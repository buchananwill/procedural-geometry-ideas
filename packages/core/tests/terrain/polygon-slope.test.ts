import {
    DEFAULT_INTERIOR_SAMPLES,
    evaluatePolygonSlopes,
    isPointInPolygon,
    polygonSamplePositions,
} from '../../src/terrain/polygon-slope';
import {
    createFlatSampler,
    createHemisphereSampler,
    createRidgeSampler,
    createSlopeAspectPlaneSampler,
} from '../../src/terrain/synthetic';
import { squareDomain } from '../../src/terrain/types';
import type { TerrainSample, TerrainSampler } from '../../src/terrain/types';
import type { Vector2 } from '../../src/shared/types';

/** An axis-aligned square lot. */
function square(centreX: number, centreY: number, side: number): Vector2[] {
    const half = side / 2;
    return [
        { x: centreX - half, y: centreY - half },
        { x: centreX + half, y: centreY - half },
        { x: centreX + half, y: centreY + half },
        { x: centreX - half, y: centreY + half },
    ];
}

/** Wraps a sampler to count how many times the batch entry point is actually entered. */
function counting(sampler: TerrainSampler): { sampler: TerrainSampler; calls: () => number; positions: () => number } {
    let calls = 0;
    let positions = 0;
    return {
        sampler: {
            domain: sampler.domain,
            sample(batch: readonly Vector2[]): TerrainSample[] {
                calls++;
                positions += batch.length;
                return sampler.sample(batch);
            },
        },
        calls: () => calls,
        positions: () => positions,
    };
}

describe('sample positions for a polygon', () => {
    const lot = square(0, 0, 100);

    it('always includes the corners', () => {
        const positions = polygonSamplePositions(lot);
        for (const corner of lot) {
            expect(positions).toContainEqual(corner);
        }
    });

    it('fills the interior with a deterministic lattice', () => {
        const first = polygonSamplePositions(lot);
        expect(polygonSamplePositions(lot)).toEqual(first);
        expect(first.length).toBeGreaterThan(lot.length);
        // A square fills its bounding box, so every lattice point lands inside it.
        const perSide = Math.ceil(Math.sqrt(DEFAULT_INTERIOR_SAMPLES));
        expect(first).toHaveLength(lot.length + perSide * perSide);
    });

    it('discards lattice points outside a concave polygon', () => {
        // An L shape: the missing quadrant must take its lattice points with it.
        const shape: Vector2[] = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 50 },
            { x: 50, y: 50 },
            { x: 50, y: 100 },
            { x: 0, y: 100 },
        ];
        const perSide = Math.ceil(Math.sqrt(DEFAULT_INTERIOR_SAMPLES));
        const positions = polygonSamplePositions(shape);
        expect(positions.length).toBeGreaterThan(shape.length);
        expect(positions.length).toBeLessThan(shape.length + perSide * perSide);
        for (const position of positions.slice(shape.length)) {
            expect(isPointInPolygon(position, shape)).toBe(true);
        }
    });

    it('still yields the corners for a degenerate polygon', () => {
        expect(polygonSamplePositions([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(2);
        expect(polygonSamplePositions([])).toEqual([]);
    });
});

describe('evaluating polygons against terrain', () => {
    const lots = [square(200, 200, 100), square(600, 600, 100), square(1000, 400, 200)];

    it('returns one result per polygon, in order', () => {
        const sampler = createSlopeAspectPlaneSampler(20, 0);
        const results = evaluatePolygonSlopes(lots, sampler, { slopeThresholdDegrees: 30 });
        expect(results).toHaveLength(lots.length);
        expect(results.map((r) => r.sampleCount)).toEqual(
            lots.map((lot) => polygonSamplePositions(lot).length),
        );
    });

    it('issues exactly one batched sample call for every polygon together', () => {
        const { sampler, calls, positions } = counting(createSlopeAspectPlaneSampler(20, 0));
        evaluatePolygonSlopes(lots, sampler, { slopeThresholdDegrees: 30 });
        expect(calls()).toBe(1);
        expect(positions()).toBe(lots.reduce((total, lot) => total + polygonSamplePositions(lot).length, 0));
    });

    it('makes one call even for no polygons at all', () => {
        const { sampler, calls } = counting(createFlatSampler());
        expect(evaluatePolygonSlopes([], sampler, { slopeThresholdDegrees: 30 })).toEqual([]);
        expect(calls()).toBe(1);
    });

    it('reads a plane back as exactly the slope and aspect it was built with', () => {
        const sampler = createSlopeAspectPlaneSampler(22.5, -60);
        const [result] = evaluatePolygonSlopes([lots[0]], sampler, { slopeThresholdDegrees: 30 });
        expect(result.meanSlopeDegrees).toBeCloseTo(22.5, 9);
        expect(result.minSlopeDegrees).toBeCloseTo(22.5, 9);
        expect(result.maxSlopeDegrees).toBeCloseTo(22.5, 9);
        expect(result.aspectDegrees).toBeCloseTo(-60, 9);
        expect(result.buildableFraction).toBe(1);
    });

    it('decides buildability against the threshold, and flips when the threshold moves', () => {
        const sampler = createSlopeAspectPlaneSampler(25, 0);
        const above = evaluatePolygonSlopes(lots, sampler, { slopeThresholdDegrees: 30 });
        const below = evaluatePolygonSlopes(lots, sampler, { slopeThresholdDegrees: 20 });
        expect(above.every((r) => r.buildable)).toBe(true);
        expect(below.every((r) => r.buildable)).toBe(false);
        expect(above.every((r) => r.buildableFraction === 1)).toBe(true);
        expect(below.every((r) => r.buildableFraction === 0)).toBe(true);
    });

    it('counts a slope exactly on the threshold as buildable', () => {
        const sampler = createSlopeAspectPlaneSampler(30, 0);
        const [result] = evaluatePolygonSlopes([lots[0]], sampler, { slopeThresholdDegrees: 30 });
        expect(result.meanSlopeDegrees).toBeCloseTo(30, 9);
        expect(result.buildable).toBe(true);
    });

    it('reads flat ground as level with no aspect', () => {
        const [result] = evaluatePolygonSlopes([lots[0]], createFlatSampler(900), {
            slopeThresholdDegrees: 5,
        });
        expect(result.meanSlopeDegrees).toBe(0);
        expect(result.maxSlopeDegrees).toBe(0);
        expect(result.aspectDegrees).toBeNull();
        expect(result.meanHeightMetres).toBe(900);
        expect(result.buildable).toBe(true);
    });

    it('reports the height range the lot spans', () => {
        // Falling towards +x at 45 degrees from height 0 at the origin: a 100 m wide lot centred at
        // x = 200 runs from x = 150 to x = 250, so heights run from -150 to -250.
        const sampler = createSlopeAspectPlaneSampler(45, 0);
        const [result] = evaluatePolygonSlopes([lots[0]], sampler, { slopeThresholdDegrees: 30 });
        expect(result.minHeightMetres).toBeCloseTo(-250, 6);
        expect(result.maxHeightMetres).toBeCloseTo(-150, 6);
        expect(result.meanHeightMetres).toBeCloseTo(-200, 6);
    });

    it('finds the steep lot on a dome and the gentle one on its summit', () => {
        // R = 1000 centred at (1000, 1000). A lot at the summit is near level; one 800 m out sits
        // on ground of slope asin(0.8) = 53 degrees.
        const sampler = createHemisphereSampler({ centre: { x: 1000, y: 1000 }, radius: 1000 });
        const summit = square(1000, 1000, 60);
        const flank = square(1800, 1000, 60);
        const [atSummit, onFlank] = evaluatePolygonSlopes([summit, flank], sampler, {
            slopeThresholdDegrees: 30,
        });
        expect(atSummit.meanSlopeDegrees).toBeLessThan(3);
        expect(atSummit.buildable).toBe(true);
        expect(onFlank.meanSlopeDegrees).toBeGreaterThan(50);
        expect(onFlank.buildable).toBe(false);
        // The flank faces away from the summit — due +x.
        expect(onFlank.aspectDegrees).toBeCloseTo(0, 6);
    });

    it('gives two flanks of a ridge equal slope and opposite aspect', () => {
        const sampler = createRidgeSampler({
            crest: { x: 0, y: 0 },
            axis: { x: 0, y: 1 },
            halfWidth: 400,
            height: 200,
        });
        const [east, west] = evaluatePolygonSlopes([square(200, 0, 60), square(-200, 0, 60)], sampler, {
            slopeThresholdDegrees: 30,
        });
        expect(east.meanSlopeDegrees).toBeCloseTo(west.meanSlopeDegrees, 9);
        expect(east.aspectDegrees).toBeCloseTo(0, 6);
        expect(west.aspectDegrees).toBeCloseTo(180, 6);
        expect(east.buildable).toBe(west.buildable);
    });

    it('refuses a lot that hangs off the edge of the terrain, however gentle', () => {
        // Level ground, so slope can never be the reason — only the domain can.
        const sampler = createFlatSampler(0, squareDomain(1000));
        const [inside, straddling] = evaluatePolygonSlopes(
            [square(500, 500, 100), square(1000, 500, 200)],
            sampler,
            { slopeThresholdDegrees: 45 },
        );
        expect(inside.fullyInDomain).toBe(true);
        expect(inside.buildable).toBe(true);
        expect(straddling.fullyInDomain).toBe(false);
        expect(straddling.meanSlopeDegrees).toBe(0);
        expect(straddling.buildable).toBe(false);
    });

    it('honours the interior sample budget', () => {
        const sampler = createSlopeAspectPlaneSampler(10, 0);
        const sparse = evaluatePolygonSlopes([lots[0]], sampler, {
            slopeThresholdDegrees: 30,
            interiorSamples: 4,
        });
        const dense = evaluatePolygonSlopes([lots[0]], sampler, {
            slopeThresholdDegrees: 30,
            interiorSamples: 100,
        });
        expect(sparse[0].sampleCount).toBeLessThan(dense[0].sampleCount);
        // A plane is uniform, so more samples must not change the verdict.
        expect(sparse[0].meanSlopeDegrees).toBeCloseTo(dense[0].meanSlopeDegrees, 9);
    });

    it('handles a degenerate polygon without failing the whole batch', () => {
        const sampler = createSlopeAspectPlaneSampler(15, 0);
        const results = evaluatePolygonSlopes([[], lots[0]], sampler, { slopeThresholdDegrees: 30 });
        expect(results).toHaveLength(2);
        expect(results[0].sampleCount).toBe(0);
        expect(results[0].buildable).toBe(false);
        expect(results[1].meanSlopeDegrees).toBeCloseTo(15, 9);
    });
});
