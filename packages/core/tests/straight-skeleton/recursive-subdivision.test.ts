import {ALL_TEST_POLYGONS, SQUARE} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeStrips,
    DEGENERATE_AREA_EPSILON,
    flattenRecursiveTree,
    makeMergeGroupPredicate,
    MAX_RECURSION_LEVELS,
    RecursiveNode,
    signedArea,
    solveSkeleton,
    Strip,
    subdivideRecursively,
    Vector2,
} from '@proc-geo/core';

/**
 * Properties of the recursive driver, rather than golden coordinates.
 *
 * The two load-bearing assertions are structural and numerical. Structural: every node either
 * carries the segments it was divided into or the reason it was not, one child per merged group,
 * and no node deeper than the requested level count — which is what "failure is data" means when
 * stated as an invariant. Numerical: wherever a node did divide, its segments' areas must sum to
 * its own area, because at full depth the segments tile the region exactly. A subdivision that
 * looks right on a canvas and quietly loses a wedge fails only that second check.
 *
 * The failure census at the end is a measurement, not a gate: it reports which fixtures stop
 * subdividing and where. That is the first data this project has on how solver *output* behaves as
 * solver *input*, so it is printed rather than encoded as an expectation that would have to be
 * re-pinned every time the solver improves.
 */

/**
 * Relative area tolerance for the tiling identity, matching `strip-decomposition.test.ts`.
 *
 * The identity is exact in principle — the segments are clipped skeleton faces and at full depth the
 * clip removes nothing — so the only slack needed is double-precision summation noise.
 */
const AREA_TOLERANCE_FRACTION = 1e-12;

/**
 * Level counts every fixture is swept at.
 *
 * Decision 16 allows a reduced fixture set if the deep sweep is slow. Measured, it is not: the whole
 * of `ALL_TEST_POLYGONS` at all three level counts runs in about a second and a half, because the
 * regions handed back down are small and the solver's cubic cost is paid on ever-fewer vertices. So
 * nothing is excluded.
 */
const SWEPT_LEVELS = [1, 2, 3];

/** Merge group sizes the census measures. One is "no merging"; four merges most fixtures heavily. */
const CENSUS_MERGE_GROUP_SIZES = [1, 2, 3, 4];

const DEFAULT_MERGE_GROUP_SIZE = 2;

/**
 * Ring area via the library's own shoelace, not a re-derived one.
 *
 * `signedArea` takes every term relative to the ring's first vertex, which is what makes it
 * translation-invariant; a version summed over absolute coordinates loses the D^2 cancellation the
 * `AREA_TOLERANCE_FRACTION` below is calibrated against the moment a fixture sits far from the origin.
 */
function ringArea(ring: Vector2[]): number {
    return Math.abs(signedArea(ring));
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce((area, hole) => area - ringArea(hole), ringArea(strip.boundary));
}

function fixtureVertices(name: string): Vector2[] {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return fixture.vertices;
}

/** Structural invariants every node of every tree must satisfy. Returns the problems it found. */
function structuralProblems(root: RecursiveNode, levels: number): string[] {
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        const where = `level ${node.level}`;
        if (node.level >= levels) {
            problems.push(`${where} exists but only ${levels} level(s) were requested`);
        }
        if (node.failure === undefined && node.segments.length === 0) {
            problems.push(`${where} has neither segments nor a failure`);
        }
        if (node.failure !== undefined && node.segments.length > 0) {
            problems.push(`${where} reports the failure "${node.failure}" yet carries ${node.segments.length} segments`);
        }
        if (node.failure !== undefined && node.children.length > 0) {
            problems.push(`${where} failed yet has ${node.children.length} children`);
        }
        const expectedChildren = node.failure !== undefined || node.level + 1 >= levels
            ? 0
            : node.segments.length;
        if (node.children.length !== expectedChildren) {
            problems.push(`${where} has ${node.children.length} children for ${expectedChildren} merged group(s)`);
        }
    }
    return problems;
}

/** Relative error of the tiling identity at every node that divided. Returns the problems it found. */
function tilingProblems(root: RecursiveNode): string[] {
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        if (node.failure !== undefined) continue;
        const regionArea = Math.abs(signedArea(node.boundary));
        const covered = node.segments.reduce((total, segment) => total + stripArea(segment), 0);
        const error = Math.abs(covered - regionArea) / regionArea;
        if (!(error < AREA_TOLERANCE_FRACTION)) {
            problems.push(`level ${node.level}: segments cover ${covered} of an area of ${regionArea} (out by ${error})`);
        }
    }
    return problems;
}

describe('recursive segment subdivision', () => {
    describe('merge grouping', () => {
        it('puts consecutive edge ids in the same run and breaks between runs', () => {
            const sameStreet = makeMergeGroupPredicate(3);
            expect(sameStreet(0, 1)).toBe(true);
            expect(sameStreet(1, 2)).toBe(true);
            expect(sameStreet(2, 3)).toBe(false);
            expect(sameStreet(3, 4)).toBe(true);
        });

        it('clamps a group size below one back to one segment per edge', () => {
            const sameStreet = makeMergeGroupPredicate(0);
            expect(sameStreet(0, 1)).toBe(false);
            expect(sameStreet(1, 2)).toBe(false);
        });

        it('halves the segment count of a square when groups of two are merged', () => {
            const result = solveSkeleton(SQUARE);
            const depth = computeMaxOffset(result);
            expect(computeStrips(result, {depth})).toHaveLength(4);
            expect(computeStrips(result, {depth, sameLogicalStreet: makeMergeGroupPredicate(2)})).toHaveLength(2);
        });

        it('drives the segment count of the root node', () => {
            const single = subdivideRecursively(SQUARE, {levels: 1, mergeGroupSize: 1});
            const paired = subdivideRecursively(SQUARE, {levels: 1, mergeGroupSize: 2});
            expect(single.segments).toHaveLength(4);
            expect(paired.segments).toHaveLength(2);
        });
    });

    describe('option clamping', () => {
        it('treats zero and negative level counts as a single pass', () => {
            for (const levels of [0, -3]) {
                const root = subdivideRecursively(SQUARE, {levels, mergeGroupSize: 2});
                expect(root.children).toEqual([]);
                expect(root.segments.length).toBeGreaterThan(0);
            }
        });

        it('never recurses deeper than the maximum, whatever it is asked for', () => {
            const root = subdivideRecursively(SQUARE, {levels: 99, mergeGroupSize: 2});
            const deepest = Math.max(...flattenRecursiveTree(root).map(node => node.level));
            expect(deepest).toBe(MAX_RECURSION_LEVELS - 1);
        });
    });

    describe('the recursion feeds a segment straight back in', () => {
        it("uses each segment's own boundary as its child's polygon, untransformed", () => {
            const root = subdivideRecursively(fixtureVertices('Awkward Heptagon'), {
                levels: 2,
                mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            });
            expect(root.children).toHaveLength(root.segments.length);
            root.children.forEach((child, index) => {
                expect(child.level).toBe(1);
                expect(child.boundary).toEqual(root.segments[index].boundary);
            });
        });

        it('records the region it solved at the package winding convention, whichever way it was handed in', () => {
            const clockwise = fixtureVertices('Awkward Heptagon');
            const counterClockwise = [...clockwise].reverse();
            const options = {levels: 1, mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE};

            const fromClockwise = subdivideRecursively(clockwise, options);
            const fromCounterClockwise = subdivideRecursively(counterClockwise, options);

            // `isClockwise` is `signedArea < 0`, so both roots must land on the negative branch.
            expect(signedArea(fromClockwise.boundary)).toBeLessThan(0);
            expect(signedArea(fromCounterClockwise.boundary)).toBeLessThan(0);
            // Reversed, never re-derived: the same vertices in the opposite order.
            expect(fromCounterClockwise.boundary).toEqual(clockwise);
            expect(fromClockwise.boundary).toEqual(clockwise);
        });

        it('flattens the tree root first, then each subtree in child order', () => {
            const root = subdivideRecursively(fixtureVertices('Awkward Heptagon'), {
                levels: 2,
                mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            });
            const flat = flattenRecursiveTree(root);
            expect(flat[0]).toBe(root);
            expect(flat).toHaveLength(1 + root.children.length);
            expect(flat.slice(1)).toEqual(root.children);
        });
    });

    describe('failure is recorded, never thrown', () => {
        it('returns the root as a failed node when the input has too few vertices', () => {
            const boundary: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 1}];
            const root = subdivideRecursively(boundary, {levels: 2, mergeGroupSize: 2});
            expect(root.level).toBe(0);
            expect(root.failure).toMatch(/Degenerate region/);
            expect(root.segments).toEqual([]);
            expect(root.children).toEqual([]);
            expect(root.boundary).toEqual(boundary);
        });

        it('returns the root as a failed node when the input encloses no area', () => {
            const root = subdivideRecursively(
                [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}],
                {levels: 2, mergeGroupSize: 2});
            expect(root.failure).toMatch(/^Degenerate region/);
            expect(root.failure).toMatch(/degeneracy floor/);
            expect(root.segments).toEqual([]);
        });

        it('calls a sliver of near-zero area degenerate rather than solving it', () => {
            // The case the tolerance exists for: a computed sub-region is never *exactly* collinear,
            // it is collinear to within summation noise. This triangle encloses 5e-14 — a hair above
            // zero and far below the floor — so an exact `=== 0` test would hand it to the solver.
            const sliver: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0.5, y: 1e-13}];
            expect(Math.abs(signedArea(sliver))).toBeGreaterThan(0);
            expect(Math.abs(signedArea(sliver))).toBeLessThan(DEGENERATE_AREA_EPSILON);

            const root = subdivideRecursively(sliver, {levels: 2, mergeGroupSize: 2});
            expect(root.failure).toMatch(/^Degenerate region/);
            expect(root.segments).toEqual([]);
            expect(root.children).toEqual([]);
        });

        it('subdivides a small region whose area clears the degeneracy floor', () => {
            // The other side of the same boundary: shrinking a square until its area is merely small
            // must not make it degenerate, or the floor would be silently eating real geometry.
            const side = Math.sqrt(DEGENERATE_AREA_EPSILON) * 10;
            const small: Vector2[] = [
                {x: 0, y: 0}, {x: 0, y: side}, {x: side, y: side}, {x: side, y: 0},
            ];
            expect(Math.abs(signedArea(small))).toBeGreaterThan(DEGENERATE_AREA_EPSILON);

            const root = subdivideRecursively(small, {levels: 1, mergeGroupSize: 1});
            expect(root.failure).toBeUndefined();
            expect(root.segments).toHaveLength(4);
        });

        it('keeps subdividing the siblings of a segment that fails', () => {
            // A measured case, not a constructed one: at a merge group of three the rectangle's
            // four edges become a run of three and a run of one, and the three-edge segment does
            // not re-solve. Its sibling must still be subdivided — that is the whole of decision 6.
            const root = subdivideRecursively(fixtureVertices('Rectangle'), {levels: 2, mergeGroupSize: 3});
            expect(root.children).toHaveLength(root.segments.length);

            const failed = root.children.filter(child => child.failure !== undefined);
            const solved = root.children.filter(child => child.failure === undefined);
            expect(failed).toHaveLength(1);
            expect(failed[0].failure).toMatch(/^Incomplete solve/);
            expect(failed[0].segments).toEqual([]);
            expect(solved.length).toBeGreaterThan(0);
            expect(solved.every(child => child.segments.length > 0)).toBe(true);
        });
    });

    describe('every fixture subdivides without throwing', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const vertices = fixtureVertices(name);
            const problems: string[] = [];
            for (const levels of SWEPT_LEVELS) {
                const root = subdivideRecursively(vertices, {levels, mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE});
                problems.push(
                    ...structuralProblems(root, levels).map(problem => `levels ${levels}: ${problem}`),
                    ...tilingProblems(root).map(problem => `levels ${levels}: ${problem}`));

                // Depth: a tree in which nothing failed must reach exactly the requested level
                // count. Where something did fail that branch stops early by design, and the
                // structural check above is what holds the rest of the shape.
                const nodes = flattenRecursiveTree(root);
                const deepest = Math.max(...nodes.map(node => node.level)) + 1;
                if (nodes.every(node => node.failure === undefined) && deepest !== levels) {
                    problems.push(`levels ${levels}: the tree reached ${deepest} level(s) with nothing failing`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('census: which fixtures stop subdividing, and where', () => {
        it('reports the failures rather than excluding the fixtures that produce them', () => {
            const rows: string[] = [];
            const unexplained: string[] = [];
            let subdivided = 0;
            let failed = 0;

            for (const mergeGroupSize of CENSUS_MERGE_GROUP_SIZES) {
                for (const polygon of ALL_TEST_POLYGONS) {
                    const nodes = flattenRecursiveTree(subdivideRecursively(polygon.vertices, {
                        levels: MAX_RECURSION_LEVELS,
                        mergeGroupSize,
                    }));
                    subdivided += nodes.filter(node => node.failure === undefined).length;

                    const failures = nodes.filter(node => node.failure !== undefined);
                    failed += failures.length;
                    unexplained.push(...failures
                        .map(node => node.failure ?? '')
                        .filter(failure => !/^(Degenerate region|Incomplete solve|Subdivision threw)/.test(failure)));
                    if (failures.length === 0) continue;

                    const detail = [...new Set(failures.map(node =>
                        `level ${node.level}: ${(node.failure ?? '').replace(/\s+/g, ' ').slice(0, 110)}`))].join(' | ');
                    rows.push(`${polygon.name} (merge group ${mergeGroupSize}) — ${detail}`);
                }
            }

            // Printed, not pinned. Which regions fail when a solver's own output is fed back in is a
            // measurement of the solver, and encoding today's answer as an expectation would turn
            // every future solver improvement into a test failure.
            // eslint-disable-next-line no-console
            console.log(
                `Recursive subdivision census: ${ALL_TEST_POLYGONS.length} fixtures at ` +
                `${MAX_RECURSION_LEVELS} levels, merge groups ${CENSUS_MERGE_GROUP_SIZES.join('/')} — ` +
                `${subdivided} node(s) subdivided, ${failed} recorded a failure.\n` +
                `${rows.length === 0 ? '  (no failures)' : rows.map(row => `  ${row}`).join('\n')}`);

            // Every recorded failure must say one of the things this driver can actually report; an
            // empty or unrecognised reason would make the census above worthless.
            expect(unexplained).toEqual([]);
        });
    });
});
