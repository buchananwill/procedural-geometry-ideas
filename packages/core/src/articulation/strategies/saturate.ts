import type { Vector2 } from '../../shared/types';
import type { ArticulationChain, ConstraintStrategy, ElementConstraints, SolveResult, StrategyInput } from '../types';
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

/** What one span's cascade consumed, and which of its elements stopped moving. */
interface SpanSaturation {
    consumedFraction: number;
    peeledElements: number[];
}

/**
 * Consume as much of `angle` as constraints allow for one span. Mutates
 * `out` in place; reports the fraction of the requested angle consumed and the
 * elements peeled off the span's near end as each became the rotation centre.
 */
function saturateSpan(out: Vector2[], input: StrategyInput, span: number[], angle: number): SpanSaturation {
    const { chain, pivotIndex } = input;
    const active = [...span];
    const peeledElements: number[] = [];
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
        // First active element saturates and becomes the new rotation center.
        const saturated = active.shift()!;
        peeledElements.push(saturated);
        center = out[saturated];
    }
    return { consumedFraction: angle === 0 ? 1 : consumed / angle, peeledElements };
}

function solveSaturateRotation(input: StrategyInput, angle: number): SolveResult {
    const spans = splitSpans(input.selection, input.pivotIndex);
    // Defence-in-depth: solveArticulation already guards this, but saturateStrategy
    // is exported directly from the barrel, and dividing by zero spans would be NaN.
    if (spans.length === 0) return identityResult(input.chain, 'saturate');
    const out = input.chain.elements.map((p) => ({ ...p }));
    const frozenElementIndices: number[] = [];
    let fractionSum = 0;
    for (const span of spans) {
        const saturation = saturateSpan(out, input, span, angle);
        fractionSum += saturation.consumedFraction;
        // Spans are disjoint (splitSpans excludes the pivot), so a plain push
        // cannot duplicate an element across spans.
        frozenElementIndices.push(...saturation.peeledElements);
    }
    return {
        elements: out,
        appliedFraction: fractionSum / spans.length,
        appliedStrategyId: 'saturate',
        frozenElementIndices,
    };
}

/** The resolution of an accepted fraction: one step of `clampToValid`'s search. */
const PROBE_LOOKAHEAD_FRACTION = CLAMP_RESOLUTION;

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
 * either unselected or already frozen. A chain end is no boundary at all, so a
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
 * forbidden dip. Freeze attribution is primarily the lookahead one clamp
 * resolution past the accepted fraction; the per-pair probes are only its
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
function pairsToFreeze(step: CascadeStep, acceptedFraction: number): BoundaryPair[] {
    const blocking = pairsBlockingJustBeyond(step, acceptedFraction);
    return blocking.length > 0 ? blocking : pairsWithTightestProbe(step);
}

/**
 * Freeze order, first mention wins: a single-element active range is named by
 * both of its boundary pairs, and the report must not repeat it.
 */
function appendNewlyFrozenElements(frozenElementIndices: number[], pairs: BoundaryPair[]): void {
    for (const pair of pairs) {
        if (!frozenElementIndices.includes(pair.activeElement)) frozenElementIndices.push(pair.activeElement);
    }
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
    const frozenElementIndices: number[] = [];

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

        const freezing = pairsToFreeze(step, clamp.t);
        appendNewlyFrozenElements(frozenElementIndices, freezing);
        active = freezeBoundElements(active, freezing);
    }

    return {
        elements,
        appliedFraction: requestedDistance === 0 ? 1 : consumedDistance / requestedDistance,
        appliedStrategyId: 'saturate',
        frozenElementIndices,
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
