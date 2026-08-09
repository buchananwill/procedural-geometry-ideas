import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SliceOptions, Vector2 } from '@proc-geo/core';

/**
 * The slice parameters whose sensible value depends on how big the polygon is.
 *
 * `splitIrregularity` and `seed` are deliberately absent: irregularity is a taste dial in `[0, 1]`
 * and a seed is an arbitrary integer, so neither has anything to derive from.
 */
export type DerivableSliceKey = 'minArea' | 'maxArea' | 'minWidth' | 'maxWidth';

export type DerivedSliceOptions = Pick<SliceOptions, DerivableSliceKey>;

/** Which layers of the pipeline are drawn. Each is independently switchable. */
export interface ParcelLayerVisibility {
    skeleton: boolean;
    offsetRings: boolean;
    strips: boolean;
    parcels: boolean;
    frontage: boolean;
}

export interface ParcelStoreState {
    /**
     * Inward depth as a percentage of `computeMaxOffset`, in `[1, 100]`.
     *
     * A percentage rather than an absolute distance because the absolute one is meaningless without
     * the polygon: the same 40 units is the whole block on one shape and a kerb on another. At a low
     * percentage the parcels form a perimeter band around an unallocated core; at 100 they tile the
     * region.
     */
    depthPercent: number;
    /** Defaults computed from the polygon's own perimeter and area. See `deriveSliceDefaults`. */
    derived: DerivedSliceOptions;
    /**
     * Values the user has typed or dragged, which win over `derived`.
     *
     * Kept as a sparse overlay rather than written into a single flat options object so that a
     * polygon change can re-derive the untouched parameters without silently discarding the ones
     * the user set on purpose.
     */
    overrides: Partial<DerivedSliceOptions>;
    splitIrregularity: number;
    seed: number;

    layers: ParcelLayerVisibility;

    setDepthPercent: (percent: number) => void;
    /** Replace the polygon-derived defaults. Overrides are left alone. */
    setDerived: (derived: DerivedSliceOptions) => void;
    /** Override one derived parameter with a user-chosen value. */
    setSliceOption: (key: DerivableSliceKey, value: number) => void;
    /** Drop every override, so the polygon-derived defaults apply again. */
    clearOverrides: () => void;
    setSplitIrregularity: (value: number) => void;
    setSeed: (seed: number) => void;
    rerollSeed: () => void;
    toggleLayer: (layer: keyof ParcelLayerVisibility) => void;
    setLayer: (layer: keyof ParcelLayerVisibility, visible: boolean) => void;
}

/** Fractions of perimeter and area that produce village-scale lots on the fixtures in this repo. */
const MAX_WIDTH_PERIMETER_FRACTION = 13;
const MIN_WIDTH_PERIMETER_FRACTION = 26;
const MAX_AREA_FRACTION = 7;
const MIN_AREA_FRACTION = 70;

/** Absolute floor, so a degenerate polygon cannot hand `sliceStrips` a zero or negative bound. */
const SMALLEST_SENSIBLE = 1e-6;

export function polygonPerimeter(vertices: Vector2[]): number {
    if (vertices.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
}

export function polygonArea(vertices: Vector2[]): number {
    if (vertices.length < 3) return 0;
    let area = 0;
    const origin = vertices[0];
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return Math.abs(area / 2);
}

/**
 * Slice bounds scaled to the polygon itself.
 *
 * Fixed numbers are useless here because the demo polygons span three orders of magnitude: a
 * `maxWidth` of 30 is a whole frontage on one fixture and invisible on another, and either way the
 * page would open showing nothing until the user guessed the scale. Widths come off the perimeter
 * and areas off the enclosed area, so the lot count stays roughly constant as the polygon is
 * resized.
 */
export function deriveSliceDefaults(vertices: Vector2[]): DerivedSliceOptions {
    const perimeter = polygonPerimeter(vertices);
    const area = polygonArea(vertices);
    return {
        maxWidth: Math.max(perimeter / MAX_WIDTH_PERIMETER_FRACTION, SMALLEST_SENSIBLE),
        minWidth: Math.max(perimeter / MIN_WIDTH_PERIMETER_FRACTION, SMALLEST_SENSIBLE / 2),
        maxArea: Math.max(area / MAX_AREA_FRACTION, SMALLEST_SENSIBLE),
        minArea: Math.max(area / MIN_AREA_FRACTION, SMALLEST_SENSIBLE / 2),
    };
}

/** Just the state `effectiveSliceOptions` reads, so callers need not hold a whole store. */
export type SliceOptionSources = Pick<
    ParcelStoreState,
    'derived' | 'overrides' | 'splitIrregularity' | 'seed'
>;

/** The values the pipeline actually runs with: derived defaults with any user overrides on top. */
export function effectiveSliceOptions(state: SliceOptionSources): SliceOptions {
    return {
        ...state.derived,
        ...state.overrides,
        splitIrregularity: state.splitIrregularity,
        seed: state.seed,
    };
}

const DEFAULT_LAYERS: ParcelLayerVisibility = {
    skeleton: false,
    offsetRings: true,
    strips: true,
    parcels: true,
    frontage: true,
};

export const useParcelStore = create<ParcelStoreState>()(
    immer((set) => ({
        depthPercent: 35,
        derived: { minArea: 1, maxArea: 10, minWidth: 1, maxWidth: 2 },
        overrides: {},
        splitIrregularity: 0.3,
        seed: 1,
        layers: { ...DEFAULT_LAYERS },

        setDepthPercent: (percent) =>
            set((state) => {
                state.depthPercent = Math.min(100, Math.max(1, percent));
            }),

        setDerived: (derived) =>
            set((state) => {
                state.derived = { ...derived };
            }),

        setSliceOption: (key, value) =>
            set((state) => {
                state.overrides[key] = value;
            }),

        clearOverrides: () =>
            set((state) => {
                state.overrides = {};
            }),

        setSplitIrregularity: (value) =>
            set((state) => {
                state.splitIrregularity = Math.min(1, Math.max(0, value));
            }),

        setSeed: (seed) =>
            set((state) => {
                state.seed = Math.trunc(seed);
            }),

        rerollSeed: () =>
            set((state) => {
                // A fresh draw rather than an increment: consecutive seeds are a poor way to show
                // that the layout really is seed-driven.
                state.seed = Math.floor(Math.random() * 1_000_000) + 1;
            }),

        toggleLayer: (layer) =>
            set((state) => {
                state.layers[layer] = !state.layers[layer];
            }),

        setLayer: (layer, visible) =>
            set((state) => {
                state.layers[layer] = visible;
            }),
    })),
);
