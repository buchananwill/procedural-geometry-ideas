import {
    accessRuns,
    assertBoundaryPartition,
    assertRunPartition,
    BoundaryProvenance,
    BoundaryRun,
    isAccessProvenance,
    makeRootRegion,
    Region,
    remapRuns,
    REMOVED_VERTEX_INDEX,
    runBoundaryVertexIndices,
    runEdgeCount,
    Vector2,
} from '@proc-geo/core';

/**
 * The region vocabulary: a polygon, the provenance of every run of its boundary, and which of those
 * runs carry access.
 *
 * Almost nothing here is a coordinate. What is asserted is what the structure IS — runs index edges
 * and partition them exactly, three provenances of seven are roads, a supplied access subset is
 * completed rather than trusted, and a malformed one is rejected — and those statements would keep
 * holding if the module were reimplemented.
 *
 * TWO THINGS ARE CONVICTED BY MUTATION RATHER THAN ASSERTED. The partition check is handed a
 * one-edge gap and a one-edge overlap and must reject both, because a check that cannot fail is not
 * a check; and `accessRuns` is exercised against ALL SEVEN provenances written out by hand, so it
 * cannot agree with the implementation by reading the same list the implementation reads.
 */

/** A unit octagon: eight edges, which is the smallest ring these run arithmetic cases need. */
const OCTAGON: Vector2[] = Array.from({length: 8}, (_unused, index) => {
    const angle = (2 * Math.PI * index) / 8;
    return {x: Math.cos(angle), y: -Math.sin(angle)};
});

/** Every provenance in the vocabulary, written out here so the suite does not read the module's. */
const ALL_PROVENANCES: BoundaryProvenance[] = [
    'perimeter-access', 'perimeter-plain', 'ridge', 'cut', 'contour', 'lane', 'spine',
];

/** The three of them that are roads, likewise written out rather than imported. */
const ROAD_PROVENANCES: BoundaryProvenance[] = ['perimeter-access', 'lane', 'spine'];

function run(startIndex: number, endIndex: number, provenance: BoundaryProvenance): BoundaryRun {
    return {startIndex, endIndex, provenance};
}

/** A region built directly, bypassing the constructor, so a test can state any partition it likes. */
function region(boundary: Vector2[], runs: BoundaryRun[]): Region {
    return {boundary: boundary.map(vertex => ({x: vertex.x, y: vertex.y})), runs};
}

describe('runs index edges, inclusively and cyclically', () => {
    it('counts a forward run as its inclusive span', () => {
        expect(runEdgeCount(run(2, 4, 'ridge'), 8)).toBe(3);
        expect(runEdgeCount(run(3, 3, 'ridge'), 8)).toBe(1);
    });

    it('counts a wrapping run the long way round the ring', () => {
        expect(runEdgeCount(run(6, 1, 'ridge'), 8)).toBe(4);
        expect(runEdgeCount(run(0, 7, 'ridge'), 8)).toBe(8);
    });
});

describe('accessRuns names exactly the three provenances that are roads', () => {
    it('agrees with the predicate on every one of the seven tags', () => {
        for (const provenance of ALL_PROVENANCES) {
            expect(isAccessProvenance(provenance)).toBe(ROAD_PROVENANCES.includes(provenance));
        }
    });

    it('returns a whole-perimeter run exactly when that run is a road', () => {
        for (const provenance of ALL_PROVENANCES) {
            const single = region(OCTAGON, [run(0, 7, provenance)]);

            expect(accessRuns(single)).toEqual(ROAD_PROVENANCES.includes(provenance)
                ? [run(0, 7, provenance)]
                : []);
        }
    });

    it('picks the roads out of a boundary carrying all seven, in boundary order', () => {
        // Seven runs on eight edges: one tag per run, the last of them two edges long.
        const mixed = region(OCTAGON, ALL_PROVENANCES.map((provenance, index) =>
            run(index, index === ALL_PROVENANCES.length - 1 ? 7 : index, provenance)));

        expect(accessRuns(mixed)).toEqual([
            run(0, 0, 'perimeter-access'),
            run(5, 5, 'lane'),
            run(6, 7, 'spine'),
        ]);
    });

    it('returns copies, so a caller cannot rewrite the region through them', () => {
        const source = region(OCTAGON, [run(0, 3, 'lane'), run(4, 7, 'ridge')]);

        const roads = accessRuns(source);
        roads[0].provenance = 'cut';
        roads[0].endIndex = 6;

        expect(source.runs[0]).toEqual(run(0, 3, 'lane'));
    });

    it('answers empty for a region with no road at all, which is not an error', () => {
        // Decision 5: a gated courtyard that stays a shared garden has no connector BY DESIGN. It
        // becomes an error when something tries to slice or recurse it, which is not here.
        const courtyard = makeRootRegion(OCTAGON, []);

        expect(accessRuns(courtyard)).toEqual([]);
        expect(courtyard.runs).toEqual([run(0, 7, 'perimeter-plain')]);
    });
});

describe('the root region', () => {
    it('makes the WHOLE perimeter access when no subset is supplied', () => {
        const root = makeRootRegion(OCTAGON);

        expect(root.runs).toEqual([run(0, 7, 'perimeter-access')]);
        expect(accessRuns(root)).toEqual([run(0, 7, 'perimeter-access')]);
        expect(root.boundary).toEqual(OCTAGON);
    });

    it('copies the boundary rather than aliasing the caller\'s array or its vertices', () => {
        const caller = OCTAGON.map(vertex => ({...vertex}));

        const root = makeRootRegion(caller);
        root.boundary[0].x = 99;
        root.boundary.push({x: 5, y: 5});

        expect(caller[0].x).toBeCloseTo(1, 15);
        expect(caller).toHaveLength(8);
    });

    it('fills the complement of a supplied subset with perimeter-plain', () => {
        // Decision 10, and decision 3 with it: the subset says where the road is, and everything the
        // subset did not claim still has to belong to exactly one run.
        const root = makeRootRegion(OCTAGON, [run(2, 4, 'perimeter-access')]);

        expect(root.runs).toEqual([run(2, 4, 'perimeter-access'), run(5, 1, 'perimeter-plain')]);
        expect(accessRuns(root)).toEqual([run(2, 4, 'perimeter-access')]);
        expect(() => assertBoundaryPartition(root)).not.toThrow();
    });

    it('accepts a subset that wraps the ring', () => {
        const root = makeRootRegion(OCTAGON, [run(6, 1, 'perimeter-access')]);

        expect(root.runs).toEqual([run(2, 5, 'perimeter-plain'), run(6, 1, 'perimeter-access')]);
    });

    it('honours the provenance a subset was handed in with', () => {
        // An entrance arrives as a lane or a spine, not necessarily as inherited perimeter road.
        const root = makeRootRegion(OCTAGON, [run(0, 1, 'lane'), run(4, 5, 'spine')]);

        expect(root.runs).toEqual([
            run(0, 1, 'lane'),
            run(2, 3, 'perimeter-plain'),
            run(4, 5, 'spine'),
            run(6, 7, 'perimeter-plain'),
        ]);
        expect(accessRuns(root)).toEqual([run(0, 1, 'lane'), run(4, 5, 'spine')]);
    });

    it('emits two adjacent runs of one tag as the single run they are', () => {
        // Decision 3: adjacent runs never share a provenance, because two adjacent runs with the
        // same tag ARE one run. Spelling one stretch as two is not malformed input, so it is
        // answered in canonical form rather than rejected.
        const root = makeRootRegion(OCTAGON, [run(0, 1, 'perimeter-access'), run(2, 3, 'perimeter-access')]);

        expect(root.runs).toEqual([run(0, 3, 'perimeter-access'), run(4, 7, 'perimeter-plain')]);
    });

    it('keeps adjacent runs of DIFFERENT road tags distinct', () => {
        const root = makeRootRegion(OCTAGON, [run(0, 1, 'lane'), run(2, 3, 'perimeter-access')]);

        expect(root.runs).toEqual([
            run(0, 1, 'lane'),
            run(2, 3, 'perimeter-access'),
            run(4, 7, 'perimeter-plain'),
        ]);
    });

    it('produces a partition the assertion accepts, for every subset above', () => {
        for (const access of [
            undefined,
            [],
            [run(2, 4, 'perimeter-access')],
            [run(6, 1, 'perimeter-access')],
            [run(0, 1, 'lane'), run(4, 5, 'spine')],
            [run(0, 7, 'perimeter-access')],
        ]) {
            expect(() => assertBoundaryPartition(makeRootRegion(OCTAGON, access))).not.toThrow();
        }
    });
});

describe('a malformed access subset is rejected loudly', () => {
    /*
     * Decision 10. This is caller input, and a silently-dropped access run produces parcels with no
     * road and no complaint — so every one of these throws rather than being repaired.
     */

    it('rejects an index outside the ring', () => {
        expect(() => makeRootRegion(OCTAGON, [run(0, 8, 'perimeter-access')])).toThrow(/range|index/i);
        expect(() => makeRootRegion(OCTAGON, [run(-1, 3, 'perimeter-access')])).toThrow(/range|index/i);
    });

    it('rejects a non-integer index', () => {
        expect(() => makeRootRegion(OCTAGON, [run(0.5, 3, 'perimeter-access')])).toThrow(/integer|index/i);
        expect(() => makeRootRegion(OCTAGON, [run(0, Number.NaN, 'perimeter-access')])).toThrow(/integer|index/i);
    });

    it('rejects two access runs that overlap', () => {
        expect(() => makeRootRegion(OCTAGON, [run(0, 4, 'perimeter-access'), run(3, 6, 'lane')]))
            .toThrow(/overlap/i);
    });

    it('rejects an access run that overlaps itself by lapping the ring', () => {
        // Two whole-ring runs claim every edge twice; the second one is the report.
        expect(() => makeRootRegion(OCTAGON, [run(0, 7, 'perimeter-access'), run(0, 7, 'lane')]))
            .toThrow(/overlap/i);
    });

    it('rejects a boundary that is not a polygon', () => {
        expect(() => makeRootRegion([{x: 0, y: 0}, {x: 1, y: 0}])).toThrow(/at least 3 vertices/i);
    });
});

describe('the partition assertion is convicted by mutation', () => {
    /*
     * Decision 11. A gap or an overlap is SILENT downstream: it produces a region whose frontage is
     * quietly shorter or double-counted, and every invariant built on it still passes. So the check
     * is shown failing on both, one edge at a time, against a partition that is otherwise valid.
     */

    const VALID: BoundaryRun[] = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-plain')];

    it('accepts the valid partition it is mutated from', () => {
        expect(() => assertRunPartition(VALID, 8)).not.toThrow();
        expect(() => assertBoundaryPartition(region(OCTAGON, VALID))).not.toThrow();
    });

    it('rejects a one-edge gap', () => {
        const gapped = [run(0, 2, 'perimeter-access'), run(4, 7, 'perimeter-plain')];

        expect(() => assertRunPartition(gapped, 8)).toThrow(/gap|overlap/i);
        expect(() => assertBoundaryPartition(region(OCTAGON, gapped))).toThrow(/gap|overlap/i);
    });

    it('rejects a one-edge overlap', () => {
        const overlapping = [run(0, 3, 'perimeter-access'), run(3, 7, 'perimeter-plain')];

        expect(() => assertRunPartition(overlapping, 8)).toThrow(/gap|overlap/i);
        expect(() => assertBoundaryPartition(region(OCTAGON, overlapping))).toThrow(/gap|overlap/i);
    });

    it('rejects a run list that chains correctly but laps the ring', () => {
        // Each run begins where the last ended, so the seam check alone is satisfied — and every
        // edge is claimed twice. The covered-count check is what catches this one.
        const lapping = [run(0, 7, 'perimeter-access'), run(0, 7, 'perimeter-plain')];

        expect(() => assertRunPartition(lapping, 8)).toThrow(/8|cover/i);
    });

    it('rejects adjacent runs that share a provenance', () => {
        const fused = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-access')];

        expect(() => assertRunPartition(fused, 8)).toThrow(/adjacent|provenance/i);
    });

    it('rejects a region with no runs at all', () => {
        expect(() => assertRunPartition([], 8)).toThrow(/empty|at least one/i);
    });

    it('rejects indices that are not edges of the ring', () => {
        expect(() => assertRunPartition([run(0, 8, 'ridge')], 8)).toThrow(/range|index/i);
        expect(() => assertRunPartition([run(0.5, 7, 'ridge')], 8)).toThrow(/integer|index/i);
    });

    it('accepts a single run covering the whole ring, which is adjacent only to itself', () => {
        expect(() => assertRunPartition([run(0, 7, 'perimeter-access')], 8)).not.toThrow();
        expect(() => assertRunPartition([run(5, 4, 'perimeter-access')], 8)).not.toThrow();
    });
});

describe('run boundary vertices are the vertices canonicalisation must pin', () => {
    it('names the vertex at which each run gives way to the next', () => {
        const runs = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-plain')];

        // Run 1 starts on edge 3, whose first vertex is vertex 3; run 0 starts on edge 0 likewise.
        expect(runBoundaryVertexIndices(runs)).toEqual([0, 3]);
    });

    it('names them in ascending order however the runs are ordered', () => {
        const runs = [run(2, 5, 'perimeter-plain'), run(6, 1, 'lane')];

        expect(runBoundaryVertexIndices(runs)).toEqual([2, 6]);
    });

    it('pins NOTHING for a whole-perimeter region, which gives way to nothing', () => {
        // Which is what leaves a plain `solveSkeleton` call canonicalising exactly as it does today.
        expect(runBoundaryVertexIndices([run(0, 7, 'perimeter-access')])).toEqual([]);
        expect(runBoundaryVertexIndices([])).toEqual([]);
    });
});

describe('runs are carried through the index remap, never recomputed', () => {
    /*
     * Decision 6, as arithmetic. The geometric statement — that the remapped run still covers the
     * same stretch of boundary after a canonicalisation that actually removed vertices — is in
     * `canonicalisation.test.ts`, where the stage that produces the remap lives.
     */

    it('leaves runs alone under an identity remap', () => {
        const runs = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-plain')];
        const identity = [0, 1, 2, 3, 4, 5, 6, 7];

        expect(remapRuns(runs, identity, 8)).toEqual(runs);
    });

    it('renumbers a run around the vertices removed inside it', () => {
        // Eight vertices in, five out: 1, 2 and 6 removed. Run [0, 2] is bounded by vertices 0 and
        // 3, which become 0 and 1, so it comes back as the single edge [0, 0].
        const remap = [0, REMOVED_VERTEX_INDEX, REMOVED_VERTEX_INDEX, 1, 2, 3, REMOVED_VERTEX_INDEX, 4];
        const runs = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-plain')];

        expect(remapRuns(runs, remap, 5)).toEqual([
            run(0, 0, 'perimeter-access'),
            run(1, 4, 'perimeter-plain'),
        ]);
    });

    it('renumbers a wrapping run', () => {
        const remap = [0, REMOVED_VERTEX_INDEX, 1, 2, 3, REMOVED_VERTEX_INDEX, 4, 5];
        const runs = [run(2, 5, 'perimeter-plain'), run(6, 1, 'lane')];

        // Run [6, 1] is bounded by vertices 6 and 2, which become 4 and 1: edges 4, 5, 0.
        expect(remapRuns(runs, remap, 6)).toEqual([
            run(1, 3, 'perimeter-plain'),
            run(4, 0, 'lane'),
        ]);
    });

    it('carries a whole-perimeter run onto the whole shortened perimeter', () => {
        const remap = [0, REMOVED_VERTEX_INDEX, 1, 2];
        const runs = [run(0, 3, 'perimeter-access')];

        expect(remapRuns(runs, remap, 3)).toEqual([run(0, 2, 'perimeter-access')]);
    });

    it('throws rather than invent a run whose boundary vertex was removed', () => {
        // The pinning rule's failure mode, made loud. A run whose boundary went has no honest image
        // on the new ring, and guessing one is how a road quietly becomes a fence.
        const remap = [0, REMOVED_VERTEX_INDEX, 1, 2, 3];
        const runs = [run(0, 0, 'lane'), run(1, 4, 'perimeter-plain')];

        expect(() => remapRuns(runs, remap, 4)).toThrow(/removed|pin/i);
    });

    it('produces a partition of the shortened ring, checked as one', () => {
        const remap = [0, REMOVED_VERTEX_INDEX, REMOVED_VERTEX_INDEX, 1, 2, 3, REMOVED_VERTEX_INDEX, 4];
        const runs = [run(0, 2, 'perimeter-access'), run(3, 7, 'perimeter-plain')];

        expect(() => assertRunPartition(remapRuns(runs, remap, 5), 5)).not.toThrow();
    });
});
