import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { DEFAULT_HORIZONTAL_EXTENT_METRES, DEFAULT_VERTICAL_SCALE_METRES } from '@proc-geo/core';

/**
 * Which terrain the parcels are judged against.
 *
 * `mapgen4` is the real one — a window of the generator's own output, resampled through the seam.
 * The rest are the synthetic samplers, and they are not just filler: a plane at a stated angle is
 * the only way to confirm at a glance that the slope colouring and the threshold marking mean what
 * they claim, because every lot on it must come out the same colour and flip together.
 */
export type TerrainSourceId = 'mapgen4' | 'plane' | 'ridge' | 'dome' | 'flat';

export interface TerrainSourceOption {
    id: TerrainSourceId;
    label: string;
    description: string;
}

export const TERRAIN_SOURCES: TerrainSourceOption[] = [
    { id: 'mapgen4', label: 'mapgen4 flank', description: 'A real 2.4 km window of mapgen4 terrain' },
    { id: 'plane', label: 'Tilted plane', description: 'Constant slope and aspect — the reference case' },
    { id: 'ridge', label: 'Ridge', description: 'A crest falling away to flat ground either side' },
    { id: 'dome', label: 'Dome', description: 'Level at the summit, vertical at the rim' },
    { id: 'flat', label: 'Flat', description: 'Level ground — every lot buildable' },
];

export interface TerrainStoreState {
    /** When off, the page behaves exactly as it did before terrain existed. */
    enabled: boolean;
    source: TerrainSourceId;
    /** Slope in degrees at or below which a lot counts as buildable. */
    slopeThresholdDegrees: number;
    /**
     * Top of the slope colour ramp, in degrees. Slopes at or above it all read as the ramp's last
     * colour, so this is a contrast control rather than a threshold.
     */
    maxDisplaySlopeDegrees: number;
    /** Side length of the terrain patch in metres — the ground the marked region is placed on. */
    extentMetres: number;
    /** mapgen4 only: metres of height per 1.0 of its unitless elevation. */
    verticalScaleMetres: number;
    /** Plane source only. */
    planeSlopeDegrees: number;
    planeAspectDegrees: number;
    /** Draws the sampled slope field under the parcels, so the terrain itself is visible. */
    showSlopeField: boolean;
    /** Colours parcels by mean slope instead of by index. */
    colourBySlope: boolean;

    setEnabled: (enabled: boolean) => void;
    setSource: (source: TerrainSourceId) => void;
    setSlopeThresholdDegrees: (degrees: number) => void;
    setMaxDisplaySlopeDegrees: (degrees: number) => void;
    setExtentMetres: (metres: number) => void;
    setVerticalScaleMetres: (metres: number) => void;
    setPlaneSlopeDegrees: (degrees: number) => void;
    setPlaneAspectDegrees: (degrees: number) => void;
    setShowSlopeField: (show: boolean) => void;
    setColourBySlope: (colour: boolean) => void;
}

/**
 * 30 degrees. Not arbitrary: it is roughly where a chalet stops being a matter of grading a pad and
 * starts being a matter of retaining walls, and on the shipped mapgen4 window it rejects about a
 * quarter of the ground — enough for the marking to say something.
 */
export const DEFAULT_SLOPE_THRESHOLD_DEGREES = 30;

/** Ramp top. Above 45 degrees the distinctions stop mattering; everything there is unbuildable. */
export const DEFAULT_MAX_DISPLAY_SLOPE_DEGREES = 45;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useTerrainStore = create<TerrainStoreState>()(
    immer((set) => ({
        enabled: true,
        source: 'mapgen4',
        slopeThresholdDegrees: DEFAULT_SLOPE_THRESHOLD_DEGREES,
        maxDisplaySlopeDegrees: DEFAULT_MAX_DISPLAY_SLOPE_DEGREES,
        extentMetres: DEFAULT_HORIZONTAL_EXTENT_METRES,
        verticalScaleMetres: DEFAULT_VERTICAL_SCALE_METRES,
        planeSlopeDegrees: 25,
        planeAspectDegrees: 0,
        showSlopeField: true,
        colourBySlope: true,

        setEnabled: (enabled) => set((state) => { state.enabled = enabled; }),
        setSource: (source) => set((state) => { state.source = source; }),
        setSlopeThresholdDegrees: (degrees) =>
            set((state) => { state.slopeThresholdDegrees = clamp(degrees, 0, 89); }),
        setMaxDisplaySlopeDegrees: (degrees) =>
            set((state) => { state.maxDisplaySlopeDegrees = clamp(degrees, 5, 90); }),
        setExtentMetres: (metres) => set((state) => { state.extentMetres = clamp(metres, 100, 20000); }),
        setVerticalScaleMetres: (metres) =>
            set((state) => { state.verticalScaleMetres = clamp(metres, 10, 3000); }),
        setPlaneSlopeDegrees: (degrees) =>
            set((state) => { state.planeSlopeDegrees = clamp(degrees, 0, 85); }),
        setPlaneAspectDegrees: (degrees) =>
            set((state) => {
                // Wrapped rather than clamped: a bearing has no ends.
                const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
                state.planeAspectDegrees = wrapped;
            }),
        setShowSlopeField: (show) => set((state) => { state.showSlopeField = show; }),
        setColourBySlope: (colour) => set((state) => { state.colourBySlope = colour; }),
    })),
);
