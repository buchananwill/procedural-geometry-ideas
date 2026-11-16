import {
    CausalityViolationDiagnostic,
    PerceptualFloorOptions,
    SkeletonDiagnostic,
    SkeletonLoop,
    SkeletonSolveResult,
    SolveSkeletonOptions,
    SteppedAlgorithmResult,
    SteppedSkeletonSolveResult,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
    WeightOptions,
} from "./types";
import {runSimplePolygon, runSimplePolygonStepped, SimplePolygonRun, SolveStepObserver} from "./step-driver";
import {
    CallerLoop,
    SolvedLoop,
    assertLoopIsSolvable,
    assertVerticesAreFinite,
    buildLoopMap,
    canonicaliseInUnitSpace,
    legacyHolesComplaint,
    nonFiniteVertexComplaint,
    remapWeightsThroughCanonicalisation,
    reverseWeights,
    weightChangeVertexIndices,
    weightsAtTheDoor,
    weightsAtTheDoorForLoops,
} from "./boundary-stage";
import {describeLoopConflict, findLoopConflict, isDegenerateHole} from "./skeleton-loops";
import {decomposePolygon} from "./polygon-decomposition";
import {checkWavefrontCausality} from "./causality-check";
import {HOLED_UNCULLED_SELF_LOOP, holedSkeletonViolations} from "./holed-guard";
import {mergeSkeletonGraphs, makeMergedSolverContext} from "./graph-merge";
import {isClockwise} from "./planar-geometry";
import {
    SkeletonNormalisation,
    denormaliseCollisionCache,
    denormaliseGraph,
    denormalisePosition,
    denormalisePositionUncertainties,
    makeSkeletonNormalisation,
    normalisePolygon,
} from "./normalisation";
import {
    REMOVED_VERTEX_INDEX,
    canonicalisePolygon,
    resolvePerceptualFloor,
} from "./canonicalisation";

/*
 * THE SOLVE ENTRIES: `solveSkeleton` and its stepped twin `solveSkeletonStepped`, and the two legacy entries
 * `runAlgorithmV5` and `runAlgorithmV5Stepped`.
 */

/**
 * Carry the solve's own informational reports onto the caller's diagnostics list (spec A19).
 *
 * `errors` already carries what a step THREW; this carries what a step DECIDED and had no other way
 * to say — today, only the coaxial completion. Written once because the self-intersecting path runs
 * one context per sub-polygon and every one of them has to be heard.
 */
function pushSolveDiagnostics(diagnostics: SkeletonDiagnostic[], run: SimplePolygonRun): void {
    diagnostics.push(...run.context.diagnostics);
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
export function runAlgorithmV5(
    nodes: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): StraightSkeletonSolverContext {
    const holesComplaint = legacyHolesComplaint('runAlgorithmV5', options);
    if (holesComplaint !== undefined) {
        throw new Error(holesComplaint);
    }
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    assertVerticesAreFinite(nodes);
    const perceptualFloor = resolvePerceptualFloor(options);

    // NORMALISED ONCE, HERE, BEFORE ANYTHING ELSE LOOKS AT THE POLYGON. See `normalisation.ts` for
    // why, for the enumeration of what scales, and for why it must never be re-applied mid-solve.
    // The decomposition runs in UNIT space along with the solve, because its crossing test carries
    // the same absolute tolerances the solver does. Canonicalisation follows immediately, in unit
    // space — see {@link canonicaliseInUnitSpace} and `canonicalisation.ts`.
    const normalisation = makeSkeletonNormalisation(nodes);
    // THE WEIGHT DOOR RUNS BEFORE CANONICALISATION (W-spec W49, arc decision 124(b)), so a refusal
    // names the caller's own vertex index.
    const doorWeights = weightsAtTheDoor(normalisePolygon(nodes, normalisation), options?.weights, perceptualFloor);
    const canonical = canonicaliseInUnitSpace(
        nodes, normalisation, perceptualFloor, weightChangeVertexIndices(doorWeights));
    const unitNodes = canonical.vertices;
    const canonicalWeights = remapWeightsThroughCanonicalisation(
        doorWeights, canonical.indexRemap, unitNodes.length);

    const decomposition = decomposePolygon(unitNodes, perceptualFloor, undefined, canonicalWeights);

    if (!decomposition.wasSelfIntersecting) {
        const context = runSimplePolygon(unitNodes, perceptualFloor, canonicalWeights).context;
        // BOTH HALVES OF THE CONTEXT, because both are handed to the caller and a cache left in unit
        // space would answer in the wrong units about edges that are still perfectly valid.
        denormaliseGraph(context.graph, normalisation);
        denormaliseCollisionCache(context.collisionCache, normalisation);
        denormalisePositionUncertainties(context.positionUncertainties, normalisation);
        return context;
    }

    const subResults = decomposition.subPolygons.map((subPoly, index) => ({
        graph: runSimplePolygon(
            subPoly, perceptualFloor, decomposition.subPolygonWeights[index]).context.graph,
    }));

    // MERGED IN UNIT SPACE, then denormalised. The merge deduplicates crossing-point nodes with
    // `vectorsAreEqual`, which is the same absolute tolerance, so it has to see unit coordinates too.
    const merged = mergeSkeletonGraphs(subResults, decomposition.crossingPoints);
    const mergedContext = makeMergedSolverContext(merged, perceptualFloor);
    denormaliseGraph(mergedContext.graph, normalisation);
    denormaliseCollisionCache(mergedContext.collisionCache, normalisation);
    return mergedContext;
}

/** Collect the interior edges of a solved graph that never acquired a target node. */
function findUnresolvedInteriorEdgeIds(graph: StraightSkeletonGraph): number[] {
    return graph.interiorEdges
        .filter(interiorEdge => graph.edges[interiorEdge.id]?.target === undefined)
        .map(interiorEdge => interiorEdge.id);
}

/** Carry the causality check's findings onto the diagnostics list, each detail prefixed by `where`. */
function pushCausalityViolations(
    diagnostics: SkeletonDiagnostic[],
    violations: CausalityViolationDiagnostic[],
    where: string,
): void {
    for (const found of violations) {
        diagnostics.push({...found, detail: `${where}${found.detail}`});
    }
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
 * HOLES ARRIVE ON `options.holes` (skeleton loops-input spec). Every loop goes through the one boundary
 * pipeline below, of which a single loop is the one-loop case (decision 39), so a single-loop input solves to
 * the graph it always solved to. A holed solve steps like any other (skeleton join-and-divide spec, decision 34).
 *
 * Throws when the input cannot be solved at all: a loop with fewer than three vertices or a non-finite one, a
 * refusal at the weight door, a mis-wound loop of a holed input under `normaliseWinding: false`, and loops that
 * cross, touch or nest wrongly. Each refusal names the loop and the caller's own vertex index (decision 26).
 */
export function solveSkeleton(vertices: Vector2[], options?: SolveSkeletonOptions): SkeletonSolveResult {
    return solveSkeletonObserved(vertices, options, undefined);
}

/**
 * {@link solveSkeleton}'s pipeline, with an optional observer on the simple path's run (dashboard holed-fixtures spec,
 * decision 19). The two entries run this one pipeline; with no observer it is `solveSkeleton` itself.
 */
function solveSkeletonObserved(
    vertices: Vector2[],
    options: SolveSkeletonOptions | undefined,
    observer: SolveStepObserver | undefined,
): SkeletonSolveResult {
    const holes = options?.holes ?? [];
    const callerLoops: CallerLoop[] = [
        {vertices, weights: options?.weights, prefix: ''},
        ...holes.map((hole, k) => ({vertices: hole.vertices, weights: hole.weights, prefix: `Hole ${k}: `})),
    ];
    // THROWN, NOT DIAGNOSED, PER LOOP, BEFORE NORMALISATION (decision 16). `diagnostics` reports a solve that
    // ran and came back degraded; too few vertices or a non-finite one is input this entry point cannot solve
    // at all. The outline's messages are today's word for word; a hole's carry its name.
    callerLoops.forEach(assertLoopIsSolvable);

    const normaliseWinding = options?.normaliseWinding ?? true;
    // ONE FLOOR, TWO READINGS OF IT. `perceptualFloor` is the client's value and governs the
    // coincidence bar inside the solve; `noiseFloor` is the canonicalisation bar, which defaults to
    // the same value and is overridden ONLY by the recursion driver, which has already restated the
    // root's floor in this region's units. See `PerceptualFloorOptions`.
    const perceptualFloor = resolvePerceptualFloor(options);
    const noiseFloor = options?.noiseFloor ?? perceptualFloor;
    const diagnostics: SkeletonDiagnostic[] = [];

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
        const prefix = callerLoops[k].prefix;

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
                    throw new Error(describeLoopConflict({kind: 'degenerate-hole', loops: [k], edges: []},
                        [], () => REMOVED_VERTEX_INDEX));
                }
                // DECISION 22: the option says the caller's winding is already right, and a holed solve has no
                // meaning on the wrong side of a wall. A single loop is left to solve as it always did.
                throw new Error(k === 0
                    ? `The outline is wound counter-clockwise, and with normaliseWinding: false a holed input must `
                        + `give its outline clockwise and its holes counter-clockwise.`
                    : `Hole ${k - 1} is wound clockwise, and with normaliseWinding: false a holed input must give `
                        + `its outline clockwise and its holes counter-clockwise.`);
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
            throw new Error(describeLoopConflict(conflict, loops.map(loop => loop.count),
                (loop, local) => loopMaps[loop].vertexToNode.indexOf(loops[loop].start + local)));
        }
    }

    const workingVertices = solvedLoops.flatMap(loop => loop.vertices);
    const workingWeights = solvedLoops.flatMap(loop => loop.weights);
    const decomposition = holes.length === 0
        ? decomposePolygon(workingVertices, perceptualFloor, undefined, workingWeights)
        : null;

    let graph: StraightSkeletonGraph;
    let context: StraightSkeletonSolverContext | null;

    if (decomposition !== null && decomposition.wasSelfIntersecting) {
        diagnostics.push({
            kind: 'self-intersecting',
            detail: `Input self-intersects; decomposed into ${decomposition.subPolygons.length} sub-polygon(s) at ${decomposition.crossingPoints.length} crossing point(s) and merged. Solver context is unavailable for merged results.`,
        });

        const subResults = decomposition.subPolygons.map((subPolygon, index) => {
            // W-spec W45: each piece of a split edge carries its original edge's weight.
            const run = runSimplePolygon(
                subPolygon, perceptualFloor, decomposition.subPolygonWeights[index]);
            pushStepFailures(diagnostics, run.errors);
            pushSolveDiagnostics(diagnostics, run);
            // THE CAUSALITY CHECK RUNS PER SUB-POLYGON ON THIS PATH, BEFORE THE MERGE, AND IN UNIT
            // SPACE (journal-5 decision 148). The merged graph interleaves every sub-graph's exterior
            // and interior edges in one id space, so its exterior nodes are not one ring and a parent
            // index does not name `nodes[parent] -> nodes[parent + 1]`: the oracles' definitions do
            // not apply to it. Each sub-graph is an ordinary simple solve, and the ids reported are
            // that sub-graph's, named by its index.
            pushCausalityViolations(
                diagnostics, checkWavefrontCausality(run.context.graph, perceptualFloor, 1), `Sub-polygon ${index}: `);
            return {graph: run.context.graph};
        });

        graph = mergeSkeletonGraphs(subResults, decomposition.crossingPoints).graph;
        context = null;
    } else {
        const run = runSimplePolygon(workingVertices, perceptualFloor, workingWeights, loops, observer);
        pushStepFailures(diagnostics, run.errors);
        pushSolveDiagnostics(diagnostics, run);
        graph = run.context.graph;
        context = run.context;
    }

    // THE GUARD ON A HOLED SOLVE (BSA.D314, BSA.D318; `holed-guard.ts`) READS THE SOLVER'S OWN ANSWER, IN UNIT SPACE,
    // before it is carried back: carried back, far from the origin, every node is rounded to the caller's coordinates by more
    // than the floor, and the guard would read that rounding as a wrong answer. It only reads the graph; whether its
    // findings count is decided below, once the solve is known to be otherwise complete. A single-loop graph never
    // reaches it.
    const holedFindings = graph.loops.length > 1
        ? holedSkeletonViolations(graph, graph.loops.length - 1, perceptualFloor, 1,
            position => denormalisePosition(normalisation, position))
        : [];

    // BEFORE ANYTHING ELSE READS THE GRAPH, so that the unresolved-edge scan, the completeness flag and
    // everything the caller subsequently does all see one graph in one space.
    denormaliseGraph(graph, normalisation);
    if (context !== null) {
        denormaliseCollisionCache(context.collisionCache, normalisation);
        denormalisePositionUncertainties(context.positionUncertainties, normalisation);
    }

    // THE CAUSALITY CHECK, ALWAYS ON (journal-5 decision 148). Run on the returned, caller-space
    // graph with its lengths carried into unit space, at the solve's perceptual floor. It only reads
    // the graph. It does NOT enter `blocking` below: `complete` keeps its meaning, and the diagnostic
    // is what makes a causally wrong answer signalled. The merged path ran it per sub-polygon above.
    // Pushed BEFORE the unresolved-edge report so that, as on the merged path, a failing solve's
    // diagnostics still end with `unresolved-edges`.
    if (context !== null) {
        pushCausalityViolations(
            diagnostics, checkWavefrontCausality(graph, perceptualFloor, normalisation.toUnitScale), '');
    }

    const unresolvedEdgeIds = findUnresolvedInteriorEdgeIds(graph);
    if (unresolvedEdgeIds.length > 0) {
        diagnostics.push({
            kind: 'unresolved-edges',
            detail: `${unresolvedEdgeIds.length} interior edge(s) finished without a target node: ${unresolvedEdgeIds.join(', ')}.`,
        });
    }

    // The two refusals of a step of several rings block by themselves (skeleton join-and-divide spec, decisions 24
    // and 35); each also leaves a step failure and unresolved edges behind it.
    const blocking = diagnostics.some(d => d.kind === 'step-failure' || d.kind === 'unresolved-edges'
        || d.kind === 'simultaneous-across-rings' || d.kind === 'multi-ring-step-refused');

    // THE GUARD ON A HOLED SOLVE (BSA.D314, BSA.D318; `holed-guard.ts`): a result of more than one loop that would
    // otherwise be complete is checked for its topology, its nodes' equal time, its edges' time order and its arcs'
    // planarity (read above, in unit space, at the solve's perceptual floor), and each violation is a BLOCKING
    // diagnostic. An un-culled self-loop is reported and blocks nothing. It changes nothing in the graph. A single-loop
    // result never reaches it, so it is unchanged.
    const guardFindings = !blocking && graph.interiorEdges.length > 0 ? holedFindings : [];
    diagnostics.push(...guardFindings);
    const guardBlocks = guardFindings.some(finding => finding.kind !== HOLED_UNCULLED_SELF_LOOP);
    const complete = !blocking && !guardBlocks && graph.interiorEdges.length > 0;

    return {
        graph,
        context,
        complete,
        diagnostics,
        normalisation,
        // Every loop's weights, concatenated in exterior id order (decision 34); the outline's alone with no holes.
        weights: workingWeights,
        // `null` exactly when `context` is `null` (decision 25).
        loopMaps: context === null ? null : loopMaps,
    };
}

/**
 * THE STEPPED TWIN OF {@link solveSkeleton} (dashboard holed-fixtures spec, decisions 17 to 21): the same solve, holes
 * and every option included, watched after initialisation and after every step. It throws exactly what `solveSkeleton`
 * throws, and every failure and refusal of a step is on `result.diagnostics`, which the legacy stepped entry drops.
 *
 * A SNAPSHOT IS `structuredClone(context.graph)`, so it carries `loops`, which is plain graph data for this reason
 * (skeleton loops-input spec, decision 6; BSA.F93). Each is taken in unit space and carried back to caller space once.
 */
export function solveSkeletonStepped(vertices: Vector2[], options?: SolveSkeletonOptions): SteppedSkeletonSolveResult {
    const snapshots: StraightSkeletonGraph[] = [];
    let firstFailedSnapshot: number | null = null;
    const result = solveSkeletonObserved(vertices, options, (context, stepErrors) => {
        snapshots.push(structuredClone(context.graph));
        if (firstFailedSnapshot === null && stepErrors.length > 0) {
            firstFailedSnapshot = snapshots.length - 1;
        }
    });
    if (result.context === null) {
        // THE SELF-INTERSECTING PATH (decision 20): the sub-polygons are solved unobserved and merged, so the one
        // snapshot is the merged graph.
        const failed = result.diagnostics.some(diagnostic => diagnostic.kind === 'step-failure');
        return {snapshots: [structuredClone(result.graph)], result, firstFailedSnapshot: failed ? 0 : null};
    }
    denormaliseSnapshots(snapshots, result.normalisation);
    return {snapshots, result, firstFailedSnapshot};
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

export function runAlgorithmV5Stepped(
    nodes: Vector2[],
    options?: PerceptualFloorOptions & WeightOptions,
): SteppedAlgorithmResult {
    // Decision 4: refused on `error`, with no snapshots, as this entry answers every rejected input. It has no
    // diagnostics channel, so it keeps refusing holes, and names the stepped entry that takes them (dashboard
    // holed-fixtures spec, decision 18).
    const holesComplaint = legacyHolesComplaint('runAlgorithmV5Stepped', options);
    if (holesComplaint !== undefined) {
        return {snapshots: [], error: `${holesComplaint} For snapshots of a holed solve, call solveSkeletonStepped.`};
    }
    if (nodes.length < 3) {
        return {snapshots: [], error: "Must have at least three nodes to perform algorithm"};
    }
    // REPORTED ON `error`, not thrown: this entry point already answers a rejected polygon that way.
    const complaint = nonFiniteVertexComplaint(nodes);
    if (complaint !== undefined) {
        return {snapshots: [], error: complaint};
    }

    // NORMALISED ONCE, HERE. See `normalisation.ts`. EVERY SNAPSHOT is denormalised on the way out,
    // not just the last: they are what a debug visualiser draws, and scrubbing through a sequence of
    // graphs half of which were in unit space would be worse than useless.
    const perceptualFloor = resolvePerceptualFloor(options);
    const normalisation = makeSkeletonNormalisation(nodes);
    // THE WEIGHT DOOR, BEFORE CANONICALISATION, as in the solving entry points.
    const doorWeights = weightsAtTheDoor(normalisePolygon(nodes, normalisation), options?.weights, perceptualFloor);
    // CANONICALISED IN UNIT SPACE, immediately after, so the stepped visualiser walks the same
    // polygon the solving entry points do. See {@link canonicaliseInUnitSpace}.
    const canonical = canonicaliseInUnitSpace(
        nodes, normalisation, perceptualFloor, weightChangeVertexIndices(doorWeights));
    const unitNodes = canonical.vertices;
    const canonicalWeights = remapWeightsThroughCanonicalisation(
        doorWeights, canonical.indexRemap, unitNodes.length);

    const decomposition = decomposePolygon(unitNodes, perceptualFloor, undefined, canonicalWeights);

    if (!decomposition.wasSelfIntersecting) {
        const result = runSimplePolygonStepped(unitNodes, perceptualFloor, canonicalWeights);
        denormaliseSnapshots(result.snapshots, normalisation);
        return result;
    }

    // For decomposed polygons, run each sub-polygon stepped and concatenate snapshots,
    // with the merged graph as the final snapshot.
    const allSnapshots: StraightSkeletonGraph[] = [];
    const subGraphs: StraightSkeletonGraph[] = [];
    let lastError: string | null = null;

    for (const [index, subPoly] of decomposition.subPolygons.entries()) {
        const result = runSimplePolygonStepped(
            subPoly, perceptualFloor, decomposition.subPolygonWeights[index]);
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
