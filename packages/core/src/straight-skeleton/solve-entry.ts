import {
    CausalityViolationDiagnostic,
    PerceptualFloorOptions,
    SkeletonDiagnostic,
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
    legacyHolesComplaint,
    loopSolvabilityComplaint,
    prepareBoundary,
    prepareLegacyBoundary,
} from "./boundary-stage";
import {decomposePolygon} from "./polygon-decomposition";
import {checkWavefrontCausality} from "./causality-check";
import {HOLED_UNCULLED_SELF_LOOP, holedSkeletonViolations} from "./holed-guard";
import {mergeSkeletonGraphs, makeMergedSolverContext} from "./graph-merge";
import {
    SkeletonNormalisation,
    denormaliseContext,
    denormaliseGraph,
    denormalisePosition,
} from "./normalisation";
import {resolvePerceptualFloor} from "./canonicalisation";

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
    const perceptualFloor = resolvePerceptualFloor(options);
    // THE BOUNDARY STAGE (count, finiteness, normalisation, the weight door, canonicalisation in unit space), as
    // every entry runs it; see {@link prepareLegacyBoundary}. The decomposition runs in UNIT space along with the
    // solve, because its crossing test carries the same absolute tolerances the solver does.
    const boundary = prepareLegacyBoundary(nodes, options?.weights, perceptualFloor);
    const {normalisation} = boundary;
    const unitNodes = boundary.vertices;
    const canonicalWeights = boundary.weights;

    const decomposition = decomposePolygon(unitNodes, perceptualFloor, undefined, canonicalWeights);

    if (!decomposition.wasSelfIntersecting) {
        const context = runSimplePolygon(unitNodes, perceptualFloor, canonicalWeights).context;
        denormaliseContext(context, normalisation);
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
    // A merged context carries no position budgets (`positionUncertainties` is empty), so only its graph and memo move.
    denormaliseContext(mergedContext, normalisation);
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
 * pipeline, `prepareBoundary`, of which a single loop is the one-loop case (decision 39), so a single-loop input solves to
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
    // ONE FLOOR, TWO READINGS OF IT. `perceptualFloor` is the client's value and governs the
    // coincidence bar inside the solve; `noiseFloor` is the canonicalisation bar, which defaults to
    // the same value and is overridden ONLY by the recursion driver, which has already restated the
    // root's floor in this region's units. See `PerceptualFloorOptions`.
    const perceptualFloor = resolvePerceptualFloor(options);
    const diagnostics: SkeletonDiagnostic[] = [];

    const boundary = prepareBoundary({
        vertices,
        weights: options?.weights,
        holes,
        perceptualFloor,
        noiseFloor: options?.noiseFloor ?? perceptualFloor,
        normaliseWinding: options?.normaliseWinding ?? true,
    }, diagnostics);
    const {normalisation, loops, loopMaps} = boundary;
    const workingVertices = boundary.vertices;
    const workingWeights = boundary.weights;
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
    if (context !== null) {
        denormaliseContext(context, normalisation);
    } else {
        denormaliseGraph(graph, normalisation);
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
    // REPORTED ON `error`, not thrown: this entry point already answers a rejected polygon that way. The boundary
    // stage below asks the same two questions again and they pass; every later refusal of it is thrown.
    const complaint = loopSolvabilityComplaint(nodes);
    if (complaint !== undefined) {
        return {snapshots: [], error: complaint};
    }

    // THE BOUNDARY STAGE, as `runAlgorithmV5` runs it, so the stepped visualiser walks the same polygon. EVERY
    // SNAPSHOT is denormalised on the way out, not just the last: they are what a debug visualiser draws, and
    // scrubbing through a sequence of graphs half of which were in unit space would be worse than useless.
    const perceptualFloor = resolvePerceptualFloor(options);
    const boundary = prepareLegacyBoundary(nodes, options?.weights, perceptualFloor);
    const {normalisation} = boundary;
    const unitNodes = boundary.vertices;
    const canonicalWeights = boundary.weights;

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
