import {ALL_TEST_POLYGONS, SQUARE} from '@proc-geo/test-fixtures';
import {
    clampDepthFraction,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    DEGENERATE_AREA_EPSILON,
    denormaliseLength,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    makeMergeGroupPredicate,
    makeSkeletonNormalisation,
    MAX_RECURSION_LEVELS,
    normaliseLength,
    RecursiveNode,
    RecursiveOptions,
    signedArea,
    SKELETON_NOISE_FLOOR,
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
 * its segments' areas plus its residue rings' areas must sum to the area of the polygon THE SOLVE
 * RAN ON, because the segments and the offset contour tile that polygon between them. A subdivision
 * that looks right on a canvas and quietly loses a wedge fails only that second check.
 *
 * WHICH POLYGON THAT IS, IS THE WHOLE POINT. Canonicalisation runs inside the solve and removes
 * boundary vertices too small to see, so the polygon handed to a node and the polygon its strips
 * came out of differ on purpose. The identity is written against `canonicalBoundary`; the difference
 * between the two is asserted separately, as `canonicalAreaDrift`, and never folded into the
 * identity.
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
 * The bound `canonicalAreaDrift` is held under across the corpus, at the standing noise floor.
 *
 * MEASURED, THEN GIVEN HEADROOM, and both numbers belong here. Swept over `ALL_TEST_POLYGONS` at
 * depth fractions `0.25/0.6/1` and merge groups 1–4 at three levels — 14 404 nodes — exactly 26
 * nodes lose a vertex to canonicalisation at all, and the largest drift among them is `1.6e-15`.
 * This bound is a little over six times that. The remaining 14 378 nodes drift by exactly zero, so
 * the maximum is not a distribution's tail: it is rounding on the two or three rings where the floor
 * finds an exactly-collinear vertex to delete.
 *
 * IT IS A BOUND AT THE STANDING FLOOR OF `1e-6`, NOT A UNIVERSAL ONE. Drift is what the floor
 * removes, so it scales with the floor: swept at candidate floors the same corpus reaches `3.2e-5`
 * at `5e-6` and `0.42` at `1e-4`. That is the quantity behaving as specified rather than a failure,
 * which is precisely why it is reported separately from the tiling identity instead of inside it.
 */
const CORPUS_CANONICAL_AREA_DRIFT_BOUND = 1e-14;

/**
 * How far the driver's canonical ring may sit from the solved graph's own exterior ring, as a
 * fraction of the region's bounding-box diagonal.
 *
 * The two are independently derived — the driver selects the surviving vertices from the caller's
 * own coordinates through `canonicalisePolygon`'s index remap, while the graph carries its exterior
 * nodes back out of unit space — so this is what convicts them of agreeing rather than leaving it
 * assumed. They do not agree bit for bit and are not expected to: normalisation's CENTRING
 * translation is not exactly invertible, so the graph's ring carries up to one unit in the last
 * place of round-trip noise. Measured across the corpus at three depths and three levels, the worst
 * disagreement is `4.03e-17` of the diagonal; this bound is twenty-five times that.
 */
const CANONICAL_RING_AGREEMENT_FRACTION = 1e-15;

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

/**
 * Merge group sizes the canonical boundary's exactness is swept at.
 *
 * TWO RATHER THAN THE CENSUS'S FOUR, because the sweep is over every node of every tree at every
 * depth and the question is about coordinates rather than about merging. One and two between them
 * produce both the finest sub-regions in the corpus and the most of them, which is where a
 * coordinate that had been carried through unit space and back would round differently from the
 * caller's own.
 */
const EXACTNESS_MERGE_GROUP_SIZES = [1, 2];

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

/** A region's own characteristic length, for scaling a coordinate tolerance to the region. */
function boundingDiagonal(ring: Vector2[]): number {
    const xs = ring.map(vertex => vertex.x);
    const ys = ring.map(vertex => vertex.y);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
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

/**
 * Two rings, vertex for vertex and bit for bit.
 *
 * BY VALUE, NOT BY REFERENCE. The invariants this file states about `canonicalBoundary` are about
 * coordinates — "the caller's own vertices came back" — and the driver happens to satisfy several of
 * them by handing the very same array back. An identity test would pin that incidental fact, and an
 * equally correct implementation that rebuilt an identical array would fail it for no behavioural
 * reason. The reference check is kept only as a fast path, where it implies the value check anyway.
 */
function sameVertices(ring: Vector2[], other: Vector2[]): boolean {
    return ring === other || JSON.stringify(ring) === JSON.stringify(other);
}

/**
 * The corpus sweep's standard tree: every level the driver will run, at the default dials.
 *
 * Written once because three separate properties are asserted over the same tree — the tiling
 * identity at full depth, the absence of a residue there, and the canonical ring's agreement with
 * the solved graph — and each of them wants the whole tree rather than a fixture-specific one.
 */
function fullDepthTree(vertices: Vector2[]): RecursiveNode {
    return subdivideRecursively(vertices, options({levels: MAX_RECURSION_LEVELS}));
}

/**
 * The floor the driver measures ONCE on the region the caller handed in, as a caller-space length.
 *
 * Restated here from the two published primitives it is built out of, rather than reached for
 * through a hole opened in the driver for the tests' benefit.
 */
function rootFloorOf(boundary: Vector2[]): number {
    return denormaliseLength(makeSkeletonNormalisation(boundary), SKELETON_NOISE_FLOOR);
}

/**
 * The floor a given region is actually canonicalised against: the ROOT'S floor, said in the unit
 * space that region normalises into.
 *
 * A DESCENDANT'S FLOOR IS NOT THE STANDING DEFAULT. `SKELETON_NOISE_FLOOR` is a unit-space constant,
 * so leaving it to default re-derives the floor from whichever sliver is being solved — the
 * region-local reading the driver exists to prevent — and that is the same floor only at the root.
 * Any test that re-solves a node's boundary to check what its solve produced has to hand this in, or
 * it is checking a different canonicalisation than the one that produced the node.
 */
function regionNoiseFloor(region: Vector2[], rootFloor: number): number {
    return normaliseLength(makeSkeletonNormalisation(region), rootFloor);
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
        // Canonicalisation only ever DELETES, so the ring it leaves can never gain a vertex, and it
        // is never taken below the three a polygon needs.
        if (node.canonicalBoundary.length > node.boundary.length) {
            problems.push(
                `${where} was handed ${node.boundary.length} vertices and came back with `
                + `${node.canonicalBoundary.length}`);
        }
        if (node.failure === undefined && node.canonicalBoundary.length < 3) {
            problems.push(`${where} divided a canonical ring of ${node.canonicalBoundary.length} vertices`);
        }
        // A region that never solved was never canonicalised either, so it is its own canonical form
        // — the same vertices, which is a claim about coordinates rather than about array identity.
        if (node.failure !== undefined
            && (!sameVertices(node.canonicalBoundary, node.boundary) || node.canonicalAreaDrift !== 0)) {
            problems.push(
                `${where} failed yet reports a canonical boundary of `
                + `${node.canonicalBoundary.length} vertices drifting by ${node.canonicalAreaDrift}`);
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
            if (!sameVertices(child.boundary, node.residueRings[index])) {
                problems.push(`${where} residue child ${index} does not carry residue ring ${index}`);
            }
        });
    }
    return problems;
}

/** What a node's segments and residue rings cover between them. */
function coveredArea(node: RecursiveNode): number {
    return node.segments.reduce((total, segment) => total + stripArea(segment), 0)
        + node.residueRings.reduce((total, ring) => total + ringArea(ring), 0);
}

/**
 * The tiling identity at every node that divided: segments plus residue rings equal the area of
 * `canonicalBoundary`. Returns the problems it found.
 *
 * AGAINST `canonicalBoundary`, NEVER `boundary`. The strips are clipped skeleton faces and the rings
 * are that same skeleton's offset contour, so the polygon they tile is the one the wavefront ran on
 * — which canonicalisation has already taken the invisible vertices out of. Summing them against the
 * polygon handed in charges that intended removal as tiling error; see the bulged-square case below
 * for the shape of the number it produces.
 *
 * At full depth the residue term is zero and this reduces to the check that predates it.
 */
function tilingProblems(root: RecursiveNode): string[] {
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        if (node.failure !== undefined) continue;
        const regionArea = ringArea(node.canonicalBoundary);
        const covered = coveredArea(node);
        const error = Math.abs(covered - regionArea) / regionArea;
        if (!(error < AREA_TOLERANCE_FRACTION)) {
            problems.push(
                `level ${node.level}: ${node.segments.length} segment(s) and `
                + `${node.residueRings.length} residue ring(s) cover ${covered} of a canonical area of `
                + `${regionArea} (out by ${error})`);
        }
    }
    return problems;
}

/**
 * The OTHER thing being asserted: that what the strips were built from still resembles what was
 * handed in. Returns the problems it found.
 *
 * Deliberately a second sweep rather than a second clause of {@link tilingProblems}. A node can tile
 * its canonical polygon perfectly while canonicalisation has taken a visible bite out of the region
 * — that is a real and separate defect, and reporting it as "the strips do not tile" is what made
 * the two indistinguishable in the first place.
 */
function driftProblems(root: RecursiveNode): string[] {
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        if (!(node.canonicalAreaDrift < CORPUS_CANONICAL_AREA_DRIFT_BOUND)) {
            problems.push(
                `level ${node.level}: canonicalisation took ${node.boundary.length} vertices to `
                + `${node.canonicalBoundary.length} and drifted by ${node.canonicalAreaDrift}, over `
                + `the ${CORPUS_CANONICAL_AREA_DRIFT_BOUND} bound`);
        }
    }
    return problems;
}

/**
 * What one node contributed to the exactness sweep: the problems it showed, and which of the two
 * cases it fell into.
 *
 * The count is carried out alongside the problems because the sweep has to convict itself of being
 * non-vacuous — that both "the floor removed nothing" and "the floor removed something" actually
 * occur across the corpus — and a collector that returned only problems could not say so.
 */
interface CanonicalExactness {
    /** Ways this node broke decision 7. Empty where it did not. */
    problems: string[];
    /** True where the floor removed at least one vertex, so exactness is not the question asked. */
    reduced: boolean;
}

/**
 * Decision 7 at one node: a ring the floor took nothing out of must come back as the caller's own
 * coordinates, with a drift of EXACTLY zero rather than approximately zero.
 *
 * A non-zero drift on a node that lost no vertex would mean canonicalisation had moved a vertex it
 * kept, which is a defect in that stage rather than in this driver — so it is worth stating as an
 * exact equality instead of hiding it under the tiling tolerance.
 */
function exactnessProblems(node: RecursiveNode, where: string): CanonicalExactness {
    if (node.canonicalBoundary.length !== node.boundary.length) {
        return {problems: [], reduced: true};
    }

    const problems: string[] = [];
    if (!sameVertices(node.canonicalBoundary, node.boundary)) {
        problems.push(`${where} level ${node.level}: coordinates were perturbed`);
    }
    if (node.canonicalAreaDrift !== 0) {
        problems.push(
            `${where} level ${node.level}: drifted by ${node.canonicalAreaDrift} having removed nothing`);
    }
    return {problems, reduced: false};
}

/**
 * Decision 2 at one node: the ring the driver reports is the ring the solve actually ran on.
 *
 * RE-SOLVED AT THE FLOOR THAT NODE WAS REALLY CANONICALISED AGAINST — {@link regionNoiseFloor} of the
 * root's floor — and never at the standing default. A re-solve that let `SKELETON_NOISE_FLOOR`
 * default would canonicalise a descendant against its own extent and could keep or drop a vertex the
 * real solve did not, checking a different canonicalisation than the one under test at every node
 * below the root.
 *
 * The two rings are independently derived — the driver selects the survivors from the caller's own
 * coordinates through the index remap, while the graph carries its exterior nodes back out of unit
 * space — so the vertex count must match exactly and the positions to within the round trip's last
 * place, which is noise from the centring translation rather than from the floor.
 */
function solvedRingProblems(node: RecursiveNode, noiseFloor: number, where: string): string[] {
    const solved = solveSkeleton(node.boundary, {noiseFloor});
    const ring = solved.graph.nodes
        .slice(0, solved.graph.numExteriorNodes)
        .map(graphNode => graphNode.position);
    if (ring.length !== node.canonicalBoundary.length) {
        return [`${where} level ${node.level}: the solve kept ${ring.length} vertices where the node `
            + `reports ${node.canonicalBoundary.length}`];
    }

    const tolerance = boundingDiagonal(node.boundary) * CANONICAL_RING_AGREEMENT_FRACTION;
    const problems: string[] = [];
    ring.forEach((position, index) => {
        const separation = Math.hypot(
            position.x - node.canonicalBoundary[index].x,
            position.y - node.canonicalBoundary[index].y);
        if (!(separation <= tolerance)) {
            problems.push(
                `${where} level ${node.level}: vertex ${index} sits ${separation} from the solved `
                + `ring, over a tolerance of ${tolerance}`);
        }
    });
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

        it('holds the identity at every full-depth node, with the residue term at zero', () => {
            // Full-depth behaviour is unchanged and pinned: the residue contributes nothing, so the
            // only thing that moved is which polygon the segments are summed against.
            const problems: string[] = [];
            for (const polygon of ALL_TEST_POLYGONS) {
                const root = fullDepthTree(polygon.vertices);
                for (const node of flattenRecursiveTree(root)) {
                    if (node.residueRings.length > 0) {
                        problems.push(`${polygon.name} level ${node.level}: carries a residue at full depth`);
                    }
                }
                problems.push(...tilingProblems(root).map(problem => `${polygon.name} ${problem}`));
            }
            expect(problems).toEqual([]);
        });

        it('grows no residue and no residue children anywhere in the tree', () => {
            for (const polygon of ALL_TEST_POLYGONS) {
                const nodes = flattenRecursiveTree(fullDepthTree(polygon.vertices));
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

    /**
     * A square with one extra vertex bulging `CANONICAL_BULGE` off the midpoint of an edge.
     *
     * SIZED AGAINST THE FLOOR, not chosen by eye. `makeSkeletonNormalisation` takes the nearest power
     * of two to the longest side, so a square of side 10 is carried to unit space by a factor of 8,
     * and a caller-space bulge of `4e-6` is a unit-space deviation of `5e-7` — half the `1e-6` noise
     * floor, so canonicalisation removes it, and the vertex is at the same time far too large to be
     * rounding. The area it takes with it is `0.5 · 10 · 4e-6` against a region of 100: a relative
     * drift of `2e-7`, five orders of magnitude above the tiling tolerance.
     *
     * That gap is the entire defect this fixture exists to pin. Against the polygon handed in, the
     * strips are out by `2e-7` and the identity fails; against the polygon they were derived from
     * they are out by nothing at all.
     */
    const CANONICAL_BULGE = 4e-6;
    const CANONICAL_BULGE_DRIFT = 2e-7;
    const BULGED_SQUARE: Vector2[] = [
        {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 0}, {x: 5, y: CANONICAL_BULGE},
    ];

    describe('the strips tile the polygon they were derived from', () => {
        it('drops the invisible vertex and reports what it cost, without calling it tiling error', () => {
            const root = subdivideRecursively(BULGED_SQUARE, options());

            expect(root.failure).toBeUndefined();
            expect(root.boundary).toHaveLength(5);
            expect(root.canonicalBoundary).toHaveLength(4);
            // The removal is real geometry, not rounding: five orders of magnitude above the tiling
            // tolerance, which is what makes the two identities below distinguishable at all.
            expect(root.canonicalAreaDrift).toBeCloseTo(CANONICAL_BULGE_DRIFT, 12);
            expect(root.canonicalAreaDrift).toBeGreaterThan(AREA_TOLERANCE_FRACTION * 1e4);

            const covered = coveredArea(root);
            const againstCanonical = Math.abs(covered - ringArea(root.canonicalBoundary))
                / ringArea(root.canonicalBoundary);
            const againstHandedIn = Math.abs(covered - ringArea(root.boundary)) / ringArea(root.boundary);

            expect(againstCanonical).toBeLessThan(AREA_TOLERANCE_FRACTION);
            // The measurement the whole change exists for: the same strips, scored against the wrong
            // polygon, are out by exactly the area canonicalisation removed.
            expect(againstHandedIn).toBeGreaterThan(AREA_TOLERANCE_FRACTION);
            expect(againstHandedIn).toBeCloseTo(root.canonicalAreaDrift, 12);
            expect(tilingProblems(root)).toEqual([]);
        });

        it('still tiles below full depth, where the residue carries part of the region', () => {
            // The residue rings are projected off the same canonicalised skeleton, so they belong to
            // the same identity; a partial-depth cut must not reopen the gap the segments closed.
            const root = subdivideRecursively(BULGED_SQUARE, options({levels: 2, depthFraction: 0.4}));
            expect(root.residueRings.length).toBeGreaterThan(0);
            expect(tilingProblems(root)).toEqual([]);
        });

        it('leaves the corpus untouched where the floor finds nothing to remove', () => {
            // Decision 7: EXACTLY equal and EXACTLY zero, not approximately. Canonicalisation deletes
            // vertices and never moves the ones it keeps, so a node that lost none must come back
            // with the caller's own coordinates.
            // SWEPT ACROSS DEPTHS AND MERGE GROUPS, not just at the default: the sub-regions a
            // partial-depth cut and a fine merge produce are where a perturbed coordinate shows up,
            // because they are the ones whose vertices are furthest from their own bounding-box
            // centre and so round differently through a normalisation. At the root and at full depth
            // the question never arises.
            const problems: string[] = [];
            let unchanged = 0;
            let reduced = 0;
            for (const polygon of ALL_TEST_POLYGONS) {
                for (const depthFraction of SWEPT_DEPTH_FRACTIONS) {
                    for (const mergeGroupSize of EXACTNESS_MERGE_GROUP_SIZES) {
                        const where = `${polygon.name} (depth ${depthFraction}, merge group ${mergeGroupSize})`;
                        const root = subdivideRecursively(polygon.vertices, options({
                            levels: MAX_RECURSION_LEVELS, depthFraction, mergeGroupSize,
                        }));
                        const exactness = flattenRecursiveTree(root)
                            .map(node => exactnessProblems(node, where));
                        problems.push(...exactness.flatMap(node => node.problems));
                        reduced += exactness.filter(node => node.reduced).length;
                        unchanged += exactness.filter(node => !node.reduced).length;
                    }
                }
            }
            expect(problems).toEqual([]);
            expect(unchanged).toBeGreaterThan(0);
            // And the check is not vacuous: somewhere in the corpus the floor does remove a vertex,
            // so "removed nothing" is a case rather than the only case.
            expect(reduced).toBeGreaterThan(0);
        });

        it('agrees with the solved graph the strips were actually read off', () => {
            // Decision 2's concern, convicted rather than trusted — and convicted at the floor the
            // driver really used: the ROOT'S, carried into each node's own unit space, exactly as
            // the driver carries it. Re-solving at the standing default would canonicalise every
            // descendant against its own extent and check a ring nothing under test produced.
            const problems: string[] = [];
            let propagatedFloors = 0;
            for (const polygon of ALL_TEST_POLYGONS) {
                const rootFloor = rootFloorOf(polygon.vertices);
                for (const node of flattenRecursiveTree(fullDepthTree(polygon.vertices))) {
                    if (node.failure !== undefined) continue;
                    const noiseFloor = regionNoiseFloor(node.boundary, rootFloor);
                    if (noiseFloor !== SKELETON_NOISE_FLOOR) {
                        propagatedFloors += 1;
                    }
                    problems.push(...solvedRingProblems(node, noiseFloor, polygon.name));
                }
            }
            expect(problems).toEqual([]);
            // And the re-solve is not secretly running at the standing default: measured over this
            // sweep, 663 of the 854 solved nodes carry a floor that differs from
            // `SKELETON_NOISE_FLOOR`, by up to a factor of 128. A re-solve that dropped the option
            // would therefore be canonicalising most of the tree differently from the driver, which
            // is the failure this count exists to catch.
            expect(propagatedFloors).toBeGreaterThan(0);
        });

        it('reports a region that never solved as its own canonical form', () => {
            // Nothing was canonicalised, so there is no drift to report and no second polygon to
            // report it against — rather than a null field the caller has to test for.
            const degenerate = subdivideRecursively([{x: 0, y: 0}, {x: 1, y: 1}], options());
            expect(degenerate.failure).toMatch(/^Degenerate region/);
            expect(degenerate.canonicalBoundary).toEqual(degenerate.boundary);
            expect(degenerate.canonicalAreaDrift).toBe(0);

            const unsolvable = subdivideRecursively(fixtureVertices('Rectangle'), options({
                levels: 2, mergeGroupSize: 3,
            })).children.find(child => child.failure !== undefined);
            expect(unsolvable?.failure).toMatch(/^Incomplete solve/);
            expect(unsolvable?.canonicalBoundary).toEqual(unsolvable?.boundary);
            expect(unsolvable?.canonicalAreaDrift).toBe(0);
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
                        ...tilingProblems(root).map(problem => `${where}: ${problem}`),
                        ...driftProblems(root).map(problem => `${where}: ${problem}`));

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
