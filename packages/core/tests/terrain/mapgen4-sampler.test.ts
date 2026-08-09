import {
    DEFAULT_HORIZONTAL_EXTENT_METRES,
    DEFAULT_VERTICAL_SCALE_METRES,
    createMapgen4Sampler,
    mapgen4ReliefMetres,
} from '../../src/terrain/mapgen4-sampler';
import {
    MAPGEN4_PATCH,
    MAPGEN4_PATCH_ELEVATION_RANGE,
    MAPGEN4_PATCH_WINDOW_UNITS,
} from '../../src/terrain/mapgen4-patch-data';
import { slopeDegrees } from '../../src/terrain/slope';
import { isValidTerrainNormal } from '../../src/terrain/types';
import type { Vector2 } from '../../src/shared/types';

/** A deterministic lattice over the patch, so every test looks at the same real terrain. */
function lattice(extent: number, perSide: number): Vector2[] {
    const positions: Vector2[] = [];
    for (let row = 0; row < perSide; row++) {
        for (let column = 0; column < perSide; column++) {
            positions.push({
                x: (extent * (column + 0.5)) / perSide,
                y: (extent * (row + 0.5)) / perSide,
            });
        }
    }
    return positions;
}

describe('the shipped patch', () => {
    it('is a consistent mesh', () => {
        const regionCount = MAPGEN4_PATCH.regionElevation.length;
        expect(MAPGEN4_PATCH.positions).toHaveLength(regionCount * 2);
        expect(MAPGEN4_PATCH.triangles).toHaveLength(MAPGEN4_PATCH.triangleElevation.length * 3);
        expect(regionCount).toBeGreaterThan(100);
        expect(MAPGEN4_PATCH.triangleElevation.length).toBeGreaterThan(200);
        for (const index of MAPGEN4_PATCH.triangles) {
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(regionCount);
        }
    });

    it('is all land, as a resort region must be', () => {
        expect(MAPGEN4_PATCH_ELEVATION_RANGE.min).toBeGreaterThan(0);
        expect(MAPGEN4_PATCH_ELEVATION_RANGE.max).toBeLessThanOrEqual(1);
        for (const elevation of MAPGEN4_PATCH.regionElevation) {
            expect(elevation).toBeGreaterThan(0);
        }
    });

    it('covers the window it claims to', () => {
        // Positions are normalised to the window, and every triangle touching it is kept whole, so
        // the covered area must reach past [0, 1] in both axes rather than stopping short of it.
        let minX = Infinity;
        let maxX = -Infinity;
        for (let r = 0; r < MAPGEN4_PATCH.regionElevation.length; r++) {
            minX = Math.min(minX, MAPGEN4_PATCH.positions[2 * r]);
            maxX = Math.max(maxX, MAPGEN4_PATCH.positions[2 * r]);
        }
        expect(minX).toBeLessThanOrEqual(0);
        expect(maxX).toBeGreaterThanOrEqual(1);
    });
});

describe('mapgen4 sampler — the seam contract', () => {
    const sampler = createMapgen4Sampler();

    it('returns one sample per position, in order', () => {
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 12);
        const samples = sampler.sample(positions);
        expect(samples).toHaveLength(positions.length);

        // Permuting the input must permute the output identically — checked against heights, which
        // vary enough across this patch to identify a position.
        const permutation = [17, 3, 100, 42, 0, 143];
        const shuffled = sampler.sample(permutation.map((i) => positions[i]));
        expect(shuffled.map((s) => s.height)).toEqual(permutation.map((i) => samples[i].height));
    });

    it('handles an empty batch', () => {
        expect(sampler.sample([])).toEqual([]);
    });

    it('emits contract-valid normals everywhere on the patch', () => {
        for (const sample of sampler.sample(lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 40))) {
            expect(isValidTerrainNormal(sample.normal)).toBe(true);
            expect(Number.isFinite(sample.height)).toBe(true);
        }
    });

    it('is total at and beyond the domain corners', () => {
        const extent = DEFAULT_HORIZONTAL_EXTENT_METRES;
        const positions: Vector2[] = [
            { x: 0, y: 0 },
            { x: extent, y: 0 },
            { x: 0, y: extent },
            { x: extent, y: extent },
            { x: -5000, y: -5000 },
            { x: 1e9, y: 1e9 },
        ];
        const samples = sampler.sample(positions);
        expect(samples).toHaveLength(positions.length);
        for (const sample of samples) {
            expect(Number.isFinite(sample.height)).toBe(true);
            expect(isValidTerrainNormal(sample.normal)).toBe(true);
        }
        expect(samples[0].inDomain).toBe(true);
        expect(samples[4].inDomain).toBe(false);
        expect(samples[5].inDomain).toBe(false);
    });

    it('clamps an outside position onto the domain edge', () => {
        const extent = DEFAULT_HORIZONTAL_EXTENT_METRES;
        const [outside, edge] = sampler.sample([{ x: extent + 900, y: 1200 }, { x: extent, y: 1200 }]);
        expect(outside.height).toBe(edge.height);
        expect(outside.normal).toEqual(edge.normal);
        expect(outside.inDomain).toBe(false);
        expect(edge.inDomain).toBe(true);
    });

    it('is pure', () => {
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 7);
        expect(sampler.sample(positions)).toEqual(sampler.sample(positions));
        expect(createMapgen4Sampler().sample(positions)).toEqual(sampler.sample(positions));
    });

    it('is continuous — neighbouring positions give neighbouring heights', () => {
        // 383 m of relief over 2400 m cannot produce a 50 m step across 1 m of ground. A point
        // location that silently fell through to the wrong triangle would show up here.
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 30);
        const nudged = positions.map((p) => ({ x: p.x + 1, y: p.y }));
        const a = sampler.sample(positions);
        const b = sampler.sample(nudged);
        for (let i = 0; i < a.length; i++) {
            expect(Math.abs(a[i].height - b[i].height)).toBeLessThan(5);
        }
    });
});

describe('the metric mapping', () => {
    it('reports the scale it was built with', () => {
        const sampler = createMapgen4Sampler();
        expect(sampler.metrics.horizontalExtentMetres).toBe(2400);
        expect(sampler.metrics.verticalScaleMetres).toBe(500);
        expect(sampler.metrics.metresPerMapUnit).toBeCloseTo(2400 / MAPGEN4_PATCH_WINDOW_UNITS, 9);
        expect(sampler.metrics.metresPerMapUnit).toBeCloseTo(21.818, 3);
        expect(sampler.domain).toEqual({ minX: 0, minY: 0, maxX: 2400, maxY: 2400 });
    });

    it('turns unitless elevation into the relief it claims', () => {
        const sampler = createMapgen4Sampler();
        const range = MAPGEN4_PATCH_ELEVATION_RANGE;
        expect(sampler.metrics.minHeightMetres).toBeCloseTo(range.min * 500, 6);
        expect(sampler.metrics.maxHeightMetres).toBeCloseTo(range.max * 500, 6);
        expect(sampler.metrics.reliefMetres).toBeCloseTo((range.max - range.min) * 500, 6);
        // 0.765 of an elevation unit across the window, at 500 m per unit.
        expect(sampler.metrics.reliefMetres).toBeCloseTo(382.6, 1);
        expect(mapgen4ReliefMetres()).toBeCloseTo(sampler.metrics.reliefMetres, 6);
        expect(mapgen4ReliefMetres(1000)).toBeCloseTo(2 * sampler.metrics.reliefMetres, 6);
    });

    it('scales height linearly with the vertical scale', () => {
        const single = createMapgen4Sampler({ verticalScaleMetres: 500 });
        const double = createMapgen4Sampler({ verticalScaleMetres: 1000 });
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 10);
        const a = single.sample(positions);
        const b = double.sample(positions);
        for (let i = 0; i < a.length; i++) {
            expect(b[i].height).toBeCloseTo(2 * a[i].height, 6);
        }
    });

    it('offsets height by the sea level it is given, leaving slope untouched', () => {
        const raised = createMapgen4Sampler({ seaLevelMetres: 1500 });
        const base = createMapgen4Sampler();
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 8);
        const a = base.sample(positions);
        const b = raised.sample(positions);
        for (let i = 0; i < a.length; i++) {
            expect(b[i].height).toBeCloseTo(a[i].height + 1500, 6);
            expect(b[i].normal.x).toBeCloseTo(a[i].normal.x, 12);
            expect(b[i].normal.y).toBeCloseTo(a[i].normal.y, 12);
            expect(b[i].normal.z).toBeCloseTo(a[i].normal.z, 12);
        }
    });

    it('leaves the terrain shape unchanged under a uniform rescale of both axes', () => {
        // Doubling the ground extent and the vertical scale together is a similarity transform of
        // the whole surface, so every normal must come out identical and every height exactly
        // doubled. This is the sharpest check that the two scale parameters mean what they say.
        const base = createMapgen4Sampler({ horizontalExtentMetres: 2400, verticalScaleMetres: 500 });
        const scaled = createMapgen4Sampler({ horizontalExtentMetres: 4800, verticalScaleMetres: 1000 });
        const positions = lattice(2400, 12);
        const a = base.sample(positions);
        const b = scaled.sample(positions.map((p) => ({ x: p.x * 2, y: p.y * 2 })));
        for (let i = 0; i < a.length; i++) {
            expect(b[i].height).toBeCloseTo(2 * a[i].height, 6);
            expect(b[i].normal.x).toBeCloseTo(a[i].normal.x, 9);
            expect(b[i].normal.y).toBeCloseTo(a[i].normal.y, 9);
            expect(b[i].normal.z).toBeCloseTo(a[i].normal.z, 9);
        }
    });

    it('steepens monotonically as the vertical scale rises', () => {
        const positions = lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 14);
        const gentle = createMapgen4Sampler({ verticalScaleMetres: 250 }).sample(positions);
        const steep = createMapgen4Sampler({ verticalScaleMetres: 1000 }).sample(positions);
        for (let i = 0; i < positions.length; i++) {
            const a = slopeDegrees(gentle[i].normal);
            const b = slopeDegrees(steep[i].normal);
            if (a > 0.5) expect(b).toBeGreaterThan(a);
        }
    });
});

describe('the default scale as a ski resort', () => {
    // These are the numbers the defaults were chosen to produce. If the patch or the mapping ever
    // changes, this is where the change announces itself rather than quietly moving every verdict.
    const sampler = createMapgen4Sampler();
    const samples = sampler.sample(lattice(DEFAULT_HORIZONTAL_EXTENT_METRES, 60));
    const slopes = samples.map((s) => slopeDegrees(s.normal)).sort((a, b) => a - b);
    const mean = slopes.reduce((total, slope) => total + slope, 0) / slopes.length;

    it('has a mean slope in the low twenties', () => {
        expect(mean).toBeGreaterThan(18);
        expect(mean).toBeLessThan(26);
    });

    it('spreads across the buildable threshold instead of sitting on one side of it', () => {
        const steep = slopes.filter((slope) => slope > 30).length / slopes.length;
        expect(steep).toBeGreaterThan(0.1);
        expect(steep).toBeLessThan(0.5);
    });

    it('has gentle ground as well as steep', () => {
        expect(slopes[0]).toBeLessThan(8);
        expect(slopes[slopes.length - 1]).toBeGreaterThan(35);
    });

    it('carries a few hundred metres of relief, not thousands', () => {
        expect(sampler.metrics.reliefMetres).toBeGreaterThan(200);
        expect(sampler.metrics.reliefMetres).toBeLessThan(800);
    });

    it('is flatter than mapgen4 renders it, deliberately', () => {
        // mapgen4's own renderer draws elevation 1.0 as 50 map units, which over this window is
        // 50 * 2400 / 110 metres. The default is well under that.
        const mapgen4Own = (50 * 2400) / MAPGEN4_PATCH_WINDOW_UNITS;
        expect(mapgen4Own).toBeCloseTo(1090.9, 1);
        expect(DEFAULT_VERTICAL_SCALE_METRES).toBeLessThan(mapgen4Own);
    });
});
