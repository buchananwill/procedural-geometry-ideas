import {
    childRegionId,
    degenerateAreaBar,
    denormaliseLength,
    makeSkeletonNormalisation,
    ringPerimeter,
    setSkeletonLogLevel,
    SKELETON_NOISE_FLOOR,
    findRegionById,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    MAX_RECURSION_LEVELS,
    ROOT_REGION_ID,
    signedArea,
    subdivideRecursively,
    uniformLevelSpecs,
} from '@proc-geo/core';
import type {LevelSpec, RecursiveNode} from '@proc-geo/core';
import {
    AWKWARD_HEPTAGON, FULL_CORPUS, OFF_EDGE_JITTER_L_SEED_55433, OFF_EDGE_JITTER_L_SEED_55433_K4,
    OFF_EDGE_JITTER_PLUS_SEED_7919,
} from '@proc-geo/test-fixtures';

/**
 * The region tree as a FIRST-CLASS, CITABLE DATA STRUCTURE — journal decision 97.
 *
 * The driver has always returned a tree; what this suite pins is that every node of it can be
 * NAMED. A census row, a dashboard inspector and a defect report are only talking about the same
 * region if the name they use is a function of the input rather than of the run, so the properties
 * asserted here are exactly the ones that make a citation mean something:
 *
 * - the ids are path-based, so they are a function of the tree's shape and of nothing else;
 * - two runs of one input produce the SAME tree, bit for bit, so a pinned id survives a re-run;
 * - a node's `boundary` is the polygon that was fed down, so quoting a region by id and solving its
 *   boundary standalone reproduces what the driver saw;
 * - `outcome` says WHICH of the three things happened, rather than leaving a reader to match the
 *   prefix of a sentence — journal decision 96 made that distinction load-bearing, since a
 *   `declined-degenerate` region is accepted behaviour and a `failed` one is the live defect class.
 *
 * The two pinned trees are one clean fixture and one defect fixture, because the shape assertions
 * and the diagnostics assertion fail for different reasons and neither fixture can carry both.
 */

// The defect specimen below solves a malformed region on purpose, and the solver narrates the
// attempt. The narration is not what this suite is measuring.
setSkeletonLogLevel('silent');

/** Both streams alive at level 0, so the pinned tree exercises segment AND residue provenance. */
const MIXED_STREAM_LEVELS: LevelSpec[] = [
    {depthFraction: 0.5, mergeGroupSize: 2, segments: 'recurse', residue: 'recurse'},
    {depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 1, segments: 'leaf', residue: 'void'},
];

/** The census grid's own composition, so the defect pin below is the census's own region. */
const CENSUS_LEVELS: LevelSpec[] = uniformLevelSpecs({
    levels: MAX_RECURSION_LEVELS,
    mergeGroupSize: 1,
    depthFraction: FULL_DEPTH_FRACTION,
    residue: 'recurse',
});

/** One node reduced to the facts a citation rests on: who it is, where it sits, what became of it. */
interface RegionRow {
    id: string;
    parentId: string | undefined;
    level: number;
    provenance: string;
    outcome: string;
}

function rowsOf(root: RecursiveNode): RegionRow[] {
    return flattenRecursiveTree(root).map(node => ({
        id: node.id,
        parentId: node.parentId,
        level: node.level,
        provenance: JSON.stringify(node.provenance),
        outcome: node.outcome.kind,
    }));
}

/** Every child of a node, in the order the ids number them: segments first, then residue rings. */
function childrenInIdOrder(node: RecursiveNode): RecursiveNode[] {
    return [...node.children, ...node.residueChildren];
}

describe('the region tree is first-class', () => {
    describe('a pinned tree: one clean fixture, shape and identity', () => {
        it('numbers the root and both of its child streams in one path-based sequence', () => {
            // MEASURED, not derived: four merged segments and one residue ring at level 0, each of
            // them a region of its own at level 1. The residue child's id continues the segment
            // children's numbering — one sequence, which is the order `flattenRecursiveTree` walks
            // — while its PROVENANCE indexes the ring array it actually came from.
            expect(rowsOf(subdivideRecursively(AWKWARD_HEPTAGON, {levels: MIXED_STREAM_LEVELS})))
                .toEqual([
                    {id: 'r0', parentId: undefined, level: 0, provenance: '{"kind":"root"}', outcome: 'solved'},
                    {id: 'r0.0', parentId: 'r0', level: 1, provenance: '{"kind":"segment","index":0}', outcome: 'solved'},
                    {id: 'r0.1', parentId: 'r0', level: 1, provenance: '{"kind":"segment","index":1}', outcome: 'solved'},
                    {id: 'r0.2', parentId: 'r0', level: 1, provenance: '{"kind":"segment","index":2}', outcome: 'solved'},
                    {id: 'r0.3', parentId: 'r0', level: 1, provenance: '{"kind":"segment","index":3}', outcome: 'solved'},
                    {id: 'r0.4', parentId: 'r0', level: 1, provenance: '{"kind":"residue","ringIndex":0}', outcome: 'solved'},
                ]);
        });

        it('hands each child the boundary its provenance names, vertex for vertex', () => {
            // The capture claim: a region's `boundary` IS the strip or ring it was cut from, not a
            // copy that has been through anything. This is what makes "extract the region by id and
            // solve it standalone" reproduce what the driver saw rather than approximate it.
            const root = subdivideRecursively(AWKWARD_HEPTAGON, {levels: MIXED_STREAM_LEVELS});
            for (const child of root.children) {
                if (child.provenance.kind !== 'segment') throw new Error('segment child without segment provenance');
                expect(child.boundary).toEqual(root.segments[child.provenance.index].boundary);
            }
            for (const child of root.residueChildren) {
                if (child.provenance.kind !== 'residue') throw new Error('residue child without residue provenance');
                expect(child.boundary).toEqual(root.residueRings[child.provenance.ringIndex]);
            }
        });

        it('finds any region by the id it was cited under', () => {
            const root = subdivideRecursively(AWKWARD_HEPTAGON, {levels: MIXED_STREAM_LEVELS});
            expect(findRegionById(root, ROOT_REGION_ID)).toBe(root);
            expect(findRegionById(root, 'r0.4')).toBe(root.residueChildren[0]);
            expect(findRegionById(root, 'r0.99')).toBeUndefined();
        });
    });

    describe('a pinned tree: the defect fixtures, id and diagnostics', () => {
        /*
         * RE-SPECIMENED 2026-08-29, and the two halves now come from two fixtures because no single
         * tree carries both any more.
         *
         * The failed pin was `r0.10` on `(seed 55433)` at the census levels: one sub-polygon of the
         * L's upper-right arm that would not re-solve, and F37 traced why — it carried a zero-area
         * FOLD that canonicalisation screened at 3.88 times the floor because the predicate clamped
         * its chord to a segment and so measured the fold's length instead of its width. Journal
         * decision 100's fix removes the spike and that region solves; `(seed 55433)`'s whole census
         * count went 3 to 0 with it. This is the fifth specimen this arc has lost to a fix and the
         * loss is the right kind every time.
         *
         * WHAT REPLACES IT, and the search that found it. Swept over the corpus at six depths and six
         * merge group sizes, exactly five regions anywhere still fail a solve for a reason other than
         * degeneracy — two on `(seed 55433)`, three on `(seed 7919)`, none at any of the census
         * grid's own depths. `r0.2.1` at depth 0.5, merge group 6 is the same fixture and the same
         * class of arm sub-polygon, and it is the specimen the whole suite now shares: see
         * `recursive-subdivision.test.ts`'s `JITTERED_L_FAILING_DIALS` for why this cell rather than
         * one of the other four, and the dashboard's `regionInspector.test.ts` for the affordance it
         * was chosen to keep working.
         *
         * THE DECLINE PIN MOVED TO `(seed 55433, k=4)`, because the new specimen tree contains no
         * decline at all and decision 96's distinction still needs asserting on a tree that has one.
         * That fixture is the census grid's largest remaining decline population — seven of them, all
         * three-vertex slivers — and its census count of 7 is now entirely declines.
         *
         * RE-SPECIMENED AGAIN 2026-09-11, SIXTH TIME, AND THIS ONE IS AN ATTRIBUTED CURE. The
         * COAXIALITY LANE (journal decision 137, spec A9/A10) cured `r0.2.1` of `(seed 55433)`: it
         * was the region journal finding F57 traced, and its refusal was `sourceLiesAhead` answering
         * a POSITIONAL question — "are these two sources on one line?" — at the coordinate epsilon
         * while the client measures visible distance at the floor. Its corridor's two mid-line
         * sources sat 2.754e-8 apart laterally, 36× inside the floor, and were priced 'parallel'
         * rather than 'head-on'; the two bisectors it stranded were 28 and 31, exactly the pair
         * quoted in the assertions this comment replaces. That fixture's tree at these dials now
         * carries NO failed node of any kind, pinned in `coaxial-lane.test.ts`.
         *
         * THE REPLACEMENT IS `OFF_EDGE_JITTER_PLUS_SEED_7919`'s `r0.4.1` AT THE SAME DIALS, and it
         * is the same article structurally: level 2, segment index 1, a fourteen-vertex boundary its
         * own floor reduces, an `Incomplete solve` followed by `unresolved-edges` naming two stranded
         * bisectors, and solved siblings beside it. Only the fixture and the numbers moved. Its floor
         * removes TWO vertices rather than one, so the boundary/canonical assertion below says two.
         */
        const DEFECT_LEVELS: LevelSpec[] = uniformLevelSpecs({
            levels: MAX_RECURSION_LEVELS,
            mergeGroupSize: 6,
            depthFraction: 0.5,
            residue: 'recurse',
        });
        const DEFECT_REGION_ID = 'r0.4.1';

        function defectTree(): RecursiveNode {
            return subdivideRecursively(OFF_EDGE_JITTER_PLUS_SEED_7919, {levels: DEFECT_LEVELS});
        }

        /*
         * CURED 2026-09-23, SEVENTH TIME, AND THERE IS NO REPLACEMENT TO RE-SPECIMEN TO. `intersectRays`'
         * collinearity exits moved to the coaxial form (spec A15's row, journal decision 150) and
         * `r0.4.1` SOLVES; measured by toggle over the whole harvest population at merge groups 1–8 and
         * depths 0.25–1, the ten regions that still failed a solve before the change are none after it.
         * What this block pinned until then — level 2, segment index 1, fourteen vertices, and a failure
         * reading `Incomplete solve: vertices-canonicalised: 2 vertex(es) removed before solving …
         * unresolved-edges: 2 interior edge(s) finished without a target node: 30, 32.` — is HISTORY.
         *
         * The dashboard's `regionInspector.test.ts` met the same extinction at the demo floor and
         * asserted the emptiness instead, so that the day a region fails here again the assertion is
         * what says so; this block follows it, and quotes the cure on the region it happened to.
         */
        it('carries no failure on the region the harvest used to count, which now solves under its own id', () => {
            const region = findRegionById(defectTree(), DEFECT_REGION_ID);
            expect(region).toBeDefined();
            expect(region!.level).toBe(2);
            expect(region!.provenance).toEqual({kind: 'segment', index: 1});
            expect(region!.boundary).toHaveLength(14);
            expect(region!.failure).toBeUndefined();
            expect(flattenRecursiveTree(defectTree())
                .filter(node => node.failure !== undefined && !node.failure.startsWith('Degenerate region'))
                .map(node => node.id)).toEqual([]);
        });

        it('hands the inspector the same polygon the driver cut, and used to fail on', () => {
            // PERISHABLE ON PURPOSE. The boundary quoted here is the one a standalone solve is run
            // against in the dashboard's region inspector, so if the cutter ever stops emitting it
            // this assertion is the thing that says so.
            const root = defectTree();
            const parent = findRegionById(root, 'r0.4')!;
            const region = findRegionById(root, DEFECT_REGION_ID)!;
            expect(region.boundary).toEqual(parent.segments[1].boundary);

            // AND THE TWO BOUNDARIES DIFFER, which the specimen before the previous one's did not:
            // this region's own floor removes TWO vertices before the solve, so the inspector's
            // standalone solve of `boundary` and the driver's solve of `canonicalBoundary` are
            // running on different rings — the region is malformed (and was, until 2026-09-23, unsolved),
            // and the inspector shows both.
            expect(region.canonicalBoundary).toHaveLength(region.boundary.length - 2);
            expect(region.canonicalAreaDrift).toBeGreaterThan(0);
        });

        it('tells a degenerate decline apart from a failure, and says what it measured', () => {
            // Journal decision 96: a decline is accepted behaviour, a failure is the defect class,
            // and a reader must not have to match the prefix of a sentence to know which is which.
            const declines = flattenRecursiveTree(
                subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433_K4, {levels: CENSUS_LEVELS}))
                .filter(node => node.outcome.kind === 'declined-degenerate');

            // `r0.15.2` and `r0.17.2` LEFT THIS LIST ON 2026-09-24 (C8 dispatch 2, decision 159(b)): the
            // degeneracy bar became "no visible width" (spec T23, O3 form (b)), which releases them —
            // areas 5.74e-7 and 4.61e-7 against bars 4.51e-7 and 4.04e-7 — and both solve clean.
            expect(declines.map(node => node.id))
                .toEqual(['r0.0.2', 'r0.5.3', 'r0.9.3', 'r0.11.3', 'r0.12.3']);
            // THE AREA MOVED ON 2026-09-10, FROM 2.556309138623965e-7, UNDER W-SPEC W21 / ARC
            // DECISION 115: `findOffsetViaIncenter` now solves the split event by the linear
            // equi-time form instead of by constructing a temporary node and intersecting two rays,
            // which reaches the same point through different arithmetic. This fixture's root graph
            // moves by 1 ulp on three node coordinates (its own digest pin is re-pinned for the same
            // reason in `full-graph-digest.test.ts`), and this sliver's area is that movement carried
            // through three levels of recursion: 8.5e-18 on 2.6e-7, a relative 3.3e-11. The DECLINE
            // itself, its id, its vertex count and its classification are all unmoved.
            //
            // THE BAR MOVED ON 2026-09-24 (C8 spec T23, O3 form (b)): the root floor restated in caller
            // units (2.56e-4 on this fixture) times half the region's perimeter, reported on the
            // outcome as `bar` beside the area it was measured against. The area is unmoved.
            expect(declines[0].outcome).toEqual({
                kind: 'declined-degenerate',
                vertexCount: 3,
                area: 2.556309138709409e-7,
                bar: 3.0098302748362464e-7,
                failure: 'Degenerate region: 3 boundary vertices enclosing an area of '
                    + '2.556309138709409e-7, under the 3.0098302748362464e-7 degeneracy floor '
                    + '(root floor 0.000256 × half-perimeter).',
            });
            // Every one of them is a sliver rather than a solve that failed: three vertices, and an
            // area under the bar its own perimeter sets.
            expect(declines.every(node => node.boundary.length === 3)).toBe(true);
        });
    });

    describe('determinism', () => {
        it('produces the identical tree on a second run of the same input', () => {
            // The whole warrant for citing a region by id. Compared as JSON rather than field by
            // field so that a future field added to a node is covered by this the moment it exists.
            const first = subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {levels: CENSUS_LEVELS});
            const second = subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {levels: CENSUS_LEVELS});
            expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        });

        it('gives an equal polygon an equal tree, so the id depends on the input and not the run', () => {
            const copy = OFF_EDGE_JITTER_L_SEED_55433.map(vertex => ({x: vertex.x, y: vertex.y}));
            expect(JSON.stringify(subdivideRecursively(copy, {levels: CENSUS_LEVELS})))
                .toBe(JSON.stringify(subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {levels: CENSUS_LEVELS})));
        });
    });

    // `Offset Cross Junction` (enrolled 2026-09-23, decision 151(d)) is swept below and passes both
    // sweeps: its tree at the census levels is its failed root alone, one id, `outcome` 'failed'.
    describe('identity holds over the whole corpus, not just the pinned pair', () => {
        it('gives every region a unique id equal to its own path from the root', () => {
            const problems: string[] = [];

            for (const polygon of FULL_CORPUS) {
                const root = subdivideRecursively(polygon.vertices, {levels: CENSUS_LEVELS});
                const seen = new Set<string>();

                for (const node of flattenRecursiveTree(root)) {
                    if (seen.has(node.id)) {
                        problems.push(`${polygon.name}: duplicate region id ${node.id}`);
                    }
                    seen.add(node.id);

                    childrenInIdOrder(node).forEach((child, childIndex) => {
                        const expected = childRegionId(node.id, childIndex);
                        if (child.id !== expected) {
                            problems.push(`${polygon.name}: ${child.id} should be ${expected}`);
                        }
                        if (child.parentId !== node.id) {
                            problems.push(`${polygon.name}: ${child.id} claims parent ${child.parentId}, not ${node.id}`);
                        }
                        if (child.level !== node.level + 1) {
                            problems.push(`${polygon.name}: ${child.id} sits at level ${child.level} under ${node.level}`);
                        }
                    });
                }

                if (root.id !== ROOT_REGION_ID || root.parentId !== undefined) {
                    problems.push(`${polygon.name}: root is ${root.id} with parent ${root.parentId}`);
                }
            }

            expect(problems).toEqual([]);
        });

        it('keeps `outcome` and `failure` saying the same thing at every node', () => {
            const problems: string[] = [];

            for (const polygon of FULL_CORPUS) {
                for (const node of flattenRecursiveTree(
                    subdivideRecursively(polygon.vertices, {levels: CENSUS_LEVELS}))) {
                    const outcome = node.outcome;
                    if (outcome.kind === 'solved' && node.failure !== undefined) {
                        problems.push(`${polygon.name}/${node.id}: solved but carries a failure`);
                    }
                    if (outcome.kind !== 'solved' && node.failure !== outcome.failure) {
                        problems.push(`${polygon.name}/${node.id}: outcome and failure disagree`);
                    }
                    if (outcome.kind !== 'declined-degenerate') {
                        continue;
                    }
                    // The decline's own measurement, checked against the region it was taken on:
                    // reporting an area that is not the region's would make decision 96's accepted
                    // behaviour unauditable.
                    if (outcome.vertexCount !== node.boundary.length) {
                        problems.push(`${polygon.name}/${node.id}: declined at ${outcome.vertexCount} vertices, has ${node.boundary.length}`);
                    }
                    const area = node.boundary.length < 3 ? 0 : Math.abs(signedArea(node.boundary));
                    if (outcome.area !== area) {
                        problems.push(`${polygon.name}/${node.id}: declined at area ${outcome.area}, measures ${area}`);
                    }
                    if (outcome.vertexCount >= 3 && outcome.area >= outcome.bar) {
                        problems.push(`${polygon.name}/${node.id}: declined a region of ${outcome.area}, above the floor`);
                    }
                    // The bar it reports is the one C8 spec T23 states: the ROOT floor restated in caller
                    // units, times half the region's perimeter.
                    const rootFloor = denormaliseLength(makeSkeletonNormalisation(polygon.vertices), SKELETON_NOISE_FLOOR);
                    if (outcome.vertexCount >= 3
                        && outcome.bar !== degenerateAreaBar(rootFloor, ringPerimeter(node.boundary))) {
                        problems.push(`${polygon.name}/${node.id}: declined against a bar of ${outcome.bar}, not the root-restated one`);
                    }
                }
            }

            expect(problems).toEqual([]);
        });
    });
});
