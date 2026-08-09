import {ALL_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeStrips,
    Parcel,
    SkeletonSolveResult,
    SliceOptions,
    sliceStrip,
    sliceStrips,
    solveSkeleton,
    Strip,
    Vector2,
} from '@proc-geo/core';

/**
 * Properties of the parcel slicing, rather than golden coordinates.
 *
 * Two assertions carry the weight. The first is tiling: a strip's parcels must account for the strip
 * exactly, which a gap and an overlap both violate, so it is measured as an area identity and backed
 * by a seeded Monte-Carlo overlap count. The second is egress: every parcel must own a real piece of
 * the strip frontage, which is the entire reason the skeleton-strip construction exists. Everything
 * else — the area bounds, the irregularity response, the degenerate cases — is stated the same way,
 * as a property that would survive a rewrite of the implementation.
 */

/**
 * Relative area tolerance for the tiling identity.
 *
 * The identity is exact in principle. Parcels are read off a single walk of the strip boundary
 * between consecutive cuts, using the very same vertex values on both sides of every cut, so nothing
 * here trades area for a numerical fit and the only slack needed is double-precision summation noise.
 * This mirrors the tolerance `strip-decomposition.test.ts` uses for the same reason.
 */
const AREA_TOLERANCE_FRACTION = 1e-12;

/** Absolute tolerance for "this point is on that polyline", relative to the polygon's own scale. */
const RELATIVE_TOLERANCE = 1e-7;

interface Scaled {
    result: SkeletonSolveResult;
    strips: Strip[];
    options: SliceOptions;
    polygonArea: number;
}

function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function polylineLength(polyline: Vector2[]): number {
    let total = 0;
    for (let i = 1; i < polyline.length; i++) {
        total += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y);
    }
    return total;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce(
        (area, hole) => area - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
}

function boundaryOf(result: SkeletonSolveResult): Vector2[] {
    return result.graph.nodes.slice(0, result.graph.numExteriorNodes).map(node => node.position);
}

function solvedFixture(name: string): SkeletonSolveResult {
    const fixture = ALL_TEST_POLYGONS.find(polygon => polygon.name === name);
    if (fixture === undefined) {
        throw new Error(`No fixture named "${name}" in ALL_TEST_POLYGONS`);
    }
    return solveSkeleton(fixture.vertices);
}

/** Euclidean distance from p to the segment ab. */
function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const raw = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, raw));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToPolyline(p: Vector2, polyline: Vector2[]): number {
    let nearest = Infinity;
    for (let i = 1; i < polyline.length; i++) {
        nearest = Math.min(nearest, distanceToSegment(p, polyline[i - 1], polyline[i]));
    }
    return nearest;
}

function isInsideRing(p: Vector2, ring: Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

function boundingBox(polygon: Vector2[]): {minX: number; minY: number; maxX: number; maxY: number} {
    return polygon.reduce(
        (box, p) => ({
            minX: Math.min(box.minX, p.x),
            minY: Math.min(box.minY, p.y),
            maxX: Math.max(box.maxX, p.x),
            maxY: Math.max(box.maxY, p.y),
        }),
        {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
}

/** Deterministic sampler, so an overlap either always reproduces or never appears. */
function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/**
 * Monte-Carlo count of points landing inside more than one parcel of the same strip.
 *
 * Overlap is an area, so it is measured as one rather than proxied by a vertex comparison. Points
 * exactly on a shared cut would be ambiguous, but that is a measure-zero set the sampler never hits.
 */
function countDoubleCoveredSamples(strip: Strip, parcels: Parcel[], samples = 20000): number {
    const box = boundingBox(strip.boundary);
    const random = makeRandom(20120402);

    let doubleCovered = 0;
    for (let i = 0; i < samples; i++) {
        const point: Vector2 = {
            x: box.minX + random() * (box.maxX - box.minX),
            y: box.minY + random() * (box.maxY - box.minY),
        };
        if (parcels.filter(parcel => isInsideRing(point, parcel.boundary)).length > 1) {
            doubleCovered++;
        }
    }
    return doubleCovered;
}

/** Slice options scaled to a polygon, so one set of ratios works for fixtures spanning 2 to 500 units. */
function scaledFixture(name: string, depthFraction: number, seed = 4711): Scaled {
    const result = solvedFixture(name);
    const boundary = boundaryOf(result);
    const polygonArea = Math.abs(signedRingArea(boundary));
    const perimeter = polylineLength([...boundary, boundary[0]]);

    return {
        result,
        strips: computeStrips(result, {depth: computeMaxOffset(result) * depthFraction}),
        options: {
            minWidth: perimeter / 40,
            maxWidth: perimeter / 20,
            minArea: polygonArea / 400,
            maxArea: polygonArea / 8,
            splitIrregularity: 0.25,
            seed,
        },
        polygonArea,
    };
}

/** Every way a strip's parcels can fail to tile it, reported together rather than one at a time. */
function tilingProblems(label: string, strip: Strip, parcels: Parcel[]): string[] {
    const problems: string[] = [];
    const expected = stripArea(strip);
    if (!(expected > 0)) {
        return problems;
    }

    const covered = parcels.reduce((total, parcel) => total + parcel.area, 0);
    const error = Math.abs(covered - expected) / expected;
    if (error > AREA_TOLERANCE_FRACTION) {
        problems.push(`${label}: parcel area is out by ${error} of the strip`);
    }

    const doubleCovered = countDoubleCoveredSamples(strip, parcels);
    if (doubleCovered > 0) {
        problems.push(`${label}: ${doubleCovered} sample points landed in more than one parcel`);
    }
    return problems;
}

/** Every way a parcel can fail to own a usable piece of the strip's frontage. */
function egressProblems(label: string, strip: Strip, parcels: Parcel[]): string[] {
    const problems: string[] = [];
    const scale = Math.hypot(
        boundingBox(strip.boundary).maxX - boundingBox(strip.boundary).minX,
        boundingBox(strip.boundary).maxY - boundingBox(strip.boundary).minY);
    const tolerance = scale * RELATIVE_TOLERANCE;

    for (const [index, parcel] of parcels.entries()) {
        if (parcel.frontage.length < 2) {
            problems.push(`${label} parcel ${index} has ${parcel.frontage.length} frontage vertices`);
            continue;
        }
        const length = polylineLength(parcel.frontage);
        if (!(length > tolerance)) {
            problems.push(`${label} parcel ${index} has a frontage of length ${length}`);
        }
        for (const [vertexIndex, vertex] of parcel.frontage.entries()) {
            const offBoundary = distanceToPolyline(vertex, strip.frontage);
            if (offBoundary > tolerance) {
                problems.push(
                    `${label} parcel ${index} frontage vertex ${vertexIndex} is ${offBoundary} ` +
                    `off the strip frontage`);
            }
        }
        for (const vertex of parcel.frontage) {
            if (distanceToPolyline(vertex, [...parcel.boundary, parcel.boundary[0]]) > tolerance) {
                problems.push(`${label} parcel ${index} frontage is not part of its own boundary`);
                break;
            }
        }
    }
    return problems;
}

const TILING_FIXTURES = [
    'Square',
    'Rectangle',
    'Pentagon House',
    'Awkward Heptagon',
    'Duck Octagon (passes)',
    'Crazy Polygon',
    'Long Unbroken Side Then Extreme Acute Angle',
];

describe('parcel slicing', () => {
    describe('preconditions', () => {
        const strip = (): Strip => scaledFixture('Square', 0.5).strips[0];
        const base: SliceOptions = {
            minArea: 0.1,
            maxArea: 10,
            minWidth: 0.2,
            maxWidth: 0.5,
            splitIrregularity: 0,
            seed: 1,
        };

        it('rejects a non-positive minWidth', () => {
            expect(() => sliceStrip(strip(), {...base, minWidth: 0})).toThrow(/minWidth/);
        });

        it('rejects a maxWidth below minWidth', () => {
            expect(() => sliceStrip(strip(), {...base, maxWidth: 0.1})).toThrow(/maxWidth/);
        });

        it('rejects a maxArea below minArea', () => {
            expect(() => sliceStrip(strip(), {...base, maxArea: 0.01})).toThrow(/maxArea/);
        });

        it('rejects a negative splitIrregularity', () => {
            expect(() => sliceStrip(strip(), {...base, splitIrregularity: -1})).toThrow(/splitIrregularity/);
        });

        it('rejects a non-finite seed', () => {
            expect(() => sliceStrip(strip(), {...base, seed: Number.NaN})).toThrow(/seed/);
        });
    });

    describe('tiling: a strip\'s parcels partition it exactly', () => {
        it.each(TILING_FIXTURES)('%s', name => {
            const {strips, options} = scaledFixture(name, 0.5);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, options);
                problems.push(...tilingProblems(`strip ${index}`, strip, parcels));
            }
            expect(problems.join('; ')).toBe('');
        });

        it.each(TILING_FIXTURES)('%s: and the slicing is not vacuous', name => {
            // The identity above would also hold if every strip came back as a single parcel, so the
            // sweep has to show that the strips are genuinely being divided.
            const {strips, options} = scaledFixture(name, 0.5);
            const counts = strips.map(strip => sliceStrip(strip, options).length);
            expect(Math.max(...counts)).toBeGreaterThan(1);
        });
    });

    describe('egress: every parcel owns a piece of the strip frontage', () => {
        it.each(TILING_FIXTURES)('%s', name => {
            const {strips, options} = scaledFixture(name, 0.5);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                problems.push(...egressProblems(`strip ${index}`, strip, sliceStrip(strip, options)));
            }
            expect(problems.join('; ')).toBe('');
        });

        it.each(TILING_FIXTURES)('%s: the parcel frontages chain into the strip frontage', name => {
            // Egress is not just "owns some frontage": the parcels' frontages must partition the
            // strip's, end to end, with no piece of street left unowned and none owned twice.
            const {strips, options} = scaledFixture(name, 0.5);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, options);
                const owned = parcels.reduce((total, parcel) => total + polylineLength(parcel.frontage), 0);
                const available = polylineLength(strip.frontage);
                if (Math.abs(owned - available) > available * 1e-9) {
                    problems.push(`strip ${index} parcels own ${owned} of ${available} frontage`);
                }
                for (let i = 1; i < parcels.length; i++) {
                    const previousEnd = parcels[i - 1].frontage[parcels[i - 1].frontage.length - 1];
                    const nextStart = parcels[i].frontage[0];
                    if (Math.hypot(previousEnd.x - nextStart.x, previousEnd.y - nextStart.y) > available * 1e-9) {
                        problems.push(`strip ${index} parcels ${i - 1} and ${i} do not meet on the frontage`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('area bounds', () => {
        /**
         * Above `Amax`, with merging switched off.
         *
         * The paper splits an oversized parcel with a second ray from the frontage. That can only run
         * while there is frontage left to split: a parcel whose frontage is already shorter than two
         * sampling widths cannot be halved without starving one half of its egress, and the sole
         * parcel of a strip too short to divide has no split available at all. Those are the two
         * exceptions allowed here, and `minArea` is set to zero so that the merge pass — which runs
         * last and can legitimately push a parcel back over `Amax` — cannot mask a failure to split.
         */
        it.each(TILING_FIXTURES)('%s: nothing exceeds Amax that could have been split', name => {
            const {strips, options} = scaledFixture(name, 0.5);
            const unmerged: SliceOptions = {...options, minArea: 0};
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, unmerged);
                for (const [parcelIndex, parcel] of parcels.entries()) {
                    if (parcel.area <= unmerged.maxArea) {
                        continue;
                    }
                    if (parcels.length === 1 || polylineLength(parcel.frontage) < 2 * unmerged.minWidth) {
                        continue;
                    }
                    problems.push(
                        `strip ${index} parcel ${parcelIndex} has area ${parcel.area} over ` +
                        `Amax ${unmerged.maxArea} with ${polylineLength(parcel.frontage)} of frontage`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        /**
         * Below `Amin`, and triangles.
         *
         * The paper's rule is absolute apart from its own escape clause: keep unioning until the
         * parcel is neither small nor triangular, *or only one parcel remains*. So the sole parcel of
         * a strip is exempt and nothing else is.
         */
        it.each(TILING_FIXTURES)('%s: nothing is below Amin or triangular unless it is alone', name => {
            const {strips, options} = scaledFixture(name, 0.5);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, options);
                if (parcels.length <= 1) {
                    continue;
                }
                for (const [parcelIndex, parcel] of parcels.entries()) {
                    if (parcel.area < options.minArea) {
                        problems.push(
                            `strip ${index} parcel ${parcelIndex} has area ${parcel.area} under ` +
                            `Amin ${options.minArea}`);
                    }
                    if (parcel.boundary.length <= 3) {
                        problems.push(`strip ${index} parcel ${parcelIndex} is a triangle`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('a strip too small for Amin comes back as one parcel rather than none', () => {
            const {strips} = scaledFixture('Square', 0.5);
            const parcels = sliceStrip(strips[0], {
                minArea: Number.MAX_SAFE_INTEGER,
                maxArea: Number.MAX_SAFE_INTEGER,
                minWidth: 0.1,
                maxWidth: 0.2,
                splitIrregularity: 0,
                seed: 9,
            });

            expect(parcels).toHaveLength(1);
            expect(parcels[0].area).toBeCloseTo(stripArea(strips[0]), 9);
        });
    });

    describe('determinism', () => {
        it.each(TILING_FIXTURES)('%s: the same seed gives byte-identical parcels', name => {
            const {strips, options} = scaledFixture(name, 0.5);
            expect(JSON.stringify(sliceStrips(strips, options)))
                .toBe(JSON.stringify(sliceStrips(strips, options)));
        });

        it('a different seed gives different parcels once omega is non-zero', () => {
            const {strips, options} = scaledFixture('Duck Octagon (passes)', 0.5);
            const irregular: SliceOptions = {...options, splitIrregularity: 1, minArea: 0, maxArea: Infinity};

            const first = JSON.stringify(sliceStrips(strips, {...irregular, seed: 1}));
            const second = JSON.stringify(sliceStrips(strips, {...irregular, seed: 2}));
            expect(first).not.toBe(second);
        });

        it('omega of zero ignores the seed entirely', () => {
            const {strips, options} = scaledFixture('Duck Octagon (passes)', 0.5);
            const regular: SliceOptions = {...options, splitIrregularity: 0};

            expect(JSON.stringify(sliceStrips(strips, {...regular, seed: 1})))
                .toBe(JSON.stringify(sliceStrips(strips, {...regular, seed: 12345})));
        });
    });

    describe('split irregularity', () => {
        /** Frontage widths of every parcel of every strip, post-processing switched off. */
        function parcelWidths(strips: Strip[], options: SliceOptions, omega: number, seed: number): number[] {
            const sliced = sliceStrips(strips, {
                ...options,
                minArea: 0,
                maxArea: Infinity,
                splitIrregularity: omega,
                seed,
            });
            return sliced.flatMap(parcels => parcels.map(parcel => polylineLength(parcel.frontage)));
        }

        /** Population variance of the interior widths — the last parcel of a strip takes the remainder. */
        function widthVariance(widths: number[]): number {
            const mean = widths.reduce((total, width) => total + width, 0) / widths.length;
            return widths.reduce((total, width) => total + (width - mean) ** 2, 0) / widths.length;
        }

        /**
         * With `ω = 0` the walk steps off the frontage at exactly `(Wmin + Wmax) / 2` every time, so
         * every parcel but the last of a strip is a whole number of those steps wide. It is a whole
         * number rather than exactly one because the triangular-parcel rule still applies at `ω = 0`
         * and merging two adjacent parcels adds their widths; the last parcel of a strip is exempt
         * because it takes whatever frontage is left over.
         */
        it('omega of zero steps the frontage off in exact, uniform widths', () => {
            const {strips, options} = scaledFixture('Duck Octagon (passes)', 0.5);
            const mean = (options.minWidth + options.maxWidth) / 2;
            const sliced = sliceStrips(strips, {...options, minArea: 0, maxArea: Infinity, splitIrregularity: 0});
            const problems: string[] = [];

            for (const [index, parcels] of sliced.entries()) {
                for (const parcel of parcels.slice(0, -1)) {
                    const steps = polylineLength(parcel.frontage) / mean;
                    if (Math.abs(steps - Math.round(steps)) > 1e-9 || Math.round(steps) < 1) {
                        problems.push(`strip ${index} has a parcel ${steps} mean widths wide`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
            expect(sliced.flat().length).toBeGreaterThan(strips.length);
        });

        it('a larger omega measurably widens the spread of parcel widths', () => {
            const {strips, options} = scaledFixture('Duck Octagon (passes)', 0.5);
            const regular = widthVariance(parcelWidths(strips, options, 0, 77));
            const irregular = widthVariance(parcelWidths(strips, options, 1, 77));
            expect(irregular).toBeGreaterThan(regular);
        });

        it('the spread grows monotonically with omega across several seeds', () => {
            const {strips, options} = scaledFixture('Duck Octagon (passes)', 0.5);
            const averageVariance = (omega: number): number => {
                const seeds = [11, 22, 33, 44, 55];
                const total = seeds.reduce(
                    (sum, seed) => sum + widthVariance(parcelWidths(strips, options, omega, seed)), 0);
                return total / seeds.length;
            };

            const none = averageVariance(0);
            const some = averageVariance(0.3);
            const lots = averageVariance(1);
            expect(some).toBeGreaterThan(none);
            expect(lots).toBeGreaterThan(some);
        });
    });

    describe('degenerate inputs', () => {
        it('a strip too short for one parcel comes back whole, not empty', () => {
            const {strips} = scaledFixture('Square', 0.5);
            const strip = strips[0];
            const frontage = polylineLength(strip.frontage);
            const parcels = sliceStrip(strip, {
                minArea: 0,
                maxArea: Infinity,
                minWidth: frontage * 0.75,
                maxWidth: frontage * 1.5,
                splitIrregularity: 0,
                seed: 3,
            });

            expect(parcels).toHaveLength(1);
            expect(parcels[0].area).toBeCloseTo(stripArea(strip), 9);
            expect(polylineLength(parcels[0].frontage)).toBeCloseTo(frontage, 9);
        });

        it('a strip whose frontage is a single edge slices normally', () => {
            // The default `computeStrips` policy gives exactly this: one strip per exterior edge.
            const {strips, options} = scaledFixture('Rectangle', 0.5);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                expect(strip.supportingEdgeIds).toHaveLength(1);
                expect(strip.frontage).toHaveLength(2);
                const parcels = sliceStrip(strip, options);
                expect(parcels.length).toBeGreaterThanOrEqual(1);
                problems.push(...tilingProblems(`strip ${index}`, strip, parcels));
                problems.push(...egressProblems(`strip ${index}`, strip, parcels));
            }
            expect(problems.join('; ')).toBe('');
        });

        it('an empty strip boundary yields no parcels', () => {
            const result = solvedFixture('Square');
            const strips = computeStrips(result, {depth: 0});
            for (const strip of strips) {
                expect(strip.boundary).toEqual([]);
                expect(sliceStrip(strip, {
                    minArea: 0,
                    maxArea: Infinity,
                    minWidth: 0.1,
                    maxWidth: 0.2,
                    splitIrregularity: 0,
                    seed: 1,
                })).toEqual([]);
            }
        });

        it('a strip with a hole is returned whole rather than sliced or thrown at', () => {
            // One logical street all the way round closes a loop about the offset contour.
            const result = solvedFixture('Square');
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.5,
                sameLogicalStreet: () => true,
            });

            expect(strips).toHaveLength(1);
            expect(strips[0].holes.length).toBeGreaterThan(0);

            const parcels = sliceStrip(strips[0], {
                minArea: 0,
                maxArea: Infinity,
                minWidth: 0.1,
                maxWidth: 0.2,
                splitIrregularity: 0,
                seed: 1,
            });
            expect(parcels).toHaveLength(1);
            expect(parcels[0].area).toBeCloseTo(stripArea(strips[0]), 9);
        });

        it('sliceStrips maps one parcel list per strip, in order', () => {
            const {strips, options} = scaledFixture('Awkward Heptagon', 0.5);
            const grouped = sliceStrips(strips, options);

            expect(grouped).toHaveLength(strips.length);
            for (const [index, strip] of strips.entries()) {
                expect(JSON.stringify(grouped[index])).toBe(JSON.stringify(sliceStrip(strip, options)));
            }
        });
    });

    describe('rays follow skeleton edges rather than crossing them', () => {
        /** A strip merged from three consecutive edges, so its interior carries skeleton seams. */
        function mergedStrip(name: string): {strip: Strip; options: SliceOptions} {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const polygonArea = Math.abs(signedRingArea(boundary));
            const perimeter = polylineLength([...boundary, boundary[0]]);
            const strips = computeStrips(result, {
                depth: computeMaxOffset(result) * 0.5,
                sameLogicalStreet: (a, b) => a < 3 && b <= 3,
            });
            const strip = strips.find(candidate => candidate.supportingEdgeIds.length > 1);
            if (strip === undefined) {
                throw new Error(`No merged strip produced for "${name}"`);
            }
            return {
                strip,
                options: {
                    minWidth: perimeter / 40,
                    maxWidth: perimeter / 20,
                    minArea: 0,
                    maxArea: Infinity,
                    splitIrregularity: 0,
                    seed: 8123,
                },
            };
        }

        it.each(['Duck Octagon (passes)', 'Awkward Heptagon', 'Crazy Polygon'])('%s: a merged strip still tiles and every parcel keeps its frontage', name => {
            const {strip, options} = mergedStrip(name);
            const parcels = sliceStrip(strip, options);

            expect(strip.supportingEdgeIds.length).toBeGreaterThan(1);
            expect(strip.holes).toEqual([]);
            expect(parcels.length).toBeGreaterThan(1);
            expect([
                ...tilingProblems('merged strip', strip, parcels),
                ...egressProblems('merged strip', strip, parcels),
            ].join('; ')).toBe('');
        });

        it('a cut that meets a seam turns and follows it, leaving a bend inside the strip', () => {
            // A straight ray ends the moment it touches the strip boundary, so every vertex of every
            // parcel would lie on that boundary. A vertex strictly inside the strip can only be the
            // point where a ray met a skeleton seam and turned along it.
            const {strip, options} = mergedStrip('Duck Octagon (passes)');
            const scale = Math.hypot(
                boundingBox(strip.boundary).maxX - boundingBox(strip.boundary).minX,
                boundingBox(strip.boundary).maxY - boundingBox(strip.boundary).minY);
            const closedBoundary = [...strip.boundary, strip.boundary[0]];

            const interiorBends = sliceStrip(strip, options)
                .flatMap(parcel => parcel.boundary)
                .filter(vertex => distanceToPolyline(vertex, closedBoundary) > scale * 1e-6);
            expect(interiorBends.length).toBeGreaterThan(0);
        });
    });

    describe('full depth: a strip cut to the skeleton is still divided into lots', () => {
        /**
         * At `depth >= computeMaxOffset` a strip is a whole skeleton face, so its lateral boundary is
         * a bare skeleton arc and its two end parcels have three corners each. The triangle rule of
         * the merge pass is stated on shape alone, and unioning is its only remedy, so left unbounded
         * it deletes every cut the sampler and the `Amax` split placed and hands the strip back as
         * the single deep wedge it started as. It is bounded by `Amax` for exactly that reason, and
         * these are the properties that bound states.
         */
        /**
         * Sampling as coarse as a village-scale consumer asks for — the ratios the `/parcels` page
         * derives — where a strip carries only two or three sampled cuts and the merge cascade has
         * that much less to chew through before it reaches the strip's one-parcel escape clause.
         */
        function coarseFixture(name: string): {strips: Strip[]; options: SliceOptions} {
            const result = solvedFixture(name);
            const boundary = boundaryOf(result);
            const area = Math.abs(signedRingArea(boundary));
            const perimeter = polylineLength([...boundary, boundary[0]]);
            return {
                strips: computeStrips(result, {depth: computeMaxOffset(result)}),
                options: {
                    minWidth: perimeter / 26,
                    maxWidth: perimeter / 13,
                    minArea: area / 70,
                    maxArea: area / 7,
                    splitIrregularity: 0.3,
                    seed: 1,
                },
            };
        }

        it.each(TILING_FIXTURES)('%s: full depth is not dissolved back to one parcel per strip', name => {
            const {strips, options} = scaledFixture(name, 1);
            const counts = strips.map(strip => sliceStrip(strip, options).length);
            expect(Math.max(...counts)).toBeGreaterThan(1);
        });

        /**
         * The `Amax` bound of the `area bounds` block, restated at full depth — where it used to be
         * comprehensively false.
         *
         * The split pass cut these strips correctly; the merge pass then deleted every cut it made,
         * chasing a triangular end parcel that unioning could never fix, and handed back a single
         * wedge many times `Amax` with a full strip's frontage still on it. `minArea` is zero, so no
         * undersized merge can be blamed and nothing but the triangle rule is under test.
         */
        it.each(TILING_FIXTURES)('%s: coarse sampling at full depth respects Amax', name => {
            const {strips, options} = coarseFixture(name);
            const unmerged: SliceOptions = {...options, minArea: 0};
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, unmerged);
                for (const [parcelIndex, parcel] of parcels.entries()) {
                    if (parcel.area <= unmerged.maxArea) {
                        continue;
                    }
                    if (parcels.length === 1 || polylineLength(parcel.frontage) < 2 * unmerged.minWidth) {
                        continue;
                    }
                    problems.push(
                        `strip ${index} parcel ${parcelIndex} has area ${parcel.area} over ` +
                        `Amax ${unmerged.maxArea} with ${polylineLength(parcel.frontage)} of frontage`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it.each(TILING_FIXTURES)('%s: coarse sampling at full depth tiles and keeps egress', name => {
            const {strips, options} = coarseFixture(name);
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, options);
                problems.push(...tilingProblems(`strip ${index}`, strip, parcels));
                problems.push(...egressProblems(`strip ${index}`, strip, parcels));
            }
            expect(problems.join('; ')).toBe('');
        });

        it.each(TILING_FIXTURES)('%s: a smaller Amax still buys more parcels at full depth', name => {
            // The reported defect in its measured form: overriding `Amax` downward at full depth
            // changed nothing, because the split pass cut and the merge pass immediately undid it.
            const {strips, options} = scaledFixture(name, 1);
            const parcelsWith = (maxArea: number): number =>
                strips.reduce((total, strip) => total + sliceStrip(strip, {...options, maxArea}).length, 0);

            expect(parcelsWith(options.maxArea / 4)).toBeGreaterThan(parcelsWith(options.maxArea));
        });

        it.each(TILING_FIXTURES)('%s: and those extra parcels still tile and still have egress', name => {
            const {strips, options} = scaledFixture(name, 1);
            const tight: SliceOptions = {...options, maxArea: options.maxArea / 4};
            const problems: string[] = [];

            for (const [index, strip] of strips.entries()) {
                const parcels = sliceStrip(strip, tight);
                problems.push(...tilingProblems(`strip ${index}`, strip, parcels));
                problems.push(...egressProblems(`strip ${index}`, strip, parcels));
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('end to end over every fixture', () => {
        it('solves, strips at 25%, 50%, 75% and 100% of max offset, and slices every strip', () => {
            const problems: string[] = [];
            let parcelCount = 0;
            let stripCount = 0;

            for (const polygon of ALL_TEST_POLYGONS) {
                for (const fraction of [0.25, 0.5, 0.75, 1]) {
                    const {strips, options} = scaledFixture(polygon.name, fraction);
                    for (const [index, strip] of strips.entries()) {
                        const parcels = sliceStrip(strip, options);
                        stripCount += 1;
                        parcelCount += parcels.length;
                        const label = `${polygon.name} at ${fraction * 100}% strip ${index}`;
                        problems.push(...tilingProblems(label, strip, parcels));
                        problems.push(...egressProblems(label, strip, parcels));
                    }
                }
            }

            expect(problems.join('; ')).toBe('');
            expect(stripCount).toBeGreaterThan(0);
            expect(parcelCount).toBeGreaterThan(stripCount);
            // eslint-disable-next-line no-console
            console.log(`parcel slicing sweep: ${parcelCount} parcels from ${stripCount} strips`);
        });
    });
});
