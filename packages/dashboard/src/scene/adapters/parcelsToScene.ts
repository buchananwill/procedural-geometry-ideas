import type { Parcel, PolygonSlopeStatistics, Strip, Vector2 } from '@proc-geo/core';
import type { StraightSkeletonGraph } from '@proc-geo/core';
import type { Vertex } from '../../stores/usePolygonStore';
import type { ParcelLayerVisibility } from '../../stores/useParcelStore';
import type { SlopeFieldCell } from '../../hooks/useParcelTerrain';
import type { SceneGroup, ScenePrimitive } from '../types';

/**
 * Golden-angle hue step. Successive strips and successive parcels are adjacent on the canvas, so
 * stepping the hue by anything that divides the circle evenly eventually puts two near-identical
 * colours side by side. The golden angle is the standard fix and keeps neighbours distinct at any
 * count.
 */
const GOLDEN_ANGLE_DEGREES = 137.508;

/**
 * Colours are emitted as hex, not `hsl(...)`, because `SceneCanvas` applies a fill's opacity by
 * rewriting the colour string and only understands hex and `rgb()`. An `hsl()` fill would silently
 * render fully opaque and bury everything under it.
 */
function hslHex(hueDegrees: number, saturation: number, lightness: number): string {
    const h = ((hueDegrees % 360) + 360) % 360;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - chroma / 2;

    let rgb: [number, number, number];
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];

    const channel = (value: number) =>
        Math.round(Math.min(255, Math.max(0, (value + m) * 255)))
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

export function stripColour(index: number): string {
    return hslHex(index * GOLDEN_ANGLE_DEGREES, 0.5, 0.45);
}

export function parcelColour(index: number): string {
    // Offset from the strip ramp so a parcel never lands on its own strip's colour.
    return hslHex(index * GOLDEN_ANGLE_DEGREES + 40, 0.72, 0.58);
}

/**
 * Slope colour ramp: green through yellow and orange to deep red.
 *
 * Sequential and monotone in lightness as well as hue, so it still reads as an ordering in
 * greyscale and to a viewer who cannot separate red from green — which matters here, because the
 * whole point of the layer is that steeper ground looks worse.
 */
const SLOPE_RAMP: { at: number; rgb: [number, number, number] }[] = [
    { at: 0.0, rgb: [26, 127, 55] },
    { at: 0.25, rgb: [116, 196, 118] },
    { at: 0.5, rgb: [254, 224, 139] },
    { at: 0.75, rgb: [252, 141, 89] },
    { at: 1.0, rgb: [151, 25, 40] },
];

function toHex(rgb: [number, number, number]): string {
    return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Colour for a slope, ramped over `[0, maxDegrees]`.
 *
 * Clamped at both ends rather than extended, so a 70-degree cliff and an 80-degree one are both
 * simply the last colour. Distinguishing them would be precision about ground nobody can build on.
 */
export function slopeColour(degrees: number, maxDegrees: number): string {
    const t = maxDegrees > 0 ? Math.min(1, Math.max(0, degrees / maxDegrees)) : 0;
    for (let i = 1; i < SLOPE_RAMP.length; i++) {
        const previous = SLOPE_RAMP[i - 1];
        const next = SLOPE_RAMP[i];
        if (t <= next.at) {
            const span = next.at - previous.at;
            const local = span === 0 ? 0 : (t - previous.at) / span;
            return toHex([
                previous.rgb[0] + (next.rgb[0] - previous.rgb[0]) * local,
                previous.rgb[1] + (next.rgb[1] - previous.rgb[1]) * local,
                previous.rgb[2] + (next.rgb[2] - previous.rgb[2]) * local,
            ]);
        }
    }
    return toHex(SLOPE_RAMP[SLOPE_RAMP.length - 1].rgb);
}

/** The canvas background `SceneCanvas` paints behind everything. */
const CANVAS_BACKGROUND: [number, number, number] = [26, 27, 30];

/**
 * Mixes a hex colour towards the canvas background — the opaque equivalent of drawing it at
 * `weight` opacity over an empty canvas.
 */
export function muteOntoCanvas(hex: string, weight: number): string {
    const channel = (offset: number) => {
        const value = parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16);
        return value * weight + CANVAS_BACKGROUND[offset] * (1 - weight);
    };
    return toHex([channel(0), channel(1), channel(2)]);
}

function flatten(points: Vector2[]): number[] {
    return points.flatMap((p) => [p.x, p.y]);
}

const POLYGON_COLOUR = '#ffffff';
const RING_COLOUR = '#ffd43b';
const SKELETON_COLOUR = '#5c5f66';
/** Frontage is the property the whole method exists to guarantee, so it gets the loudest stroke. */
const FRONTAGE_COLOUR = '#ff4d4f';
/** The marking for a lot the threshold rejects: a hard white dash nothing else on the page uses. */
const TOO_STEEP_COLOUR = '#ffffff';

/** Terrain to judge and draw the parcels against. `null` restores the page's terrain-free behaviour. */
export interface ParcelsSceneTerrain {
    /** One entry per parcel, in the flattened `parcelsByStrip` order. */
    slopes: PolygonSlopeStatistics[];
    /** Background slope field, in polygon coordinates. Empty to draw none. */
    field: SlopeFieldCell[];
    /** Lots whose mean slope exceeds this are marked. */
    thresholdDegrees: number;
    /** Top of the colour ramp. */
    maxDisplaySlopeDegrees: number;
    /** When false the parcels keep their index colours and only the threshold marking applies. */
    colourBySlope: boolean;
}

export interface ParcelsToSceneParams {
    vertices: Vertex[];
    skeleton: StraightSkeletonGraph | null;
    offsetRings: Vector2[][];
    strips: Strip[];
    parcelsByStrip: Parcel[][];
    layers: ParcelLayerVisibility;
    terrain?: ParcelsSceneTerrain | null;
}

/**
 * Draws the parcel pipeline back to front: strips, then parcels on top of them, then the linework.
 *
 * The input polygon outline is emitted last so it stays legible over every fill — without it a
 * decomposition that quietly loses a corner of the region looks like a decomposition that covered
 * everything.
 *
 * Strip holes are drawn as dashed outlines rather than punched out of the fill: the scene DSL's
 * closed line has no hole support, and a strip only ever has a hole under a `sameLogicalStreet`
 * policy that merges most of the boundary, which this page does not use. Showing them as outlines
 * is honest about what is there without pretending the fill is correct.
 */
export function parcelsToScene(params: ParcelsToSceneParams): ScenePrimitive[] {
    const { vertices, skeleton, offsetRings, strips, parcelsByStrip, layers } = params;
    const terrain = params.terrain ?? null;
    const groups: SceneGroup[] = [];

    // 0. group:terrain-field — under everything, because it is the ground everything else sits on.
    {
        const rampTop = terrain?.maxDisplaySlopeDegrees ?? 45;
        const children: ScenePrimitive[] = (terrain?.field ?? []).map((cell) => {
            // Muted, because the parcels drawn over it carry the same ramp and have to stay
            // legible against it — and more muted still off the edge of the terrain, where the
            // sampler was clamping and the colour is an extrapolation rather than a reading.
            //
            // The muting is baked into the colour rather than applied as a fill opacity, and the
            // cells then overlap slightly. Both are needed to stop 2300 cells reading as a grid
            // drawn over the terrain. Semi-transparent cells let the dark canvas through their
            // antialiased edges, and overlapping *those* only moves the problem, since the overlaps
            // blend twice and draw as a grid of dark squares instead. Opaque cells fix the
            // double-blend; the overlap then fixes the seam, where two abutting antialiased edges
            // each cover about half the pixel and composite in sequence, leaving a quarter of the
            // background showing through.
            const colour = muteOntoCanvas(slopeColour(cell.slopeDegrees, rampTop), cell.inDomain ? 0.5 : 0.15);
            const size = cell.size * 1.02;
            return {
                type: 'line' as const,
                points: [cell.x, cell.y, cell.x + size, cell.y, cell.x + size, cell.y + size, cell.x, cell.y + size],
                closed: true,
                stroke: { color: colour, width: 0 },
                fill: { color: colour },
            };
        });
        groups.push({ type: 'group', id: 'group:terrain-field', children });
    }

    // 1. group:parcel-strips
    {
        const children: ScenePrimitive[] = [];
        strips.forEach((strip, index) => {
            if (strip.boundary.length < 3) return;
            const colour = stripColour(index);
            children.push({
                type: 'line',
                points: flatten(strip.boundary),
                closed: true,
                stroke: { color: colour, width: 1 },
                fill: { color: colour, opacity: 0.3 },
            });
            for (const hole of strip.holes) {
                if (hole.length < 3) continue;
                children.push({
                    type: 'line',
                    points: flatten(hole),
                    closed: true,
                    stroke: { color: colour, width: 1.5, dash: [4, 4] },
                });
            }
        });
        groups.push({ type: 'group', id: 'group:parcel-strips', children, visible: layers.strips });
    }

    // 2. group:parcels
    {
        const children: ScenePrimitive[] = [];
        let running = 0;
        for (const parcels of parcelsByStrip) {
            for (const parcel of parcels) {
                if (parcel.boundary.length >= 3) {
                    const slope = terrain?.slopes[running] ?? null;
                    const colour =
                        terrain !== null && terrain.colourBySlope && slope !== null
                            ? slopeColour(slope.meanSlopeDegrees, terrain.maxDisplaySlopeDegrees)
                            : parcelColour(running);
                    // A lot the threshold rejects gets a dashed white outline as well as its colour.
                    // Colour alone is not a verdict: the ramp is continuous and the threshold is a
                    // line on it, so the two have to be drawn as two different things.
                    const tooSteep = slope !== null && !slope.buildable;
                    children.push({
                        type: 'line',
                        points: flatten(parcel.boundary),
                        closed: true,
                        stroke: tooSteep
                            ? { color: TOO_STEEP_COLOUR, width: 2, dash: [7, 4] }
                            : { color: '#1a1b1e', width: 1 },
                        fill: { color: colour, opacity: 0.85 },
                    });
                }
                running++;
            }
        }
        groups.push({ type: 'group', id: 'group:parcels', children, visible: layers.parcels });
    }

    // 3. group:parcel-skeleton
    {
        const children: ScenePrimitive[] = [];
        if (skeleton) {
            for (const { id } of skeleton.interiorEdges) {
                const edge = skeleton.edges[id];
                if (edge === undefined || edge.target === undefined) continue;
                const source = skeleton.nodes[edge.source];
                const target = skeleton.nodes[edge.target];
                children.push({
                    type: 'line',
                    points: [source.position.x, source.position.y, target.position.x, target.position.y],
                    stroke: { color: SKELETON_COLOUR, width: 1 },
                });
            }
        }
        groups.push({ type: 'group', id: 'group:parcel-skeleton', children, visible: layers.skeleton });
    }

    // 4. group:offset-rings
    {
        const children: ScenePrimitive[] = offsetRings
            .filter((ring) => ring.length >= 2)
            .map((ring) => ({
                type: 'line' as const,
                points: flatten(ring),
                closed: true,
                stroke: { color: RING_COLOUR, width: 2, dash: [8, 5] },
            }));
        groups.push({ type: 'group', id: 'group:offset-rings', children, visible: layers.offsetRings });
    }

    // 5. group:parcel-frontage
    {
        const children: ScenePrimitive[] = [];
        for (const parcels of parcelsByStrip) {
            for (const parcel of parcels) {
                if (parcel.frontage.length < 2) continue;
                children.push({
                    type: 'line',
                    points: flatten(parcel.frontage),
                    // Wider than the polygon outline drawn over it, so a band of frontage colour
                    // survives on both sides of the boundary line. Every frontage lies exactly on
                    // that boundary, so a thinner stroke is simply invisible.
                    stroke: { color: FRONTAGE_COLOUR, width: 5 },
                });
            }
        }
        groups.push({ type: 'group', id: 'group:parcel-frontage', children, visible: layers.frontage });
    }

    // 6. group:polygon — last, so the input outline survives every fill above it.
    {
        groups.push({
            type: 'group',
            id: 'group:polygon',
            children: [
                {
                    type: 'line',
                    points: vertices.flatMap((v) => [v.x, v.y]),
                    closed: true,
                    stroke: { color: POLYGON_COLOUR, width: 1.5 },
                },
            ],
        });
    }

    return groups;
}
