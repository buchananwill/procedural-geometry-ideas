import {
    createFlatSampler,
    createHemisphereSampler,
    createPlaneSampler,
    createRidgeSampler,
    createSlopeAspectPlaneSampler,
} from '../../src/terrain/synthetic';
import { aspectDegrees, slopeDegrees, slopeGrade } from '../../src/terrain/slope';
import { isValidTerrainNormal, squareDomain, UNBOUNDED_DOMAIN } from '../../src/terrain/types';
import type { Vector2 } from '../../src/shared/types';

describe('the batch contract', () => {
    const sampler = createPlaneSampler({ gradient: { x: 0.25, y: -0.5 } });

    it('returns one sample per position', () => {
        for (const count of [0, 1, 2, 7, 100]) {
            const positions = Array.from({ length: count }, (_, i) => ({ x: i, y: 2 * i }));
            expect(sampler.sample(positions)).toHaveLength(count);
        }
    });

    it('preserves order', () => {
        // Heights on this plane are 0.25x - 0.5y, so each position has a distinct, predictable
        // height and a permuted input must come back permuted the same way.
        const positions: Vector2[] = [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 0, y: 4 },
            { x: -8, y: 6 },
            { x: 100, y: 100 },
        ];
        const expected = positions.map((p) => 0.25 * p.x - 0.5 * p.y);

        const inOrder = sampler.sample(positions).map((s) => s.height);
        expect(inOrder).toEqual(expected);

        const permutation = [3, 0, 4, 2, 1];
        const shuffled = permutation.map((i) => positions[i]);
        const shuffledHeights = sampler.sample(shuffled).map((s) => s.height);
        expect(shuffledHeights).toEqual(permutation.map((i) => expected[i]));
    });

    it('does not mutate the positions it is given', () => {
        const positions = [{ x: 3, y: 4 }];
        const before = JSON.stringify(positions);
        sampler.sample(positions);
        expect(JSON.stringify(positions)).toBe(before);
    });

    it('is pure — the same batch twice gives the same numbers', () => {
        const positions = [{ x: 1, y: 2 }, { x: -5, y: 9 }];
        expect(sampler.sample(positions)).toEqual(sampler.sample(positions));
    });

    it('emits contract-valid normals', () => {
        const positions = Array.from({ length: 50 }, (_, i) => ({ x: i * 3.7, y: -i * 1.1 }));
        for (const sample of sampler.sample(positions)) {
            expect(isValidTerrainNormal(sample.normal)).toBe(true);
        }
    });
});

describe('out-of-domain policy', () => {
    // A 45-degree plane rising in +x, over a 100 m square with its min corner at the origin.
    const sampler = createPlaneSampler({ gradient: { x: 1, y: 0 }, domain: squareDomain(100) });

    it('flags a position outside the domain', () => {
        const [inside, outside] = sampler.sample([{ x: 50, y: 50 }, { x: 150, y: 50 }]);
        expect(inside.inDomain).toBe(true);
        expect(outside.inDomain).toBe(false);
    });

    it('clamps to the domain edge rather than throwing or returning a sentinel', () => {
        const [clamped, edge] = sampler.sample([{ x: 150, y: 50 }, { x: 100, y: 50 }]);
        expect(clamped.height).toBe(edge.height);
        expect(clamped.height).toBe(100);
        expect(clamped.normal).toEqual(edge.normal);
        expect(Number.isFinite(clamped.height)).toBe(true);
    });

    it('clamps each axis independently, so a corner query lands on the corner', () => {
        const [corner, actual] = sampler.sample([{ x: -40, y: 900 }, { x: 0, y: 100 }]);
        expect(corner.height).toBe(actual.height);
        expect(corner.inDomain).toBe(false);
    });

    it('treats every position as in domain when the domain is unbounded', () => {
        const unbounded = createPlaneSampler({ gradient: { x: 1, y: 0 } });
        expect(unbounded.domain).toEqual(UNBOUNDED_DOMAIN);
        expect(unbounded.sample([{ x: 1e12, y: -1e12 }])[0].inDomain).toBe(true);
    });
});

describe('plane sampler', () => {
    it('has the slope its gradient implies, everywhere', () => {
        const sampler = createPlaneSampler({ gradient: { x: 1, y: 0 }, heightAtOrigin: 200 });
        const samples = sampler.sample([{ x: 0, y: 0 }, { x: -300, y: 40 }, { x: 17, y: -9 }]);
        for (const sample of samples) {
            expect(slopeDegrees(sample.normal)).toBeCloseTo(45, 12);
            expect(slopeGrade(sample.normal)).toBeCloseTo(1, 12);
            expect(aspectDegrees(sample.normal)).toBeCloseTo(180, 12);
        }
        expect(samples[0].height).toBe(200);
        expect(samples[1].height).toBe(-100);
    });

    it('builds a plane from a slope and an aspect', () => {
        for (const slope of [5, 18, 30, 47.5]) {
            for (const aspect of [-135, -90, 0, 60, 180]) {
                const sampler = createSlopeAspectPlaneSampler(slope, aspect);
                const [sample] = sampler.sample([{ x: 12, y: -7 }]);
                expect(slopeDegrees(sample.normal)).toBeCloseTo(slope, 10);
                expect(aspectDegrees(sample.normal)).toBeCloseTo(aspect, 10);
            }
        }
    });

    it('places a 30-degree slope at exactly the height its trigonometry demands', () => {
        // Falling towards +x at 30 degrees: over 100 m of run the ground drops 100 * tan(30).
        const sampler = createSlopeAspectPlaneSampler(30, 0, { heightAtOrigin: 1000 });
        const [sample] = sampler.sample([{ x: 100, y: 0 }]);
        expect(sample.height).toBeCloseTo(1000 - 100 * Math.tan(Math.PI / 6), 9);
    });
});

describe('hemisphere sampler', () => {
    const RADIUS = 100;
    const sampler = createHemisphereSampler({ centre: { x: 0, y: 0 }, radius: RADIUS });

    it('is level at the summit and stands exactly one radius tall', () => {
        const [summit] = sampler.sample([{ x: 0, y: 0 }]);
        expect(summit.height).toBe(RADIUS);
        expect(slopeDegrees(summit.normal)).toBe(0);
    });

    it('has slope asin(d / R) at horizontal distance d — the closed form', () => {
        // asin(0.5) = 30 deg, asin(sqrt(2)/2) = 45 deg, asin(sqrt(3)/2) = 60 deg.
        const cases: { distance: number; slope: number }[] = [
            { distance: 0, slope: 0 },
            { distance: 50, slope: 30 },
            { distance: (RADIUS * Math.SQRT2) / 2, slope: 45 },
            { distance: (RADIUS * Math.sqrt(3)) / 2, slope: 60 },
        ];
        for (const { distance, slope } of cases) {
            const [sample] = sampler.sample([{ x: distance, y: 0 }]);
            expect(slopeDegrees(sample.normal)).toBeCloseTo(slope, 9);
        }
    });

    it('has the height a sphere of that radius must have', () => {
        // At d = 60 on R = 100, height = sqrt(100^2 - 60^2) = 80. The 3-4-5 triangle.
        const [sample] = sampler.sample([{ x: 60, y: 0 }]);
        expect(sample.height).toBeCloseTo(80, 9);
    });

    it('faces radially outward, whatever direction that is', () => {
        for (const bearing of [0, 45, 90, 137, -30, 180]) {
            const radians = (bearing * Math.PI) / 180;
            const [sample] = sampler.sample([
                { x: 50 * Math.cos(radians), y: 50 * Math.sin(radians) },
            ]);
            expect(aspectDegrees(sample.normal)).toBeCloseTo(bearing, 9);
        }
    });

    it('is level ground beyond the rim', () => {
        const [outside] = sampler.sample([{ x: 150, y: 0 }]);
        expect(outside.height).toBe(0);
        expect(slopeDegrees(outside.normal)).toBe(0);
    });

    it('sits on the base height it is given', () => {
        const raised = createHemisphereSampler({ centre: { x: 10, y: 10 }, radius: 20, baseHeight: 700 });
        expect(raised.sample([{ x: 10, y: 10 }])[0].height).toBe(720);
        expect(raised.sample([{ x: 500, y: 500 }])[0].height).toBe(700);
    });
});

describe('ridge sampler', () => {
    // A ridge running along +y through x = 0: 50 m tall, falling to flat ground 100 m either side.
    const sampler = createRidgeSampler({
        crest: { x: 0, y: 0 },
        axis: { x: 0, y: 1 },
        halfWidth: 100,
        height: 50,
    });

    it('is level along the crest, at full height', () => {
        for (const y of [-500, 0, 500]) {
            const [sample] = sampler.sample([{ x: 0, y }]);
            expect(sample.height).toBeCloseTo(50, 12);
            expect(slopeDegrees(sample.normal)).toBeCloseTo(0, 12);
        }
    });

    it('is steepest exactly halfway down each flank, at atan(pi * h / 2w)', () => {
        // d/ds of (h/2)(1 + cos(pi s / w)) peaks at |s| = w/2 with magnitude pi*h/(2w).
        const steepest = (Math.atan((Math.PI * 50) / (2 * 100)) * 180) / Math.PI;
        expect(steepest).toBeCloseTo(38.1460, 4);
        for (const x of [50, -50]) {
            const [sample] = sampler.sample([{ x, y: 0 }]);
            expect(slopeDegrees(sample.normal)).toBeCloseTo(steepest, 9);
        }
    });

    it('gives the two flanks equal slope and exactly opposite aspect', () => {
        const [east, west] = sampler.sample([{ x: 50, y: 0 }, { x: -50, y: 0 }]);
        expect(slopeDegrees(east.normal)).toBeCloseTo(slopeDegrees(west.normal), 12);
        expect(aspectDegrees(east.normal)).toBeCloseTo(0, 9);
        expect(aspectDegrees(west.normal)).toBeCloseTo(180, 9);
    });

    it('is half height halfway down, by the raised cosine', () => {
        // cos(pi/2) = 0, so h = (50/2)(1 + 0) = 25.
        expect(sampler.sample([{ x: 50, y: 0 }])[0].height).toBeCloseTo(25, 12);
    });

    it('meets flat ground at the half width and stays there', () => {
        for (const x of [100, 101, 400, -100, -400]) {
            const [sample] = sampler.sample([{ x, y: 3 }]);
            expect(sample.height).toBeCloseTo(0, 12);
            expect(slopeDegrees(sample.normal)).toBeCloseTo(0, 12);
        }
    });

    it('runs along whatever axis it is given', () => {
        // The same ridge rotated to run along +x. Its flanks now face +y and -y.
        const rotated = createRidgeSampler({
            crest: { x: 0, y: 0 },
            axis: { x: 1, y: 0 },
            halfWidth: 100,
            height: 50,
        });
        const [north, south] = rotated.sample([{ x: 0, y: 50 }, { x: 0, y: -50 }]);
        expect(aspectDegrees(north.normal)).toBeCloseTo(90, 9);
        expect(aspectDegrees(south.normal)).toBeCloseTo(-90, 9);
    });
});

describe('flat sampler', () => {
    it('is level at a fixed height with no aspect', () => {
        const sampler = createFlatSampler(1234);
        const [sample] = sampler.sample([{ x: -9, y: 4 }]);
        expect(sample.height).toBe(1234);
        expect(slopeDegrees(sample.normal)).toBe(0);
        expect(aspectDegrees(sample.normal)).toBeNull();
    });
});
