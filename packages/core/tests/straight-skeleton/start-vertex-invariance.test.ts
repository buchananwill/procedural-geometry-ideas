/*
 * A SKELETON DOES NOT DEPEND ON WHICH VERTEX ITS OUTLINE STARTS FROM (BSA.D335).
 *
 * Rotating an outline's starting vertex renumbers every exterior edge and every bisector, and changes nothing about the
 * shape. So wherever the solver lets an id decide between two events, a rotation can change the answer, and wherever it
 * decides by geometry, it cannot. This suite solves each outline at every rotation of its starting vertex (sampled to at
 * most `MAX_ROTATIONS`) and compares each skeleton with the unrotated one by geometry alone: whether it completes, the
 * kinds of its diagnostics, and its interior arcs as pairs of end positions, matched within a tolerance.
 *
 * THE CASES: the level-ridge tie (BSA.F107) and the island of the user's layout file 7, whose pairing BSA.D335 made
 * geometric, and every fifth fixture of the clean roster. Measured on the parent of BSA.D335's stage 1 commit, all of
 * them were already invariant: the tie's far pairing joins a primary bisector, whose id is below every later bisector's
 * at any rotation, so the id order took the far meeting at every rotation.
 *
 * THE CASES THAT BITE (BSA.F109, BSA.D338): five along-edge jitter cells of the sweep harness, the reflex L at
 * k = 2, 3, 5 and the double-reflex plus at k = 3, 5, each at magnitude 1.0 with `{noiseFloor: 0}` so that the
 * jittered samples reach the solver. On the parent of stage 1 the pairwise fallback ordered their simultaneous events
 * by edge id, and the skeleton changed at most of the sampled rotations (measured at every rotation: L k2 at 8 of 11,
 * L k3 at 14 of 17, L k5 at 24 of 29, plus k3 at 29 of 35, plus k5 at 49 of 59); with the nearer event on a shared
 * bisector resolved first, at none.
 */
import type {SkeletonSolveResult, SolveSkeletonOptions, Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {CLEAN_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {clockwise, JITTER_DOUBLE_REFLEX_PLUS, JITTER_REFLEX_L, jitteredSamples} from './jitter-helpers';
import {FILE_7_ISLAND, LEVEL_RIDGE_TIE} from './level-ridge-fixtures';

setSkeletonLogLevel('silent');

/** At most this many rotations of one outline, evenly spaced. */
const MAX_ROTATIONS = 8;
/** End positions agree to this fraction of the outline's largest coordinate. */
const RELATIVE_TOLERANCE = 1e-7;

interface Outline {
    name: string;
    vertices: Vector2[];
    weights?: number[];
    options?: SolveSkeletonOptions;
}

/** An along-edge cell of the sweep harness: magnitude 1.0, canonicalisation off. */
const alongEdgeCell = (label: string, polygon: Vector2[], k: number, seed: number): Outline => ({
    name: `alongedge:${label}:k${k}:s${seed}, noiseFloor 0`,
    vertices: jitteredSamples(clockwise(polygon), k, seed, 1.0, false),
    options: {noiseFloor: 0},
});

const OUTLINES: Outline[] = [
    LEVEL_RIDGE_TIE,
    FILE_7_ISLAND,
    alongEdgeCell('L', JITTER_REFLEX_L, 2, 15838),
    alongEdgeCell('L', JITTER_REFLEX_L, 3, 7919),
    alongEdgeCell('L', JITTER_REFLEX_L, 5, 23757),
    alongEdgeCell('plus', JITTER_DOUBLE_REFLEX_PLUS, 3, 7919),
    alongEdgeCell('plus', JITTER_DOUBLE_REFLEX_PLUS, 5, 23757),
    ...CLEAN_TEST_POLYGONS.filter((_, index) => index % 5 === 0),
];

const rotated = <T>(items: T[], start: number): T[] => [...items.slice(start), ...items.slice(0, start)];

function solveFrom(outline: Outline, start: number): SkeletonSolveResult {
    const vertices = rotated(outline.vertices, start);
    return solveSkeleton(vertices, {
        ...outline.options,
        ...(outline.weights === undefined ? {} : {weights: rotated(outline.weights, start)}),
    });
}

type Arc = [Vector2, Vector2];

/** The interior arcs that are not culled and do not end at their own source, as end positions. */
function interiorArcs(result: SkeletonSolveResult): Arc[] {
    const graph = result.graph;
    return graph.interiorEdges.flatMap((interior): Arc[] => {
        const edge = graph.edges[interior.id];
        if (interior.culled || edge.target === undefined || edge.target === edge.source) {
            return [];
        }
        return [[graph.nodes[edge.source].position, graph.nodes[edge.target].position]];
    });
}

const diagnosticKinds = (result: SkeletonSolveResult) => result.diagnostics
    .map(diagnostic => diagnostic.kind)
    .filter(kind => kind !== 'winding-normalised')
    .sort();

/** The arcs of `first` with no partner in `second`, and those of `second` with none in `first`, each partner used once. */
function unmatchedArcs(first: Arc[], second: Arc[], tolerance: number): {onlyFirst: Arc[]; onlySecond: Arc[]} {
    const close = (p: Vector2, q: Vector2) => Math.abs(p.x - q.x) <= tolerance && Math.abs(p.y - q.y) <= tolerance;
    const used = second.map(() => false);
    const onlyFirst = first.filter(([p, q]) => {
        const partner = second.findIndex(([s, t], index) => !used[index]
            && ((close(p, s) && close(q, t)) || (close(p, t) && close(q, s))));
        if (partner < 0) {
            return true;
        }
        used[partner] = true;
        return false;
    });
    return {onlyFirst, onlySecond: second.filter((_, index) => !used[index])};
}

describe('a skeleton does not depend on which vertex its outline starts from (BSA.D335)', () => {
    it.each(OUTLINES.map(outline => [outline.name, outline] as const))('%s', (_, outline) => {
        const count = outline.vertices.length;
        const step = Math.max(1, Math.ceil(count / MAX_ROTATIONS));
        const extent = Math.max(...outline.vertices.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), 1);
        const tolerance = RELATIVE_TOLERANCE * extent;
        const reference = solveFrom(outline, 0);

        for (let start = step; start < count; start += step) {
            const result = solveFrom(outline, start);
            const where = `starting at vertex ${start}`;
            expect({where, complete: result.complete}).toEqual({where, complete: reference.complete});
            expect({where, kinds: diagnosticKinds(result)}).toEqual({where, kinds: diagnosticKinds(reference)});
            const {onlyFirst, onlySecond} = unmatchedArcs(interiorArcs(reference), interiorArcs(result), tolerance);
            expect({where, onlyUnrotated: onlyFirst, onlyRotated: onlySecond}).toEqual({where, onlyUnrotated: [], onlyRotated: []});
        }
    });
});
