import {COLLINEAR_DUMBBELL} from '@proc-geo/test-fixtures';
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
 *  A RECORDED DEFECT, PINNED AS IT STANDS. Read this before "fixing" a failure here.
 * ============================================================================
 *
 * `COLLINEAR_DUMBBELL` tiles with a 1.0e-1 relative error — strips overlapping strips by about 22
 * of its 220 area units — while the solve reports `complete: true` with empty diagnostics and the
 * ring accounting is innocent. That combination is the worst failure mode a result type has: a
 * wrong answer that says it is right. `result.complete` is therefore **not** a sufficient
 * precondition for the tiling identity.
 *
 * These tests assert the CURRENT WRONG BEHAVIOUR, exactly. They are a tripwire in both directions:
 * if the overlap is fixed they fail and should be rewritten as a specification; if it worsens they
 * fail and something regressed. Neither drift is allowed to be silent.
 *
 * WHAT IS DEGENERATE ABOUT IT is not redundant vertices — every turn is 90 degrees, so nothing is
 * collinear at a vertex and no vertex-local test can see it. It is that *non-adjacent* edges share
 * supporting lines, which makes wall-to-wall distances exactly equal so the pinches land in one
 * offset layer. The perturbed control below has the identical topology with those coincidences
 * broken, and tiles cleanly, which is what convicts that diagnosis rather than merely asserting it.
 *
 * Whether the overlap is downstream fallout of the reverted layer-partitioning defect
 * (`docs/notes/solver-hardening-backlog.md` item 3) or independent of it is the open question this
 * fixture exists to make answerable. Fixing it is out of scope here.
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

/** Monte-Carlo estimate, in area units, of how much strip overlaps strip within the bounding box. */
function overlapArea(strips: Strip[]): number {
    const random = makeRandom(20120402);
    const samples = 20000;
    let doubleCovered = 0;
    for (let i = 0; i < samples; i++) {
        const point: Vector2 = {x: random() * 30, y: random() * 10};
        if (strips.filter(strip => isInsideStrip(point, strip)).length > 1) {
            doubleCovered++;
        }
    }
    return (doubleCovered / samples) * 300;
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

describe('COLLINEAR_DUMBBELL: the recorded defect', () => {
    it('reports a complete solve with no diagnostics at all', () => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);

        expect(result.complete).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(computeMaxOffset(result)).toBeCloseTo(5, 12);
        expect(Math.abs(signedRingArea(COLLINEAR_DUMBBELL))).toBe(AREA);
    });

    it.each([0.2, 0.5])('fails the tiling identity by a tenth of its area at depth %p of max offset', fraction => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);
        const depth = computeMaxOffset(result) * fraction;

        expect(tilingError(result, COLLINEAR_DUMBBELL, depth)).toBeCloseTo(0.1, 6);
    });

    it('overlaps strip with strip by about 22 area units, which is the excess exactly', () => {
        const result = solveSkeleton(COLLINEAR_DUMBBELL);
        const strips = computeStrips(result, {depth: computeMaxOffset(result) * 0.4});

        expect(overlapArea(strips)).toBeCloseTo(22, 0);
    });

    it('fuses four skeleton nodes that the perturbed shape keeps apart', () => {
        // The pinches land in one offset layer and are resolved as fewer events than there are
        // pinches. Same topology, same strip count, four fewer nodes and edges.
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

        expect(overlapArea(strips)).toBe(0);
    });
});
