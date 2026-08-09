import { muteOntoCanvas, parcelsToScene, slopeColour } from '../../src/scene/adapters/parcelsToScene';
import type { ParcelsSceneTerrain } from '../../src/scene/adapters/parcelsToScene';
import type { Parcel, PolygonSlopeStatistics } from '@proc-geo/core';
import type { SceneGroup, SceneLine, ScenePrimitive } from '../../src/scene/types';
import type { ParcelLayerVisibility } from '../../src/stores/useParcelStore';

const LAYERS: ParcelLayerVisibility = {
    skeleton: false,
    offsetRings: false,
    strips: false,
    parcels: true,
    frontage: false,
};

const SQUARE = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
];

function parcel(offsetX: number): Parcel {
    return {
        boundary: SQUARE.map((v) => ({ x: v.x + offsetX, y: v.y })),
        frontage: [{ x: offsetX, y: 0 }, { x: offsetX + 10, y: 0 }],
        area: 100,
    };
}

function statistics(meanSlopeDegrees: number, buildable: boolean): PolygonSlopeStatistics {
    return {
        sampleCount: 10,
        meanSlopeDegrees,
        minSlopeDegrees: meanSlopeDegrees,
        maxSlopeDegrees: meanSlopeDegrees,
        meanHeightMetres: 0,
        minHeightMetres: 0,
        maxHeightMetres: 0,
        aspectDegrees: 0,
        buildableFraction: buildable ? 1 : 0,
        fullyInDomain: true,
        buildable,
    };
}

function groupById(scene: ScenePrimitive[], id: string): SceneGroup {
    const group = scene.find((primitive) => primitive.type === 'group' && primitive.id === id);
    if (group === undefined || group.type !== 'group') throw new Error(`no group ${id}`);
    return group;
}

const baseParams = {
    vertices: SQUARE,
    skeleton: null,
    offsetRings: [],
    strips: [],
    parcelsByStrip: [[parcel(0), parcel(20)]],
    layers: LAYERS,
};

describe('slopeColour', () => {
    it('is green at level and deep red at the ramp top', () => {
        expect(slopeColour(0, 45)).toBe('#1a7f37');
        expect(slopeColour(45, 45)).toBe('#971928');
    });

    it('clamps beyond the ramp rather than extrapolating', () => {
        expect(slopeColour(90, 45)).toBe(slopeColour(45, 45));
        expect(slopeColour(-10, 45)).toBe(slopeColour(0, 45));
    });

    it('darkens monotonically — steeper never looks safer', () => {
        const luminance = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        // Rising to a bright yellow midpoint and falling to a dark red is what makes the ramp
        // readable, so what must hold is that the two ends are clearly separated and the top is
        // the darkest point of all.
        expect(luminance(slopeColour(22.5, 45))).toBeGreaterThan(luminance(slopeColour(0, 45)));
        expect(luminance(slopeColour(45, 45))).toBeLessThan(luminance(slopeColour(0, 45)));
    });

    it('rescales with the ramp top', () => {
        expect(slopeColour(30, 60)).toBe(slopeColour(45, 90));
    });

    it('never divides by a zero ramp', () => {
        expect(slopeColour(30, 0)).toBe(slopeColour(0, 45));
    });
});

describe('parcelsToScene without terrain', () => {
    it('emits an empty terrain field group and index-coloured parcels', () => {
        const scene = parcelsToScene(baseParams);
        expect(groupById(scene, 'group:terrain-field').children).toHaveLength(0);
        const parcels = groupById(scene, 'group:parcels').children as SceneLine[];
        expect(parcels).toHaveLength(2);
        expect(parcels[0].stroke.dash).toBeUndefined();
        expect(parcels[0].fill?.color).not.toBe(parcels[1].fill?.color);
    });

    it('draws the terrain field beneath everything else', () => {
        const scene = parcelsToScene(baseParams);
        expect((scene[0] as SceneGroup).id).toBe('group:terrain-field');
    });
});

describe('parcelsToScene with terrain', () => {
    const terrain = (thresholdDegrees: number, colourBySlope = true): ParcelsSceneTerrain => ({
        slopes: [statistics(12, 12 <= thresholdDegrees), statistics(38, 38 <= thresholdDegrees)],
        field: [
            { x: 0, y: 0, size: 5, slopeDegrees: 10, inDomain: true },
            { x: 5, y: 0, size: 5, slopeDegrees: 40, inDomain: false },
        ],
        thresholdDegrees,
        maxDisplaySlopeDegrees: 45,
        colourBySlope,
    });

    it('colours each parcel by its own mean slope', () => {
        const scene = parcelsToScene({ ...baseParams, terrain: terrain(30) });
        const parcels = groupById(scene, 'group:parcels').children as SceneLine[];
        expect(parcels[0].fill?.color).toBe(slopeColour(12, 45));
        expect(parcels[1].fill?.color).toBe(slopeColour(38, 45));
    });

    it('marks only the lots the threshold rejects', () => {
        const scene = parcelsToScene({ ...baseParams, terrain: terrain(30) });
        const parcels = groupById(scene, 'group:parcels').children as SceneLine[];
        expect(parcels[0].stroke.dash).toBeUndefined();
        expect(parcels[1].stroke.dash).toEqual([7, 4]);
        expect(parcels[1].stroke.color).toBe('#ffffff');
    });

    it('moves the marking when the threshold moves', () => {
        const lenient = groupById(parcelsToScene({ ...baseParams, terrain: terrain(45) }), 'group:parcels')
            .children as SceneLine[];
        const strict = groupById(parcelsToScene({ ...baseParams, terrain: terrain(5) }), 'group:parcels')
            .children as SceneLine[];
        expect(lenient.filter((p) => p.stroke.dash !== undefined)).toHaveLength(0);
        expect(strict.filter((p) => p.stroke.dash !== undefined)).toHaveLength(2);
    });

    it('keeps the marking when slope colouring is switched off', () => {
        const scene = parcelsToScene({ ...baseParams, terrain: terrain(30, false) });
        const parcels = groupById(scene, 'group:parcels').children as SceneLine[];
        expect(parcels[0].fill?.color).not.toBe(slopeColour(12, 45));
        expect(parcels[1].stroke.dash).toEqual([7, 4]);
    });

    it('draws the slope field, fading the cells off the edge of the terrain', () => {
        const scene = parcelsToScene({ ...baseParams, terrain: terrain(30) });
        const field = groupById(scene, 'group:terrain-field').children as SceneLine[];
        expect(field).toHaveLength(2);
        expect(field[0].closed).toBe(true);
        expect(field[0].fill?.color).toBe(muteOntoCanvas(slopeColour(10, 45), 0.5));
        expect(field[1].fill?.color).toBe(muteOntoCanvas(slopeColour(40, 45), 0.15));
        // Opaque, and slightly oversized so neighbours overlap: see the note in the adapter on why
        // both are required to stop the field reading as a grid.
        expect(field[0].fill?.opacity).toBeUndefined();
        expect(field[0].points).toEqual([0, 0, 5.1, 0, 5.1, 5.1, 0, 5.1]);
        expect(field[1].points[0]).toBe(5);
        expect(field[1].points[2]).toBeGreaterThan(10);
    });

    it('mutes towards the canvas background rather than past it', () => {
        expect(muteOntoCanvas('#ffffff', 1)).toBe('#ffffff');
        expect(muteOntoCanvas('#ffffff', 0)).toBe('#1a1b1e');
        expect(muteOntoCanvas('#1a1b1e', 0.5)).toBe('#1a1b1e');
    });

    it('leaves a parcel unmarked when terrain has no statistics for it', () => {
        const scene = parcelsToScene({
            ...baseParams,
            terrain: { ...terrain(30), slopes: [] },
        });
        const parcels = groupById(scene, 'group:parcels').children as SceneLine[];
        for (const drawn of parcels) expect(drawn.stroke.dash).toBeUndefined();
    });
});
