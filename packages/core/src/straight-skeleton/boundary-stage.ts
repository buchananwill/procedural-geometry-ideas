import {
    PerceptualFloorOptions,
    SkeletonDiagnostic,
    SkeletonHole,
    SkeletonInputRefusalKind,
    SkeletonLoop,
    SkeletonLoopMap,
    Vector2,
    WeightOptions,
} from "./types";
import {SkeletonInputRefusal} from "./input-refusal";
import {crossProduct, makeBasis} from "./core-functions";
import {maxWeightRatio, minWeightTurnSine} from "./constants";
import {isClockwise} from "./planar-geometry";
import {
    describeDegenerateHole,
    describeLoopConflict,
    findLoopConflict,
    isDegenerateHole,
    loopName,
    loopRefusalPrefix,
} from "./skeleton-loops";
import {weightsAreOmitted} from "./graph-helpers";
import {SkeletonNormalisation, makeSkeletonNormalisation, normalisePolygon} from "./normalisation";
import {
    CanonicalPolygon,
    REMOVED_VERTEX_INDEX,
    canonicalisePolygon,
    resolvePerceptualFloor,
} from "./canonicalisation";

/*
 * THE BOUNDARY STAGE: what happens to a caller's loops before the solver sees them — the vertex checks, the weight
 * door, canonicalisation in unit space, winding, the loop relations and each loop's map onto the solved graph —
 * stated once, as {@link prepareBoundary}, for every solve entry.
 */

/**
 * What the boundary stage does to a caller's ring: the surviving vertices and, on `indexRemap`,
 * where each input vertex ended up.
 *
 * THIS EXISTS FOR CALLERS THAT LABEL THE SOLVED GRAPH AGAINST THEIR OWN INPUT. A removed vertex
 * renumbers every exterior node and every exterior edge after it, so an overlay drawing input
 * indices beside solver indices is showing two index spaces in one picture and reads as a
 * corrupted solve: the bisector of exterior node 5 appears at the caller's vertex 6, carrying the
 * parents [5,4] that belong to it. That is what a dashboard inspection reported on 2026-08-28, and
 * the graph was right every time. `indexRemap[i]` is the exterior node the caller's vertex `i`
 * became, or {@link REMOVED_VERTEX_INDEX} where it was removed as invisible.
 *
 * THE SOLVE'S CANONICALISATION, ASKED ALONE: the polygon carried to unit extent by the same transform, then
 * `canonicalisePolygon` at the perceptual floor with the weight-change vertices pinned, as
 * {@link prepareBoundary} canonicalises a single loop for the legacy entries, so a caller's remap cannot
 * describe a different boundary from the one the solver saw. It DOES NOT describe the self-intersecting
 * path: `decomposePolygon` rebuilds the rings and `mergeSkeletonGraphs` renumbers again, so a caller must
 * check the survivor count against the graph's `numExteriorNodes` before trusting the mapping.
 *
 * NOT FOLDED INTO {@link prepareBoundary} (BSA.D356): it checks no vertex count and no finiteness, and
 * passes the weight door only when the caller gives weights, so it refuses nothing it did not refuse before.
 */
export function canonicaliseForSolve(
    vertices: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): CanonicalPolygon {
    // W-spec W44: a weighted caller's remap must describe the same boundary the weighted solve saw,
    // and under weights that boundary keeps every weight-change vertex. Unweighted callers pass
    // nothing and pin nothing, exactly as before.
    const normalisation = makeSkeletonNormalisation(vertices);
    const unitVertices = normalisePolygon(vertices, normalisation);
    const pinned = weightsAreOmitted(options?.weights)
        ? []
        : weightChangeVertexIndices(weightsAtTheDoor(unitVertices, options!.weights, resolvePerceptualFloor(options)));
    return canonicalisePolygon(unitVertices, resolvePerceptualFloor(options), pinned);
}

/**
 * The complaint about the first non-finite input vertex, or `undefined` when every coordinate is
 * finite.
 *
 * REJECTED AT THE DOOR, NOT DOWNSTREAM. A NaN coordinate is invisible to the bounding-box scan that
 * opens `makeSkeletonNormalisation` — every comparison against NaN is false, so the extent is
 * computed as though the vertex were not there — and it then travels through normalisation,
 * canonicalisation and the decomposition before `findOrAddNode` finally refuses it, by which point
 * nothing names the vertex the caller actually passed. An infinity is worse: it survives the scan,
 * takes the extent to infinity, and normalises every other vertex to zero.
 *
 * The index is the caller's own, taken before canonicalisation can renumber anything.
 */
function nonFiniteVertexComplaint(vertices: readonly Vector2[]): InputComplaint | undefined {
    for (let index = 0; index < vertices.length; index++) {
        const {x, y} = vertices[index];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return {
                kind: 'non-finite-vertex',
                index,
                message: `Vertex ${index} is not finite: (${x}, ${y}). Every input vertex coordinate must be a finite number.`,
            };
        }
    }
    return undefined;
}

/** A refusal not yet thrown: its kind, its text, and the caller's index where it has one. */
export interface InputComplaint {
    kind: SkeletonInputRefusalKind;
    message: string;
    index?: number;
}

/**
 * Decision 16: the complaint about a loop's vertex count, else about its first non-finite vertex, or `undefined`
 * when the loop can be solved. Unprefixed; a refusal of a hole adds the hole's name.
 */
export function loopSolvabilityComplaint(vertices: readonly Vector2[]): InputComplaint | undefined {
    if (vertices.length < 3) {
        return {kind: 'too-few-vertices', message: "Must have at least three nodes to perform algorithm"};
    }
    return nonFiniteVertexComplaint(vertices);
}

/*
 * ============================================================================
 *  THE WEIGHT DOOR — W-spec W1–W4, W44, W45, W48, W49
 * ============================================================================
 *
 * A weight is a per-exterior-edge, strictly positive SPEED: `weights[i]` is the speed of the edge
 * from input vertex `i` to input vertex `(i + 1) % n` (arc journal decision 112(a)). Everything the
 * solver used to call an offset is that edge's arrival TIME, `distance / weight`.
 *
 * EVERY REFUSAL HERE IS A THROW, NOT A DIAGNOSTIC, and every one of them names the offender. The
 * reason is the one {@link nonFiniteVertexComplaint} already states: `diagnostics` reports a solve that ran
 * and came back degraded, while these are inputs the solver cannot solve at all. All three run
 * BEFORE canonicalisation, so the index in the message is the caller's own, before any renumbering
 * (arc decision 124(b)).
 */

/** The caller's weights, or all ones. Rejects a mismatched length by name (W-spec W1). */
function resolveWeightArray(vertexCount: number, weights?: readonly number[]): number[] {
    if (weightsAreOmitted(weights)) {
        return new Array<number>(vertexCount).fill(1);
    }
    if (weights!.length !== vertexCount) {
        throw new SkeletonInputRefusal('weight-count',
            `Weight array has ${weights!.length} entries but the polygon has ${vertexCount} vertices; `
            + `there must be exactly one weight per vertex — the speed of the edge leaving it.`);
    }
    return [...weights!];
}

/** W-spec W2: every weight is a finite, strictly positive double. Zero and infinite are out of contract. */
function assertWeightsAreFinitePositive(weights: readonly number[]): void {
    for (let index = 0; index < weights.length; index++) {
        const weight = weights[index];
        if (!Number.isFinite(weight) || weight <= 0) {
            throw new SkeletonInputRefusal('weight-not-finite-positive',
                `Weight ${index} is ${weight}. Every edge weight must be a finite, strictly positive `
                + `number: a zero or infinite weight has no well-posed vertex velocity, and gables are `
                + `a post-process on an all-positive solve rather than a solver input.`,
                {index});
        }
    }
}

/**
 * W-spec W3 and W48, arc decision 119: the weight ratio is checked at the door and refused by a
 * throw, naming the two extreme edges and the bound.
 *
 * THE BOUND IS `maxWeightRatio(δ) = δ / (64·√2·u)` (C8 spec T22, journal decision 156), about 9.95e7
 * at the library floor — the ratio beyond which the narrowest per-pair simultaneity window would fall
 * inside the arithmetic moment bar. It replaced `MAX_WEIGHT_RATIO = 100`, whose only derivation was
 * `1e-6 / 1e-8` and whose hazard the per-pair window dissolves.
 *
 * GLOBAL ACROSS LOOPS (skeleton loops-input spec, decision 19): `weights` is every edge of every loop, and
 * `edgeName` names an index of it in the refusal, with its loop when the input has holes. With one loop it is
 * `edge i`, today's text.
 */
function assertWeightRatioIsInContract(
    weights: readonly number[],
    perceptualFloor: number,
    edgeName: (index: number) => string = index => `edge ${index}`,
): void {
    let slowestIndex = 0;
    let fastestIndex = 0;
    for (let index = 1; index < weights.length; index++) {
        if (weights[index] < weights[slowestIndex]) {
            slowestIndex = index;
        }
        if (weights[index] > weights[fastestIndex]) {
            fastestIndex = index;
        }
    }

    const ratio = weights[fastestIndex] / weights[slowestIndex];
    const bound = maxWeightRatio(perceptualFloor);
    if (ratio > bound) {
        throw new SkeletonInputRefusal('weight-ratio',
            `Weight ratio ${ratio} exceeds maxWeightRatio(${perceptualFloor}) (${bound}): ${edgeName(fastestIndex)} `
            + `has weight ${weights[fastestIndex]} and ${edgeName(slowestIndex)} has weight `
            + `${weights[slowestIndex]}. Beyond that ratio the narrowest simultaneity window — the floor `
            + `read on the fastest edge — falls inside the arithmetic's own moment bar, so the solver `
            + `could no longer tell two arrivals apart that the window says are two.`);
    }
}

/**
 * W-spec W49, arc journal decision 124(b): **WEIGHTS MAY CHANGE ONLY AT A VISIBLE CORNER.**
 *
 * A vertex whose two incident edges carry different weights and whose turn sine `|c × b|` is below
 * `minWeightTurnSine(δ, Δw)` is refused, PER VERTEX, with `Δw` that vertex's weight difference on the
 * normalised weights (minimum 1, W-spec W4) — the kernel's own error budget against the floor (C8 spec
 * T21, argued at `minWeightTurnSine` in constants.ts). It replaced the frozen `MIN_WEIGHT_TURN_SINE`
 * (1.4142e-4, the scratch epsilon's `√(ε(2 − ε))`). The kernel there is either inconsistent (an exactly
 * collinear weight change has NO vertex velocity: the two offset lines are parallel at different
 * distances for every `t > 0` and the wavefront has a step of height `|w₁ − w₂| · t`) or so badly
 * conditioned that the solver's own time window becomes a spatial slack of a fraction of the whole
 * polygon — `|v| = |w₁ − w₂| / sin(turn)`, measured at `1.5e7` for a turn of `1e-6`.
 *
 * THIS IS A FENCE, NOT A CONVENTION. Arc decision 124's model invariant is that the base of the roof
 * lies in a single plane; a configuration the weighted skeleton cannot make well-posed without an
 * extra convention (the struck riser of W-spec W53) is OUTSIDE the contract, not inside it with the
 * convention bolted on. A dormer is a feature stitched into the roof the skeleton produces.
 *
 * UNIT WEIGHTS NEVER REACH THE ANGULAR TEST: it is guarded by `w₁ !== w₂` first, so with every
 * weight equal this function looks at no geometry at all and the digest cannot move.
 *
 * ONE LOOP AT A TIME, WITH ITS OWN WRAPAROUND (skeleton loops-input spec, decision 18): a hole's last edge meets
 * its own first edge. `slowest` is the smallest weight of the WHOLE INPUT, every loop of it, because the solve
 * divides by that one (decision 19); omitted, it is this loop's own, which for a single loop is the same number.
 */
export function assertWeightsChangeOnlyAtVisibleCorners(
    vertices: readonly Vector2[],
    weights: readonly number[],
    perceptualFloor: number,
    slowest: number = Math.min(...weights),
): void {
    const count = vertices.length;
    // Δw is read on the NORMALISED weights (minimum 1, W-spec W4): the derivation's time bound assumes
    // the slowest edge runs at weight 1, and a common scaling of the weights moves nothing geometric.
    for (let index = 0; index < count; index++) {
        const incomingWeight = weights[(index - 1 + count) % count];
        const outgoingWeight = weights[index];
        if (incomingWeight === outgoingWeight) {
            continue;
        }

        const outgoing = makeBasis(vertices[index], vertices[(index + 1) % count]);
        const incoming = makeBasis(vertices[(index - 1 + count) % count], vertices[index]);
        const turnSine = Math.abs(crossProduct(outgoing, incoming));
        const turnBar = minWeightTurnSine(perceptualFloor, Math.abs(incomingWeight - outgoingWeight) / slowest);
        if (turnSine < turnBar) {
            throw new SkeletonInputRefusal('weight-change-without-corner',
                `Vertex ${index} carries a weight change (${incomingWeight} to ${outgoingWeight}) at a `
                + `turn whose sine is ${turnSine}, below minWeightTurnSine (${turnBar}). `
                + `Weights may change only at a visible corner: a collinear or near-collinear weight `
                + `change has no well-posed vertex velocity, and anything needing one — a dormer, for `
                + `instance — is a separate feature stitched into the roof the skeleton produces.`,
                {index});
        }
    }
}

/**
 * W-spec W4: weights are normalised so that the MINIMUM is exactly `1`, once, before anything else
 * reads them.
 *
 * The skeleton is invariant under a common scaling of all weights (every time scales by the
 * reciprocal), so one convention fixes the time unit. Minimum `1` is the one that keeps every time
 * at most the distance it came from — `t = d / w ≤ d` — so every ABSOLUTE tolerance on a time is at
 * least as wide in distance terms as it is at unit weight. (W-spec W48 derived the retired ratio bound
 * from that band; the per-pair window, stated on the faster participant, supersedes it — C8 spec T13,
 * T22.)
 *
 * ALL-ONES DIVIDES BY `1.0`, WHICH IS EXACT, so the unit-weight path is untouched bit for bit.
 *
 * `minimum` is the smallest weight of the whole input, every loop of it (skeleton loops-input spec, decision 19);
 * omitted, it is this array's own.
 */
function normaliseWeights(weights: readonly number[], minimum: number = Math.min(...weights)): number[] {
    return weights.map(weight => weight / minimum);
}

/**
 * Every check at the door, in the order the spec fixes them, returning the normalised weights.
 *
 * `unitVertices` is the caller's ring carried to unit extent — the turn guard is stated in unit
 * space (W-spec N19) — while the indices reported are the caller's own, which they still are because
 * nothing has been renumbered yet.
 *
 * The door of ONE LOOP: the one-loop case of {@link weightsAtTheDoorForLoops}, so `canonicaliseForSolve` passes
 * the door the solve entries do.
 */
function weightsAtTheDoor(
    unitVertices: readonly Vector2[],
    weights: readonly number[] | undefined,
    perceptualFloor: number,
): number[] {
    return weightsAtTheDoorForLoops([unitVertices], [{vertices: unitVertices, weights, loop: 0}], perceptualFloor)[0];
}

/**
 * THE WEIGHT DOOR OVER EVERY LOOP (skeleton loops-input spec, decisions 18 and 19), returning each loop's weights
 * divided by the smallest weight of ALL the loops.
 *
 * PER LOOP: the length, finiteness and positivity, and the visible-corner test with the loop's own wraparound,
 * so a hole's last edge meets its own first edge and not the next loop's; a hole's refusal is prefixed with its
 * name. GLOBAL: the ratio, because the bound protects the narrowest simultaneity window and edges of different
 * loops meet in events, and the division, because the solve has one time unit (W-spec W4); the visible-corner
 * test reads `Δw` against that one smallest weight. With one loop every global quantity is that loop's, and this
 * is the door as it always ran, check for check.
 */
function weightsAtTheDoorForLoops(
    unitLoops: readonly (readonly Vector2[])[],
    callerLoops: readonly CallerLoop[],
    perceptualFloor: number,
): number[][] {
    const resolved = unitLoops.map((unitLoop, k) =>
        refuseInLoop(callerLoops[k].loop, () => resolveWeightArray(unitLoop.length, callerLoops[k].weights)));
    resolved.forEach((weights, k) =>
        refuseInLoop(callerLoops[k].loop, () => assertWeightsAreFinitePositive(weights)));

    const every = resolved.flat();
    const loopOf = resolved.flatMap((weights, k) => weights.map(() => k));
    const localOf = resolved.flatMap(weights => weights.map((_unused, local) => local));
    const edgeName = resolved.length === 1
        ? (index: number) => `edge ${index}`
        : (index: number) => `edge ${localOf[index]} of ${loopName(loopOf[index])}`;
    assertWeightRatioIsInContract(every, perceptualFloor, edgeName);

    const slowest = Math.min(...every);
    unitLoops.forEach((unitLoop, k) => refuseInLoop(callerLoops[k].loop,
        () => assertWeightsChangeOnlyAtVisibleCorners(unitLoop, resolved[k], perceptualFloor, slowest)));
    return resolved.map(weights => normaliseWeights(weights, slowest));
}

/**
 * The vertices canonicalisation may not remove: those whose two incident edges differ in weight
 * (W-spec W44, arc journal decisions 120 and 124(c)).
 *
 * SUCH A VERTEX IS STRUCTURAL, WHATEVER ITS DEVIATION FROM THE CHORD. Decision 55's rule — "a vertex
 * collinear with the chord between its neighbours contributes nothing" — becomes "collinear AND
 * equal-weighted contributes nothing" under weights: the vertex is invisible in the SILHOUETTE and
 * visible in the SKELETON, because the weight change either side of it is what the client authored.
 * It is pinned, never merged in either direction.
 *
 * WELL-CONDITIONED BY THE DOOR IT HAS ALREADY PASSED. Every vertex this pins has a visible turn —
 * {@link assertWeightsChangeOnlyAtVisibleCorners} ran first — so its kernel speed is at most
 * `|w₁ − w₂| / minWeightTurnSine(δ, Δw)`. A sub-floor CHORD DEVIATION does not condition the kernel; the
 * turn does, and the turn is bounded from below.
 *
 * UNIT WEIGHTS PIN NOTHING: with every weight equal this returns an empty list, canonicalisation
 * behaves exactly as it did before pins existed, and the digest cannot move.
 */
function weightChangeVertexIndices(weights: readonly number[]): number[] {
    const pinned: number[] = [];
    for (let index = 0; index < weights.length; index++) {
        if (weights[(index - 1 + weights.length) % weights.length] !== weights[index]) {
            pinned.push(index);
        }
    }
    return pinned;
}

/**
 * Weights carried through canonicalisation's renumbering (W-spec W45).
 *
 * Edge `i` survives as edge `indexRemap[i]` when vertex `i` survives; a merged edge — one whose
 * intervening vertices were removed — takes the weight of its first constituent, which is the weight
 * of ALL of them, because {@link weightChangeVertexIndices} pinned every vertex where two weights
 * met. There is no merge rule to choose here: under W-spec W44 the choice cannot arise.
 */
function remapWeightsThroughCanonicalisation(
    weights: readonly number[],
    indexRemap: readonly number[],
    survivorCount: number,
): number[] {
    const remapped = new Array<number>(survivorCount).fill(1);
    for (let index = 0; index < indexRemap.length; index++) {
        const survivor = indexRemap[index];
        if (survivor !== REMOVED_VERTEX_INDEX) {
            remapped[survivor] = weights[index];
        }
    }
    return remapped;
}

/**
 * Weights carried through the winding reversal (W-spec W45).
 *
 * Reversing an `n`-ring sends vertex `j` to `v_{n−1−j}`, so reversed edge `j` runs from `v_{n−1−j}`
 * to `v_{n−2−j}` — which is original edge `n−2−j`, traversed backwards. A weight is a speed and is
 * indifferent to which way its edge is traversed, so the value is carried unchanged to that index.
 */
function reverseWeights(weights: readonly number[]): number[] {
    const count = weights.length;
    return weights.map((_unused, index) => weights[(count - 2 - index + count) % count]);
}

/*
 * ============================================================================
 *  THE LOOPS OF ONE INPUT — skeleton loops-input spec
 * ============================================================================
 *
 * ONE BOUNDARY PIPELINE, AND A SINGLE LOOP IS ITS ONE-LOOP CASE (decision 39). Loop 0 is the outline and loop
 * `k` the caller's hole `k - 1`. Each stage is fixed as per loop or global: the vertex checks, the weight door's
 * length, finiteness, positivity and visible-corner test, canonicalisation and winding run per loop; the
 * normalisation, the weight ratio and the division by the smallest weight are global.
 */

/** One loop as the caller gave it: its vertices, its weights, and its index among the loops. */
interface CallerLoop {
    vertices: readonly Vector2[];
    weights: readonly number[] | undefined;
    /** 0 for the outline, `k + 1` for the caller's hole `k`; its refusals carry {@link loopRefusalPrefix}. */
    loop: number;
}

/** One loop after the boundary stage: the ring the solver is given, its weights, and how it got there. */
interface SolvedLoop {
    vertices: Vector2[];
    weights: number[];
    /** Canonicalisation's map, caller vertex to canonical vertex, before any reversal. */
    indexRemap: number[];
    reversed: boolean;
}

/**
 * Run a check of one loop, prefixing its refusal with {@link loopRefusalPrefix} (decision 16). The outline's prefix is
 * empty, so its message is today's word for word. A {@link SkeletonInputRefusal} keeps its kind and index and gains
 * the loop; any other throw is passed through as before, the outline's untouched and a hole's prefixed.
 */
function refuseInLoop<T>(loop: number, check: () => T): T {
    const prefix = loopRefusalPrefix(loop);
    try {
        return check();
    } catch (error) {
        if (error instanceof SkeletonInputRefusal) {
            throw new SkeletonInputRefusal(error.kind, `${prefix}${error.message}`, {loop, index: error.index});
        }
        if (prefix === '') {
            throw error;
        }
        throw new Error(`${prefix}${error instanceof Error ? error.message : String(error)}`);
    }
}

/** Decision 16: a loop's vertex count and finiteness, before normalisation, by a throw. */
function assertLoopIsSolvable(loop: CallerLoop): void {
    const complaint = loopSolvabilityComplaint(loop.vertices);
    if (complaint !== undefined) {
        throw new SkeletonInputRefusal(complaint.kind, `${loopRefusalPrefix(loop.loop)}${complaint.message}`,
            {loop: loop.loop, index: complaint.index});
    }
}

/**
 * Decision 24: loop `k`'s caller map onto the solved graph, from canonicalisation's `indexRemap` and then the
 * reversal. A surviving vertex maps to its exterior node. A caller edge maps to the solved edge that carries it:
 * the edge leaving its start vertex or, where that vertex was removed, the merged edge leaving the nearest
 * surviving vertex before it. Reversal sends local vertex `c` of an `m`-loop to `m - 1 - c` and local edge `c` to
 * `m - 2 - c` (mod `m`), the map {@link reverseWeights} uses.
 */
function buildLoopMap(loop: SolvedLoop, start: number): SkeletonLoopMap {
    const m = loop.vertices.length;
    const solvedVertex = (canonical: number) => loop.reversed ? m - 1 - canonical : canonical;
    const solvedEdge = (canonical: number) => loop.reversed ? (m - 2 - canonical + m) % m : canonical;
    const vertexToNode = loop.indexRemap.map(canonical =>
        canonical === REMOVED_VERTEX_INDEX ? REMOVED_VERTEX_INDEX : start + solvedVertex(canonical));

    // The canonical vertex each caller edge leaves from: its own where it survived, else the nearest surviving
    // vertex before it, cyclically. Canonicalisation never leaves fewer than three, so one exists.
    let carrier = loop.indexRemap.reduce(
        (found, canonical) => canonical === REMOVED_VERTEX_INDEX ? found : canonical, REMOVED_VERTEX_INDEX);
    const edgeToEdge = loop.indexRemap.map(canonical => {
        if (canonical !== REMOVED_VERTEX_INDEX) {
            carrier = canonical;
        }
        return start + solvedEdge(carrier);
    });
    return {vertexToNode, edgeToEdge, reversed: loop.reversed};
}

/** What the boundary stage is asked to do with one input. Every value is resolved; nothing is read from options here. */
export interface BoundaryRequest {
    /** Loop 0: the outline, in the caller's coordinates. */
    vertices: readonly Vector2[];
    /** The outline's weights, one per vertex; omitted or empty is all ones. */
    weights: readonly number[] | undefined;
    /** Loops 1 onwards, in the order given. Empty for a single-loop input. */
    holes: readonly SkeletonHole[];
    /** δ: the coincidence bar, the weight door's bounds and the loop relations read it, in unit space. */
    perceptualFloor: number;
    /** The canonicalisation bar, in unit space: `perceptualFloor` unless the recursion driver restates the root's. */
    noiseFloor: number;
    /** Wind every loop (the outline clockwise, each hole counter-clockwise), or leave the caller's winding. */
    normaliseWinding: boolean;
}

/** The boundary stage's answer: the loops the solver is given, in unit space, and how each caller loop got there. */
export interface PreparedBoundary {
    /** The one transform of every loop to unit extent (decision 17), to be undone on everything handed back. */
    normalisation: SkeletonNormalisation;
    /** The loop table (decisions 6 and 7): the outline's exterior ids first, then each hole's. */
    loops: SkeletonLoop[];
    /** Each caller loop mapped onto the solved graph (decision 24), index 0 the outline. */
    loopMaps: SkeletonLoopMap[];
    /** Every loop's solved vertices, concatenated in exterior id order: the ring the solver is given. */
    vertices: Vector2[];
    /** Every loop's normalised and remapped weights, concatenated in exterior id order (decision 34). */
    weights: number[];
}

/**
 * THE BOUNDARY STAGE OF EVERY SOLVE ENTRY, in its fixed order: each loop's vertex count and finiteness, the global
 * normalisation, the weight door, then per loop canonicalisation and winding, then the loop table, the loop maps and,
 * with holes, the loop relations. Throws on input that cannot be solved at all; pushes what it did to the input onto
 * `diagnostics`, per loop, the canonicalisation before the winding.
 *
 * ONE BOUNDARY PIPELINE, AND A SINGLE LOOP IS ITS ONE-LOOP CASE (skeleton loops-input spec, decision 39). The legacy
 * entries ask it for one loop, no holes, their caller's winding and the perceptual floor as the noise floor, and
 * discard its diagnostics: with one loop and `normaliseWinding: false` the winding test decides nothing, so that is
 * the sequence they always ran.
 */
export function prepareBoundary(request: BoundaryRequest, diagnostics: SkeletonDiagnostic[]): PreparedBoundary {
    const {holes, perceptualFloor, noiseFloor, normaliseWinding} = request;
    const callerLoops: CallerLoop[] = [
        {vertices: request.vertices, weights: request.weights, loop: 0},
        ...holes.map((hole, k) => ({vertices: hole.vertices, weights: hole.weights, loop: k + 1})),
    ];
    // THROWN, NOT DIAGNOSED, PER LOOP, BEFORE NORMALISATION (decision 16). `diagnostics` reports a solve that
    // ran and came back degraded; too few vertices or a non-finite one is input this entry point cannot solve
    // at all. The outline's messages are today's word for word; a hole's carry its name.
    callerLoops.forEach(assertLoopIsSolvable);

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts`. The
    // winding test and the decomposition both run in unit space along with the solve, because both
    // carry the same absolute tolerances and both would otherwise change meaning with the caller's
    // coordinates. Everything on the returned result is carried back before it is handed over.
    // GLOBAL (decision 17): one transform from the bounding box of every loop together, so one solve has one
    // unit space and the result's `normalisation` describes every loop.
    const normalisation = makeSkeletonNormalisation(callerLoops.flatMap(loop => [...loop.vertices]));
    const unitLoops = callerLoops.map(loop => normalisePolygon(loop.vertices, normalisation));

    // THE WEIGHT DOOR, BEFORE CANONICALISATION (W-spec W1–W4, W49; arc decision 124(b)). All three
    // refusals throw here, naming the caller's own index, because nothing has renumbered anything
    // yet. With no weights this resolves to all ones and refuses nothing. Per loop and global as
    // decisions 18 and 19 fix them (see `weightsAtTheDoorForLoops`).
    const doorWeights = weightsAtTheDoorForLoops(unitLoops, callerLoops, perceptualFloor);

    const solvedLoops = unitLoops.map((unitLoop, k): SolvedLoop => {
        const prefix = loopRefusalPrefix(k);

        // CANONICALISED IMMEDIATELY AFTER, AND STILL IN UNIT SPACE. The floor is a unit-space constant,
        // which is what makes it relative by construction rather than a second tolerance system living
        // alongside the first. See `canonicalisation.ts` for what the stage removes and why removing the
        // input beats handling it. Every weight-change vertex is PINNED (W-spec W44, arc decision 120):
        // under weights such a vertex is structural whatever its deviation from the chord.
        // PER LOOP, AT THE ONE FLOOR (decision 20): a loop's pins are its own, no loop goes below three
        // vertices, and each loop that loses vertices is reported on its own.
        const canonical = canonicalisePolygon(
            unitLoop, noiseFloor, weightChangeVertexIndices(doorWeights[k]));
        let workingVertices = canonical.vertices;
        let workingWeights = remapWeightsThroughCanonicalisation(
            doorWeights[k], canonical.indexRemap, workingVertices.length);

        if (canonical.removedCount > 0) {
            diagnostics.push({
                kind: 'vertices-canonicalised',
                detail: `${prefix}${canonical.removedCount} vertex(es) removed before solving as invisible at the `
                    + `${noiseFloor} unit-space noise floor; largest discarded deviation `
                    + `${canonical.maxDeviation}. ${workingVertices.length} vertices remain.`,
            });
        }

        // WINDING, PER LOOP (decision 21): the outline clockwise and each hole counter-clockwise, by
        // `isClockwise`, so the building lies on the same side of every exterior edge (BSA.D282).
        const wantsClockwise = k === 0;
        let reversed = false;
        if (isClockwise(workingVertices) !== wantsClockwise) {
            if (normaliseWinding) {
                workingVertices = [...workingVertices].reverse();
                // W-spec W45: the weights are remapped through the reversal with the ring.
                workingWeights = reverseWeights(workingWeights);
                reversed = true;
                diagnostics.push({
                    kind: 'winding-normalised',
                    detail: k === 0
                        ? `Input was counter-clockwise; ${workingVertices.length} vertices reversed to clockwise winding before solving.`
                        : `${prefix}input was clockwise; ${workingVertices.length} vertices reversed to counter-clockwise `
                            + `winding before solving, opposite to the outline.`,
                });
            } else if (holes.length > 0) {
                // DECISION 50: A SLIVER HOLE IS DEGENERATE BEFORE IT IS MIS-WOUND. Its signed area has no sign
                // the solver can trust (decision 28), so that sign may not refuse it; it is refused as what it is.
                // Under `normaliseWinding: true` the sign only reverses it, and the loop relations below refuse it
                // in decision 27's order.
                if (k > 0 && isDegenerateHole(workingVertices, perceptualFloor)) {
                    throw new SkeletonInputRefusal('loop-conflict', describeDegenerateHole(k), {loop: k});
                }
                // DECISION 22: the option says the caller's winding is already right, and a holed solve has no
                // meaning on the wrong side of a wall. A single loop is left to solve as it always did.
                throw new SkeletonInputRefusal('mis-wound-loop', k === 0
                    ? `The outline is wound counter-clockwise, and with normaliseWinding: false a holed input must `
                        + `give its outline clockwise and its holes counter-clockwise.`
                    : `Hole ${k - 1} is wound clockwise, and with normaliseWinding: false a holed input must give `
                        + `its outline clockwise and its holes counter-clockwise.`,
                    {loop: k});
            }
        }
        return {vertices: workingVertices, weights: workingWeights, indexRemap: canonical.indexRemap, reversed};
    });

    // THE LOOP TABLE (decisions 6 and 7): the outline's exterior ids first, then each hole's in the order given,
    // each loop in its solved vertex order. The outline's ids are therefore exactly the ids it always had.
    const loops: SkeletonLoop[] = [];
    solvedLoops.forEach(loop => {
        const start = loops.length === 0 ? 0 : loops[loops.length - 1].start + loops[loops.length - 1].count;
        loops.push({start, count: loop.vertices.length});
    });
    const loopMaps = solvedLoops.map((loop, k) => buildLoopMap(loop, loops[k].start));

    // THE LOOP RELATIONS (decisions 23, 26 to 32): after canonicalisation and winding, in unit space, at δ, on
    // the loops the solver will be given, and refused by a throw naming the caller's own vertices.
    // `decomposePolygon` never sees a holed input, because it discards a counter-clockwise ring as an exterior
    // island (BSA.F93): a self-crossing loop decomposes without holes and is refused with them (decision 39).
    if (holes.length > 0) {
        const conflict = findLoopConflict(solvedLoops.map(loop => loop.vertices), perceptualFloor);
        if (conflict !== null) {
            throw new SkeletonInputRefusal('loop-conflict', describeLoopConflict(conflict, loops.map(loop => loop.count),
                (loop, local) => loopMaps[loop].vertexToNode.indexOf(loops[loop].start + local)),
                {loop: conflict.loops[0]});
        }
    }

    return {
        normalisation,
        loops,
        loopMaps,
        vertices: solvedLoops.flatMap(loop => loop.vertices),
        weights: solvedLoops.flatMap(loop => loop.weights),
    };
}

/**
 * THE LEGACY ENTRIES' BOUNDARY (`runAlgorithmV5` and `runAlgorithmV5Stepped`): {@link prepareBoundary} on one loop,
 * no holes, the caller's winding, canonicalised at the perceptual floor, its diagnostics discarded. Both entries
 * must hand the solver the same polygon for the stepped snapshots to describe the solve `runAlgorithmV5` performs.
 * Neither has a diagnostics channel, so a removal is SILENT in both, which is what makes them legacy.
 *
 * THE PERCEPTUAL FLOOR IS THE ONE OPTION THESE TWO DO HONOUR (journal decision 106), because the
 * dashboard explorer drives them and the whole point of the option is that a client's renderer, not
 * this module, decides what can be seen. It is a single scale-free value, not a region pass-down.
 */
export function prepareLegacyBoundary(
    nodes: readonly Vector2[],
    weights: readonly number[] | undefined,
    perceptualFloor: number,
): PreparedBoundary {
    return prepareBoundary(
        {vertices: nodes, weights, holes: [], perceptualFloor, noiseFloor: perceptualFloor, normaliseWinding: false},
        []);
}

/**
 * Decision 4: THE LEGACY ENTRIES TAKE NO HOLES. Their options type does not carry the field, but an options
 * object that carries a non-empty `holes` anyway is refused, naming `solveSkeleton`: neither entry has a
 * diagnostics channel, so a holed run would come back silently incomplete, and ignoring the field would silently
 * solve the outline alone. Returns the refusal, or `undefined` when there are no holes.
 */
export function legacyHolesComplaint(entry: string, options: unknown): string | undefined {
    const holes = (options as {holes?: unknown} | undefined)?.holes;
    if (!Array.isArray(holes) || holes.length === 0) {
        return undefined;
    }
    return `${entry} takes no holes, and was given ${holes.length}: only solveSkeleton solves an outline with `
        + `holes, because only it can report the state of a holed solve on its diagnostics.`;
}
