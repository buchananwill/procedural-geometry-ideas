import type { Vector2 } from '../../shared/types';
import type {
    ArticulationChain,
    ConstraintStrategy,
    ElementConstraints,
    StrategyInput,
    StrategyResult,
} from '../types';
import { addV, distV, dotV, lenV, rotateAbout, scaleV, subV } from '../geometry';
import { clampToValid } from '../clamping';
import {
    ARTICULATION_EPSILON,
    jointAngleAt,
    linkDistanceBounds,
    makePoseNoWorsePredicate,
} from '../validity';
import { splitSpans } from '../topology';
import { identityResult } from '../identity-result';
import { translateSelectionAsRigidUnit } from './rigid';

/** Index pairs (a, b) walking from the pivot to the far end of the span. */
function walkPairs(pivotIndex: number, span: number[]): Array<[number, number]> {
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const pairs: Array<[number, number]> = [];
    for (let j = pivotIndex + dir; dir > 0 ? j <= far : j >= far; j += dir) {
        pairs.push([j - dir, j]);
    }
    return pairs;
}

function applySpreadToSpan(
    out: Vector2[],
    input: StrategyInput,
    span: number[],
    angle: number,
): void {
    const { pivotIndex, selectionSet } = input;
    const far = span[span.length - 1];
    const dir = far > pivotIndex ? 1 : -1;
    const qualifying = walkPairs(pivotIndex, span).filter(([, b]) => selectionSet.has(b));
    if (qualifying.length === 0) return;
    const share = angle / qualifying.length;
    for (const [a, b] of qualifying) {
        const center = out[a];
        for (let j = b; dir > 0 ? j <= far : j >= far; j += dir) {
            if (selectionSet.has(j)) out[j] = rotateAbout(out[j], center, share);
        }
    }
}

function spreadPose(input: StrategyInput, spans: number[][], angle: number): Vector2[] {
    const out = input.chain.elements.map((p) => ({ ...p }));
    for (const span of spans) {
        applySpreadToSpan(out, input, span, angle);
    }
    return out;
}

function solveSpreadRotation(input: StrategyInput, angle: number): StrategyResult {
    // Empty spans need no guard here: spreadPose simply rotates nothing, and
    // spread never divides by the span count, so there is no NaN to avoid.
    const spans = splitSpans(input.selection, input.pivotIndex);
    const clamp = clampToValid(
        (t) => spreadPose(input, spans, t * angle),
        makePoseNoWorsePredicate(input.chain.elements, input.chain.constraints),
    );
    return {
        elements: clamp.elements,
        appliedFraction: clamp.t,
        appliedStrategyId: 'spread',
    };
}

/**
 * Constraint-projection sweeps run per solved pose. Fixed rather than
 * convergence-driven, so relaxation costs a bounded amount and every pose is
 * reproducible from its inputs alone.
 */
export const SPREAD_RELAXATION_ITERATIONS = 16;

/** A contiguous run of movable selected elements together with its falloff ramp. */
interface SpanRamp {
    /** Ordered from the element nearest the pivot to the furthest one. */
    elementIndices: number[];
    /** The anchored element immediately inside the span, on the pivot side. */
    anchorIndex: number;
    /** Parallel to elementIndices: each element's share of the input vector. */
    deltaWeights: number[];
}

/** What the relaxation projects against: the constraints, and the pose the solve started from. */
interface RelaxationContext {
    basePose: Vector2[];
    constraints: ElementConstraints[];
}

function isElementIndex(index: number, chainLength: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < chainLength;
}

/**
 * The elements the relaxation may never move: everything outside the selection,
 * plus the pivot, which spread treats as the immovable origin of its falloff. A
 * first-class set because the user-authored Freeze state will add members to it
 * without anything else here needing to change.
 */
function anchorIndices(chainLength: number, selectionSet: Set<number>, pivotIndex: number): Set<number> {
    const anchors = new Set<number>();
    for (let index = 0; index < chainLength; index++) {
        if (!selectionSet.has(index)) anchors.add(index);
    }
    anchors.add(pivotIndex);
    return anchors;
}

/** Distance walked along the base pose from the pivot to `targetIndex`. */
function arcLengthFromPivot(elements: Vector2[], pivotIndex: number, targetIndex: number): number {
    const walkStep = targetIndex > pivotIndex ? 1 : -1;
    let arcLength = 0;
    for (let index = pivotIndex; index !== targetIndex; index += walkStep) {
        arcLength += distV(elements[index], elements[index + walkStep]);
    }
    return arcLength;
}

/**
 * The falloff ramp for one span: arc length from the pivot along the base pose,
 * normalised so the furthest element receives the whole vector and a physically
 * nearer element moves less however the chain is folded. A span whose furthest
 * element sits at zero arc length -- a chain collapsed onto coincident points --
 * has no ramp to divide by and stays where it is.
 */
function makeSpanRamp(elements: Vector2[], pivotIndex: number, elementIndices: number[]): SpanRamp {
    const furthestElement = elementIndices[elementIndices.length - 1];
    const walkStep = furthestElement > pivotIndex ? 1 : -1;
    const arcLengths = elementIndices.map((index) => arcLengthFromPivot(elements, pivotIndex, index));
    const furthestArcLength = arcLengths[arcLengths.length - 1];
    const deltaWeights = furthestArcLength < ARTICULATION_EPSILON
        ? arcLengths.map(() => 0)
        : arcLengths.map((arcLength) => arcLength / furthestArcLength);
    return { elementIndices, anchorIndex: elementIndices[0] - walkStep, deltaWeights };
}

function makeSpanRamps(
    chain: ArticulationChain,
    selection: number[],
    anchors: Set<number>,
    pivotIndex: number,
): SpanRamp[] {
    const movableSelection = selection.filter((index) => !anchors.has(index));
    return splitSpans(movableSelection, pivotIndex)
        .map((elementIndices) => makeSpanRamp(chain.elements, pivotIndex, elementIndices));
}

/** The seeded pose: every span element displaced by its share of the vector, anchors untouched. */
function rampPose(elements: Vector2[], spans: SpanRamp[], scaledVector: Vector2): Vector2[] {
    const posed = elements.map((point) => ({ ...point }));
    for (const span of spans) {
        span.elementIndices.forEach((elementIndex, position) => {
            posed[elementIndex] = addV(elements[elementIndex], scaleV(scaledVector, span.deltaWeights[position]));
        });
    }
    return posed;
}

/**
 * The direction to place `movingIndex` along: the one it already lies in, or
 * the one it had in the base pose where a sweep has collapsed the link onto a
 * point, so that a minimum bound can still push the two apart deterministically.
 */
function placementDirection(
    context: RelaxationContext,
    posed: Vector2[],
    fixedIndex: number,
    movingIndex: number,
): Vector2 | null {
    const currentOffset = subV(posed[movingIndex], posed[fixedIndex]);
    const currentLength = lenV(currentOffset);
    if (currentLength >= ARTICULATION_EPSILON) return scaleV(currentOffset, 1 / currentLength);
    const baseOffset = subV(context.basePose[movingIndex], context.basePose[fixedIndex]);
    const baseLength = lenV(baseOffset);
    if (baseLength < ARTICULATION_EPSILON) return null;
    return scaleV(baseOffset, 1 / baseLength);
}

/** Move `movingIndex` to the nearest distance from `fixedIndex` that its link bounds admit. */
function projectLinkLength(
    context: RelaxationContext,
    posed: Vector2[],
    fixedIndex: number,
    movingIndex: number,
): void {
    const bounds = linkDistanceBounds(context.constraints, Math.min(fixedIndex, movingIndex));
    if (!bounds) return;
    const currentLength = distV(posed[fixedIndex], posed[movingIndex]);
    if (currentLength >= bounds.min && currentLength <= bounds.max) return;
    const direction = placementDirection(context, posed, fixedIndex, movingIndex);
    if (!direction) return;
    const projectedLength = Math.min(Math.max(currentLength, bounds.min), bounds.max);
    posed[movingIndex] = addV(posed[fixedIndex], scaleV(direction, projectedLength));
}

/**
 * Turn the joint at `jointIndex` until its angle lies inside its bound, keeping
 * the link length the length projection just settled on. The sweep only ever
 * places elements ahead of itself, so `sweepStep` names which of the joint's
 * two arms is still free to move.
 */
function projectJointAngle(
    context: RelaxationContext,
    posed: Vector2[],
    jointIndex: number,
    sweepStep: number,
): void {
    const bound = context.constraints[jointIndex]?.jointAngle;
    if (!bound) return;
    const angle = jointAngleAt(posed, jointIndex);
    if (angle === null) return;
    const projectedAngle = Math.min(Math.max(angle, bound.min), bound.max);
    if (projectedAngle === angle) return;
    const movingIndex = jointIndex + sweepStep;
    posed[movingIndex] = rotateAbout(posed[movingIndex], posed[jointIndex], sweepStep * (projectedAngle - angle));
}

/**
 * Walk consecutive elements from the one that stays put to the far end, placing
 * each against the neighbour already settled behind it.
 */
function sweepAlong(context: RelaxationContext, posed: Vector2[], orderedIndices: number[]): void {
    if (orderedIndices.length < 2) return;
    const sweepStep = orderedIndices[1] - orderedIndices[0];
    for (let position = 1; position < orderedIndices.length; position++) {
        const fixedIndex = orderedIndices[position - 1];
        projectLinkLength(context, posed, fixedIndex, orderedIndices[position]);
        // A joint is the sweep's to project only once both of its arms have been
        // placed by this sweep; the joints at either end of the segment reach
        // outside it -- into the anchored side, or past the far element -- and
        // are left for the clamp to judge.
        if (position >= 2) projectJointAngle(context, posed, fixedIndex, sweepStep);
    }
}

/**
 * One relaxation iteration for a span: FABRIK's two half-sweeps. The backward
 * one drags the chain inward from the far element pinned at its ramp target,
 * letting the link to the anchored side break; the forward one restores that
 * link from the immovable anchor outward, which is what pulls a far element
 * short of a target the chain cannot reach.
 */
function relaxSpan(
    context: RelaxationContext,
    posed: Vector2[],
    span: SpanRamp,
    rampTarget: Vector2,
): void {
    const furthestElement = span.elementIndices[span.elementIndices.length - 1];
    const outwardOrder = [span.anchorIndex, ...span.elementIndices];
    posed[furthestElement] = { ...rampTarget };
    sweepAlong(context, posed, [...outwardOrder].reverse().slice(0, -1));
    sweepAlong(context, posed, outwardOrder);
}

/** Restore feasibility to the ramped pose without moving an anchor. */
function relaxedPose(context: RelaxationContext, rampedPose: Vector2[], spans: SpanRamp[]): Vector2[] {
    const posed = rampedPose.map((point) => ({ ...point }));
    const rampTargets = spans.map((span) => rampedPose[span.elementIndices[span.elementIndices.length - 1]]);
    for (let iteration = 0; iteration < SPREAD_RELAXATION_ITERATIONS; iteration++) {
        spans.forEach((span, position) => relaxSpan(context, posed, span, rampTargets[position]));
    }
    return posed;
}

/**
 * Ramp, then relax, both rebuilt from the base pose on every call: clampToValid
 * samples this dozens of times in a search order of its own, so the pose at a
 * fraction must be deterministic and must never accumulate an earlier call's
 * result.
 */
function spreadTranslatePoseAt(chain: ArticulationChain, spans: SpanRamp[], scaledVector: Vector2): Vector2[] {
    // The relaxation moves elements even at a zero delta -- from an invalid
    // start there are violations for it to project away -- but clampToValid
    // reads poseAt(0) as the pose to fall back to when nothing else is
    // acceptable, and that must be the pose the solve started from.
    if (scaledVector.x === 0 && scaledVector.y === 0) return chain.elements.map((point) => ({ ...point }));
    const ramped = rampPose(chain.elements, spans, scaledVector);
    return relaxedPose({ basePose: chain.elements, constraints: chain.constraints }, ramped, spans);
}

/**
 * How much of the requested vector one span's furthest element actually
 * achieved: its net displacement resolved along the drag direction, over the
 * drag's magnitude. Measured on the pose the solve is returning, because the
 * clamp fraction alone would lie -- the relaxation absorbs an out-of-reach
 * target inside a pose the clamp is perfectly happy with, and the far element
 * falling short of the cursor is exactly what the selection clamp reports.
 */
function achievedFractionForSpan(
    basePose: Vector2[],
    finalPose: Vector2[],
    span: SpanRamp,
    vector: Vector2,
): number {
    const magnitude = lenV(vector);
    if (magnitude < ARTICULATION_EPSILON) return 1;
    // A collapsed span (zero arc length, weights all 0) requests zero
    // displacement, so its achievement is vacuously complete -- scoring it
    // 0 would burn the selection-clamp badge on every drag of such a chain.
    if (span.deltaWeights[span.deltaWeights.length - 1] === 0) return 1;
    const furthestElement = span.elementIndices[span.elementIndices.length - 1];
    const displacement = subV(finalPose[furthestElement], basePose[furthestElement]);
    const achievedFraction = dotV(displacement, vector) / (magnitude * magnitude);
    return Math.min(1, Math.max(0, achievedFraction));
}

/** The mean across spans, the same convention saturate rotate reports for two spans. */
function meanAchievedFraction(
    basePose: Vector2[],
    finalPose: Vector2[],
    spans: SpanRamp[],
    vector: Vector2,
): number {
    const total = spans.reduce(
        (sum, span) => sum + achievedFractionForSpan(basePose, finalPose, span, vector),
        0,
    );
    const mean = total / spans.length;
    // A measured fraction carries floating noise where a scaled one does not,
    // and the selection-clamp badge turns on anything below 1: a drag that
    // reached its target to within epsilon has to report exactly 1.
    return mean >= 1 - ARTICULATION_EPSILON ? 1 : mean;
}

function solveSpreadTranslation(input: StrategyInput, vector: Vector2): StrategyResult {
    const { chain, pivotIndex, selection, selectionSet } = input;
    // Translation needs no pivot for the other strategies, so solveArticulation
    // does not vet it -- but spread's falloff has no origin without one. The
    // attribution stays 'spread' where the dispatch's discontiguous fallback
    // says 'rigid': this is spread's own code choosing a degenerate-input
    // behaviour, not the solver substituting another strategy.
    if (!isElementIndex(pivotIndex, chain.elements.length)) {
        return translateSelectionAsRigidUnit(chain, selectionSet, vector, 'spread');
    }
    const anchors = anchorIndices(chain.elements.length, selectionSet, pivotIndex);
    const spans = makeSpanRamps(chain, selection, anchors, pivotIndex);
    // A selection of nothing but the pivot is all anchor: spread translate, unlike
    // rigid and saturate, never moves the pivot, so there is nothing to move at all.
    if (spans.length === 0) return identityResult(chain, 'spread');
    const clamp = clampToValid(
        (t) => spreadTranslatePoseAt(chain, spans, scaleV(vector, t)),
        makePoseNoWorsePredicate(chain.elements, chain.constraints),
    );
    return {
        elements: clamp.elements,
        appliedFraction: meanAchievedFraction(chain.elements, clamp.elements, spans, vector),
        appliedStrategyId: 'spread',
    };
}

export const spreadStrategy: ConstraintStrategy = {
    id: 'spread',
    label: 'Spread Articulation',
    solve(input: StrategyInput): StrategyResult {
        if (input.delta.kind === 'translate') {
            return solveSpreadTranslation(input, input.delta.vector);
        }
        return solveSpreadRotation(input, input.delta.angle);
    },
};
