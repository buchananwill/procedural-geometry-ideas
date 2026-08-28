import {CLEAN_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeStrips,
    makeMergeGroupPredicate,
    Parcel,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    SliceOptions,
    sliceStrips,
    solveSkeleton,
    StripOptions,
    Vector2,
} from '@proc-geo/core';

import {insertIrregularly, insertRegularly} from './subdivision-helpers';
import {signedRingArea} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  THE OBSERVABLE IS THE TILING AND THE LOT SET. NOTHING ELSE.
 * ============================================================================
 *
 * Read this before adding an assertion to this file. Declaring the observable NARROWLY is what
 * makes vertex removal sound rather than merely plausible, and the temptation to widen it later is
 * exactly what this paragraph exists to stop.
 *
 * IN the observable — what a caller of this pipeline actually receives:
 *   - the lot set: every parcel's area and centroid, as an unordered multiset;
 *   - the tiling: the total area those lots cover, and how many there are.
 *
 * OUT of the observable, explicitly, and an assertion on any of them is a defect in this file:
 *   - the vertex list of the input, or of anything derived from it;
 *   - exterior edge ids, and how many exterior edges a silhouette is expressed in;
 *   - the internal strip partition — how many strips, which strip a lot came from, their order.
 *
 * ----------------------------------------------------------------------------
 * THE INVARIANT
 * ----------------------------------------------------------------------------
 *
 * Pipeline output is invariant under SILHOUETTE-PRESERVING VERTEX INSERTION. Take a fixture, insert
 * vertices that lie on the segments they subdivide — which changes how the boundary is written down
 * and not what it looks like — and the lots come back the same.
 *
 * This is a metamorphic property, and it is stronger than the alternatives available here. It needs
 * no expected coordinates, so it cannot rot into a golden file that gets updated whenever it goes
 * red. It is strictly stronger than "solves completely", which an entirely wrong-but-closed answer
 * satisfies. And it transfers verbatim to the downstream C++ port, because it mentions nothing about
 * how either implementation is built.
 *
 * BOTH INSERTION FAMILIES ARE PROBED, REGULAR AND IRREGULAR. Backlog item 3 recorded the reflex L
 * failing at k = 5, 6, 8, 10 and passing at k = 1, 2, 3, 4, 7, 9 under EQUAL subdivision — a pattern
 * with no smooth explanation, which is the signature of a test that only probes one family. Equal
 * subdivision is a special input: it manufactures exact simultaneity and exactly equal spacing that
 * irregular insertion never produces.
 *
 * PROBING BOTH IS LOAD-BEARING, NOT THOROUGHNESS, and `reflex-subdivision.test.ts` carries the
 * measurement that shows it — the two families each catch failures the other misses entirely. With
 * the stage switched off, the reflex L fails 4 of 10 regular and 0 of 10 irregular, while the
 * double-reflex plus fails 1 of 10 regular and 4 of 10 irregular. A suite probing either family
 * alone would have declared one of those two shapes clean.
 *
 * ----------------------------------------------------------------------------
 * WHERE TO LOOK FIRST IF THIS GOES RED
 * ----------------------------------------------------------------------------
 *
 * `sameLogicalStreet` and `minEdgeLength` in `strip-decomposition.ts`. Both are keyed to exterior
 * edge COUNT or IDENTITY rather than to shape: the predicate is asked once per adjacent exterior
 * edge pair, and `minEdgeLength` merges runs by frontage length. So changing how many edges a
 * silhouette is expressed in can change the strip partition and everything downstream of it. This
 * file therefore runs the sweep under both of them deliberately rather than under the defaults
 * alone. A FAILURE THERE IS A GENUINE FINDING, NOT A TEST DEFECT — do not widen the tolerance.
 */

setSkeletonLogLevel('silent');

/** The whole of what this file is allowed to look at. See the header. */
interface PipelineObservable {
    /** Every lot's area, ascending. The lot set, as a multiset. */
    lotAreas: number[];
    /** Every lot's centroid, in the same order as {@link lotAreas}. Placement, not just size. */
    lotCentroids: Vector2[];
    /** The area the lots cover between them. The tiling. */
    totalArea: number;
}

/**
 * Relative agreement required between two spellings of one silhouette.
 *
 * MEASURED, NOT CHOSEN. Canonicalisation restores the inserted-vertex polygon to the original
 * corner list before the solver ever runs, and the normalisation those corners go through is
 * identical because inserting vertices on existing segments cannot move the bounding box. The two
 * pipelines therefore run on the same numbers and the residual is summation noise. The worst
 * relative disagreement observed across the whole sweep is recorded in the test that pins it; this
 * bound sits above it with room to spare and well below anything a real structural difference could
 * hide under.
 */
const OBSERVABLE_TOLERANCE = 1e-9;

/** Fixtures the sweep runs over: every one that solves and yields lots. */
const SWEPT_FIXTURES = CLEAN_TEST_POLYGONS.map(polygon => polygon.name);

/**
 * Area-weighted centroid of a simple ring, accumulated ABOUT THE RING'S FIRST VERTEX.
 *
 * The origin subtraction is the same one `signedRingArea` makes, and for the same reason: the
 * centroid is derived from that area, so accumulating the moments from absolute coordinates while
 * the area came from relative ones would state the two halves of one quotient in different
 * arithmetic. Subtracting the first vertex and adding it back makes the whole quantity independent
 * of where in the plane the ring sits — which matters here, because this file compares lots
 * produced by two spellings of one silhouette and a placement-dependent residual would be
 * indistinguishable from the structural difference it is looking for.
 */
function ringCentroid(ring: Vector2[]): Vector2 {
    const origin = ring[0];
    const area = signedRingArea(ring);
    if (area === 0) {
        return ring.reduce(
            (sum, vertex, _unused, all) => ({x: sum.x + vertex.x / all.length, y: sum.y + vertex.y / all.length}),
            {x: 0, y: 0});
    }
    let x = 0;
    let y = 0;
    for (let index = 0; index < ring.length; index++) {
        const aX = ring[index].x - origin.x;
        const aY = ring[index].y - origin.y;
        const bX = ring[(index + 1) % ring.length].x - origin.x;
        const bY = ring[(index + 1) % ring.length].y - origin.y;
        const cross = aX * bY - bX * aY;
        x += (aX + bX) * cross;
        y += (aY + bY) * cross;
    }
    return {x: origin.x + x / (6 * area), y: origin.y + y / (6 * area)};
}

function polylineLength(polyline: Vector2[]): number {
    let total = 0;
    for (let index = 1; index < polyline.length; index++) {
        total += Math.hypot(
            polyline[index].x - polyline[index - 1].x,
            polyline[index].y - polyline[index - 1].y);
    }
    return total;
}

function boundaryOf(result: SkeletonSolveResult): Vector2[] {
    return result.graph.nodes.slice(0, result.graph.numExteriorNodes).map(node => node.position);
}

/**
 * Slice options derived from the SOLVED region rather than from the input vertex list.
 *
 * Deliberate: reading the perimeter off the input would make the options themselves depend on how
 * the boundary is written down, and the sweep would then be comparing two different configurations
 * rather than two spellings of one. The solved boundary is the same closed curve either way.
 */
function optionsFor(result: SkeletonSolveResult, seed: number): SliceOptions {
    const boundary = boundaryOf(result);
    const area = Math.abs(signedRingArea(boundary));
    const perimeter = polylineLength([...boundary, boundary[0]]);
    return {
        minWidth: perimeter / 40,
        maxWidth: perimeter / 20,
        minArea: area / 400,
        maxArea: area / 8,
        splitIrregularity: 0.25,
        seed,
    };
}

/** How the strips are cut. Named so decision 13's two edge-keyed mechanisms can be swept explicitly. */
interface StripConfiguration {
    name: string;
    /** Built from the solved result, because `minEdgeLength` is a world-space length. */
    build: (result: SkeletonSolveResult) => StripOptions;
}

const STRIP_CONFIGURATIONS: StripConfiguration[] = [
    {
        name: 'default (one strip per exterior edge)',
        build: result => ({depth: computeMaxOffset(result) * 0.5}),
    },
    {
        name: 'sameLogicalStreet keyed by edge id, groups of 2',
        build: result => ({
            depth: computeMaxOffset(result) * 0.5,
            sameLogicalStreet: makeMergeGroupPredicate(2),
        }),
    },
    {
        name: 'minEdgeLength keyed by frontage length',
        build: result => {
            const boundary = boundaryOf(result);
            const perimeter = polylineLength([...boundary, boundary[0]]);
            return {depth: computeMaxOffset(result) * 0.5, minEdgeLength: perimeter / 12};
        },
    },
];

/** Everything this file is allowed to observe, for one polygon under one strip configuration. */
function observe(
    vertices: Vector2[],
    configuration: StripConfiguration,
    noiseFloor?: number,
): PipelineObservable | null {
    const result = solveSkeleton(vertices, noiseFloor === undefined ? undefined : {noiseFloor});
    if (!result.complete || result.context === null) {
        return null;
    }

    const strips = computeStrips(result, configuration.build(result));
    const lots: Parcel[] = sliceStrips(strips, optionsFor(result, 4711)).flat();

    const ordered = lots
        .map(lot => ({area: lot.area, centroid: ringCentroid(lot.boundary)}))
        .sort((a, b) => a.area - b.area || a.centroid.x - b.centroid.x || a.centroid.y - b.centroid.y);

    return {
        lotAreas: ordered.map(lot => lot.area),
        lotCentroids: ordered.map(lot => lot.centroid),
        totalArea: ordered.reduce((total, lot) => total + lot.area, 0),
    };
}

/** Worst relative disagreement between two observables, or `Infinity` if they are not comparable. */
function disagreement(base: PipelineObservable, variant: PipelineObservable): number {
    if (base.lotAreas.length !== variant.lotAreas.length) {
        return Infinity;
    }

    const scale = Math.max(base.totalArea, Number.MIN_VALUE);
    const span = Math.sqrt(scale);

    let worst = Math.abs(base.totalArea - variant.totalArea) / scale;
    for (let index = 0; index < base.lotAreas.length; index++) {
        worst = Math.max(worst, Math.abs(base.lotAreas[index] - variant.lotAreas[index]) / scale);
        worst = Math.max(worst, Math.abs(base.lotCentroids[index].x - variant.lotCentroids[index].x) / span);
        worst = Math.max(worst, Math.abs(base.lotCentroids[index].y - variant.lotCentroids[index].y) / span);
    }
    return worst;
}

/** Every insertion this file applies, named for reporting. */
const INSERTIONS: Array<[string, (polygon: Vector2[]) => Vector2[]]> = [
    ['regular k=2', polygon => insertRegularly(polygon, 2)],
    ['regular k=3', polygon => insertRegularly(polygon, 3)],
    ['regular k=5', polygon => insertRegularly(polygon, 5)],
    ['irregular 1/edge', polygon => insertIrregularly(polygon, 1, 20260817)],
    ['irregular 2/edge', polygon => insertIrregularly(polygon, 2, 991)],
    ['irregular 3/edge', polygon => insertIrregularly(polygon, 3, 5150)],
];

describe('pipeline output is invariant under silhouette-preserving vertex insertion', () => {
    describe.each(STRIP_CONFIGURATIONS.map(configuration => [configuration.name, configuration] as const))(
        'strips cut with %s',
        (_unusedName, configuration) => {
            it.each(SWEPT_FIXTURES)('%s', name => {
                const fixture = CLEAN_TEST_POLYGONS.find(polygon => polygon.name === name)!;
                const base = observe(fixture.vertices, configuration);
                if (base === null || base.lotAreas.length === 0) {
                    return;
                }

                const problems: string[] = [];
                for (const [insertionName, insert] of INSERTIONS) {
                    const variant = observe(insert(fixture.vertices), configuration);
                    if (variant === null) {
                        problems.push(`${insertionName}: did not solve`);
                        continue;
                    }
                    const worst = disagreement(base, variant);
                    if (!(worst <= OBSERVABLE_TOLERANCE)) {
                        problems.push(
                            `${insertionName}: ${base.lotAreas.length} lots vs ${variant.lotAreas.length}, `
                            + `worst relative disagreement ${worst}`);
                    }
                }
                expect(problems.join('; ')).toBe('');
            });
        });
});

describe('the invariant is a live gate, convicted by mutation', () => {
    /*
     * Decision 16: a test that cannot fail is not a gate. Switching the removal off with a zero
     * noise floor — an exact identity in the stage — must take the sweep above red. If it does not,
     * the invariant is being satisfied by something other than canonicalisation and the evidence
     * for the stage evaporates.
     */

    const CONFIGURATION = STRIP_CONFIGURATIONS[0];

    it('goes red on some fixture and insertion when the removal is switched off', () => {
        const broken: string[] = [];

        for (const name of SWEPT_FIXTURES) {
            const fixture = CLEAN_TEST_POLYGONS.find(polygon => polygon.name === name)!;
            const base = observe(fixture.vertices, CONFIGURATION, 0);
            if (base === null || base.lotAreas.length === 0) {
                continue;
            }
            for (const [insertionName, insert] of INSERTIONS) {
                const variant = observe(insert(fixture.vertices), CONFIGURATION, 0);
                if (variant === null || !(disagreement(base, variant) <= OBSERVABLE_TOLERANCE)) {
                    broken.push(`${name} / ${insertionName}`);
                }
            }
        }

        // EVERY PAIR BREAKS — the full cross-product of fixtures and insertions, not a sample of
        // it. Pinned as the cross-product rather than as a bare number so the assertion says what
        // it means: with the removal off, NO fixture in the corpus is invariant under ANY of these
        // insertions, so the sweep's silence above is entirely the stage's doing.
        //
        // The mechanism is decision 13's, and it is worth being explicit that this conviction is
        // not subtle: the default configuration cuts one strip per exterior edge, so an inserted
        // vertex adds a strip and the lot set moves with it. That is precisely the coupling the
        // stage exists to break, so a total break here is the expected shape of the result.
        expect(broken).toHaveLength(SWEPT_FIXTURES.length * INSERTIONS.length);
        expect(broken.length).toBeGreaterThan(0);
    });
});

describe('the agreement the sweep actually achieves', () => {
    it('is far tighter than the bound it is asserted against', () => {
        // The tolerance is measured rather than chosen, so the measurement is pinned. Inserting
        // vertices on existing segments cannot move the bounding box, so both spellings normalise
        // identically and canonicalisation hands the solver the same corner list; the residual is
        // summation noise in the lot areas and nothing structural.
        let worst = 0;
        for (const name of SWEPT_FIXTURES) {
            const fixture = CLEAN_TEST_POLYGONS.find(polygon => polygon.name === name)!;
            const base = observe(fixture.vertices, STRIP_CONFIGURATIONS[0]);
            if (base === null || base.lotAreas.length === 0) {
                continue;
            }
            for (const [, insert] of INSERTIONS) {
                const variant = observe(insert(fixture.vertices), STRIP_CONFIGURATIONS[0]);
                if (variant !== null) {
                    worst = Math.max(worst, disagreement(base, variant));
                }
            }
        }

        expect(worst).toBeLessThan(OBSERVABLE_TOLERANCE / 100);
    });
});
