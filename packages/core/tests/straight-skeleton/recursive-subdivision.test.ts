import {ALL_TEST_POLYGONS, SQUARE} from '@proc-geo/test-fixtures';
import {
    boundsOfPoints,
    canonicalisePolygon,
    clampDepthFraction,
    clampLevelSpecs,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    DEGENERATE_AREA_EPSILON,
    denormaliseLength,
    FALLBACK_LEVEL_SPEC,
    flattenRecursiveTree,
    FULL_DEPTH_FRACTION,
    isLastLevel,
    LevelSpec,
    makeMergeGroupPredicate,
    makeSkeletonNormalisation,
    MAX_RECURSION_LEVELS,
    normaliseLength,
    normalisePolygon,
    RecursiveNode,
    REMOVED_VERTEX_INDEX,
    RecursiveOptions,
    ResidueTreatment,
    SegmentTreatment,
    signedArea,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    Strip,
    subdivideRecursively,
    uniformLevelSpecs,
    UniformLevelSpecsInput,
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
 * depth fractions `0.25/0.6/1` and merge groups 1–4 at three levels — 14 404 nodes — exactly 31
 * nodes lose a vertex to canonicalisation at all, and the largest drift among them is `1.6e-15`.
 * This bound is a little over six times that. The remaining 14 373 nodes drift by exactly zero, so
 * the maximum is not a distribution's tail: it is rounding on the two or three rings where the floor
 * finds an exactly-collinear vertex to delete.
 *
 * FIVE OF THOSE 31 ARE NODES THAT WENT ON TO FAIL TO SOLVE, and they are in the count because
 * canonicalisation ran on them before the wavefront did: the largest drift among them is `2.2e-16`.
 * They were absent from the earlier reading of this sweep, which reported 26, because the driver
 * was then zeroing the drift of anything that failed.
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

/**
 * The merge group size the corpus is swept at when the question is about regions that FAILED.
 *
 * The largest of the census's four, because a coarse merge is what produces the awkward regions:
 * every failed node in the corpus that also lost a vertex to the floor — five of them, across three
 * depths — appears at this group size and at no smaller one. A sweep at the default would examine
 * the same property against a population that does not contain the case.
 */
const FAILING_REGION_MERGE_GROUP_SIZE = 4;

const DEFAULT_MERGE_GROUP_SIZE = 2;

/**
 * The depth the stream-combination trees are cut at.
 *
 * SHORT OF FULL DEPTH, because three of the four combinations say something about the RESIDUE and at
 * full depth there is none to say it about: a `void` and a `recurse` are indistinguishable on a level
 * with no rings, so every one of those tests would pass vacuously.
 */
const STREAM_DEPTH_FRACTION = 0.5;

/**
 * The fixture the stream combinations are asserted on.
 *
 * Chosen because it subdivides CLEANLY to three levels at {@link STREAM_DEPTH_FRACTION} — every node
 * solves, and every node carries both segments and residue rings. The combination tests assert which
 * children a node ends up with, and a node that failed to solve or that had no rings would land in the
 * "neither" bucket for reasons that have nothing to do with the spec under test. Each test states that
 * precondition rather than assuming it.
 */
const STREAM_FIXTURE = 'Duck Octagon (passes)';

/**
 * Options in the UNIFORM reading: one spec repeated at every level, built the way a migrating caller
 * builds it.
 *
 * The scalars this takes are the ones `RecursiveOptions` used to carry, and `uniformLevelSpecs` is the
 * published constructor that turns them into a spec array — so every property in this file that
 * predates per-level specs goes on asserting exactly what it asserted before, through the migration
 * path the spec offers rather than through a hand-built array of its own. Full depth, no residue is
 * still what a test gets unless it says otherwise.
 */
function options(overrides: Partial<UniformLevelSpecsInput> = {}): RecursiveOptions {
    return {
        levels: uniformLevelSpecs({
            levels: 1,
            mergeGroupSize: DEFAULT_MERGE_GROUP_SIZE,
            depthFraction: FULL_DEPTH_FRACTION,
            residue: 'recurse',
            ...overrides,
        }),
    };
}

/** One level's spec, with the stream treatments the caller cares about and the dials it does not. */
function levelSpec(
    segments: SegmentTreatment,
    residue: ResidueTreatment,
    dials: Partial<Pick<LevelSpec, 'depthFraction' | 'mergeGroupSize'>> = {},
): LevelSpec {
    return {
        depthFraction: dials.depthFraction ?? STREAM_DEPTH_FRACTION,
        mergeGroupSize: dials.mergeGroupSize ?? DEFAULT_MERGE_GROUP_SIZE,
        segments,
        residue,
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

/**
 * Residue children that record a failure — the rings this node kept but did not subdivide.
 *
 * NOT "the degenerate ones". A residue ring recurses through the very same path a segment child does,
 * so it can just as well come back with an incomplete solve as with a degeneracy, and the census
 * below counts the rings the recursion did not reach whatever the reason was.
 */
function unsubdividedResidueChildren(node: RecursiveNode): RecursiveNode[] {
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

/**
 * The ring the floor really leaves standing on `region`, from the published primitives.
 *
 * Reached for where a node FAILED to solve and so has no graph to read its surviving ring out of —
 * which is exactly where the driver used to substitute the polygon it was handed. `canonicalisePolygon`
 * is a pure function of the ring and the floor, so asking it the same question the driver asked is
 * what convicts the node of reporting the answer rather than a stand-in.
 */
function canonicalRingOf(region: Vector2[], rootFloor: number): Vector2[] {
    const canonical = canonicalisePolygon(
        normalisePolygon(region, makeSkeletonNormalisation(region)),
        regionNoiseFloor(region, rootFloor));
    return region.filter((_vertex, index) => canonical.indexRemap[index] !== REMOVED_VERTEX_INDEX);
}

/** `canonicalAreaDrift`'s own formula, restated so a node's reported drift can be checked against it. */
function relativeAreaDrift(boundary: Vector2[], canonicalBoundary: Vector2[]): number {
    return Math.abs(ringArea(boundary) - ringArea(canonicalBoundary)) / ringArea(boundary);
}

/** Two rings enclosing the same axis-aligned box, from the library's own bounds rather than a local one. */
function sameBoundingBox(ring: Vector2[], other: Vector2[]): boolean {
    const box = boundsOfPoints(ring);
    const otherBox = boundsOfPoints(other);
    return box.minX === otherBox.minX && box.maxX === otherBox.maxX
        && box.minY === otherBox.minY && box.maxY === otherBox.maxY;
}

/**
 * A copy of `ring` carrying one extra vertex, `offset` off the midpoint of its longest edge.
 *
 * The insertion is PERPENDICULAR TO THE EDGE and at its midpoint, so the deviation the floor is
 * asked about is exactly `offset` — and it is put on the longest edge so the sliver it adds is the
 * largest one this ring can be given at that deviation, which keeps the drift it produces clear of
 * rounding.
 *
 * AND IT IS PUT ON WHICHEVER SIDE LEAVES THE BOUNDING BOX ALONE. `makeSkeletonNormalisation` reads
 * the box, so a vertex that pushed it out by even a millionth would rescale and re-centre every
 * coordinate the solve then runs on — and a solve on different numbers is a different solve, not the
 * same one with a vertex added. Measured: bulging a region outward this way flips one corpus region
 * from failing to solving, which is the whole property under test evaporating quietly.
 */
function bulgeLongestEdge(ring: Vector2[], offset: number): Vector2[] {
    const edgeLength = (index: number): number => Math.hypot(
        ring[(index + 1) % ring.length].x - ring[index].x,
        ring[(index + 1) % ring.length].y - ring[index].y);
    let longest = 0;
    ring.forEach((_vertex, index) => {
        if (edgeLength(index) > edgeLength(longest)) longest = index;
    });

    const from = ring[longest];
    const to = ring[(longest + 1) % ring.length];
    const length = edgeLength(longest);
    for (const side of [1, -1]) {
        const bulge: Vector2 = {
            x: (from.x + to.x) / 2 + (side * offset * (to.y - from.y)) / length,
            y: (from.y + to.y) / 2 - (side * offset * (to.x - from.x)) / length,
        };
        const bulged = [...ring.slice(0, longest + 1), bulge, ...ring.slice(longest + 1)];
        if (sameBoundingBox(bulged, ring)) {
            return bulged;
        }
    }
    throw new Error('Neither side of the longest edge takes a bulge without moving the bounding box');
}

/**
 * One region THE DRIVER ITSELF PRODUCED and then could not solve, with everything a check of it
 * needs: the node, the floor its own solve was set up with, and where it came from.
 *
 * The floor is the ROOT'S, in caller space, because that is the one the driver measured once and
 * carried down — a node's canonicalisation is only reproducible against it.
 */
interface FailedRegion {
    /** The node itself. Its `failure` is set, and is not degeneracy. */
    node: RecursiveNode;
    /** The caller-space floor the whole tree, and so this node, was canonicalised against. */
    rootFloor: number;
    /** Which fixture and depth produced it, for a problem message. */
    where: string;
}

/**
 * The failed nodes of one tree, minus the degenerate ones.
 *
 * Degenerate regions are passed over everywhere this file asks about canonicalisation because they
 * are turned away BEFORE any canonicalisation runs, so they are their own canonical form by
 * construction rather than by measurement.
 */
function failedNodesOf(root: RecursiveNode): RecursiveNode[] {
    return flattenRecursiveTree(root)
        .filter(node => node.failure !== undefined && failureKind(node.failure) !== 'degenerate');
}

/**
 * Every region the recursion cut for itself and then could not solve, across the whole corpus.
 *
 * The one place the `fixture × depth → tree → failed node` traversal is written, so that the two
 * properties asked of these regions — that at least one of them still fails as a root of its own,
 * and that every one of them reports the canonicalisation it was solved with — differ only in what
 * they do with a region rather than in how they find one.
 *
 * SWEPT AT `FAILING_REGION_MERGE_GROUP_SIZE`, which is where the interesting population lives; see
 * that constant for the measurement.
 */
function failedRegions(): FailedRegion[] {
    const regions: FailedRegion[] = [];
    for (const polygon of ALL_TEST_POLYGONS) {
        const rootFloor = rootFloorOf(polygon.vertices);
        for (const depthFraction of SWEPT_DEPTH_FRACTIONS) {
            const root = subdivideRecursively(polygon.vertices, options({
                levels: MAX_RECURSION_LEVELS,
                mergeGroupSize: FAILING_REGION_MERGE_GROUP_SIZE,
                depthFraction,
            }));
            const where = `${polygon.name} (depth ${depthFraction})`;
            regions.push(...failedNodesOf(root).map(node => ({node, rootFloor, where})));
        }
    }
    return regions;
}

/**
 * A region the driver produced and could not solve, taken from the corpus rather than hand-authored.
 *
 * Hand-authoring one would mean guessing at what defeats this solver, which is a moving target; a
 * sub-region the recursion cut for itself is the real article, and the census at the end of this file
 * is the standing evidence that the corpus keeps producing them. The region is checked to fail AGAIN
 * when it is handed back in as a root of its own — a node's floor is its root's, said in its own unit
 * space, so a region only reproduces its failure as a root where the two agree.
 */
function unsolvableRegion(): Vector2[] {
    const region = failedRegions()
        .map(failed => failed.node.boundary)
        .find(boundary => subdivideRecursively(boundary, options()).failure !== undefined);
    if (region === undefined) {
        throw new Error('No corpus region fails to solve when it is handed back in as a root of its own');
    }
    return region;
}

/**
 * Structural invariants every node of every tree must satisfy. Returns the problems it found.
 *
 * EVERY EXPECTATION IS READ OFF THE SPEC FOR THE NODE'S OWN LEVEL, which is decision 2 stated as an
 * invariant: `levels[n]` governs the region a node at level `n` was handed. The options are clamped
 * through `clampLevelSpecs` first, so a sweep may hand in the array it asked for rather than having to
 * pre-clamp it itself.
 */
function structuralProblems(root: RecursiveNode, subdivisionOptions: RecursiveOptions): string[] {
    const levels = clampLevelSpecs(subdivisionOptions.levels);
    const problems: string[] = [];
    for (const node of flattenRecursiveTree(root)) {
        const where = `level ${node.level}`;
        const spec = levels[node.level];
        if (spec === undefined) {
            problems.push(`${where} exists but only ${levels.length} level(s) were specified`);
            continue;
        }
        const {depthFraction, residue, segments} = spec;
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
        // A DEGENERATE region — and only a degenerate one — was turned away before anything was
        // canonicalised, so it is its own canonical form: the same vertices, which is a claim about
        // coordinates rather than about array identity, and a drift of exactly zero. A region that
        // failed to SOLVE was canonicalised first and reports whatever the floor really removed.
        if (node.failure !== undefined && failureKind(node.failure) === 'degenerate'
            && (!sameVertices(node.canonicalBoundary, node.boundary) || node.canonicalAreaDrift !== 0)) {
            problems.push(
                `${where} was turned away as degenerate yet reports a canonical boundary of `
                + `${node.canonicalBoundary.length} vertices drifting by ${node.canonicalAreaDrift}`);
        }
        if (depthFraction >= FULL_DEPTH_FRACTION && node.residueRings.length > 0) {
            problems.push(`${where} carries ${node.residueRings.length} residue ring(s) at full depth`);
        }
        // A stream recurses only where its own level's spec says so AND a next level exists to
        // receive it: at the last level both streams are terminal whatever the spec says.
        const isLastLevel = node.level + 1 >= levels.length;
        const expectedChildren = node.failure !== undefined || isLastLevel || segments !== 'recurse'
            ? 0
            : node.segments.length;
        if (node.children.length !== expectedChildren) {
            problems.push(`${where} has ${node.children.length} children for ${expectedChildren} merged group(s)`);
        }
        const expectedResidueChildren = residue !== 'recurse' || isLastLevel
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
 * What one failed region contributed to the sweep over {@link failedRegions}: the problems it showed,
 * and whether the floor really took anything out of it.
 *
 * Carried together for the same reason {@link CanonicalExactness} carries them: the sweep has to
 * convict itself of being non-vacuous — that failed nodes which LOST a vertex before failing actually
 * occur — and a collector that returned only problems could not say so.
 */
interface FailedCanonicalisation {
    /** Ways this node misreports the canonicalisation its own solve was set up with. Empty where it does not. */
    problems: string[];
    /** True where the floor removed at least one vertex before the solve went on to fail. */
    reduced: boolean;
}

/**
 * A failed node at the corpus scale: what the floor leaves standing on the region it was handed,
 * asked of `canonicalisePolygon` directly, against what the node reports.
 *
 * Reached for where the node has no graph to read a surviving ring out of — which is exactly where
 * the driver used to substitute the polygon it was handed, zeroing a removal that had happened.
 */
function failedCanonicalisation(failed: FailedRegion): FailedCanonicalisation {
    const {node, rootFloor, where} = failed;
    const expected = canonicalRingOf(node.boundary, rootFloor);
    const problems: string[] = [];
    if (!sameVertices(node.canonicalBoundary, expected)) {
        problems.push(
            `${where} level ${node.level}: the floor leaves ${expected.length} of `
            + `${node.boundary.length} vertices, the node reports ${node.canonicalBoundary.length}`);
    }
    const drift = relativeAreaDrift(node.boundary, expected);
    if (node.canonicalAreaDrift !== drift) {
        problems.push(
            `${where} level ${node.level}: drifted by ${drift}, the node reports `
            + `${node.canonicalAreaDrift}`);
    }
    return {problems, reduced: expected.length < node.boundary.length};
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

/** Which of a node's two child streams actually grew children. */
type ChildStreams = 'both' | 'segments only' | 'residue only' | 'neither';

/**
 * A node's two child streams reduced to which of them is populated.
 *
 * The distinction decision 11 turns on: `residue only` is reachable by no other combination than
 * `leaf` + `recurse`, so a driver that quietly recursed on segments it was told to leave alone could
 * not produce it, and one that quietly dropped the residue stream could not either.
 */
function childStreams(node: RecursiveNode): ChildStreams {
    if (node.children.length > 0) {
        return node.residueChildren.length > 0 ? 'both' : 'segments only';
    }
    return node.residueChildren.length > 0 ? 'residue only' : 'neither';
}

/** One of decision 4's four combinations, and the tree shape a level carrying it must produce. */
interface StreamCombination {
    segments: SegmentTreatment;
    residue: ResidueTreatment;
    /** What every node at the level carrying this spec must end up with. */
    streams: ChildStreams;
}

/**
 * All four combinations, each paired with the shape it must produce.
 *
 * A TABLE RATHER THAN A DERIVATION. Reading the expected shape back out of the combination would be
 * restating the driver's own conditional, and a test that computes its expectation the way the code
 * under test computes its answer agrees with it by construction.
 */
const STREAM_COMBINATIONS: StreamCombination[] = [
    {segments: 'recurse', residue: 'recurse', streams: 'both'},
    {segments: 'recurse', residue: 'void', streams: 'segments only'},
    {segments: 'leaf', residue: 'recurse', streams: 'residue only'},
    {segments: 'leaf', residue: 'void', streams: 'neither'},
];

/**
 * A spec array carrying `combination` at level `at`, never as the last level.
 *
 * The levels above it recurse on both streams, so that level `at` is reached by segment children and
 * residue children alike and is populated by more than one region. The level below it is terminal, and
 * it is there so that a `recurse` on the level under test is a request the driver COULD honour — at the
 * last level both streams are terminal regardless, which would make three of the four combinations
 * indistinguishable.
 */
function combinationLevels(combination: StreamCombination, at: number): LevelSpec[] {
    return [
        ...Array.from({length: at}, () => levelSpec('recurse', 'recurse')),
        levelSpec(combination.segments, combination.residue),
        levelSpec('leaf', 'void'),
    ];
}

/**
 * What a region divides into under one spec, from the published primitives rather than from the driver.
 *
 * `undefined` where the solve does not finish, which is the one case a node has no streams to compare.
 * THE FLOOR IS THE ROOT'S, carried into this region's own unit space exactly as the driver carries it;
 * see {@link regionNoiseFloor} for why the standing default is the wrong question.
 */
interface DerivedStreams {
    segments: Vector2[][];
    residueRings: Vector2[][];
}

function deriveStreams(region: Vector2[], spec: LevelSpec, rootFloor: number): DerivedStreams | undefined {
    const result = solveSkeleton(region, {noiseFloor: regionNoiseFloor(region, rootFloor)});
    if (!result.complete) return undefined;
    const depth = computeMaxOffset(result) * spec.depthFraction;
    return {
        segments: computeStrips(result, {
            depth, sameLogicalStreet: makeMergeGroupPredicate(spec.mergeGroupSize),
        }).map(segment => segment.boundary),
        residueRings: spec.depthFraction >= FULL_DEPTH_FRACTION
            ? []
            : computeOffsetRings(result, depth),
    };
}

/** A node's own streams in the terms {@link deriveStreams} returns them, for comparison. */
function nodeStreams(node: RecursiveNode): DerivedStreams {
    return {
        segments: node.segments.map(segment => segment.boundary),
        residueRings: node.residueRings,
    };
}

function sameStreams(streams: DerivedStreams, other: DerivedStreams): boolean {
    return JSON.stringify(streams) === JSON.stringify(other);
}

/**
 * Decision 2 at one node: the region was divided by the spec for ITS OWN level, vertex for vertex.
 *
 * Re-derived from `solveSkeleton` → `computeStrips`/`computeOffsetRings` at that spec's depth and merge
 * group, which is the only way to catch a driver that read a neighbouring level's spec: an off-by-one
 * still produces a well-formed tree of the right shape, and only the coordinates say which spec cut it.
 */
function specGovernedProblems(node: RecursiveNode, spec: LevelSpec, rootFloor: number, where: string): string[] {
    const derived = deriveStreams(node.boundary, spec, rootFloor);
    if (derived === undefined) {
        return [`${where} level ${node.level}: re-solving the region did not finish`];
    }
    const problems: string[] = [];
    if (JSON.stringify(nodeStreams(node).segments) !== JSON.stringify(derived.segments)) {
        problems.push(
            `${where} level ${node.level}: carries ${node.segments.length} segment(s) where its own `
            + `level's spec cuts ${derived.segments.length}`);
    }
    if (JSON.stringify(node.residueRings) !== JSON.stringify(derived.residueRings)) {
        problems.push(
            `${where} level ${node.level}: carries ${node.residueRings.length} residue ring(s) where `
            + `its own level's spec leaves ${derived.residueRings.length}`);
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
            // Against the CANONICAL ring, like every other statement of the identity in this file:
            // this fixture's root happens to lose no vertex to the floor, so the two are the same
            // polygon today, and summing against the one handed in would only be right by accident.
            const regionArea = ringArea(root.canonicalBoundary);
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

    describe('the levels array is the depth', () => {
        it('takes the length of the array as the recursion depth', () => {
            for (const depth of [1, 2, 3]) {
                const levels = Array.from({length: depth}, () => levelSpec('recurse', 'recurse'));
                const nodes = flattenRecursiveTree(subdivideRecursively(SQUARE, {levels}));
                expect(Math.max(...nodes.map(node => node.level)) + 1).toBe(depth);
            }
        });

        it('drops the specs past the maximum rather than folding them into the last one', () => {
            const asked = Array.from({length: 6}, (_unused, index) =>
                levelSpec('recurse', 'recurse', {mergeGroupSize: index + 1}));
            const clamped = clampLevelSpecs(asked);

            expect(clamped).toHaveLength(MAX_RECURSION_LEVELS);
            // The first three, unaltered: a fourth level's spec has nowhere to apply, and merging it
            // into the third would run a spec against a region it was not written for.
            expect(clamped.map(spec => spec.mergeGroupSize)).toEqual([1, 2, 3]);
        });

        it('falls back on one terminal full-depth level when handed no levels at all', () => {
            expect(clampLevelSpecs([])).toEqual([FALLBACK_LEVEL_SPEC]);
            expect(FALLBACK_LEVEL_SPEC.depthFraction).toBe(FULL_DEPTH_FRACTION);
            // Terminal in both streams, because a single level's streams are terminal anyway.
            expect(FALLBACK_LEVEL_SPEC.segments).toBe('leaf');
            expect(FALLBACK_LEVEL_SPEC.residue).toBe('void');

            const root = subdivideRecursively(SQUARE, {levels: []});
            expect(root.failure).toBeUndefined();
            expect(root.segments.length).toBeGreaterThan(0);
            expect(root.children).toEqual([]);
            expect(root.residueRings).toEqual([]);
        });

        it('clamps each spec on its own rather than clamping one and copying it', () => {
            const clamped = clampLevelSpecs([
                levelSpec('recurse', 'recurse', {depthFraction: 0, mergeGroupSize: 0}),
                levelSpec('leaf', 'void', {depthFraction: 2.5, mergeGroupSize: 3.9}),
            ]);
            expect(clamped[0].depthFraction).toBe(FULL_DEPTH_FRACTION);
            expect(clamped[0].mergeGroupSize).toBe(1);
            expect(clamped[1].depthFraction).toBe(FULL_DEPTH_FRACTION);
            expect(clamped[1].mergeGroupSize).toBe(3);
            // And the treatments are carried through untouched: they have no range to clamp to.
            expect(clamped.map(spec => spec.segments)).toEqual(['recurse', 'leaf']);
            expect(clamped.map(spec => spec.residue)).toEqual(['recurse', 'void']);
        });

        it('builds a uniform array from the scalars the options used to carry', () => {
            const levels = uniformLevelSpecs({
                levels: 2, mergeGroupSize: 3, depthFraction: 0.4, residue: 'void',
            });
            expect(levels).toEqual([
                {depthFraction: 0.4, mergeGroupSize: 3, segments: 'recurse', residue: 'void'},
                {depthFraction: 0.4, mergeGroupSize: 3, segments: 'recurse', residue: 'void'},
            ]);
            // `recurse` on the segments at every level, because that is the only thing the scalar
            // shape could ever do — which is why three of the four combinations were unreachable.
            expect(levels.every(level => level.segments === 'recurse')).toBe(true);
            // And the count goes through the same clamp the array's length does.
            expect(uniformLevelSpecs({
                levels: 99, mergeGroupSize: 1, depthFraction: 1, residue: 'void',
            })).toHaveLength(MAX_RECURSION_LEVELS);
        });

        it('reads a recurse on the last level as leaf and void, having nowhere to send it', () => {
            // Decision 3. The rings are still produced and still counted — what is overridden is
            // whether they become regions, not whether they exist.
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), {
                levels: [levelSpec('recurse', 'recurse', {depthFraction: PINCH_DEPTH_FRACTION})],
            });
            expect(root.failure).toBeUndefined();
            expect(root.segments.length).toBeGreaterThan(0);
            expect(root.residueRings.length).toBeGreaterThan(0);
            expect(childStreams(root)).toBe('neither');
        });

        it('overrides only the last level, leaving the same spec above it recursing', () => {
            const spec = levelSpec('recurse', 'recurse', {depthFraction: PINCH_DEPTH_FRACTION});
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), {levels: [spec, spec]});

            expect(childStreams(root)).toBe('both');
            const deeper = flattenRecursiveTree(root).filter(node => node.level === 1);
            expect(deeper.length).toBeGreaterThan(1);
            expect(deeper.every(node => childStreams(node) === 'neither')).toBe(true);
        });

        it('publishes the last-level predicate rather than leaving each caller to restate it', () => {
            // Decision 3's rule is asked three times over — by the driver here, by the readout that
            // reports an overridden setting, and by the panel that disables a terminal row — and a
            // readout that answered it differently would report a recursion the driver never ran.
            const spec = levelSpec('recurse', 'recurse', {depthFraction: PINCH_DEPTH_FRACTION});
            const levels = [spec, spec];

            expect(isLastLevel(0, levels)).toBe(false);
            expect(isLastLevel(1, levels)).toBe(true);
            expect(isLastLevel(0, [spec])).toBe(true);

            // And it answers for the tree the driver actually grew: exactly the levels the predicate
            // calls last are the ones whose solved regions grew no children of either kind.
            const root = subdivideRecursively(fixtureVertices(PINCHING_FIXTURE), {levels});
            const solved = flattenRecursiveTree(root).filter(node => node.failure === undefined);
            expect(solved.length).toBeGreaterThan(1);
            expect(solved.map(node => childStreams(node) === 'neither'))
                .toEqual(solved.map(node => isLastLevel(node.level, levels)));
        });
    });

    /**
     * Decision 11: all four combinations, each at the level it is written for and again a level down.
     *
     * TWO POSITIONS RATHER THAN ONE, because a driver that read `levels[0]` for every node would pass
     * every one of these at level 0 and fail all four at level 1 — which is the whole of decision 2
     * expressed as the cheapest possible test.
     */
    describe.each(STREAM_COMBINATIONS)(
        'segments $segments, residue $residue',
        (combination: StreamCombination) => {
            it.each([0, 1])('grows the streams it was told to, at level %i', (at: number) => {
                const levels = combinationLevels(combination, at);
                const subdivisionOptions: RecursiveOptions = {levels};
                const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), subdivisionOptions);

                // The precondition every one of these rests on: the regions at this level all solved,
                // and all carry both streams. A node that failed, or that had no rings, would land in
                // the "neither" bucket for reasons that have nothing to do with the spec under test.
                const carrying = flattenRecursiveTree(root).filter(node => node.level === at);
                expect(carrying.length).toBeGreaterThan(at);
                expect(carrying.every(node => node.failure === undefined)).toBe(true);
                expect(carrying.every(node => node.segments.length > 0)).toBe(true);
                expect(carrying.every(node => node.residueRings.length > 0)).toBe(true);

                expect(carrying.map(childStreams)).toEqual(carrying.map(() => combination.streams));
                // One child per member of a recursed stream, and none at all from a terminal one.
                expect(carrying.map(node => node.children.length)).toEqual(carrying.map(node =>
                    combination.segments === 'recurse' ? node.segments.length : 0));
                expect(carrying.map(node => node.residueChildren.length)).toEqual(carrying.map(node =>
                    combination.residue === 'recurse' ? node.residueRings.length : 0));

                expect(structuralProblems(root, subdivisionOptions)).toEqual([]);
                expect(tilingProblems(root)).toEqual([]);
            });
        },
    );

    describe('the droste reading: a final ring around a subdivided courtyard', () => {
        // Decision 11 names `leaf` + `recurse` as the case most likely to be quietly broken, because
        // it is the only one where a node has residue children and no segment children — so the next
        // level down is reached exclusively through the residue.
        const levels: LevelSpec[] = [
            levelSpec('leaf', 'recurse'),
            levelSpec('leaf', 'void'),
        ];

        it('sends the courtyard down and leaves the ring of segments final', () => {
            const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), {levels});

            expect(root.segments.length).toBeGreaterThan(0);
            expect(root.children).toEqual([]);
            expect(root.residueChildren).toHaveLength(root.residueRings.length);
            expect(root.residueChildren.length).toBeGreaterThan(0);
        });

        it('makes every level-1 region a residue ring rather than a segment', () => {
            const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), {levels});
            const deeper = flattenRecursiveTree(root).filter(node => node.level === 1);

            expect(deeper).toEqual(root.residueChildren);
            deeper.forEach((node, index) => {
                expect(node.boundary).toEqual(root.residueRings[index]);
            });
        });

        it('still tiles: a final ring of segments accounts for the region with its courtyard', () => {
            const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), {levels});
            expect(tilingProblems(root)).toEqual([]);
        });
    });

    /**
     * Decision 12's headline: three levels that differ in every field a spec has.
     *
     * Level 0 cuts a shallow rim in coarse groups of three and sends both streams down. Level 1 cuts
     * much deeper, one segment per edge, and is the droste level — its ring is final and only its
     * courtyard descends. Level 2 is at full depth, so it has no residue at all, and it asks to recurse
     * on its segments while being the last level, which decision 3 overrides.
     *
     * Every field differs from its neighbours, which is what makes an off-by-one in decision 2 visible:
     * under a uniform array, reading `levels[level - 1]` or `levels[level + 1]` produces exactly the
     * same tree.
     */
    const HETEROGENEOUS_LEVELS: LevelSpec[] = [
        {depthFraction: 0.35, mergeGroupSize: 3, segments: 'recurse', residue: 'recurse'},
        {depthFraction: 0.7, mergeGroupSize: 1, segments: 'leaf', residue: 'recurse'},
        {depthFraction: FULL_DEPTH_FRACTION, mergeGroupSize: 2, segments: 'recurse', residue: 'void'},
    ];

    describe('a heterogeneous tree', () => {
        const heterogeneous: RecursiveOptions = {levels: HETEROGENEOUS_LEVELS};

        it("divides every node by the spec for the node's own level, vertex for vertex", () => {
            const problems: string[] = [];
            const counted = [0, 0, 0];
            for (const polygon of ALL_TEST_POLYGONS) {
                const rootFloor = rootFloorOf(polygon.vertices);
                const root = subdivideRecursively(polygon.vertices, heterogeneous);
                for (const node of flattenRecursiveTree(root)) {
                    if (node.failure !== undefined) continue;
                    counted[node.level] += 1;
                    problems.push(...specGovernedProblems(
                        node, HETEROGENEOUS_LEVELS[node.level], rootFloor, polygon.name));
                }
            }
            expect(problems).toEqual([]);
            // Non-vacuous at every level: a sweep that never reached level 2 would be silent about the
            // level furthest from the root, which is where an off-by-one is most likely to hide.
            expect(counted.every(nodes => nodes > 0)).toBe(true);
        });

        it('would notice a level reading its neighbour’s spec', () => {
            // The sensitivity check for the assertion above. Re-deriving each node under the spec of
            // the level BELOW it must give a different answer somewhere, or the comparison could not
            // tell the two apart and the test above would pass on a driver with an off-by-one.
            let differing = 0;
            for (const polygon of ALL_TEST_POLYGONS) {
                const rootFloor = rootFloorOf(polygon.vertices);
                const root = subdivideRecursively(polygon.vertices, heterogeneous);
                for (const node of flattenRecursiveTree(root)) {
                    if (node.failure !== undefined || node.level + 1 >= HETEROGENEOUS_LEVELS.length) continue;
                    const neighbour = deriveStreams(
                        node.boundary, HETEROGENEOUS_LEVELS[node.level + 1], rootFloor);
                    if (neighbour !== undefined && !sameStreams(nodeStreams(node), neighbour)) {
                        differing += 1;
                    }
                }
            }
            expect(differing).toBeGreaterThan(0);
        });

        it('reaches level 2 through the residue alone, as level 1 is the droste level', () => {
            const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), heterogeneous);
            const atOne = flattenRecursiveTree(root).filter(node => node.level === 1);
            const atTwo = flattenRecursiveTree(root).filter(node => node.level === 2);

            expect(atOne.length).toBeGreaterThan(1);
            expect(atOne.every(node => node.children.length === 0)).toBe(true);
            expect(atTwo.length).toBeGreaterThan(0);
            // Every level-2 region is some level-1 node's residue child, and no level-1 node's
            // segment child, because level 1's segments are leaves.
            expect(atTwo).toEqual(atOne.flatMap(node => node.residueChildren));
        });

        it('grows nothing from the last level, whose spec asked to recurse', () => {
            const root = subdivideRecursively(fixtureVertices(STREAM_FIXTURE), heterogeneous);
            const atTwo = flattenRecursiveTree(root).filter(node => node.level === 2);

            expect(HETEROGENEOUS_LEVELS[2].segments).toBe('recurse');
            expect(atTwo.every(node => childStreams(node) === 'neither')).toBe(true);
            // At full depth there is no residue there either, so nothing is being hidden by the
            // override: the segments simply have nowhere to go.
            expect(atTwo.every(node => node.residueRings.length === 0)).toBe(true);
        });

        it('holds the structure, the tiling identity and the drift at every node of the corpus', () => {
            // Decision 13: the identity is against `canonicalBoundary`, unchanged, and this change
            // must not touch it — so it is asserted over a heterogeneous tree of every fixture rather
            // than only over the uniform sweeps that predate per-level specs.
            const problems: string[] = [];
            for (const polygon of ALL_TEST_POLYGONS) {
                const root = subdivideRecursively(polygon.vertices, heterogeneous);
                problems.push(
                    ...structuralProblems(root, heterogeneous).map(problem => `${polygon.name} ${problem}`),
                    ...tilingProblems(root).map(problem => `${polygon.name} ${problem}`),
                    ...driftProblems(root).map(problem => `${polygon.name} ${problem}`));
            }
            expect(problems).toEqual([]);
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
            expect(unsubdividedResidueChildren(root)).toHaveLength(1);
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

        it('reports a region turned away as degenerate as its own canonical form', () => {
            // The degeneracy screen runs BEFORE anything is canonicalised, so here — and only here —
            // there really is no drift to report and no second polygon to report it against, rather
            // than a null field the caller has to test for.
            const degenerate = subdivideRecursively([{x: 0, y: 0}, {x: 1, y: 1}], options());
            expect(degenerate.failure).toMatch(/^Degenerate region/);
            expect(degenerate.canonicalBoundary).toEqual(degenerate.boundary);
            expect(degenerate.canonicalAreaDrift).toBe(0);
        });

        it('reports a region that failed to solve as unchanged only where the floor took nothing', () => {
            // Not because the solve failed: canonicalisation runs ahead of the wavefront and does not
            // depend on it finishing. This region simply has no vertex under its floor, which is the
            // ordinary case — the test below is what happens when it does.
            const unsolvable = subdivideRecursively(fixtureVertices('Rectangle'), options({
                levels: 2, mergeGroupSize: 3,
            })).children.find(child => child.failure !== undefined);
            expect(unsolvable?.failure).toMatch(/^Incomplete solve/);
            expect(unsolvable?.canonicalBoundary).toEqual(unsolvable?.boundary);
            expect(unsolvable?.canonicalAreaDrift).toBe(0);
        });

        it('reports what the floor removed from a region that then failed to solve', () => {
            // A METAMORPHIC PAIR: one sub-floor vertex inserted into a region the driver cannot
            // solve. The floor removes it, so the solve runs on the same ring and fails in the same
            // words — the only thing that changed is what was HANDED IN, and that difference is the
            // drift. Reporting the region as its own canonical form here, as the driver did while it
            // treated a failed solve as proof that no canonicalisation had happened, zeroes a
            // removal that demonstrably did happen.
            const region = unsolvableRegion();
            const plain = subdivideRecursively(region, options());
            const bulged = subdivideRecursively(
                bulgeLongestEdge(region, rootFloorOf(region) / 2), options());

            const plainFailure = plain.failure ?? '';
            const bulgedFailure = bulged.failure ?? '';
            expect(plainFailure).not.toBe('');
            // The same solve failing in the same words. The bulged run adds one diagnostic to them,
            // which is canonicalisation reporting the very removal this test is about.
            expect(failureKind(bulgedFailure)).toBe(failureKind(plainFailure));
            expect(bulgedFailure).toContain(plainFailure.replace(/^Incomplete solve: /, ''));

            expect(bulged.boundary).toHaveLength(plain.boundary.length + 1);
            // The invisible vertex, and only it, is gone: the ring the solve ran on is unchanged.
            expect(sameVertices(bulged.canonicalBoundary, plain.canonicalBoundary)).toBe(true);

            // And the removal is reported at its true size rather than as zero. Real geometry, two
            // orders of magnitude above the tiling tolerance, on a node carrying a failure.
            expect(bulged.canonicalAreaDrift).toBeGreaterThan(AREA_TOLERANCE_FRACTION * 1e2);
            expect(bulged.canonicalAreaDrift)
                .toBeCloseTo(relativeAreaDrift(bulged.boundary, bulged.canonicalBoundary), 15);
        });

        it('reports the canonicalisation its own solve was set up with, at every failed node', () => {
            // The corpus reading of the same thing: every region that failed for a reason other than
            // degeneracy is asked what the floor left it, and the answer is checked against what
            // `canonicalisePolygon` says at the floor that node was really solved at.
            const canonicalisations = failedRegions().map(failedCanonicalisation);
            expect(canonicalisations.flatMap(failed => failed.problems)).toEqual([]);
            const reduced = canonicalisations.filter(failed => failed.reduced).length;
            // Not vacuous: five failed nodes in the corpus lost a vertex to the floor before failing,
            // which is the population the check exists for. Should the solver ever improve until this
            // count reaches zero, the metamorphic pair above is what still pins the behaviour — this
            // sweep would then need a region built for it rather than the assertion being dropped.
            expect(reduced).toBeGreaterThan(0);
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
            let unsubdividedRings = 0;

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
                        unsubdividedRings += nodes.reduce(
                            (total, node) => total + unsubdividedResidueChildren(node).length, 0);

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
                `${residueRings} residue ring(s), ${unsubdividedRings} of them not subdivided.\n` +
                `${rows.length === 0 ? '  (no failures)' : rows.map(row => `  ${row}`).join('\n')}`);

            // Every recorded failure must say one of the things this driver can actually report; an
            // empty or unrecognised reason would make the census above worthless.
            expect(unexplained).toEqual([]);
        });
    });
});
