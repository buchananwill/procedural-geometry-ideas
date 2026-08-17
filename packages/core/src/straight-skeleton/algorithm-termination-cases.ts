import {
    AlgorithmStepInput,
    AlgorithmStepOutput, CollisionEvent,
    PolygonNode,
    SkeletonDiagnostic,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {stepLog} from "./logger";
import {
    areEqual,
    dotProduct,
    normalize,
    rotateCw90,
    subtractVectors,
    vectorsAreEqual
} from "./core-functions";
import {intersectRays} from "./intersection-edges";
import {
    bestNonPhantomCollision,
    collideInteriorEdges,
    makeOffsetDistance,
    sourceOffsetDistance
} from "./collision-helpers";
import {makeStraightSkeletonSolverContext} from "./solver-context";
import {initInteriorEdges, tryToAcceptExteriorEdge} from "./algorithm-helpers";
import {handleInteriorNGon} from "./algorithm-complex-cases";
import {TRIANGLE_INTERSECT_PAIRINGS} from "./constants";
import {decomposePolygon} from "./polygon-decomposition";
import {mergeSkeletonGraphs, makeMergedSolverContext} from "./graph-merge";
import {isClockwise} from "../random-polygon/geometry-helpers";
import {
    SkeletonNormalisation,
    denormaliseCollisionCache,
    denormaliseGraph,
    makeSkeletonNormalisation,
    normalisePolygon,
} from "./normalisation";
import {SKELETON_NOISE_FLOOR, canonicalisePolygon} from "./canonicalisation";

function stringifyFinalData(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): string {
    return `{"polygonEdges" :${JSON.stringify(context.getEdges(input.interiorEdges))}, "interiorEdges": ${JSON.stringify(context.getInteriorEdges(input.interiorEdges))}, "sourceNodes": ${JSON.stringify(input.interiorEdges.map(e => context.graph.nodes[context.getEdgeWithId(e).source]))}}`
}

/**
 * The offset at which a node was created, derived the same way the solver derives it
 * everywhere else. Exterior nodes sit on the boundary, so their offset is zero; an interior
 * node is born at the source offset of any bisector emitted from it.
 *
 * Returns `undefined` for a terminal interior node, which emits nothing and therefore has no
 * offset recorded anywhere for us to read.
 */
function nodeOffset(context: StraightSkeletonSolverContext, node: PolygonNode): number | undefined {
    if (node.id < context.graph.numExteriorNodes) {
        return 0;
    }

    const outInterior = node.outEdges.find(id => context.edgeRank(id) !== 'exterior');
    if (outInterior === undefined) {
        return undefined;
    }

    return sourceOffsetDistance(context.getInteriorWithId(outInterior), context);
}

/**
 * For a given edge, scan all existing nodes to see if any node lies exactly
 * along the edge's basis direction from its source.  If found, wire up
 * target / inEdges and return true.
 *
 * Several nodes can be collinear with the ray — an apex vertex sits directly beyond the
 * ridge node it feeds, for instance — so the *nearest* one wins. A bisector ends where the
 * wavefront next arrives, and taking any further node instead runs the edge backwards
 * through skeleton the solver has already resolved.
 *
 * CAUSALITY. This snap pass is an *early* part of the algorithm, written to close the
 * terminal scenario when the skeleton fully solves, and reached only from
 * `handleInteriorEdgePair`, the two-edge base case. It predates the tighter runtime checks
 * added later, and because it assigns `target` directly — computing no offset and building
 * no `CollisionEvent` — none of them can see it: not `validateSplitReachesEdge`'s
 * `notYetBorn` guard, not the `phantomDivergentOffset` classification in
 * `collideInteriorEdges`, not the `outOfBounds` check against `maxOffset`. Its own
 * `distance > 0` test is only a proxy for causality, and holds only while the bisector points
 * inward; a *secondary* bisector aimed at a distant original polygon vertex marches forward
 * along its ray but backwards in time. So the same birth-relative rule the collision path
 * applies is applied here explicitly: a snap is a collision at `distance` along the ray, so
 * its offset must not be earlier than the bisector's own birth offset. `makeOffsetDistance`
 * and `sourceOffsetDistance` are reused verbatim so this rule cannot drift away from
 * `notYetBorn`.
 */
function tryAttachEdgeToNode(context: StraightSkeletonSolverContext, edgeId: number): boolean {
    const edgeData = context.getEdgeWithId(edgeId);
    const source = context.findSource(edgeId);
    const interiorEdge = context.getInteriorWithId(edgeId);
    const ray = context.projectRayInterior(interiorEdge);
    const birthOffset = sourceOffsetDistance(interiorEdge, context);

    let nearest: PolygonNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < context.graph.nodes.length; i++) {
        if (i === edgeData.source) continue;
        const candidate = context.graph.nodes[i];
        const [direction, distance] = normalize(subtractVectors(candidate.position, source.position));
        if (!(distance > 0 && distance < nearestDistance && vectorsAreEqual(direction, edgeData.basisVector))) {
            continue;
        }

        // Same tolerance convention as `notYetBorn`: a snap exactly at the birth offset is
        // legitimate, only a strictly earlier one is rejected.
        const snapOffset = makeOffsetDistance(interiorEdge, context, ray, distance);
        const localOffset = snapOffset - birthOffset;
        if (localOffset < 0 && !areEqual(localOffset, 0)) {
            stepLog.debug(
                `Rejecting snap of e${edgeId} to node ${candidate.id}: snap offset ${snapOffset} precedes the bisector's birth offset ${birthOffset}.`,
            );
            continue;
        }

        // Stronger form, mirroring the phantom classifier: both sides must agree on when the
        // meeting happens, so the candidate's own birth offset has to match the offset this
        // bisector computes on arriving there. This earns its keep beyond the birth check above.
        // A snap mutates two things — `target` here and `inEdges` on the node — but only
        // `target` is ever rewritten downstream, so a snap that is later superseded leaves the
        // node permanently claiming an in-edge that no longer points at it. On the peanut the
        // birth check alone still let e67 and e68 snap outward before a later pass corrected
        // their targets, leaving nodes 31 and 35 holding exactly such phantom in-edges.
        const candidateOffset = nodeOffset(context, candidate);
        if (candidateOffset !== undefined && !areEqual(candidateOffset, snapOffset)) {
            stepLog.debug(
                `Rejecting snap of e${edgeId} to node ${candidate.id}: node exists at offset ${candidateOffset} but the bisector arrives at ${snapOffset}.`,
            );
            continue;
        }

        nearest = candidate;
        nearestDistance = distance;
    }

    if (nearest === undefined) {
        return false;
    }

    edgeData.target = nearest.id;
    nearest.inEdges.push(edgeId);
    return true;
}

/**
 * Pre-pass: try to resolve every edge in the input by snapping it to an
 * existing node.  Returns the list of edge IDs that could NOT be resolved
 * (and therefore still need collision handling).
 */
function resolveEdgesPointingAtNodes(context: StraightSkeletonSolverContext, edgeIds: number[]): number[] {
    const unresolved: number[] = [];
    for (const id of edgeIds) {
        if (!tryAttachEdgeToNode(context, id)) {
            unresolved.push(id);
        }
    }
    return unresolved;
}

export function handleInteriorEdgePair(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 2) {
        throw new Error("Invalid call: expecting two interior edges");
    }

    const remaining = resolveEdgesPointingAtNodes(context, input.interiorEdges);

    // All edges resolved without collision
    if (remaining.length === 0) {
        context.acceptAll(input.interiorEdges);
        return {childSteps: []};
    }

    // One edge resolved, the other still needs a target — try to snap it too
    if (remaining.length === 1) {
        // The resolved edge created a new target node; re-attempt the remaining one
        if (tryAttachEdgeToNode(context, remaining[0])) {
            context.acceptAll(input.interiorEdges);
            return {childSteps: []};
        }
    }

    // Fall back to collision-based resolution
    const [id1, id2] = input.interiorEdges;
    const interior1 = context.getInteriorWithId(id1);
    const interior2 = context.getInteriorWithId(id2);

    // ANTI-PARALLEL IS NOT HEAD-ON. This used to test `dot(basis1, basis2) === -1` and cross-wire
    // on the strength of it, which is wrong: two bisectors pointing directly *away* from each
    // other are equally anti-parallel. Cross-wiring those makes each terminate at the other's
    // source, so both edges run backwards along their own basis — a 2-cycle in which the
    // wavefront vertex is drawn travelling the opposite way to the direction it actually moves.
    //
    // `intersectRays` already draws the distinction the dot product cannot. Its anti-parallel
    // branch returns 'head-on' only when the other ray's source lies *ahead* along this ray, and
    // 'parallel' when it lies behind. No new geometric rule is needed here; the existing one just
    // has to be consulted rather than re-derived badly.
    const [, , pairIntersection] = intersectRays(
        context.projectRayInterior(interior1),
        context.projectRayInterior(interior2),
    );

    // Head on Collision
    if (pairIntersection === 'head-on') {
        context.crossWireEdges(id1, id2);
    } else if (pairIntersection === 'identical-source') {
        // A SHARED SOURCE IS A TERMINAL STATE, NOT A FAILURE. Rays leaving one point in different
        // directions do not intersect, and there is nothing left for them to propagate into: the
        // wavefront has finished. `intersectRays` classifies coincident sources first, before every
        // other test, and that verdict is already computed above for the head-on check — it was
        // then discarded by `NO_COLLISION_RESULTS` as "no collision" so that the collision branch
        // below threw two lines later. No new predicate and no new tolerance is introduced here; an
        // existing decision simply stops being thrown away.
        context.terminateEdgesAtPoint([id1, id2], context.sourcePosition(id1));
    } else {
        const collisions = collideInteriorEdges(interior1, interior2, context);
        if (collisions.length === 0) {
            throw new Error(`Unable to generate any collision from last two edges: ${stringifyFinalData(context, input)}`)
        }

        // Pick the best (lowest offset, non-phantom) collision
        const best = bestNonPhantomCollision(collisions)!;

        // Co-linear collapse: cross-wire sources
        const intersectionType = best.intersectionData[2];
        if (intersectionType === 'co-linear-from-1') {
            context.crossWireEdges(id1, id2);
        } else {
            // Standard convergence — wire both edges to the collision point
            context.terminateEdgesAtPoint([id1, id2], best.position);
        }
    }

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}

/** A terminal point and the wavefront offset at which every face reaches it. */
interface TerminalSolution {
    position: Vector2;
    /** The wavefront clock `t`: the offset from the supporting lines at which they meet here. */
    offset: number;
}

type Row3 = [number, number, number];

function determinant3(row0: Row3, row1: Row3, row2: Row3): number {
    return row0[0] * (row1[1] * row2[2] - row1[2] * row2[1])
        - row0[1] * (row1[0] * row2[2] - row1[2] * row2[0])
        + row0[2] * (row1[0] * row2[1] - row1[1] * row2[0]);
}

/** The exterior edges bounding these interior edges' faces, deduplicated, in first-seen order. */
function distinctExteriorParents(context: StraightSkeletonSolverContext, interiorEdgeIds: number[]): number[] {
    const parents: number[] = [];
    for (const edgeId of interiorEdgeIds) {
        const interior = context.getInteriorWithId(edgeId);
        for (const parent of [interior.clockwiseExteriorEdgeIndex, interior.widdershinsExteriorEdgeIndex]) {
            if (!parents.includes(parent)) {
                parents.push(parent);
            }
        }
    }
    return parents;
}

/**
 * Where three offset lines meet, and when — solved in closed form, with no tolerance anywhere.
 *
 * Each supporting line contributes `n . P - t = n . A`, where `n` is that edge's inward unit
 * normal and `A` any point on it. Three of them are three equations in the three unknowns
 * `(x, y, t)`, solved here by Cramer's rule.
 *
 * THE WAVEFRONT CLOCK IS AN UNKNOWN, NOT A CONSTRAINT CHECKED AFTERWARDS. That is what makes this
 * stronger than intersecting two bisectors and then pricing the result on each edge's clock and
 * hoping the two agree: the returned point is by construction the one place all three offset lines
 * coincide at a single common offset. It also means the solve never reads a bisector source, so
 * coincident sources stop being a case.
 *
 * THE INWARD NORMAL IS NOT RE-DERIVED HERE. It is `rotateCw90` of the edge's unit basis, which is
 * the convention `FaceEdge.normal` already establishes in `parcel-slicing.ts` — inward for a
 * clockwise ring, and the normal against which `(p - start) . normal` is the skeleton offset within
 * that edge's face. `initBoundingPolygon` orients every exterior edge from its own node to the
 * next, so that basis and that rotation agree with the face model exactly. An outward normal
 * produces a negative `t` that is internally consistent and wrong; the caller tests the sign.
 *
 * Returns `undefined` when the system is singular, which is malformed input rather than poor
 * conditioning: across 785 measured terminals the determinant never fell below 0.106 in magnitude.
 */
function solveTerminalPoint(
    context: StraightSkeletonSolverContext,
    exteriorParentIds: number[],
): TerminalSolution | undefined {
    const lines = exteriorParentIds.map(parentId => {
        const normal = rotateCw90(context.getEdgeWithId(parentId).basisVector);
        return {normal, offsetFromOrigin: dotProduct(normal, context.sourcePosition(parentId))};
    });

    const rows = lines.map<Row3>(line => [line.normal.x, line.normal.y, -1]);
    const rhs = lines.map(line => line.offsetFromOrigin);

    const determinant = determinant3(rows[0], rows[1], rows[2]);
    if (areEqual(determinant, 0)) {
        return undefined;
    }

    const substituted = (column: number): number => {
        const replaced = rows.map<Row3>((row, index) => {
            const copy: Row3 = [row[0], row[1], row[2]];
            copy[column] = rhs[index];
            return copy;
        });
        return determinant3(replaced[0], replaced[1], replaced[2]) / determinant;
    };

    return {position: {x: substituted(0), y: substituted(1)}, offset: substituted(2)};
}

/**
 * The closed-form answer for this terminal triangle, or `undefined` when the assumptions it rests
 * on do not hold — in which case the existing collision path resolves the step instead.
 *
 * Every fall-through is logged, because each one is an assumption made observable rather than an
 * assumption trusted: all 785 measured terminals had exactly three distinct parents and a
 * well-conditioned system, but that is a measurement on one corpus and not a proof.
 */
function solveTerminalTriangle(
    context: StraightSkeletonSolverContext,
    interiorEdgeIds: number[],
): TerminalSolution | undefined {
    const parents = distinctExteriorParents(context, interiorEdgeIds);
    if (parents.length !== 3) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] has ${parents.length} distinct exterior parents, `
            + `not three, so the three-line system is not determined: falling through to the collision path.`,
        );
        return undefined;
    }

    const solution = solveTerminalPoint(context, parents);
    if (solution === undefined) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] over parents [${parents.join(', ')}] has a singular `
            + `determinant: falling through to the collision path.`,
        );
        return undefined;
    }

    // The offset is the wavefront clock, measured outwards from the boundary, so it cannot run
    // backwards. A negative one means the normals came out pointing away from the interior — the
    // one sign-sensitive step in this construction — and the position it pairs with is worthless.
    if (solution.offset < 0 && !areEqual(solution.offset, 0)) {
        stepLog.debug(
            `Terminal triangle [${interiorEdgeIds.join(', ')}] solved to a negative offset `
            + `${solution.offset}, so its parents' normals point outward: falling through to the collision path.`,
        );
        return undefined;
    }

    return solution;
}

export function handleInteriorEdgeTriangle(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    if (input.interiorEdges.length !== 3) {
        throw new Error("Invalid call: expecting three interior edges");
    }

    const terminal = solveTerminalTriangle(context, input.interiorEdges);
    if (terminal !== undefined) {
        context.terminateEdgesAtPoint(input.interiorEdges, terminal.position);
        context.acceptAll(input.interiorEdges);

        return {
            childSteps: []
        }
    }

    const allCollisions: CollisionEvent[] = [];
    for (const [index1, index2] of TRIANGLE_INTERSECT_PAIRINGS) {
        const edge1 = context.getInteriorWithId(input.interiorEdges[index1]);
        const edge2 = context.getInteriorWithId(input.interiorEdges[index2]);
        allCollisions.push(...collideInteriorEdges(edge1, edge2, context));
    }

    // Pick the best non-phantom collision; fall back to any collision
    const best = bestNonPhantomCollision(allCollisions);

    if (!best) {
        throw new Error(`Failed to collide interior edges in triangle: ${stringifyFinalData(context, input)}`);
    }

    context.terminateEdgesAtPoint(input.interiorEdges, best.position);

    context.acceptAll(input.interiorEdges);

    return {
        childSteps: []
    }
}


export function handleAlgorithmStepInput(context: StraightSkeletonSolverContext, input: AlgorithmStepInput): AlgorithmStepOutput {
    const result: AlgorithmStepOutput = {
        childSteps: []
    };

    if (input.interiorEdges.length < 2) {
        throw new Error("Fewer than 2 interior edges is not a valid skeleton state")
    }

    if (input.interiorEdges.length === 2) {
        result.childSteps.push(...handleInteriorEdgePair(context, input).childSteps)
    }

    if (input.interiorEdges.length === 3) {
        result.childSteps.push(...handleInteriorEdgeTriangle(context, input).childSteps)
    }

    if (input.interiorEdges.length > 3) {
        result.childSteps.push(...handleInteriorNGon(context, input).childSteps)
    }

    return result;
}

export function stepAlgorithm(context: StraightSkeletonSolverContext, inputs: AlgorithmStepInput[]): AlgorithmStepOutput {
    const childSteps: AlgorithmStepInput[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
        try {
            childSteps.push(...handleAlgorithmStepInput(context, input).childSteps);
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }
    }

    if (errors.length > 0) {
        stepLog.warn(`stepAlgorithm: ${errors.length} sub-polygon(s) failed:\n${errors.join('\n')}`);
    }

    return {
        childSteps: childSteps.filter(steps => steps.interiorEdges.length > 1),
        errors
    }
}

/** Outcome of solving one simple (non-self-intersecting) polygon. */
interface SimplePolygonRun {
    context: StraightSkeletonSolverContext;
    /** Messages accumulated from every `stepAlgorithm` iteration of this run. */
    errors: string[];
}

/** Run the straight skeleton algorithm on a single simple (non-self-intersecting) polygon. */
function runSimplePolygon(nodes: Vector2[]): SimplePolygonRun {
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges]
    const errors: string[] = [];

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}]
    while (inputs.length > 0) {
        const output = stepAlgorithm(context, inputs);
        errors.push(...(output.errors ?? []));
        inputs = output.childSteps
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id))
    }

    return {context, errors}
}

/**
 * Legacy entry point, preserved verbatim for existing callers.
 *
 * It reports nothing about how well the solve went, and retains four silent-failure modes:
 * 1. Counter-clockwise input does not throw — it yields a graph with only the boundary and no
 *    resolved interior edges.
 * 2. Per-sub-polygon exceptions are swallowed by `stepAlgorithm`, so a partially-resolved
 *    skeleton is indistinguishable from a complete one.
 * 3. Self-intersecting input returns the merged solver context, whose helpers throw when called.
 * 4. Input canonicalisation can remove vertices, so the returned graph may carry fewer exterior
 *    nodes than the caller passed in, with nothing said about it. There is no diagnostics channel
 *    here to say it on — which is the whole reason this entry point is legacy.
 *
 * Prefer {@link solveSkeleton}, which normalises winding, reports every one of those on
 * `diagnostics`, and returns `context: null` instead of a throwing stub for the merged path.
 */
export function runAlgorithmV5(nodes: Vector2[]): StraightSkeletonSolverContext {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts` for
    // why, for the enumeration of what scales, and for why it must never be re-applied mid-solve.
    // The decomposition runs in UNIT space along with the solve, because its crossing test carries
    // the same absolute tolerances the solver does.
    const normalisation = makeSkeletonNormalisation(nodes);
    // CANONICALISED IN UNIT SPACE, immediately after. See `canonicalisation.ts`. The removal is
    // silent here for want of anywhere to report it; `solveSkeleton` reports it.
    const unitNodes = canonicalisePolygon(normalisePolygon(nodes, normalisation), SKELETON_NOISE_FLOOR).vertices;

    const decomposition = decomposePolygon(unitNodes);

    if (!decomposition.wasSelfIntersecting) {
        const context = runSimplePolygon(unitNodes).context;
        // BOTH HALVES OF THE CONTEXT, because both are handed to the caller and a cache left in unit
        // space would answer in the wrong units about edges that are still perfectly valid.
        denormaliseGraph(context.graph, normalisation);
        denormaliseCollisionCache(context.collisionCache, normalisation);
        return context;
    }

    const subResults = decomposition.subPolygons.map(subPoly => ({
        graph: runSimplePolygon(subPoly).context.graph,
    }));

    // MERGED IN UNIT SPACE, then denormalised. The merge deduplicates crossing-point nodes with
    // `vectorsAreEqual`, which is the same absolute tolerance, so it has to see unit coordinates too.
    const merged = mergeSkeletonGraphs(subResults, decomposition.crossingPoints);
    const mergedContext = makeMergedSolverContext(merged);
    denormaliseGraph(mergedContext.graph, normalisation);
    denormaliseCollisionCache(mergedContext.collisionCache, normalisation);
    return mergedContext;
}

export interface SolveSkeletonOptions {
    /**
     * Reverse counter-clockwise input before solving. The solver only handles clockwise
     * winding; leaving this off on counter-clockwise input produces an unresolved skeleton.
     * Defaults to `true`.
     */
    normaliseWinding?: boolean;
    /**
     * Override the deviation below which an input vertex is treated as invisible and removed.
     * Defaults to {@link SKELETON_NOISE_FLOOR}.
     *
     * IN UNIT SPACE, NOT THE CALLER'S. Canonicalisation runs after the polygon has been carried to
     * unit extent, so this value does NOT go through `normaliseLength` — it is compared directly
     * against unit-space deviations, which is what makes it relative by construction. See
     * `canonicalisation.ts`.
     *
     * THE FLOOR BELONGS TO THE ROOT REGION, which is why it is accepted here rather than derived from
     * the polygon. For a direct call the two coincide. The recursion driver will pass a sub-region's
     * root floor down through this option, because normalising a thin sliver to its own extent would
     * scale it up enormously and leave it holding every degenerate vertex it has.
     *
     * Zero is an exact identity — nothing is removed — which is the supported way to turn the stage
     * off and measure what it is buying.
     */
    noiseFloor?: number;
}

/** Collect the interior edges of a solved graph that never acquired a target node. */
function findUnresolvedInteriorEdgeIds(graph: StraightSkeletonGraph): number[] {
    return graph.interiorEdges
        .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined)
        .map(interiorEdge => interiorEdge.id);
}

function pushStepFailures(diagnostics: SkeletonDiagnostic[], errors: string[]): void {
    for (const error of errors) {
        diagnostics.push({kind: 'step-failure', detail: error});
    }
}

/**
 * Primary entry point: solve the straight skeleton and report how complete the answer is.
 *
 * Unlike {@link runAlgorithmV5}, every degraded outcome is visible on the returned value —
 * winding correction, self-intersection, swallowed step failures, and interior edges that
 * never resolved all appear in `diagnostics`, and `complete` summarises whether the skeleton
 * can be trusted.
 *
 * Throws only when there are fewer than three vertices.
 */
export function solveSkeleton(vertices: Vector2[], options?: SolveSkeletonOptions): SkeletonSolveResult {
    if (vertices.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }

    const normaliseWinding = options?.normaliseWinding ?? true;
    const noiseFloor = options?.noiseFloor ?? SKELETON_NOISE_FLOOR;
    const diagnostics: SkeletonDiagnostic[] = [];

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts`. The
    // winding test and the decomposition both run in unit space along with the solve, because both
    // carry the same absolute tolerances and both would otherwise change meaning with the caller's
    // coordinates. Everything on the returned result is carried back before it is handed over.
    const normalisation = makeSkeletonNormalisation(vertices);
    const unitVertices = normalisePolygon(vertices, normalisation);

    // CANONICALISED IMMEDIATELY AFTER, AND STILL IN UNIT SPACE. The floor is a unit-space constant,
    // which is what makes it relative by construction rather than a second tolerance system living
    // alongside the first. See `canonicalisation.ts` for what the stage removes and why removing the
    // input beats handling it.
    const canonical = canonicalisePolygon(unitVertices, noiseFloor);
    let workingVertices = canonical.vertices;

    if (canonical.removedCount > 0) {
        diagnostics.push({
            kind: 'vertices-canonicalised',
            detail: `${canonical.removedCount} vertex(es) removed before solving as invisible at the `
                + `${noiseFloor} unit-space noise floor; largest discarded deviation `
                + `${canonical.maxDeviation}. ${workingVertices.length} vertices remain.`,
        });
    }

    if (normaliseWinding && !isClockwise(workingVertices)) {
        workingVertices = [...workingVertices].reverse();
        diagnostics.push({
            kind: 'winding-normalised',
            detail: `Input was counter-clockwise; ${workingVertices.length} vertices reversed to clockwise winding before solving.`,
        });
    }

    const decomposition = decomposePolygon(workingVertices);

    let graph: StraightSkeletonGraph;
    let context: StraightSkeletonSolverContext | null;

    if (decomposition.wasSelfIntersecting) {
        diagnostics.push({
            kind: 'self-intersecting',
            detail: `Input self-intersects; decomposed into ${decomposition.subPolygons.length} sub-polygon(s) at ${decomposition.crossingPoints.length} crossing point(s) and merged. Solver context is unavailable for merged results.`,
        });

        const subResults = decomposition.subPolygons.map(subPolygon => {
            const run = runSimplePolygon(subPolygon);
            pushStepFailures(diagnostics, run.errors);
            return {graph: run.context.graph};
        });

        graph = mergeSkeletonGraphs(subResults, decomposition.crossingPoints).graph;
        context = null;
    } else {
        const run = runSimplePolygon(workingVertices);
        pushStepFailures(diagnostics, run.errors);
        graph = run.context.graph;
        context = run.context;
    }

    // BEFORE ANYTHING READS THE GRAPH, so that the unresolved-edge scan, the completeness flag and
    // everything the caller subsequently does all see one graph in one space.
    denormaliseGraph(graph, normalisation);
    if (context !== null) {
        denormaliseCollisionCache(context.collisionCache, normalisation);
    }

    const unresolvedEdgeIds = findUnresolvedInteriorEdgeIds(graph);
    if (unresolvedEdgeIds.length > 0) {
        diagnostics.push({
            kind: 'unresolved-edges',
            detail: `${unresolvedEdgeIds.length} interior edge(s) finished without a target node: ${unresolvedEdgeIds.join(', ')}.`,
        });
    }

    const blocking = diagnostics.some(d => d.kind === 'step-failure' || d.kind === 'unresolved-edges');
    const complete = !blocking && graph.interiorEdges.length > 0;

    return {graph, context, complete, diagnostics, normalisation};
}

export interface SteppedAlgorithmResult {
    /** Graph snapshots: index 0 = after init, 1..N = after each while-loop iteration */
    snapshots: StraightSkeletonGraph[];
    /** Non-null if the algorithm threw an error */
    error: string | null;
}

/**
 * Carry every snapshot back to caller space, once each.
 *
 * DEDUPLICATED BY OBJECT IDENTITY, because `mergeSkeletonGraphs` returns its single input graph by
 * reference when there is exactly one sub-polygon and no crossing point — in which case the merged
 * "final" snapshot IS the last sub-polygon snapshot, and denormalising the list naively would scale
 * that one graph twice. Nothing in a graph could detect a double application afterwards.
 */
function denormaliseSnapshots(snapshots: StraightSkeletonGraph[], normalisation: SkeletonNormalisation): void {
    const done = new Set<StraightSkeletonGraph>();
    for (const snapshot of snapshots) {
        if (done.has(snapshot)) {
            continue;
        }
        done.add(snapshot);
        denormaliseGraph(snapshot, normalisation);
    }
}

export function runAlgorithmV5Stepped(nodes: Vector2[]): SteppedAlgorithmResult {
    if (nodes.length < 3) {
        return {snapshots: [], error: "Must have at least three nodes to perform algorithm"};
    }

    // NORMALISED ONCE, HERE. See `normalisation.ts`. EVERY SNAPSHOT is denormalised on the way out,
    // not just the last: they are what a debug visualiser draws, and scrubbing through a sequence of
    // graphs half of which were in unit space would be worse than useless.
    const normalisation = makeSkeletonNormalisation(nodes);
    // CANONICALISED IN UNIT SPACE, immediately after, so the stepped visualiser walks the same
    // polygon the solving entry points do. See `canonicalisation.ts`.
    const unitNodes = canonicalisePolygon(normalisePolygon(nodes, normalisation), SKELETON_NOISE_FLOOR).vertices;

    const decomposition = decomposePolygon(unitNodes);

    if (!decomposition.wasSelfIntersecting) {
        const result = runSimplePolygonStepped(unitNodes);
        denormaliseSnapshots(result.snapshots, normalisation);
        return result;
    }

    // For decomposed polygons, run each sub-polygon stepped and concatenate snapshots,
    // with the merged graph as the final snapshot.
    const allSnapshots: StraightSkeletonGraph[] = [];
    const subGraphs: StraightSkeletonGraph[] = [];
    let lastError: string | null = null;

    for (const subPoly of decomposition.subPolygons) {
        const result = runSimplePolygonStepped(subPoly);
        allSnapshots.push(...result.snapshots);
        if (result.error) lastError = result.error;
        if (result.snapshots.length > 0) {
            subGraphs.push(result.snapshots[result.snapshots.length - 1]);
        }
    }

    // Append merged graph as final snapshot. Merged in UNIT space, because the crossing-point
    // deduplication compares positions under the same absolute tolerance the solver uses.
    const merged = mergeSkeletonGraphs(
        subGraphs.map(graph => ({graph})),
        decomposition.crossingPoints,
    );
    allSnapshots.push(merged.graph);

    denormaliseSnapshots(allSnapshots, normalisation);

    return {snapshots: allSnapshots, error: lastError};
}

function runSimplePolygonStepped(nodes: Vector2[]): SteppedAlgorithmResult {
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    const snapshots: StraightSkeletonGraph[] = [structuredClone(context.graph)];
    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];

    try {
        while (inputs.length > 0) {
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
            snapshots.push(structuredClone(context.graph));
        }
        return {snapshots, error: null};
    } catch (e) {
        snapshots.push(structuredClone(context.graph));
        return {snapshots, error: e instanceof Error ? e.message : String(e)};
    }
}