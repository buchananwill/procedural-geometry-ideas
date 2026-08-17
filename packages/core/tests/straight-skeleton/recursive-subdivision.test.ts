import {ALL_TEST_POLYGONS, SQUARE} from '@proc-geo/test-fixtures';
import {
    clampDepthFraction,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    DEGENERATE_AREA_EPSILON,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    makeMergeGroupPredicate,
    MAX_RECURSION_LEVELS,
    RecursiveNode,
    RecursiveOptions,
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
 * carries the segments it was divided into or the reason it was not, one child per merged group and
 * one residue child per residue ring, and no node deeper than the requested level count — which is
 * what "failure is data" means when stated as an invariant. Numerical: wherever a node did divide,
 * its segments' areas plus its residue rings' areas must sum to its own area, because the segments
 * and the offset contour tile the region between them. A subdivision that looks right on a canvas
 * and quietly loses a wedge fails only that second check.
 *
 * The failure census at the end is a measurement, not a gate: it reports which fixtures stop
 * subdividing and where. That is the first data this project has on how solver *output* behaves as
 * solver *input*, so it is printed rather than encoded as an expectation that would have to be
 * re-pinned every time the solver improves.
 */

/**
 * Relative area tolerance for the tiling identity, matching `strip-decomposition.test.ts`.
 *
 * The identity is exact in principle — the segments are clipped skeleton faces and whatever the clip
 * removes is exactly the offset contour's interior — so the only slack needed is double-precision
 * summation noise.
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

/**
 * Depth fractions every fixture is swept at: one shallow, one middling, and full depth.
 *
 * Full depth is in the sweep rather than assumed: it is the case with no residue at all, and the one
 * the structural invariants degenerate to, so a fraction that stopped producing a residue would
 * otherwise look identical to the case that is meant to have none.
 */
const SWEPT_DEPTH_FRACTIONS = [0.25, 0.6, FULL_DEPTH_FRACTION];

/** Merge group sizes the census measures. One is "no merging"; four merges most fixtures heavily. */
const CENSUS_MERGE_GROUP_SIZES = [1, 2, 3, 4];

const DEFAULT_MERGE_GROUP_SIZE = 2;

/**
 * Options with the two new dials at the values that reproduce the driver's original behaviour.
 *
 * Written once so that a test about merge grouping says only what it is about, and so that the
 * regression gate of decision 2 — full depth, no residue — is what every pre-existing test still
 * runs under unless it says otherwise.
 */
function options(overrides: Partial<RecursiveOptions> = {}): RecursiveOptions {
    return {
        levels: 1,
        mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
        depthFraction: FULL_DEPTH_FRACTION,
        residue: 'recurse',
        ...overrides,
    };
}

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

/** Residue children that record a failure — the rings decision 4 discarded rather than recursed. */
function discardedResidueChildren(node: RecursiveNode): RecursiveNode[] {
    return node.residueChildren.filter(child => child.failure !== undefined);
}

/**
 * The three things this driver can report, as a kind rather than a sentence.
 *
 * The reference recursion below has to say the same thing the driver says without restating its
 * wording, and the wording is a diagnostic detail nothing else asserts on.
 */
type FailureKind = 'degenerate' | 'incomplete' | 'threw';

/** A subdivision tree reduced to the facts two independent implementations must agree on. */
interface SubdivisionShape {
    level: number;
    /** Segment boundaries in order. Empty where the region did not divide. */
    segments: Vector2[][];
    children: SubdivisionShape[];
    failure?: FailureKind;
}

function failureKind(failure: string): FailureKind {
    if (failure.startsWith('Degenerate region')) return 'degenerate';
    if (failure.startsWith('Incomplete solve')) return 'incomplete';
    return 'threw';
}

/** A driver tree in the reference's terms. Residue is not projected: the reference has none. */
function shapeOf(node: RecursiveNode): SubdivisionShape {
    return {
        level: node.level,
        segments: node.segments.map(segment => segment.boundary),
        children: node.children.map(shapeOf),
        ...(node.failure === undefined ? {} : {failure: failureKind(node.failure)}),
    };
}

/**
 * The driver as it stood before the residue stream: solve, cut at the maximum offset, recurse on
 * every segment. Restated here, deliberately, rather than reused.
 *
 * This is decision 2's regression gate. It is written out in full because a gate that called the
 * driver would be comparing the driver against itself; what it must pin is that asking for a depth
 * fraction of 1 lands on exactly the geometry the pre-residue driver produced — including that the
 * default noise floor and the root-derived one agree, which is measured rather than assumed.
 */
function fullDepthReference(
    boundary: Vector2[],
    level: number,
    levels: number,
    mergeGroupSize: number,
): SubdivisionShape {
    const bare: SubdivisionShape = {level, segments: [], children: []};
    if (boundary.length < 3 || ringArea(boundary) < DEGENERATE_AREA_EPSILON) {
        return {...bare, failure: 'degenerate'};
    }

    let segments: Strip[];
    try {
        const result = solveSkeleton(boundary);
        if (!result.complete) return {...bare, failure: 'incomplete'};
        segments = computeStrips(result, {
            depth: computeMaxOffset(result),
            sameLogicalStreet: makeMergeGroupPredicate(mergeGroupSize),
        });
    } catch {
        return {...bare, failure: 'threw'};
    }

    return {
        level,
        segments: segments.map(segment => segment.boundary),
        children: level + 1 >= levels
            ? []
            : segments.map(segment => fullDepthReference(segment.boundary, level + 1, levels, mergeGroupSize)),
    };
}

function fixtureVertices(name: string): Vector2[] {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return fixture.vertices;
}

/** Structural invariants every node of every tree must satisfy. Returns the problems it found. */
function structuralProblems(root: RecursiveNode, subdivisionOptions: RecursiveOptions): string[] {
    const {levels, depthFraction, residue} = subdivisionOptions;
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
        if (node.failure !== undefined && node.residueRings.length > 0) {
            problems.push(`${where} failed yet carries ${node.residueRings.length} residue ring(s)`);
        }
        if (depthFraction >= FULL_DEPTH_FRACTION && node.residueRings.length > 0) {
            problems.push(`${where} carries ${node.residueRings.length} residue ring(s) at full depth`);
        }
        const expectedChildren = node.failure !== undefined || node.level + 1 >= levels
            ? 0
            : node.segments.length;
        if (node.children.length !== expectedChildren) {
            problems.push(`${where} has ${node.children.length} children for ${expectedChildren} merged group(s)`);
        }
        const expectedResidueChildren = residue === 'void' || node.level + 1 >= levels
            ? 0
            : node.residueRings.length;
        if (node.residueChildren.length !== expectedResidueChildren) {
            problems.push(
                `${where} has ${node.residueChildren.length} residue child(ren) for `
                + `${expectedResidueChildren} residue ring(s)`);
        }
        node.residueChildren.forEach((child, index) => {
            if (child.boundary !== node.residueRings[index]
                && JSON.stringify(child.boundary) !== JSON.stringify(node.residueRings[index])) {
                problems.push(`${where} residue child ${index} does not carry residue ring ${index}`);
            }
        });
    }
    return problems;
}

/**
 * Decision 8's tiling identity at every node that divided: segments plus residue rings equal the
 * node's own area. Returns the problems it found.
 *
 * At full depth the residue term is zero and this reduces to the check that predates it.
 */
function tilingProblems(root: RecursiveNode): string[] {
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        if (node.failure !== undefined) continue;
        const regionArea = Math.abs(signedArea(node.boundary));
        const covered = node.segments.reduce((total, segment) => total + stripArea(segment), 0)
            + node.residueRings.reduce((total, ring) => total + ringArea(ring), 0);
        const error = Math.abs(covered - regionArea) / regionArea;
        if (!(error < AREA_TOLERANCE_FRACTION)) {
            problems.push(
                `level ${node.level}: ${node.segments.length} segment(s) and `
                + `${node.residueRings.length} residue ring(s) cover ${covered} of an area of `
                + `${regionArea} (out by ${error})`);
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
            const single = subdivideRecursively(SQUARE, options({mergeGroupSize: 1}));
            const paired = subdivideRecursively(SQUARE, options({mergeGroupSize: 2}));
            expect(single.segments).toHaveLength(4);
            expect(paired.segments).toHaveLength(2);
        });
    });

    describe('option clamping', () => {
        it('treats zero and negative level counts as a single pass', () => {
            for (const levels of [0, -3]) {
                const root = subdivideRecursively(SQUARE, options({levels}));
                expect(root.children).toEqual([]);
                expect(root.segments.length).toBeGreaterThan(0);
            }
        });

        it('never recurses deeper than the maximum, whatever it is asked for', () => {
            const root = subdivideRecursively(SQUARE, options({levels: 99}));
            const deepest = Math.max(...flattenRecursiveTree(root).map(node => node.level));
            expect(deepest).toBe(MAX_RECURSION_LEVELS - 1);
        });

        it('holds the depth fraction inside the half-open interval it is specified on', () => {
            expect(clampDepthFraction(0.4)).toBe(0.4);
            expect(clampDepthFraction(FULL_DEPTH_FRACTION)).toBe(FULL_DEPTH_FRACTION);
            expect(clampDepthFraction(2.5)).toBe(FULL_DEPTH_FRACTION);
        });

        it('reads an unusable depth fraction as full depth, the behaviour that predates the dial', () => {
            for (const unusable of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
                expect(clampDepthFraction(unusable)).toBe(FULL_DEPTH_FRACTION);
            }

            const clamped = subdivideRecursively(SQUARE, options({depthFraction: 0}));
            const full = subdivideRecursively(SQUARE, options({depthFraction: FULL_DEPTH_FRACTION}));
            expect(clamped.residueRings).toEqual([]);
            expect(clamped.segments.map(segment => segment.boundary))
                .toEqual(full.segments.map(segment => segment.boundary));
        });
    });

    describe('the recursion feeds a segment straight back in', () => {
        it("uses each segment's own boundary as its child's polygon, untransformed", () => {
            const root = subdivideRecursively(fixtureVertices('Awkward Heptagon'), options({levels: 2}));
            expect(root.children).toHaveLength(root.segments.length);
            root.children.forEach((child, index) => {
                expect(child.level).toBe(1);
                expect(child.boundary).toEqual(root.segments[index].boundary);
            });
        });

        it('records the region it solved at the package winding convention, whichever way it was handed in', () => {
            const clockwise = fixtureVertices('Awkward Heptagon');
            const counterClockwise = [...clockwise].reverse();

            const fromClockwise = subdivideRecursively(clockwise, options());
            const fromCounterClockwise = subdivideRecursively(counterClockwise, options());

            // `isClockwise` is `signedArea < 0`, so both roots must land on the negative branch.
            expect(signedArea(fromClockwise.boundary)).toBeLessThan(0);
            expect(signedArea(fromCounterClockwise.boundary)).toBeLessThan(0);
            // Reversed, never re-derived: the same vertices in the opposite order.
            expect(fromCounterClockwise.boundary).toEqual(clockwise);
            expect(fromClockwise.boundary).toEqual(clockwise);
        });

        it('flattens the tree root first, then each subtree in child order', () => {
            const root = subdivideRecursively(fixtureVertices('Awkward Heptagon'), options({levels: 2}));
            const flat = flattenRecursiveTree(root);
            expect(flat[0]).toBe(root);
            expect(flat).toHaveLength(1 + root.children.length);
            expect(flat.slice(1)).toEqual(root.children);
        });

        it('walks the residue subtrees too, after the segment subtrees of the same node', () => {
            // A residue subtree the traversal cannot see is a subtree the counts, the census and the
            // canvas cannot see either, which is indistinguishable from never having recursed on it.
            const root = subdivideRecursively(fixtureVertices('Awkward Heptagon'), options({
                levels: 2,
                depthFraction: 0.4,
            }));
            expect(root.residueChildren.length).toBeGreaterThan(0);

            const flat = flattenRecursiveTree(root);
            expect(flat).toEqual([root, ...root.children, ...root.residueChildren]);
        });
    });

    describe('failure is recorded, never thrown', () => {
        it('returns the root as a failed node when the input has too few vertices', () => {
            const boundary: Vector2[] = [{x: 0, y: 0}, {x: 1, y: 1}];
            const root = subdivideRecursively(boundary, options({levels: 2}));
            expect(root.level).toBe(0);
            expect(root.failure).toMatch(/Degenerate region/);
            expect(root.segments).toEqual([]);
            expect(root.children).toEqual([]);
            expect(root.boundary).toEqual(boundary);
        });

        it('returns the root as a failed node when the input encloses no area', () => {
            const root = subdivideRecursively(
                [{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}],
                options({levels: 2}));
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

            const root = subdivideRecursively(sliver, options({levels: 2}));
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

            const root = subdivideRecursively(small, options({mergeGroupSize: 1}));
            expect(root.failure).toBeUndefined();
            expect(root.segments).toHaveLength(4);
        });

        it('keeps subdividing the siblings of a segment that fails', () => {
            // A measured case, not a constructed one: at a merge group of three the rectangle's
            // four edges become a run of three and a run of one, and the three-edge segment does
            // not re-solve. Its sibling must still be subdivided — that is the whole of decision 6.
            const root = subdivideRecursively(fixtureVertices('Rectangle'), options({levels: 2, mergeGroupSize: 3}));
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

    describe('full depth is exactly the behaviour that predates the residue stream', () => {
        // Decision 2's gate, run against the corpus rather than a chosen fixture: node for node,
        // segment for segment, vertex for vertex, and bit for bit — `toEqual` on coordinates, with
        // no tolerance, because the two paths perform the same arithmetic on the same input.
        it.each([2, 3])('reproduces the pre-residue tree at merge group %i', mergeGroupSize => {
            const differing: string[] = [];
            for (const polygon of ALL_TEST_POLYGONS) {
                const tree = subdivideRecursively(polygon.vertices, options({
                    levels: MAX_RECURSION_LEVELS,
                    mergeGroupSize,
                }));
                const reference = fullDepthReference(polygon.vertices, 0, MAX_RECURSION_LEVELS, mergeGroupSize);
                if (JSON.stringify(shapeOf(tree)) !== JSON.stringify(reference)) {
                    differing.push(polygon.name);
                }
            }
            expect(differing).toEqual([]);
        });

        it('grows no residue and no residue children anywhere in the tree', () => {
            for (const polygon of ALL_TEST_POLYGONS) {
                const nodes = flattenRecursiveTree(subdivideRecursively(polygon.vertices, options({
                    levels: MAX_RECURSION_LEVELS,
                })));
                expect(nodes.every(node => node.residueRings.length === 0)).toBe(true);
                expect(nodes.every(node => node.residueChildren.length === 0)).toBe(true);
            }
        });
    });

    /**
     * Decision 14's pinching fixtures, and the depths their residue splits at.
     *
     * Measured across the corpus rather than assumed: `Long Unbroken Side Then Extreme Acute Angle`
     * comes apart into two rings at a quarter of its maximum offset and three at three tenths, and
     * `Premature Bisector Split (passes)` into two at a quarter. Decision 3 — that the residue is
     * rings, plural — is invisible on any convex fixture, which is most of the corpus.
     */
    const PINCHING_FIXTURE = 'Long Unbroken Side Then Extreme Acute Angle';
    const PINCH_DEPTH_FRACTION = 0.3;
    const PINCH_RING_COUNT = 3;

    describe('the residue is rings, plural', () => {
        it('splits into more than one ring where the wavefront pinches', () => {
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), options({
                depthFraction: PINCH_DEPTH_FRACTION,
            }));
            expect(root.residueRings).toHaveLength(PINCH_RING_COUNT);
            expect(root.residueRings.every(ring => ring.length >= 3)).toBe(true);
        });

        it('agrees with the projection it reads the rings from, ring for ring', () => {
            // Not a second opinion about the geometry — the same call, asserted to have been made at
            // the fraction of this node's own maximum offset rather than at some absolute depth.
            const vertices = fixtureVertices(PINCHING_FIXTURE);
            const result = solveSkeleton(vertices);
            const expected = computeOffsetRings(result, computeMaxOffset(result) * PINCH_DEPTH_FRACTION);

            const root = subdivideRecursively(vertices, options({depthFraction: PINCH_DEPTH_FRACTION}));
            expect(root.residueRings).toEqual(expected);
        });

        it('grows one child per ring, in the same order, each on its own ring', () => {
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), options({
                levels: 2,
                depthFraction: PINCH_DEPTH_FRACTION,
            }));
            expect(root.residueChildren).toHaveLength(root.residueRings.length);
            root.residueChildren.forEach((child, index) => {
                expect(child.level).toBe(1);
                expect(child.boundary).toEqual(root.residueRings[index]);
            });
        });

        it('splits a second fixture too, so the first is not a one-off of its own geometry', () => {
            const root = subdivideRecursively(fixtureVertices('Premature Bisector Split (passes)'), options({
                depthFraction: 0.25,
            }));
            expect(root.residueRings.length).toBeGreaterThan(1);
        });
    });

    describe('the residue is load-bearing in the tiling identity', () => {
        it('leaves the region short by exactly the residue when the rings are left out', () => {
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), options({
                depthFraction: PINCH_DEPTH_FRACTION,
            }));
            const regionArea = ringArea(root.boundary);
            const segmentArea = root.segments.reduce((total, segment) => total + stripArea(segment), 0);
            const residueArea = root.residueRings.reduce((total, ring) => total + ringArea(ring), 0);

            // A tenth of the region and more: the segments alone are not a tiling at partial depth,
            // and a check that only summed the segments would be passing on a rounding tolerance.
            expect(residueArea / regionArea).toBeGreaterThan(0.1);
            expect(Math.abs(regionArea - segmentArea) / regionArea).toBeGreaterThan(0.1);
            expect(Math.abs(regionArea - segmentArea - residueArea) / regionArea)
                .toBeLessThan(AREA_TOLERANCE_FRACTION);
        });
    });

    describe('what becomes of the residue', () => {
        it('keeps the rings and grows nothing from them when the residue is voided', () => {
            const vertices = fixtureVertices(PINCHING_FIXTURE);
            const recursed = subdivideRecursively(vertices, options({
                levels: 2, depthFraction: PINCH_DEPTH_FRACTION, residue: 'recurse',
            }));
            const voided = subdivideRecursively(vertices, options({
                levels: 2, depthFraction: PINCH_DEPTH_FRACTION, residue: 'void',
            }));

            // A courtyard, not an absence: the rings are still there, and so is everything else.
            expect(voided.residueRings).toEqual(recursed.residueRings);
            expect(voided.residueChildren).toEqual([]);
            expect(recursed.residueChildren.length).toBeGreaterThan(0);
            expect(voided.segments.map(segment => segment.boundary))
                .toEqual(recursed.segments.map(segment => segment.boundary));
            expect(voided.children.map(child => child.boundary))
                .toEqual(recursed.children.map(child => child.boundary));
        });

        it('grows no residue children at the leaf level, as the segments grow none', () => {
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), options({
                levels: 1, depthFraction: PINCH_DEPTH_FRACTION,
            }));
            expect(root.residueRings.length).toBeGreaterThan(0);
            expect(root.residueChildren).toEqual([]);
            expect(root.children).toEqual([]);
        });
    });

    describe('a residue ring too degenerate to recurse on', () => {
        /**
         * Cut this deep and the square's residue is a square of area 4e-8 — a real ring of four real
         * vertices, and far under the degeneracy floor. Decision 4 discards it from the recursion; it
         * is not discarded from the region, because it is still part of the area the tiling identity
         * has to account for.
         */
        const NEARLY_FULL_DEPTH = 0.9999;

        it('is recorded as a failed child while the ring itself is kept', () => {
            const root = subdivideRecursively(SQUARE, options({levels: 2, depthFraction: NEARLY_FULL_DEPTH}));

            expect(root.residueRings).toHaveLength(1);
            expect(ringArea(root.residueRings[0])).toBeLessThan(DEGENERATE_AREA_EPSILON);
            expect(ringArea(root.residueRings[0])).toBeGreaterThan(0);

            expect(root.residueChildren).toHaveLength(1);
            expect(root.residueChildren[0].failure).toMatch(/^Degenerate region/);
            expect(root.residueChildren[0].segments).toEqual([]);
            expect(root.residueChildren[0].children).toEqual([]);
            expect(discardedResidueChildren(root)).toHaveLength(1);
        });

        it("leaves its parent and its parent's segments subdividing as normal", () => {
            const root = subdivideRecursively(SQUARE, options({levels: 2, depthFraction: NEARLY_FULL_DEPTH}));
            expect(root.failure).toBeUndefined();
            expect(root.children).toHaveLength(root.segments.length);
            expect(root.children.every(child => child.failure === undefined)).toBe(true);
        });
    });

    describe('every fixture subdivides without throwing, at every depth', () => {
        it.each(ALL_TEST_POLYGONS.map(polygon => polygon.name))('%s', name => {
            const vertices = fixtureVertices(name);
            const problems: string[] = [];
            for (const depthFraction of SWEPT_DEPTH_FRACTIONS) {
                for (const levels of SWEPT_LEVELS) {
                    const where = `depth ${depthFraction}, levels ${levels}`;
                    const swept = options({levels, depthFraction});
                    const root = subdivideRecursively(vertices, swept);
                    problems.push(
                        ...structuralProblems(root, swept).map(problem => `${where}: ${problem}`),
                        ...tilingProblems(root).map(problem => `${where}: ${problem}`));

                    // Depth: a tree in which nothing failed must reach exactly the requested level
                    // count. Where something did fail that branch stops early by design, and the
                    // structural check above is what holds the rest of the shape.
                    const nodes = flattenRecursiveTree(root);
                    const deepest = Math.max(...nodes.map(node => node.level)) + 1;
                    if (nodes.every(node => node.failure === undefined) && deepest !== levels) {
                        problems.push(`${where}: the tree reached ${deepest} level(s) with nothing failing`);
                    }
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
            let residueRings = 0;
            let discardedRings = 0;

            for (const depthFraction of SWEPT_DEPTH_FRACTIONS) {
                for (const mergeGroupSize of CENSUS_MERGE_GROUP_SIZES) {
                    for (const polygon of ALL_TEST_POLYGONS) {
                        const nodes = flattenRecursiveTree(subdivideRecursively(polygon.vertices, options({
                            levels: MAX_RECURSION_LEVELS,
                            mergeGroupSize,
                            depthFraction,
                        })));
                        subdivided += nodes.filter(node => node.failure === undefined).length;
                        residueRings += nodes.reduce((total, node) => total + node.residueRings.length, 0);
                        discardedRings += nodes.reduce(
                            (total, node) => total + discardedResidueChildren(node).length, 0);

                        const failures = nodes.filter(node => node.failure !== undefined);
                        failed += failures.length;
                        unexplained.push(...failures
                            .map(node => node.failure ?? '')
                            .filter(failure => !/^(Degenerate region|Incomplete solve|Subdivision threw)/.test(failure)));
                        if (failures.length === 0) continue;

                        const detail = [...new Set(failures.map(node =>
                            `level ${node.level}: ${(node.failure ?? '').replace(/\s+/g, ' ').slice(0, 110)}`))].join(' | ');
                        rows.push(
                            `${polygon.name} (depth ${depthFraction}, merge group ${mergeGroupSize}) — ${detail}`);
                    }
                }
            }

            // Printed, not pinned. Which regions fail when a solver's own output is fed back in is a
            // measurement of the solver, and encoding today's answer as an expectation would turn
            // every future solver improvement into a test failure.
            // eslint-disable-next-line no-console
            console.log(
                `Recursive subdivision census: ${ALL_TEST_POLYGONS.length} fixtures at ` +
                `${MAX_RECURSION_LEVELS} levels, depths ${SWEPT_DEPTH_FRACTIONS.join('/')}, ` +
                `merge groups ${CENSUS_MERGE_GROUP_SIZES.join('/')} — ` +
                `${subdivided} node(s) subdivided, ${failed} recorded a failure; ` +
                `${residueRings} residue ring(s), ${discardedRings} of them discarded as degenerate.\n` +
                `${rows.length === 0 ? '  (no failures)' : rows.map(row => `  ${row}`).join('\n')}`);

            // Every recorded failure must say one of the things this driver can actually report; an
            // empty or unrecognised reason would make the census above worthless.
            expect(unexplained).toEqual([]);
        });
    });
});
