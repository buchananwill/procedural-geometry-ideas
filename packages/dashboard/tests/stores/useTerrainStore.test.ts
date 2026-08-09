import {
    DEFAULT_MAX_DISPLAY_SLOPE_DEGREES,
    DEFAULT_SLOPE_THRESHOLD_DEGREES,
    TERRAIN_SOURCES,
    useTerrainStore,
} from '../../src/stores/useTerrainStore';

// Zustand stores are singletons, so reset the slices these tests touch.
const resetStore = () => {
    useTerrainStore.setState({
        enabled: true,
        source: 'mapgen4',
        slopeThresholdDegrees: DEFAULT_SLOPE_THRESHOLD_DEGREES,
        maxDisplaySlopeDegrees: DEFAULT_MAX_DISPLAY_SLOPE_DEGREES,
        extentMetres: 2400,
        verticalScaleMetres: 500,
        planeSlopeDegrees: 25,
        planeAspectDegrees: 0,
        showSlopeField: true,
        colourBySlope: true,
    });
};

beforeEach(resetStore);

describe('terrain sources', () => {
    it('offers the real source and the synthetic ones', () => {
        expect(TERRAIN_SOURCES.map((source) => source.id)).toEqual([
            'mapgen4',
            'plane',
            'ridge',
            'dome',
            'flat',
        ]);
        for (const source of TERRAIN_SOURCES) {
            expect(source.label.length).toBeGreaterThan(0);
            expect(source.description.length).toBeGreaterThan(0);
        }
    });

    it('selects a source', () => {
        useTerrainStore.getState().setSource('ridge');
        expect(useTerrainStore.getState().source).toBe('ridge');
    });
});

describe('the slope threshold', () => {
    it('starts at 30 degrees', () => {
        expect(useTerrainStore.getState().slopeThresholdDegrees).toBe(30);
    });

    it('accepts a value in range', () => {
        useTerrainStore.getState().setSlopeThresholdDegrees(18.5);
        expect(useTerrainStore.getState().slopeThresholdDegrees).toBe(18.5);
    });

    it('clamps rather than accepting a slope no ground can have', () => {
        useTerrainStore.getState().setSlopeThresholdDegrees(-10);
        expect(useTerrainStore.getState().slopeThresholdDegrees).toBe(0);
        useTerrainStore.getState().setSlopeThresholdDegrees(1000);
        expect(useTerrainStore.getState().slopeThresholdDegrees).toBe(89);
    });
});

describe('scale parameters', () => {
    it('clamps the terrain extent to something a region could sit on', () => {
        useTerrainStore.getState().setExtentMetres(0);
        expect(useTerrainStore.getState().extentMetres).toBe(100);
        useTerrainStore.getState().setExtentMetres(1e9);
        expect(useTerrainStore.getState().extentMetres).toBe(20000);
    });

    it('clamps the vertical scale', () => {
        useTerrainStore.getState().setVerticalScaleMetres(-5);
        expect(useTerrainStore.getState().verticalScaleMetres).toBe(10);
        useTerrainStore.getState().setVerticalScaleMetres(99999);
        expect(useTerrainStore.getState().verticalScaleMetres).toBe(3000);
    });

    it('clamps the plane slope below vertical', () => {
        useTerrainStore.getState().setPlaneSlopeDegrees(120);
        expect(useTerrainStore.getState().planeSlopeDegrees).toBe(85);
    });

    it('wraps the plane aspect instead of clamping it — a bearing has no ends', () => {
        const store = useTerrainStore.getState();
        store.setPlaneAspectDegrees(190);
        expect(useTerrainStore.getState().planeAspectDegrees).toBe(-170);
        store.setPlaneAspectDegrees(-190);
        expect(useTerrainStore.getState().planeAspectDegrees).toBe(170);
        store.setPlaneAspectDegrees(540);
        expect(useTerrainStore.getState().planeAspectDegrees).toBe(-180);
        store.setPlaneAspectDegrees(45);
        expect(useTerrainStore.getState().planeAspectDegrees).toBe(45);
    });
});

describe('display toggles', () => {
    it('turns terrain evaluation off and on', () => {
        useTerrainStore.getState().setEnabled(false);
        expect(useTerrainStore.getState().enabled).toBe(false);
        useTerrainStore.getState().setEnabled(true);
        expect(useTerrainStore.getState().enabled).toBe(true);
    });

    it('switches the slope field and the slope colouring independently', () => {
        useTerrainStore.getState().setShowSlopeField(false);
        useTerrainStore.getState().setColourBySlope(false);
        expect(useTerrainStore.getState().showSlopeField).toBe(false);
        expect(useTerrainStore.getState().colourBySlope).toBe(false);
        expect(useTerrainStore.getState().enabled).toBe(true);
    });
});
