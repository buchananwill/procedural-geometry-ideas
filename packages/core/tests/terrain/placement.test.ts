import { boundsOfPoints, fitPlacementToDomain } from '../../src/terrain/placement';
import { squareDomain } from '../../src/terrain/types';
import type { Vector2 } from '../../src/shared/types';

describe('boundsOfPoints', () => {
    it('finds the bounding box', () => {
        expect(boundsOfPoints([{ x: 1, y: 5 }, { x: -3, y: 2 }, { x: 4, y: -1 }])).toEqual({
            minX: -3,
            minY: -1,
            maxX: 4,
            maxY: 5,
        });
    });

    it('is degenerate but finite for an empty set', () => {
        expect(boundsOfPoints([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });
});

describe('fitPlacementToDomain', () => {
    const domain = squareDomain(2400);

    it('scales the longer axis to the requested fill', () => {
        // A 100-unit square at 80% fill of a 2400 m domain: 1920 m across, so 19.2 m per unit.
        const placement = fitPlacementToDomain(boundsOfPoints([
            { x: 0, y: 0 },
            { x: 100, y: 100 },
        ]), domain);
        expect(placement.metresPerUnit).toBeCloseTo(19.2, 9);
    });

    it('centres the polygon on the domain', () => {
        const placement = fitPlacementToDomain({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, domain);
        expect(placement.toMetres({ x: 50, y: 50 })).toEqual({ x: 1200, y: 1200 });
        expect(placement.toMetres({ x: 0, y: 0 })).toEqual({ x: 240, y: 240 });
        expect(placement.toMetres({ x: 100, y: 100 })).toEqual({ x: 2160, y: 2160 });
    });

    it('is uniform, so an oblong is not sheared', () => {
        // Twice as wide as tall: the width sets the scale and the height keeps the same one.
        const placement = fitPlacementToDomain({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, domain);
        expect(placement.metresPerUnit).toBeCloseTo(9.6, 9);
        const a = placement.toMetres({ x: 0, y: 0 });
        const b = placement.toMetres({ x: 200, y: 100 });
        expect(b.x - a.x).toBeCloseTo(1920, 6);
        expect(b.y - a.y).toBeCloseTo(960, 6);
    });

    it('round-trips', () => {
        const placement = fitPlacementToDomain({ minX: -40, minY: 12, maxX: 260, maxY: 90 }, domain);
        for (const point of [{ x: 0, y: 0 }, { x: 260, y: 90 }, { x: 111, y: -37 }] as Vector2[]) {
            const back = placement.fromMetres(placement.toMetres(point));
            expect(back.x).toBeCloseTo(point.x, 9);
            expect(back.y).toBeCloseTo(point.y, 9);
        }
    });

    it('honours a fill of 1', () => {
        const placement = fitPlacementToDomain({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, domain, {
            fill: 1,
        });
        expect(placement.metresPerUnit).toBeCloseTo(24, 9);
        expect(placement.toMetres({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(placement.toMetres({ x: 100, y: 100 })).toEqual({ x: 2400, y: 2400 });
    });

    it('falls back to 1 metre per unit for a polygon with no extent', () => {
        const placement = fitPlacementToDomain({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, domain);
        expect(placement.metresPerUnit).toBe(1);
        expect(placement.toMetres({ x: 5, y: 5 })).toEqual({ x: 1200, y: 1200 });
    });
});
