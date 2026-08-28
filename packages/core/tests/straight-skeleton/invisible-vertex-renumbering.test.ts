import {INVISIBLE_VERTEX_INDEX, INVISIBLE_VERTEX_RECTANGLE} from '@proc-geo/test-fixtures';
import {REMOVED_VERTEX_INDEX, canonicaliseForSolve, solveSkeleton, StraightSkeletonGraph} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE SIX SYMPTOMS OF ONE REMOVED VERTEX.
 * ============================================================================
 *
 * Journal decision 75, 2026-08-28. A dashboard inspection of a first solve reported six defects at
 * once: a bisector absent from a three-way collision at offset 50; a run of three consecutive
 * primary bisectors each carrying the parent pair of the vertex before it — "a very serious defect
 * to allow a primary bisector to be accepted with the wrong pair of parent edges"; a derived
 * bisector inheriting the corruption; and two skeleton nodes drawn on top of each other.
 *
 * THE SOLVER WAS RIGHT ABOUT ALL OF IT. The polygon carried one vertex sitting exactly on its own
 * edge — what the canvas's click-to-insert produces, since it projects the click onto the segment —
 * and the boundary stage removed it as invisible before the solve began. Removing vertex 5
 * renumbers every exterior node and every exterior edge after it, so the bisector of exterior node
 * 5 stands at the CALLER'S vertex 6 carrying the parents [5,4] that are genuinely its own. Read
 * against input indices it looks shifted by one; read against the graph it is exact. That is what
 * this file measures, in both directions.
 *
 * BOTH DIRECTIONS, BECAUSE ONE ALONE PROVES NOTHING. The default-floor solve reproduces the
 * screenshot's labels; the same polygon at `noiseFloor: 0` — the supported way to turn the stage off
 * — keeps all sixteen vertices and produces exactly the labels the inspection expected. The shift
 * is the removal, and nothing else.
 *
 * THE SIXTH SYMPTOM — the two nodes drawn on top of each other — IS NOT PINNED HERE, and that is a
 * measurement rather than an omission. It belongs to the screenshot's near-flat boundary, which
 * resolves to four distinct nodes spread across 0.04 of a 175-unit shape: a fifth of a pixel apart
 * at the inspection's zoom, thousands of times wider than the tolerance `findOrAddNode` merges at,
 * and correct geometry on a boundary that nearly closes at one point. The enrolled fixture stands
 * its vertices clear of their chords and so has no such cluster. What guards the real question —
 * whether the solver ever leaves two nodes it should have merged — is the corpus-wide I2 sweep in
 * `graph-index-invariants.test.ts`.
 *
 * The corpus-wide statement of the invariant the inspection thought was broken is that same file;
 * the boundary-stage half of the fix is `canonicaliseForSolve`, which hands a caller the remap so a
 * debug overlay can label one index space instead of two.
 */

/**
 * How far a solved exterior node sits from the caller's vertex it came from.
 *
 * NOT ZERO, AND THAT IS NOT THIS FILE'S SUBJECT: the solve carries the polygon to unit extent and
 * back, and the round trip is exact only where the scale is, so a vertex at -0.04 returns 6e-18
 * away from itself. The claim here is which vertex a bisector stands at, not what the round trip
 * costs — `normalisation.test.ts` owns that — so the comparison is by distance.
 */
function distanceFromInputVertex(position: {x: number, y: number}, vertex: number): number {
    const input = INVISIBLE_VERTEX_RECTANGLE[vertex];
    return Math.hypot(position.x - input.x, position.y - input.y);
}

/** The bisector standing on exterior node `vertex`, as the debug overlay would label it. */
function primaryBisectorAt(graph: StraightSkeletonGraph, vertex: number) {
    const interiorEdge = graph.interiorEdges.find(candidate => graph.edges[candidate.id].source === vertex);
    if (interiorEdge === undefined) {
        throw new Error(`No bisector stands on exterior node ${vertex}`);
    }
    return {
        id: interiorEdge.id,
        parents: [interiorEdge.clockwiseExteriorEdgeIndex, interiorEdge.widdershinsExteriorEdgeIndex],
        position: graph.nodes[graph.edges[interiorEdge.id].source].position,
    };
}

describe('the boundary stage removes exactly the vertex that sits on its own edge', () => {
    it('takes one of the sixteen, at a deviation four orders below the floor', () => {
        const canonical = canonicaliseForSolve(INVISIBLE_VERTEX_RECTANGLE);

        expect(canonical.removedCount).toBe(1);
        expect(canonical.vertices).toHaveLength(15);
        // 1.1e-16 against a 1e-6 floor: this vertex is exactly collinear, not merely nearly so.
        expect(canonical.maxDeviation).toBeLessThan(1e-15);
    });

    it('renumbers everything after it, and nothing before it', () => {
        const {indexRemap} = canonicaliseForSolve(INVISIBLE_VERTEX_RECTANGLE);

        expect(indexRemap[INVISIBLE_VERTEX_INDEX]).toBe(REMOVED_VERTEX_INDEX);
        for (let vertex = 0; vertex < INVISIBLE_VERTEX_INDEX; vertex++) {
            expect(indexRemap[vertex]).toBe(vertex);
        }
        for (let vertex = INVISIBLE_VERTEX_INDEX + 1; vertex < INVISIBLE_VERTEX_RECTANGLE.length; vertex++) {
            expect(indexRemap[vertex]).toBe(vertex - 1);
        }
    });

    it('says so on the solve, which the legacy entry points have no channel to do', () => {
        const result = solveSkeleton(INVISIBLE_VERTEX_RECTANGLE);

        expect(result.complete).toBe(true);
        expect(result.graph.numExteriorNodes).toBe(15);
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['vertices-canonicalised']);
    });
});

describe('the screenshot, re-derived from the solved graph', () => {
    const graph = solveSkeleton(INVISIBLE_VERTEX_RECTANGLE).graph;

    /*
     * The inspection's table, verbatim: the label it read, and the caller's vertex it was standing
     * at. Every parent pair here belongs to the exterior node the bisector actually stands on — it
     * is the CALLER'S index for that node that is one higher, from the removal at vertex 5.
     */
    const observed: ReadonlyArray<readonly [number, readonly [number, number], number]> = [
        [17, [2, 1], 2],
        [18, [3, 2], 3],
        [19, [4, 3], 4],
        [20, [5, 4], 6],
        [21, [6, 5], 7],
        [22, [7, 6], 8],
    ];

    it.each(observed.map(([id, parents, inputVertex]) => [id, `[${parents[0]},${parents[1]}]`, inputVertex, parents] as const))(
        'e%s carries %s and stands at the caller\'s vertex %s',
        (id, _label, inputVertex, parents) => {
            const bisector = primaryBisectorAt(graph, id - graph.numExteriorNodes);

            expect(bisector.id).toBe(id);
            expect(bisector.parents).toEqual([...parents]);
            expect(distanceFromInputVertex(bisector.position, inputVertex)).toBeLessThan(1e-12);
        },
    );

    it('the caller\'s edges 4 and 5 are one exterior edge in the solve', () => {
        // Which is the whole of the missing-bisector symptom: there is no vertex between them for a
        // bisector to stand on, so a collision the inspection expected three arrivals at takes two.
        const merged = graph.edges[4];

        expect(distanceFromInputVertex(graph.nodes[merged.source].position, 4)).toBeLessThan(1e-12);
        expect(distanceFromInputVertex(graph.nodes[merged.target!].position, 6)).toBeLessThan(1e-12);
    });

    it('no bisector stands at the caller\'s vertex 5, because no exterior node does', () => {
        const standingThere = graph.nodes
            .slice(0, graph.numExteriorNodes)
            .filter(node => distanceFromInputVertex(node.position, INVISIBLE_VERTEX_INDEX) < 1e-9);

        expect(standingThere).toEqual([]);
    });
});

describe('with the boundary stage turned off, the labels are the ones the inspection expected', () => {
    const graph = solveSkeleton(INVISIBLE_VERTEX_RECTANGLE, {noiseFloor: 0}).graph;

    it('keeps all sixteen vertices', () => {
        expect(graph.numExteriorNodes).toBe(16);
    });

    it.each([
        [5, [5, 4]],
        [6, [6, 5]],
        [7, [7, 6]],
        [8, [8, 7]],
    ] as const)('the bisector at vertex %s carries that vertex\'s own pair', (vertex, parents) => {
        const bisector = primaryBisectorAt(graph, vertex);

        expect(bisector.parents).toEqual([...parents]);
        expect(distanceFromInputVertex(bisector.position, vertex)).toBeLessThan(1e-12);
    });
});
