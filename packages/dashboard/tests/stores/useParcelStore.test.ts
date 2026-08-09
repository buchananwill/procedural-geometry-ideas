import {
    deriveSliceDefaults,
    effectiveSliceOptions,
    polygonArea,
    polygonPerimeter,
    useParcelStore,
} from '../../src/stores/useParcelStore';

const UNIT_SQUARE = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
];

// Zustand stores are singletons, so reset the slices these tests touch.
const resetStore = () => {
    useParcelStore.setState({
        depthPercent: 35,
        derived: deriveSliceDefaults(UNIT_SQUARE),
        overrides: {},
        splitIrregularity: 0.3,
        mitreToleranceDeg: 30,
        seed: 1,
    });
};

beforeEach(() => {
    resetStore();
});

describe('polygon measurements', () => {
    it('measures the perimeter around the closing edge', () => {
        expect(polygonPerimeter(UNIT_SQUARE)).toBeCloseTo(40, 12);
    });

    it('measures area regardless of winding', () => {
        expect(polygonArea(UNIT_SQUARE)).toBeCloseTo(100, 12);
        expect(polygonArea([...UNIT_SQUARE].reverse())).toBeCloseTo(100, 12);
    });

    it('reports zero for a polygon with too few vertices to enclose anything', () => {
        expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
        expect(polygonPerimeter([])).toBe(0);
    });
});

describe('deriveSliceDefaults', () => {
    it('scales widths off the perimeter and areas off the area', () => {
        const defaults = deriveSliceDefaults(UNIT_SQUARE);
        expect(defaults.maxWidth).toBeCloseTo(40 / 13, 12);
        expect(defaults.minWidth).toBeCloseTo(40 / 26, 12);
        expect(defaults.maxArea).toBeCloseTo(100 / 7, 12);
        expect(defaults.minArea).toBeCloseTo(100 / 70, 12);
    });

    it('keeps every bound strictly positive for a degenerate polygon', () => {
        const defaults = deriveSliceDefaults([]);
        expect(defaults.minWidth).toBeGreaterThan(0);
        expect(defaults.maxWidth).toBeGreaterThan(0);
        expect(defaults.minArea).toBeGreaterThan(0);
        expect(defaults.maxArea).toBeGreaterThan(0);
    });

    it('scales with the polygon, so a doubled polygon quadruples the areas', () => {
        const doubled = UNIT_SQUARE.map((v) => ({ x: v.x * 2, y: v.y * 2 }));
        const small = deriveSliceDefaults(UNIT_SQUARE);
        const large = deriveSliceDefaults(doubled);
        expect(large.maxWidth / small.maxWidth).toBeCloseTo(2, 12);
        expect(large.maxArea / small.maxArea).toBeCloseTo(4, 12);
    });
});

describe('effectiveSliceOptions', () => {
    it('uses the derived defaults when nothing is overridden', () => {
        const options = effectiveSliceOptions(useParcelStore.getState());
        expect(options.maxWidth).toBeCloseTo(40 / 13, 12);
        expect(options.seed).toBe(1);
        expect(options.splitIrregularity).toBeCloseTo(0.3, 12);
    });

    it('lets an override win over the derived value', () => {
        useParcelStore.getState().setSliceOption('maxWidth', 7);
        expect(effectiveSliceOptions(useParcelStore.getState()).maxWidth).toBe(7);
    });

    it('re-deriving for a new polygon leaves an override in place', () => {
        useParcelStore.getState().setSliceOption('minArea', 3);
        useParcelStore.getState().setDerived(deriveSliceDefaults(UNIT_SQUARE.map((v) => ({ x: v.x * 5, y: v.y * 5 }))));
        const options = effectiveSliceOptions(useParcelStore.getState());
        expect(options.minArea).toBe(3);
        expect(options.maxArea).toBeCloseTo(2500 / 7, 12);
    });

    it('clearing overrides restores every derived value', () => {
        useParcelStore.getState().setSliceOption('minArea', 3);
        useParcelStore.getState().setSliceOption('maxWidth', 7);
        useParcelStore.getState().clearOverrides();
        const options = effectiveSliceOptions(useParcelStore.getState());
        expect(options.minArea).toBeCloseTo(100 / 70, 12);
        expect(options.maxWidth).toBeCloseTo(40 / 13, 12);
    });
});

describe('depth and seed', () => {
    it('clamps the depth percentage into [1, 100]', () => {
        useParcelStore.getState().setDepthPercent(0);
        expect(useParcelStore.getState().depthPercent).toBe(1);
        useParcelStore.getState().setDepthPercent(500);
        expect(useParcelStore.getState().depthPercent).toBe(100);
    });

    it('clamps split irregularity into [0, 1]', () => {
        useParcelStore.getState().setSplitIrregularity(-2);
        expect(useParcelStore.getState().splitIrregularity).toBe(0);
        useParcelStore.getState().setSplitIrregularity(9);
        expect(useParcelStore.getState().splitIrregularity).toBe(1);
    });

    it('defaults the mitre tolerance to 30 degrees, unscaled by the polygon', () => {
        expect(useParcelStore.getState().mitreToleranceDeg).toBe(30);
    });

    it('clamps the mitre tolerance into [0, 180] degrees', () => {
        useParcelStore.getState().setMitreToleranceDeg(-30);
        expect(useParcelStore.getState().mitreToleranceDeg).toBe(0);
        useParcelStore.getState().setMitreToleranceDeg(270);
        expect(useParcelStore.getState().mitreToleranceDeg).toBe(180);
        useParcelStore.getState().setMitreToleranceDeg(95.5);
        expect(useParcelStore.getState().mitreToleranceDeg).toBe(95.5);
    });

    it('keeps the seed an integer, since sliceStrips indexes its generator with it', () => {
        useParcelStore.getState().setSeed(12.9);
        expect(useParcelStore.getState().seed).toBe(12);
    });

    it('re-rolls to a different seed', () => {
        const before = useParcelStore.getState().seed;
        const seen = new Set<number>();
        for (let i = 0; i < 20; i++) {
            useParcelStore.getState().rerollSeed();
            seen.add(useParcelStore.getState().seed);
        }
        expect(seen.has(before)).toBe(false);
        expect(seen.size).toBeGreaterThan(1);
    });
});

describe('layer visibility', () => {
    it('toggles one layer without disturbing the others', () => {
        const before = { ...useParcelStore.getState().layers };
        useParcelStore.getState().toggleLayer('skeleton');
        const after = useParcelStore.getState().layers;
        expect(after.skeleton).toBe(!before.skeleton);
        expect(after.parcels).toBe(before.parcels);
        expect(after.frontage).toBe(before.frontage);
    });

    it('sets a layer to an explicit value', () => {
        useParcelStore.getState().setLayer('parcels', false);
        expect(useParcelStore.getState().layers.parcels).toBe(false);
        useParcelStore.getState().setLayer('parcels', false);
        expect(useParcelStore.getState().layers.parcels).toBe(false);
    });
});
