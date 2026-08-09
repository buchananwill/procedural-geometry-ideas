import type { Parcel, Strip, Vector2 } from '@proc-geo/core';
import type { StraightSkeletonGraph } from '@proc-geo/core';
import type { Vertex } from '../../stores/usePolygonStore';
import type { ParcelLayerVisibility } from '../../stores/useParcelStore';
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

function flatten(points: Vector2[]): number[] {
    return points.flatMap((p) => [p.x, p.y]);
}

const POLYGON_COLOUR = '#ffffff';
const RING_COLOUR = '#ffd43b';
const SKELETON_COLOUR = '#5c5f66';
/** Frontage is the property the whole method exists to guarantee, so it gets the loudest stroke. */
const FRONTAGE_COLOUR = '#ff4d4f';

export interface ParcelsToSceneParams {
    vertices: Vertex[];
    skeleton: StraightSkeletonGraph | null;
    offsetRings: Vector2[][];
    strips: Strip[];
    parcelsByStrip: Parcel[][];
    layers: ParcelLayerVisibility;
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
    const groups: SceneGroup[] = [];

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
                    const colour = parcelColour(running);
                    children.push({
                        type: 'line',
                        points: flatten(parcel.boundary),
                        closed: true,
                        stroke: { color: '#1a1b1e', width: 1 },
                        fill: { color: colour, opacity: 0.75 },
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
