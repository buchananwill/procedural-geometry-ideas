import type {AlgorithmStepInput, InteriorEdge, StraightSkeletonSolverContext} from "./types";
import {isLiveBisector, NOT_LIVE, wavefrontSegmentsOf} from "./wavefront-links";

/**
 * The violations of W1 to W4 (skeleton wavefront-order spec, decisions 2 to 5), empty when the wavefront is sound. Stated at a step
 * boundary, over the step inputs still to run (decision 6); not required to hold inside a layer.
 *
 * W3 is read as also requiring every live bisector to stand in some input: at a boundary the step inputs
 * are the whole wavefront, so a live bisector in none of them is a ring the solve has lost.
 */
export function checkWavefront(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]): string[] {
    const violations: string[] = [];
    const {clockwiseNeighbour, widdershinsNeighbour} = context.wavefront;
    const live = (id: number) => isLiveBisector(context, id);
    const interior = (id: number): InteriorEdge => context.getInteriorWithId(id);

    for (const edge of context.graph.interiorEdges) {
        const id = edge.id;
        const clockwise = clockwiseNeighbour[id] ?? NOT_LIVE;
        const widdershins = widdershinsNeighbour[id] ?? NOT_LIVE;
        if (!live(id)) {
            if (clockwise !== NOT_LIVE || widdershins !== NOT_LIVE) {
                violations.push(`W1: e${id} is not live but holds neighbours (cw e${clockwise}, ws e${widdershins})`);
            }
            continue;
        }
        if (!live(clockwise)) {
            violations.push(`W1: live e${id} has clockwise neighbour e${clockwise}, which is not live`);
        } else {
            if (widdershinsNeighbour[clockwise] !== id) {
                violations.push(`W1: e${id}'s clockwise neighbour e${clockwise} has widdershins neighbour e${widdershinsNeighbour[clockwise]}`);
            }
            if (edge.clockwiseExteriorEdgeIndex !== interior(clockwise).widdershinsExteriorEdgeIndex) {
                violations.push(`W2: e${id}'s clockwise parent ${edge.clockwiseExteriorEdgeIndex} is not the widdershins parent ${interior(clockwise).widdershinsExteriorEdgeIndex} of its clockwise neighbour e${clockwise}`);
            }
        }
        if (!live(widdershins)) {
            violations.push(`W1: live e${id} has widdershins neighbour e${widdershins}, which is not live`);
        } else if (clockwiseNeighbour[widdershins] !== id) {
            violations.push(`W1: e${id}'s widdershins neighbour e${widdershins} has clockwise neighbour e${clockwiseNeighbour[widdershins]}`);
        }
    }

    const inputOf = new Map<number, number>();
    inputs.forEach((input, index) => {
        for (const id of input.interiorEdges) {
            if (!live(id)) {
                violations.push(`W3: step input ${index} holds e${id}, which is not live`);
            }
            const other = inputOf.get(id);
            if (other !== undefined) {
                violations.push(`W3: e${id} stands in step inputs ${other} and ${index}`);
            }
            inputOf.set(id, index);
        }
    });
    inputs.forEach((input, index) => {
        for (const id of input.interiorEdges) {
            const clockwise = clockwiseNeighbour[id] ?? NOT_LIVE;
            if (live(id) && live(clockwise) && inputOf.get(clockwise) !== index) {
                violations.push(`W3: step input ${index} holds e${id} but not its clockwise neighbour e${clockwise}`);
            }
        }
    });
    for (const edge of context.graph.interiorEdges) {
        if (live(edge.id) && !inputOf.has(edge.id)) {
            violations.push(`W3: live e${edge.id} stands in no step input`);
        }
    }

    for (let exteriorEdge = 0; exteriorEdge < context.graph.numExteriorNodes; exteriorEdge++) {
        const tos = new Set(context.graph.interiorEdges
            .filter(edge => live(edge.id) && edge.widdershinsExteriorEdgeIndex === exteriorEdge)
            .map(edge => edge.id));
        const segments = wavefrontSegmentsOf(context, exteriorEdge);
        const reached = new Set<number>();
        for (const segment of segments) {
            if (!tos.has(segment.to)) {
                violations.push(`W4: segment (e${segment.from}, e${segment.to}) of edge ${exteriorEdge} does not end on a bisector whose widdershins parent is the edge`);
            } else if (reached.has(segment.to)) {
                violations.push(`W4: two segments of edge ${exteriorEdge} end on e${segment.to}`);
            }
            reached.add(segment.to);
        }
        for (const to of tos) {
            if (!reached.has(to)) {
                violations.push(`W4: e${to} has widdershins parent ${exteriorEdge} but ends no segment of it`);
            }
        }
    }

    return violations;
}

// ── The standing gate's hook (wavefront-order spec, decision 23: `checkWavefront` stays in the suite) ──────────────────────────────────────────────────

/**
 * The hook `checkWavefront`'s standing gate runs through, held on the context as `context.probe`. OFF IN A NORMAL
 * SOLVE: its call sites read `context.probe` and do nothing more when it is `null` — in `runSimplePolygon`, the
 * boundary after `initInteriorEdges`, the boundary after each `stepAlgorithm`, and `solveFinished` at the end; in
 * `runSimplePolygonStepped`, the same boundaries and no `solveFinished`; and the two holed rules' firings.
 *
 * A context takes its probe when it is made, from {@link setWavefrontProbe}'s installation, so a test installs one
 * around the public solve it watches and every context that solve makes carries it. Installed only by the test suite.
 */
export interface WavefrontProbe {
    /** After `initInteriorEdges`, and after each `stepAlgorithm` returns, with the inputs still to run. */
    stepBoundary?(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]): void;
    /** At the end of one simple-polygon solve: `errors` are the step failures it accumulated. */
    solveFinished?(context: StraightSkeletonSolverContext, errors: readonly string[]): void;
    /** Once per flat ring closed in its step (skeleton flat-ring and third-front spec, decision 47). */
    flatRingClosed?(context: StraightSkeletonSolverContext, ring: readonly number[]): void;
    /** Once per third-front meeting resolved whole: the merge's arrivals and the struck wall (decision 47). */
    thirdFrontResolved?(context: StraightSkeletonSolverContext, merge: readonly number[], wall: number): void;
}

let installedProbe: WavefrontProbe | null = null;

/** Install (or, with `null`, remove) the probe every context made from now on carries. Test-side only. */
export function setWavefrontProbe(probe: WavefrontProbe | null): void {
    installedProbe = probe;
}

/** The installed probe, which a context made now takes as `context.probe`; `null` in a normal solve. */
export function activeWavefrontProbe(): WavefrontProbe | null {
    return installedProbe;
}
