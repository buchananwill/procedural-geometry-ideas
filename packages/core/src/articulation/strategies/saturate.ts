import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, ElementConstraints, StrategyInput, StrategyResult } from '../types';
import type { ClampResult } from '../clamping';
import { addV, lenV, rotateAbout, scaleV } from '../geometry';
import { CLAMP_RESOLUTION, clampToValid } from '../clamping';
import {
    ARTICULATION_EPSILON,
    jointAngleViolation,
    linkDistanceViolation,
    makePoseNoWorsePredicate,
} from '../validity';
import { splitSpans } from '../topology';
import { identityResult } from '../identity-result';

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates `out`
 * in place and reports the fraction of the requested angle consumed. Each time
 * the span's near element saturates it is dropped from the active set and
 * becomes the rotation centre for the remainder.
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
            makePoseNoWorsePredicate(base, chain.constraints),
        );
        for (let i = 0; i < out.length; i++) out[i] = clamp.elements[i];
        consumed += clamp.t * stepAngle;
        remaining = stepAngle * (1 - clamp.t);
        if (clamp.t >= 1) break;
        const saturated = active.shift()!;
        center = out[saturated];
    }
    return angle === 0 ? 1 : consumed / angle;
}

function solveSaturateRotation(input: StrategyInput, angle: number): StrategyResult {
    const spans = splitSpans(input.selection, input.pivotIndex);
    // Defence-in-depth: solveArticulation already guards this, but saturateStrategy
    // is exported directly from the barrel, and dividing by zero spans would be NaN.
    if (spans.length === 0) return identityResult(input.chain, 'saturate');
    const out = input.chain.elements.map((p) => ({ ...p }));
    let fractionSum = 0;
    for (const span of spans) {
        fractionSum += saturateSpan(out, input, span, angle);
    }
    return {
        elements: out,
        appliedFraction: fractionSum / spans.length,
        appliedStrategyId: 'saturate',
    };
}

/** The resolution of an accepted fraction: one step of `clampToValid`'s search. */
const PROBE_LOOKAHEAD_FRACTION = CLAMP_RESOLUTION;

/**
 * The still-movable elements, always a contiguous index range because the
 * selection is contiguous and the range only ever shrinks from its ends.
 * Selected elements outside it have already stopped for good.
 */
interface ActiveRange {
    lowIndex: number;
    highIndex: number;
}

type BoundarySide = 'lower' | 'upper';

/** The constraint violations a boundary pair's own motion can perturb. */
interface BoundaryPairViolations {
    linkDistance: number;
    activeJointAngle: number;
    inactiveJointAngle: number;
}

/**
 * An active element paired with the inactive neighbour it can collide with,
 * carrying the violations its constraints already had in the step's base pose
 * so no candidate fraction has to measure them again.
 */
interface BoundaryPair {
    side: BoundarySide;
    activeElement: number;
    inactiveNeighbour: number;
    baseViolations: BoundaryPairViolations;
}

function activeRangeIsEmpty(active: ActiveRange): boolean {
    return active.lowIndex > active.highIndex;
}

function measureBoundaryPairViolations(
    elements: Vector2[],
    constraints: ElementConstraints[],
    activeElement: number,
    inactiveNeighbour: number,
): BoundaryPairViolations {
    const lowerLinkIndex = Math.min(activeElement, inactiveNeighbour);
    return {
        linkDistance: linkDistanceViolation(elements, constraints, lowerLinkIndex),
        activeJointAngle: jointAngleViolation(elements, constraints, activeElement),
        inactiveJointAngle: jointAngleViolation(elements, constraints, inactiveNeighbour),
    };
}

function makeBoundaryPair(
    side: BoundarySide,
    activeElement: number,
    inactiveNeighbour: number,
    chain: ArticulationChain,
    basePose: Vector2[],
): BoundaryPair {
    return {
        side,
        activeElement,
        inactiveNeighbour,
        baseViolations: measureBoundaryPairViolations(basePose, chain.constraints, activeElement, inactiveNeighbour),
    };
}

/**
 * Neighbours just outside the active range are inactive by construction --
 * either unselected or already stopped. A chain end is no boundary at all, so a
 * whole-chain active range yields none and translates freely.
 */
function findBoundaryPairs(active: ActiveRange, chain: ArticulationChain, basePose: Vector2[]): BoundaryPair[] {
    const pairs: BoundaryPair[] = [];
    if (active.lowIndex > 0) {
        pairs.push(makeBoundaryPair('lower', active.lowIndex, active.lowIndex - 1, chain, basePose));
    }
    if (active.highIndex < chain.elements.length - 1) {
        pairs.push(makeBoundaryPair('upper', active.highIndex, active.highIndex + 1, chain, basePose));
    }
    return pairs;
}

/**
 * Rigid translation of a contiguous active set leaves every interior link and
 * interior joint untouched, so the restricted checks below enumerate exactly
 * what the motion can perturb: each boundary link and the joint angles at its
 * two endpoints. Each is compared against the step's base pose rather than
 * against its bound outright, so a pair that starts out violated may still
 * move, provided it does not get any worse.
 *
 * What guarantees an applied pose is no worse globally is clamping on the
 * CONJUNCTION of the boundary pairs -- a per-pair minimum would not, because a
 * min-distance bound makes a pair's acceptance non-monotone in the step
 * fraction, so one pair's probe can step straight through another pair's
 * forbidden dip. Which pairs the step blamed is primarily the lookahead one
 * clamp resolution past the accepted fraction; the per-pair probes are only its
 * fallback.
 */
function boundaryPairIsNoWorse(
    elements: Vector2[],
    chain: ArticulationChain,
    pair: BoundaryPair,
): boolean {
    const candidate = measureBoundaryPairViolations(
        elements,
        chain.constraints,
        pair.activeElement,
        pair.inactiveNeighbour,
    );
    const base = pair.baseViolations;
    return candidate.linkDistance <= base.linkDistance + ARTICULATION_EPSILON
        && candidate.activeJointAngle <= base.activeJointAngle + ARTICULATION_EPSILON
        && candidate.inactiveJointAngle <= base.inactiveJointAngle + ARTICULATION_EPSILON;
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

/** Largest fraction of the step vector that worsens no boundary pair. */
function clampStepToBoundaries(step: CascadeStep): ClampResult {
    return clampToValid(
        (fraction) => stepPoseAt(step, fraction),
        (posed) => step.boundaryPairs.every((pair) => boundaryPairIsNoWorse(posed, step.chain, pair)),
    );
}

/** Largest fraction of the step vector this boundary pair alone permits. */
function probeBoundaryPair(step: CascadeStep, pair: BoundaryPair): number {
    return clampToValid(
        (fraction) => stepPoseAt(step, fraction),
        (posed) => boundaryPairIsNoWorse(posed, step.chain, pair),
    ).t;
}

/** The pairs that would be worsened one clamp resolution past the accepted fraction. */
function pairsBlockingJustBeyond(step: CascadeStep, acceptedFraction: number): BoundaryPair[] {
    const lookaheadPose = stepPoseAt(step, Math.min(1, acceptedFraction + PROBE_LOOKAHEAD_FRACTION));
    return step.boundaryPairs.filter((pair) => !boundaryPairIsNoWorse(lookaheadPose, step.chain, pair));
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
function pairsThatStopHere(step: CascadeStep, acceptedFraction: number): BoundaryPair[] {
    const blocking = pairsBlockingJustBeyond(step, acceptedFraction);
    return blocking.length > 0 ? blocking : pairsWithTightestProbe(step);
}

/** Withdraw each stopped boundary element from the active range's near end. */
function narrowActiveRange(active: ActiveRange, pairs: BoundaryPair[]): ActiveRange {
    const narrowed = { ...active };
    for (const pair of pairs) {
        if (pair.side === 'lower') narrowed.lowIndex++;
        else narrowed.highIndex--;
    }
    return narrowed;
}

function solveSaturateTranslation(input: StrategyInput, vector: Vector2): StrategyResult {
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
            boundaryPairs: findBoundaryPairs(active, chain, elements),
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

        active = narrowActiveRange(active, pairsThatStopHere(step, clamp.t));
    }

    return {
        elements,
        appliedFraction: requestedDistance === 0 ? 1 : consumedDistance / requestedDistance,
        appliedStrategyId: 'saturate',
    };
}

export const saturateStrategy: ConstraintStrategy = {
    id: 'saturate',
    label: 'Saturate Articulation',
    solve(input: StrategyInput): StrategyResult {
        if (input.delta.kind === 'translate') {
            return solveSaturateTranslation(input, input.delta.vector);
        }
        return solveSaturateRotation(input, input.delta.angle);
    },
};
