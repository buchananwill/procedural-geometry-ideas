import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, SolveResult, StrategyInput } from '../types';
import type { ClampResult } from '../clamping';
import { addV, lenV, rotateAbout, scaleV } from '../geometry';
import { CLAMP_BISECTION_DEPTH, clampToValid } from '../clamping';
import { ARTICULATION_EPSILON, isPoseValid, jointAngleHolds, linkDistanceHolds } from '../validity';
import { splitSpans } from '../topology';
import { identityResult } from '../identity-result';

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates
 * `out` in place; returns the fraction of the requested angle consumed.
 */
function saturateSpan(out: Vector2[], input: StrategyInput, span: number[], angle: number): number {
    const { chain, pivotIndex } = input;
    const active = [...span];
    let center = out[pivotIndex];
    let remaining = angle;
    let consumed = 0;
    while (active.length > 0 && Math.abs(remaining) > ARTICULATION_EPSILON) {
        const base = out.map((p) => ({ ...p }));
        const stepAngle = remaining;
        const clamp = clampToValid(
            (t) => base.map((p, i) => (active.includes(i) ? rotateAbout(p, center, t * stepAngle) : p)),
            (els) => isPoseValid(els, chain.constraints),
        );
        for (let i = 0; i < out.length; i++) out[i] = clamp.elements[i];
        consumed += clamp.t * stepAngle;
        remaining = stepAngle * (1 - clamp.t);
        if (clamp.t >= 1) break;
        // First active element saturates and becomes the new rotation center.
        const saturated = active.shift()!;
        center = out[saturated];
    }
    return angle === 0 ? 1 : consumed / angle;
}

function solveSaturateRotation(input: StrategyInput, angle: number): SolveResult {
    const spans = splitSpans(input.selection, input.pivotIndex);
    // Defence-in-depth: solveArticulation already guards this, but saturateStrategy
    // is exported directly from the barrel, and dividing by zero spans would be NaN.
    if (spans.length === 0) return identityResult(input.chain);
    const out = input.chain.elements.map((p) => ({ ...p }));
    let fractionSum = 0;
    for (const span of spans) {
        fractionSum += saturateSpan(out, input, span, angle);
    }
    return { elements: out, appliedFraction: fractionSum / spans.length };
}

/** One bisection step of `clampToValid`: the resolution of an accepted fraction. */
const PROBE_LOOKAHEAD_FRACTION = 2 ** -CLAMP_BISECTION_DEPTH;

/**
 * The still-movable elements, always a contiguous index range because the
 * selection is contiguous and the range only ever shrinks from its ends.
 * Elements outside it that were selected are frozen.
 */
interface ActiveRange {
    lowIndex: number;
    highIndex: number;
}

type BoundarySide = 'lower' | 'upper';

/** An active element paired with the inactive neighbour it can collide with. */
interface BoundaryPair {
    side: BoundarySide;
    activeElement: number;
    inactiveNeighbour: number;
}

function activeRangeIsEmpty(active: ActiveRange): boolean {
    return active.lowIndex > active.highIndex;
}

/**
 * Neighbours just outside the active range are inactive by construction --
 * either unselected or already frozen. A chain end is no boundary at all, so a
 * whole-chain active range yields none and translates freely.
 */
function findBoundaryPairs(active: ActiveRange, chainLength: number): BoundaryPair[] {
    const pairs: BoundaryPair[] = [];
    if (active.lowIndex > 0) {
        pairs.push({ side: 'lower', activeElement: active.lowIndex, inactiveNeighbour: active.lowIndex - 1 });
    }
    if (active.highIndex < chainLength - 1) {
        pairs.push({ side: 'upper', activeElement: active.highIndex, inactiveNeighbour: active.highIndex + 1 });
    }
    return pairs;
}

/**
 * Rigid translation of a contiguous active set leaves every interior link and
 * interior joint untouched, so the restricted checks below enumerate exactly
 * what the motion can perturb: each boundary link and the joint angles at its
 * two endpoints. What guarantees an applied pose is globally valid is clamping
 * on the CONJUNCTION of the boundary pairs -- a per-pair minimum would not,
 * because a min-distance bound makes a pair's validity non-monotone in the
 * step fraction, so one pair's probe can step straight through another pair's
 * forbidden dip. Freeze attribution is primarily the lookahead one bisection
 * step past the accepted fraction; the per-pair probes are only its fallback.
 */
function boundaryPairIsSatisfied(
    elements: Vector2[],
    chain: ArticulationChain,
    pair: BoundaryPair,
): boolean {
    const lowerLinkIndex = Math.min(pair.activeElement, pair.inactiveNeighbour);
    return linkDistanceHolds(elements, chain.constraints, lowerLinkIndex)
        && jointAngleHolds(elements, chain.constraints, pair.activeElement)
        && jointAngleHolds(elements, chain.constraints, pair.inactiveNeighbour);
}

function poseWithActiveTranslatedBy(basePose: Vector2[], active: ActiveRange, offset: Vector2): Vector2[] {
    return basePose.map((point, index) =>
        index >= active.lowIndex && index <= active.highIndex ? addV(point, offset) : { ...point });
}

/** One iteration of the cascade: who may move, how far they were asked to. */
interface CascadeStep {
    chain: ArticulationChain;
    basePose: Vector2[];
    active: ActiveRange;
    stepVector: Vector2;
    boundaryPairs: BoundaryPair[];
}

function stepPoseAt(step: CascadeStep, fraction: number): Vector2[] {
    return poseWithActiveTranslatedBy(step.basePose, step.active, scaleV(step.stepVector, fraction));
}

/** Largest fraction of the step vector that keeps every boundary pair satisfied. */
function clampStepToBoundaries(step: CascadeStep): ClampResult {
    return clampToValid(
        (fraction) => stepPoseAt(step, fraction),
        (posed) => step.boundaryPairs.every((pair) => boundaryPairIsSatisfied(posed, step.chain, pair)),
    );
}

/** Largest fraction of the step vector this boundary pair alone permits. */
function probeBoundaryPair(step: CascadeStep, pair: BoundaryPair): number {
    return clampToValid(
        (fraction) => stepPoseAt(step, fraction),
        (posed) => boundaryPairIsSatisfied(posed, step.chain, pair),
    ).t;
}

/** The pairs that are unsatisfied one bisection step past the accepted fraction. */
function pairsBlockingJustBeyond(step: CascadeStep, acceptedFraction: number): BoundaryPair[] {
    const lookaheadPose = stepPoseAt(step, Math.min(1, acceptedFraction + PROBE_LOOKAHEAD_FRACTION));
    return step.boundaryPairs.filter((pair) => !boundaryPairIsSatisfied(lookaheadPose, step.chain, pair));
}

/**
 * Fallback attribution when the lookahead names nobody. The tie window is a
 * fixed world distance expressed as a fraction, so it does not widen with the
 * length of the drag.
 */
function pairsWithTightestProbe(step: CascadeStep): BoundaryPair[] {
    const probeFractions = step.boundaryPairs.map((pair) => probeBoundaryPair(step, pair));
    const tightestFraction = Math.min(...probeFractions);
    const stepDistance = lenV(step.stepVector);
    const tieWindow = stepDistance > ARTICULATION_EPSILON ? ARTICULATION_EPSILON / stepDistance : 0;
    return step.boundaryPairs.filter((_, position) => probeFractions[position] <= tightestFraction + tieWindow);
}

/** Never empty for a step that has boundary pairs, so the cascade always shrinks. */
function pairsToFreeze(step: CascadeStep, acceptedFraction: number): BoundaryPair[] {
    const blocking = pairsBlockingJustBeyond(step, acceptedFraction);
    return blocking.length > 0 ? blocking : pairsWithTightestProbe(step);
}

function freezeBoundElements(active: ActiveRange, pairs: BoundaryPair[]): ActiveRange {
    const frozen = { ...active };
    for (const pair of pairs) {
        if (pair.side === 'lower') frozen.lowIndex++;
        else frozen.highIndex--;
    }
    return frozen;
}

function solveSaturateTranslation(input: StrategyInput, vector: Vector2): SolveResult {
    const { chain, selection } = input;
    const requestedDistance = lenV(vector);
    let elements = chain.elements.map((point) => ({ ...point }));
    let active: ActiveRange = { lowIndex: selection[0], highIndex: selection[selection.length - 1] };
    let remainingVector = vector;
    let consumedDistance = 0;

    while (!activeRangeIsEmpty(active)) {
        const remainingDistance = lenV(remainingVector);
        if (remainingDistance <= ARTICULATION_EPSILON) break;

        const step: CascadeStep = {
            chain,
            basePose: elements,
            active,
            stepVector: remainingVector,
            boundaryPairs: findBoundaryPairs(active, chain.elements.length),
        };
        if (step.boundaryPairs.length === 0) {
            elements = stepPoseAt(step, 1);
            consumedDistance += remainingDistance;
            break;
        }

        const clamp = clampStepToBoundaries(step);
        elements = clamp.elements;
        consumedDistance += clamp.t * remainingDistance;
        remainingVector = scaleV(remainingVector, 1 - clamp.t);
        if (clamp.t >= 1) break;

        active = freezeBoundElements(active, pairsToFreeze(step, clamp.t));
    }

    return {
        elements,
        appliedFraction: requestedDistance === 0 ? 1 : consumedDistance / requestedDistance,
    };
}

export const saturateStrategy: ConstraintStrategy = {
    id: 'saturate',
    label: 'Saturate Articulation',
    solve(input: StrategyInput): SolveResult {
        if (input.delta.kind === 'translate') {
            return solveSaturateTranslation(input, input.delta.vector);
        }
        return solveSaturateRotation(input, input.delta.angle);
    },
};
