import {
    aspectDegrees,
    aspectRadians,
    downhillDirection,
    normalFromGradient,
    normaliseUpward,
    slopeDegrees,
    slopeGrade,
    slopeRadians,
    uphillDirection,
} from '../../src/terrain/slope';
import { isValidTerrainNormal } from '../../src/terrain/types';
import type { Vector3 } from '../../src/terrain/types';

/** Every number asserted here is derived by hand in the comment above it. No snapshots. */

const SQRT_2 = Math.SQRT2;

describe('slope from a normal', () => {
    it('reads level ground as zero slope', () => {
        const up: Vector3 = { x: 0, y: 0, z: 1 };
        expect(slopeRadians(up)).toBe(0);
        expect(slopeDegrees(up)).toBe(0);
        expect(slopeGrade(up)).toBe(0);
    });

    it('reads a 45-degree normal as 45 degrees and grade 1', () => {
        // A plane with df/dx = 1 has normal normalize(-1, 0, 1) = (-1, 0, 1)/sqrt(2).
        const normal: Vector3 = { x: -1 / SQRT_2, y: 0, z: 1 / SQRT_2 };
        expect(slopeDegrees(normal)).toBeCloseTo(45, 12);
        expect(slopeGrade(normal)).toBeCloseTo(1, 12);
        expect(slopeRadians(normal)).toBeCloseTo(Math.PI / 4, 12);
    });

    it('reads a 30-degree normal as 30 degrees and grade tan(30)', () => {
        // cos(30) = sqrt(3)/2 vertical, sin(30) = 1/2 horizontal.
        const normal: Vector3 = { x: 0.5, y: 0, z: Math.sqrt(3) / 2 };
        expect(slopeDegrees(normal)).toBeCloseTo(30, 12);
        expect(slopeGrade(normal)).toBeCloseTo(Math.tan(Math.PI / 6), 12);
        expect(slopeGrade(normal)).toBeCloseTo(1 / Math.sqrt(3), 12);
    });

    it('reads a 60-degree normal as 60 degrees and grade sqrt(3)', () => {
        const normal: Vector3 = { x: Math.sqrt(3) / 2, y: 0, z: 0.5 };
        expect(slopeDegrees(normal)).toBeCloseTo(60, 12);
        expect(slopeGrade(normal)).toBeCloseTo(Math.sqrt(3), 12);
    });

    it('survives a normal whose z is a hair over 1 from accumulated rounding', () => {
        expect(slopeRadians({ x: 0, y: 0, z: 1 + 1e-15 })).toBe(0);
        expect(Number.isNaN(slopeRadians({ x: 0, y: 0, z: 1.0000000001 }))).toBe(false);
    });

    it('reports a vertical wall as infinite grade', () => {
        expect(slopeGrade({ x: 1, y: 0, z: 0 })).toBe(Infinity);
    });
});

describe('aspect', () => {
    it('points down the fall line, opposite the gradient', () => {
        // Ground rising towards +x: uphill is +x, so the aspect — which is the downhill
        // bearing — must be 180 degrees.
        const normal = normalFromGradient({ x: 1, y: 0 });
        expect(aspectDegrees(normal)).toBeCloseTo(180, 12);
        expect(downhillDirection(normal)?.x).toBeCloseTo(-1, 12);
        expect(downhillDirection(normal)?.y).toBeCloseTo(0, 12);
        expect(uphillDirection(normal)?.x).toBeCloseTo(1, 12);
        expect(uphillDirection(normal)?.y).toBeCloseTo(0, 12);
    });

    it('reports a bearing of 90 degrees for ground falling towards +y', () => {
        // df/dy = -1 means height decreases with y, so downhill is +y.
        const normal = normalFromGradient({ x: 0, y: -1 });
        expect(aspectDegrees(normal)).toBeCloseTo(90, 12);
        expect(aspectRadians(normal)).toBeCloseTo(Math.PI / 2, 12);
    });

    it('reports 45 degrees for ground falling equally in +x and +y', () => {
        const normal = normalFromGradient({ x: -1, y: -1 });
        expect(aspectDegrees(normal)).toBeCloseTo(45, 12);
        const downhill = downhillDirection(normal);
        expect(downhill?.x).toBeCloseTo(1 / SQRT_2, 12);
        expect(downhill?.y).toBeCloseTo(1 / SQRT_2, 12);
    });

    it('is undefined on level ground rather than defaulting to a direction', () => {
        const up: Vector3 = { x: 0, y: 0, z: 1 };
        expect(aspectRadians(up)).toBeNull();
        expect(aspectDegrees(up)).toBeNull();
        expect(downhillDirection(up)).toBeNull();
        expect(uphillDirection(up)).toBeNull();
    });

    it('sweeps the full circle as the gradient rotates', () => {
        for (let bearing = -170; bearing <= 180; bearing += 10) {
            const radians = (bearing * Math.PI) / 180;
            // Gradient points uphill, so it is the negation of the downhill bearing.
            const normal = normalFromGradient({ x: -Math.cos(radians), y: -Math.sin(radians) });
            expect(aspectDegrees(normal)).toBeCloseTo(bearing, 10);
        }
    });
});

describe('normalFromGradient', () => {
    it('produces a contract-valid normal for any gradient', () => {
        for (const gradient of [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: -3, y: 7 },
            { x: 1e-9, y: -1e-9 },
            { x: 1e6, y: 1e6 },
        ]) {
            expect(isValidTerrainNormal(normalFromGradient(gradient))).toBe(true);
        }
    });

    it('round-trips through slopeGrade and uphillDirection', () => {
        const gradient = { x: 0.3, y: -0.4 }; // magnitude exactly 0.5
        const normal = normalFromGradient(gradient);
        expect(slopeGrade(normal)).toBeCloseTo(0.5, 12);
        expect(slopeDegrees(normal)).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 12);
        const uphill = uphillDirection(normal);
        expect(uphill?.x).toBeCloseTo(0.6, 12);
        expect(uphill?.y).toBeCloseTo(-0.8, 12);
    });
});

describe('normaliseUpward', () => {
    it('normalises an upward vector in place of the caller', () => {
        const normal = normaliseUpward({ x: 0, y: 3, z: 4 });
        expect(normal.y).toBeCloseTo(0.6, 12);
        expect(normal.z).toBeCloseTo(0.8, 12);
        expect(isValidTerrainNormal(normal)).toBe(true);
    });

    it('flips a downward vector rather than rejecting it', () => {
        const normal = normaliseUpward({ x: 0, y: -3, z: -4 });
        expect(normal.y).toBeCloseTo(0.6, 12);
        expect(normal.z).toBeCloseTo(0.8, 12);
    });

    it('falls back to straight up for degenerate input', () => {
        expect(normaliseUpward({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
        // A horizontal "normal" cannot come from a height field; treating it as up keeps the
        // z > 0 half of the contract rather than emitting an invalid normal.
        expect(normaliseUpward({ x: 1, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    });
});
