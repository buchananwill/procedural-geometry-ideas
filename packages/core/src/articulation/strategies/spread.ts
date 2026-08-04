import type { Vector2 } from '../../shared/types';
import type {
    ArticulationChain,
    ConstraintStrategy,
    ElementConstraints,
    StrategyInput,
    StrategyResult,
} from '../types';
import { addV, distV, dotV, lenV, rotateAbout, scaleV, subV } from '../geometry';
import { CLAMP_COARSE_SAMPLE_COUNT, clampToValid } from '../clamping';
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
    /** +1 where the span walks up the chain away from the pivot, -1 where it walks down. */
    walkStep: number;
    /** Parallel to elementIndices: each element's share of the input vector. */
    deltaWeights: number[];
}

/** What the relaxation projects against: the constraints, the anchors, and the pose the solve started from. */
interface RelaxationContext {
    basePose: Vector2[];
    constraints: ElementConstraints[];
    anchors: Set<number>;
    pivotIndex: number;
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
    return { elementIndices, anchorIndex: elementIndices[0] - walkStep, walkStep, deltaWeights };
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
 * Whether the joint at the sweep's fixed element can be settled by turning the
 * element ahead of it: only if the arm behind that joint cannot move afterwards,
 * either because this sweep has already placed it or because it is an anchor.
 *
 * The anchor case is what makes a BOUNDARY joint projectable, and it is
 * load-bearing. A joint left unprojected does not merely go unhelped -- its
 * violation survives into the candidate pose, and the outer clamp then refuses
 * the whole pose, so the first joint to saturate stops the entire armature
 * instead of parking at its limit while the joints beyond it keep bending. It
 * covers the joint at the anchor itself, whose outer arm is immovable, and the
 * joint at the far element, whose outer arm is the anchor just past the span.
 *
 * One boundary joint stays out of reach even so: the one at that anchor just
 * past the span. Its only movable arm is the far element, and every turn of the
 * far element that would settle it breaks a link the sweep has just settled, so
 * there is no legal correction and the clamp answers for it. Measured, forcing
 * one anyway cost more than it bought -- it swung the far element away from the
 * target to buy a joint the clamp was already handling.
 */
function jointArmBehindIsFixed(context: RelaxationContext, position: number, elementBehind: number): boolean {
    return position >= 2 || context.anchors.has(elementBehind);
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
        if (jointArmBehindIsFixed(context, position, fixedIndex - sweepStep)) {
            projectJointAngle(context, posed, fixedIndex, sweepStep);
        }
    }
}

/**
 * The joint at the pivot is the one joint two spans contend for: each span's
 * motion opens it, so neither may claim it and no sweep projects it. Any excess
 * bend is instead undone by turning each span rigidly about the pivot by half of
 * it -- which preserves every link the sweeps just settled, and gives the two
 * spans the same share of the cone whatever order they were relaxed in.
 *
 * Applied once the iterations are done rather than inside them: each iteration
 * re-pins the far elements at their ramp targets, which would undo the share of
 * whichever span is nothing but its far element and skew the split.
 */
function splitPivotJointExcessBetweenSpans(context: RelaxationContext, posed: Vector2[], spans: SpanRamp[]): void {
    if (spans.length < 2) return;
    const bound = context.constraints[context.pivotIndex]?.jointAngle;
    if (!bound) return;
    const angle = jointAngleAt(posed, context.pivotIndex);
    if (angle === null) return;
    const projectedAngle = Math.min(Math.max(angle, bound.min), bound.max);
    if (projectedAngle === angle) return;
    const halfExcess = (projectedAngle - angle) / 2;
    for (const span of spans) {
        for (const elementIndex of span.elementIndices) {
            posed[elementIndex] = rotateAbout(posed[elementIndex], posed[context.pivotIndex], span.walkStep * halfExcess);
        }
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
    splitPivotJointExcessBetweenSpans(context, posed, spans);
    return posed;
}

/**
 * Ramp, then relax, both rebuilt from the base pose on every call: the search
 * below evaluates this at fractions in an order of its own, so the pose at a
 * fraction must be deterministic and must never accumulate an earlier call's
 * result.
 */
function spreadTranslatePoseAt(
    chain: ArticulationChain,
    spans: SpanRamp[],
    context: RelaxationContext,
    scaledVector: Vector2,
): Vector2[] {
    // The relaxation moves elements even at a zero delta -- from an invalid
    // start there are violations for it to project away -- but the fraction 0
    // candidate is the one the search falls back on when nothing else is
    // acceptable, and that must be the pose the solve started from.
    if (scaledVector.x === 0 && scaledVector.y === 0) return chain.elements.map((point) => ({ ...point }));
    return relaxedPose(context, rampPose(chain.elements, spans, scaledVector), spans);
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

/**
 * Steps either side of the coarse winner taken by the refinement pass, and the
 * factor by which they divide the coarse grid: the selected fraction is a
 * multiple of 1 / (CLAMP_COARSE_SAMPLE_COUNT * SPREAD_REFINEMENT_SAMPLE_COUNT).
 */
export const SPREAD_REFINEMENT_SAMPLE_COUNT = 8;

/** A sampled fraction's relaxed pose, with the accommodation it turned out to deliver. */
interface AchievementCandidate {
    fraction: number;
    elements: Vector2[];
    achievedFraction: number;
}

/** One candidate fraction, or null where its pose is not one the solve may return. */
function evaluateFraction(
    chain: ArticulationChain,
    spans: SpanRamp[],
    context: RelaxationContext,
    vector: Vector2,
    fraction: number,
    isPoseAcceptable: (elements: Vector2[]) => boolean,
): AchievementCandidate | null {
    const elements = spreadTranslatePoseAt(chain, spans, context, scaleV(vector, fraction));
    if (!isPoseAcceptable(elements)) return null;
    return {
        fraction,
        elements,
        achievedFraction: meanAchievedFraction(chain.elements, elements, spans, vector),
    };
}

/**
 * The more accommodating of the two. Every scan runs downward and only a strict
 * improvement displaces the incumbent, so equal achievement keeps the larger
 * fraction -- which is what makes an unobstructed drag select the whole vector.
 */
function moreAchievingOf(
    incumbent: AchievementCandidate,
    candidate: AchievementCandidate | null,
): AchievementCandidate {
    if (candidate === null) return incumbent;
    return candidate.achievedFraction > incumbent.achievedFraction ? candidate : incumbent;
}

/**
 * The pose that accommodates the drag best, chosen from a fixed grid of
 * fractions -- the clamp search's coarse samples, then a finer raster around
 * the coarse winner -- keeping only those the non-worsening predicate accepts.
 *
 * Every other strategy can take the largest valid fraction, because there
 * validity is what limits accommodation and the two rise together. Here they
 * come apart: with boundary joints projected the relaxation makes nearly every
 * fraction valid, and the fractions above the best one buy nothing -- they feed
 * the ramp a target the joint cones forbid, and the relaxation curls the span
 * around to somewhere it can legally sit, which can be further from the cursor
 * than a smaller fraction managed, or on the wrong side of it entirely. So the
 * selector optimises the objective -- how much of the drag the far elements
 * actually achieved -- and merely requires validity.
 *
 * Standing still is always among the candidates, so the search cannot come away
 * empty: the worst it can conclude is that nothing beat not moving.
 */
function selectMostAchievingPose(
    chain: ArticulationChain,
    spans: SpanRamp[],
    context: RelaxationContext,
    vector: Vector2,
): AchievementCandidate {
    const isPoseAcceptable = makePoseNoWorsePredicate(chain.elements, chain.constraints);
    const evaluate = (fraction: number): AchievementCandidate | null =>
        evaluateFraction(chain, spans, context, vector, fraction, isPoseAcceptable);

    // Standing still reproduces the base pose, which the predicate accepts by
    // construction -- it is no worse than itself -- so the search always has an
    // incumbent and can never come away with nothing to return.
    const stationaryPose = chain.elements.map((point) => ({ ...point }));
    let best: AchievementCandidate = {
        fraction: 0,
        elements: stationaryPose,
        achievedFraction: meanAchievedFraction(chain.elements, stationaryPose, spans, vector),
    };
    for (let sampleIndex = CLAMP_COARSE_SAMPLE_COUNT; sampleIndex >= 1; sampleIndex--) {
        best = moreAchievingOf(best, evaluate(sampleIndex / CLAMP_COARSE_SAMPLE_COUNT));
        // A strict-improvement incumbent at full achievement can never be
        // displaced, so an unobstructed drag pays one evaluation, not the grid.
        if (best.achievedFraction >= 1) return best;
    }

    // A finer pass across the bracket either side of the coarse winner. The
    // winner stands in it as the incumbent, so this can only improve on it --
    // no assumption about the shape of achievement between grid points, just a
    // wider argmax over a fixed set of fractions.
    const bracketCentre = best.fraction;
    const refinedStep = 1 / (CLAMP_COARSE_SAMPLE_COUNT * SPREAD_REFINEMENT_SAMPLE_COUNT);
    for (let step = SPREAD_REFINEMENT_SAMPLE_COUNT; step >= -SPREAD_REFINEMENT_SAMPLE_COUNT; step--) {
        const fraction = bracketCentre + step * refinedStep;
        if (fraction < 0 || fraction > 1) continue;
        best = moreAchievingOf(best, evaluate(fraction));
    }
    return best;
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
    const context: RelaxationContext = {
        basePose: chain.elements,
        constraints: chain.constraints,
        anchors,
        pivotIndex,
    };
    const selected = selectMostAchievingPose(chain, spans, context, vector);
    return {
        elements: selected.elements,
        appliedFraction: selected.achievedFraction,
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
