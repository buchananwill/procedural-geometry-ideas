import {
    childRegionId,
    DEGENERATE_AREA_EPSILON,
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
import {AWKWARD_HEPTAGON, FULL_CORPUS, OFF_EDGE_JITTER_L_SEED_55433} from '@proc-geo/test-fixtures';

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

    describe('a pinned tree: the defect fixture, id and diagnostics', () => {
        // The live recursion defect of journal decisions 96/97 and finding F35: one large,
        // real-area sub-polygon of the L's upper-right arm that will not re-solve. Pinned by ID as
        // well as by sentence, so a report, a census row and an inspector all name one region.
        const DEFECT_REGION_ID = 'r0.10';
        const DEFECT_FAILURE =
            'Incomplete solve: step-failure: Unable to generate any collisions from graph context. '
            + 'Skeleton remains incomplete.; unresolved-edges: 4 interior edge(s) finished without a '
            + 'target node: 10, 11, 12, 13.';

        function defectTree(): RecursiveNode {
            return subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, {levels: CENSUS_LEVELS});
        }

        it('carries the failure on the region the census counts, under its own id', () => {
            const region = findRegionById(defectTree(), DEFECT_REGION_ID);
            expect(region).toBeDefined();
            expect(region!.level).toBe(1);
            expect(region!.provenance).toEqual({kind: 'segment', index: 10});
            expect(region!.outcome).toEqual({kind: 'failed', failure: DEFECT_FAILURE});
            expect(region!.failure).toBe(DEFECT_FAILURE);
            expect(region!.boundary).toHaveLength(6);
        });

        it('hands the inspector the same polygon the driver failed on', () => {
            // PERISHABLE ON PURPOSE. The boundary quoted here is the one a standalone solve is run
            // against in the dashboard's region inspector, so if the cutter ever stops emitting it
            // this assertion is the thing that says so.
            const root = defectTree();
            const region = findRegionById(root, DEFECT_REGION_ID)!;
            expect(region.boundary).toEqual(root.segments[10].boundary);
            expect(region.canonicalBoundary).toEqual(region.boundary);
        });

        it('tells a degenerate decline apart from a failure, and says what it measured', () => {
            // Journal decision 96: a decline is accepted behaviour, a failure is the defect class,
            // and a reader must not have to match the prefix of a sentence to know which is which.
            const declines = flattenRecursiveTree(defectTree())
                .filter(node => node.outcome.kind === 'declined-degenerate');
            expect(declines).toHaveLength(1);
            expect(declines[0].outcome).toEqual({
                kind: 'declined-degenerate',
                vertexCount: 0,
                area: 0,
                failure: 'Degenerate region: 0 boundary vertices, fewer than the three a polygon needs.',
            });
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
                    if (outcome.vertexCount >= 3 && outcome.area >= DEGENERATE_AREA_EPSILON) {
                        problems.push(`${polygon.name}/${node.id}: declined a region of ${outcome.area}, above the floor`);
                    }
                }
            }

            expect(problems).toEqual([]);
        });
    });
});
