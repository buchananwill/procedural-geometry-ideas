import {ASYMMETRIC_DUMBBELL, COLLINEAR_DUMBBELL, THREE_GLOBE_CHAIN} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    SkeletonSolveResult,
    solveSkeleton,
    Strip,
    Vector2,
} from '@proc-geo/core';

/*
 * ============================================================================
 *  THE CORRIDOR MIDLINE, SPECIFIED. This file used to pin the wrong answer.
 * ============================================================================
 *
 * `COLLINEAR_DUMBBELL` spent most of the recursive-subdivision arc as the only known SILENT wrong
 * answer in the corpus: `complete: true`, empty diagnostics, innocent ring accounting, every
 * causality and containment invariant satisfied — and strips overlapping strips by 22 of its 220 area
 * units, a tenth of the shape. What was missing was the whole skeleton of its bar. Each end of the
 * bar closes into a pinch node, and each pinch emits the bar's midline bisector; both were born
 * pointing OUT of the bar, into the globe behind them, where they duplicated that globe's own ridge.
 * The shaft had no skeleton at all and the two globes' faces covered it twice.
 *
 * THE CAUSE WAS A DIRECTION HINT, not a partition or an acceptance rule. `addBisectionEdge` derives a
 * bisector's basis from its two exterior parents and used to let a caller-supplied
 * `approximateDirection` flip it wherever the offset rate is zero. A zero rate means anti-parallel
 * parents and nothing else — which is exactly what a corridor's two walls are — and there the
 * parent-derived basis is already determinate, because the parent PAIR IS ORDERED and a corridor
 * opens the way its clockwise wall points. The hint `bisectionsForMerge` supplied was the bisection
 * of the two arrivals bracketing the gap, which is symmetric in them, so both gaps of a two-run
 * vertex event received the same hint while facing opposite ways. Journal decision 90; the hint is
 * gone and `BisectionParams` no longer carries one.
 *
 * WHAT THIS FILE ASSERTS NOW is the right answer, and it keeps the perturbed control that convicted
 * the diagnosis in the first place: the same topology with every shared supporting line broken, which
 * always tiled cleanly and is BIT-UNMOVED by the fix. Two variants of the class ride along —
 * `ASYMMETRIC_DUMBBELL` removes the mirror symmetry, `THREE_GLOBE_CHAIN` puts two corridors in series
 * — because a fix convicted only on the shape it was written for is not convicted.
 *
 * WHAT IS DEGENERATE ABOUT THE FIXTURE is not redundant vertices — every turn is 90 degrees, so
 * nothing is collinear at a vertex and no vertex-local test can see it. It is that *non-adjacent*
 * edges share supporting lines, which makes wall-to-wall distances exactly equal so the pinches land
 * in one offset layer.
 */

/** The same dumbbell with every shared supporting line broken, and nothing else changed. */
const PERTURBED_DUMBBELL: Vector2[] = [
    {x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 6},
    {x: 20.3, y: 6.2}, {x: 20.3, y: 10}, {x: 30, y: 10}, {x: 30, y: 0},
    {x: 20.1, y: 0}, {x: 20.1, y: 4.3}, {x: 10, y: 4}, {x: 10, y: 0},
];

const AREA = 220;

function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce(
        (area, hole) => area - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
}

/** Strips plus offset rings must account for the polygon exactly; this is how far off they are. */
function tilingError(result: SkeletonSolveResult, polygon: Vector2[], depth: number): number {
    const polygonArea = Math.abs(signedRingArea(polygon));
    const covered = computeStrips(result, {depth}).reduce((total, strip) => total + stripArea(strip), 0)
        + computeOffsetRings(result, depth).reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0);
    return Math.abs(covered - polygonArea) / polygonArea;
}

function isInsideRing(point: Vector2, ring: Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > point.y) !== (b.y > point.y)
            && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

function isInsideStrip(point: Vector2, strip: Strip): boolean {
    return strip.boundary.length >= 3
        && isInsideRing(point, strip.boundary)
        && !strip.holes.some(hole => isInsideRing(point, hole));
}

/** Deterministic sampler, so an overlap either always reproduces or never appears. */
function makeRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** Monte-Carlo estimate, in area units, of how much strip overlaps strip within a bounding box. */
function overlapArea(strips: Strip[], width: number, height: number): number {
    const random = makeRandom(20120402);
    const samples = 20000;
    let doubleCovered = 0;
    for (let i = 0; i < samples; i++) {
        const point: Vector2 = {x: random() * width, y: random() * height};
        if (strips.filter(strip => isInsideStrip(point, strip)).length > 1) {
            doubleCovered++;
        }
    }
    return (doubleCovered / samples) * width * height;
}

/** The interior edges whose two exterior parents are exactly anti-parallel: corridor midlines. */
function corridorMidlines(result: SkeletonSolveResult): {from: Vector2; to: Vector2; parents: number[]}[] {
    const {graph} = result;
    return graph.interiorEdges.flatMap(interior => {
        const clockwise = graph.edges[interior.clockwiseExteriorEdgeIndex].basisVector;
        const widdershins = graph.edges[interior.widdershinsExteriorEdgeIndex].basisVector;
        const antiParallel = Math.abs(
            clockwise.x * widdershins.x + clockwise.y * widdershins.y + 1) < 1e-12;
        const edge = graph.edges[interior.id];
        if (!antiParallel || edge.target === undefined) {
            return [];
        }
        return [{
            from: graph.nodes[edge.source].position,
            to: graph.nodes[edge.target].position,
            parents: [interior.clockwiseExteriorEdgeIndex, interior.widdershinsExteriorEdgeIndex],
        }];
    });
}

describe('COLLINEAR_DUMBBELL: the shape (specification)', () => {
    it('turns through exactly 90 degrees at every one of its twelve vertices', () => {
        // Decision 18, made checkable: the obvious wrong reading of this fixture is that it carries
        // redundant collinear vertices. It does not. Nothing here is a vertex-local degeneracy.
        expect(COLLINEAR_DUMBBELL).toHaveLength(12);

        for (let index = 0; index < COLLINEAR_DUMBBELL.length; index++) {
            const previous = COLLINEAR_DUMBBELL[(index - 1 + 12) % 12];
            const vertex = COLLINEAR_DUMBBELL[index];
            const next = COLLINEAR_DUMBBELL[(index + 1) % 12];
            const incoming = {x: vertex.x - previous.x, y: vertex.y - previous.y};
            const outgoing = {x: next.x - vertex.x, y: next.y - vertex.y};

            expect(Math.abs(incoming.x * outgoing.x + incoming.y * outgoing.y)).toBe(0);
        }
    });

    it('puts four pairs of non-adjacent edges on one supporting line', () => {
        const lines = new Map<string, number>();
        for (let index = 0; index < COLLINEAR_DUMBBELL.length; index++) {
            const from = COLLINEAR_DUMBBELL[index];
            const to = COLLINEAR_DUMBBELL[(index + 1) % 12];
            const key = from.x === to.x ? `x=${from.x}` : `y=${from.y}`;
            lines.set(key, (lines.get(key) ?? 0) + 1);
        }

        const shared = [...lines.entries()].filter(([, count]) => count > 1).map(([key]) => key);

        expect(shared.sort()).toEqual(['x=10', 'x=20', 'y=0', 'y=10']);
    });
});

describe('COLLINEAR_DUMBBELL: the bar carries a midline (specification)', () => {
    it('reports a complete solve with no diagnostics at all', () => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);

        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(computeMaxOffset(result)).toBeCloseTo(5, 12);
        expect(Math.abs(signedRingArea(COLLINEAR_DUMBBELL))).toBe(AREA);
    });

    it('runs a midline down the centre of the bar, parented by the bar\'s own two walls', () => {
        /*
         * THE HEADLINE ASSERTION OF THIS FILE. The bar is `y in [4, 6]` between `x = 10` and
         * `x = 20`, so its midline is `y = 5`, and it reaches one unit into each globe because that
         * is where each end's two reflex bisectors pinch: `(9, 5)` and `(21, 5)`, both at offset 1.
         *
         * TWO EDGES, NOT ONE, AND THAT IS THE REPRESENTATION RATHER THAN A DUPLICATE. Both ends of a
         * corridor are born at the same offset — the bar's half-width — and each emits its own
         * midline bisector; the two meet head-on and are cross-wired, which is the solver's standing
         * treatment of a co-linear head-on pair. Exterior edge 3 is the bar's top and edge 9 its
         * bottom, so both edges name `[3, 9]` in one order or the other and nothing else does.
         */
        const midlines = corridorMidlines(solveSkeleton(COLLINEAR_DUMBBELL));

        expect(midlines).toHaveLength(2);
        expect(midlines.map(midline => midline.parents)).toEqual([[3, 9], [9, 3]]);
        expect(midlines[0].from).toEqual({x: 9, y: 5});
        expect(midlines[0].to).toEqual({x: 21, y: 5});
        expect(midlines[1].from).toEqual({x: 21, y: 5});
        expect(midlines[1].to).toEqual({x: 9, y: 5});
    });

    it.each([0.2, 0.4, 0.5, 1])('tiles exactly at depth %p of max offset', fraction => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);
        const depth = computeMaxOffset(result) * fraction;

        expect(tilingError(result, COLLINEAR_DUMBBELL, depth)).toBeLessThan(1e-12);
    });

    it('overlaps nowhere, where it used to overlap by about 22 area units', () => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);
        const strips = computeStrips(result, {depth: computeMaxOffset(result) * 0.4});

        expect(overlapArea(strips, 30, 10)).toBe(0);
    });

    it('resolves its four simultaneous pinches into four nodes, where the perturbed shape gets eight', () => {
        /*
         * NOT A DEFECT, AND THIS IS WHERE THAT WAS SETTLED. The node counts differ because the
         * shapes differ: the collinear dumbbell's four pinches land in ONE offset layer and produce
         * two shared nodes (one per bar end), while the perturbed control's land in four layers and
         * produce four. The fix did not move either count — it moved where two of the collinear
         * shape's edges POINT — so the old reading of this gap as "four fused nodes" was wrong
         * about the mechanism while right about the numbers.
         */
        const collinear = solveSkeleton(COLLINEAR_DUMBBELL).graph;
        const perturbed = solveSkeleton(PERTURBED_DUMBBELL).graph;

        expect(collinear.nodes).toHaveLength(16);
        expect(collinear.interiorEdges).toHaveLength(16);
        expect(perturbed.nodes).toHaveLength(20);
        expect(perturbed.interiorEdges).toHaveLength(20);
    });
});

describe('the perturbed control: identical topology, no shared supporting lines', () => {
    it.each([0.2, 0.4, 0.5, 1])('tiles exactly at depth %p of max offset', fraction => {
        const result = solveSkeleton(PERTURBED_DUMBBELL);
        const depth = computeMaxOffset(result) * fraction;

        expect(result.complete).toBe(true);
        expect(tilingError(result, PERTURBED_DUMBBELL, depth)).toBeLessThan(1e-12);
    });

    it('overlaps nowhere', () => {
        const result = solveSkeleton(PERTURBED_DUMBBELL);
        const strips = computeStrips(result, {depth: computeMaxOffset(result) * 0.4});

        expect(overlapArea(strips, 30, 10)).toBe(0);
    });
});

describe('the class, not just the fixture', () => {
    it('gives the asymmetric dumbbell a midline too, though its globes finish at different offsets', () => {
        // Same bar, globes of 10x10 and 14x14. The corridor's two ends still pinch together — that
        // is forced by the bar's width — but nothing else about the solve is symmetric. It tiled at
        // 6.96e-2 before the fix.
        const result = solveSkeleton(ASYMMETRIC_DUMBBELL);
        const midlines = corridorMidlines(result);

        expect(result.complete).toBe(true);
        expect(midlines.map(midline => [midline.from, midline.to])).toEqual([
            [{x: 9, y: 5}, {x: 21, y: 5}],
            [{x: 21, y: 5}, {x: 9, y: 5}],
        ]);
        expect(tilingError(result, ASYMMETRIC_DUMBBELL, computeMaxOffset(result) * 0.4)).toBeLessThan(1e-12);
    });

    it('gives both bars of the three-globe chain their own midline', () => {
        // Two corridors in series: four simultaneous pinches, four midline bisectors, and the
        // failure the single-corridor fixture cannot show — before the fix the middle bar's two
        // midlines were wired to each other ACROSS the middle globe. It tiled at 1.29e-1.
        const result = solveSkeleton(THREE_GLOBE_CHAIN);
        const midlines = corridorMidlines(result);

        expect(result.complete).toBe(true);
        expect(midlines.map(midline => [midline.from, midline.to]).sort(
            (first, second) => first[0].x - second[0].x || first[1].x - second[1].x)).toEqual([
            [{x: 9, y: 5}, {x: 21, y: 5}],
            [{x: 21, y: 5}, {x: 9, y: 5}],
            [{x: 29, y: 5}, {x: 41, y: 5}],
            [{x: 41, y: 5}, {x: 29, y: 5}],
        ]);
        expect(tilingError(result, THREE_GLOBE_CHAIN, computeMaxOffset(result) * 0.4)).toBeLessThan(1e-12);
    });
});
