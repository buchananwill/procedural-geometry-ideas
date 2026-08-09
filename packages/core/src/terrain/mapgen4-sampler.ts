import type { Vector2 } from '../shared/types';
import { normaliseUpward } from './slope';
import {
    clampToDomain,
    isInDomain,
    squareDomain,
    type TerrainDomain,
    type TerrainSample,
    type TerrainSampler,
    type Vector3,
} from './types';
import {
    MAPGEN4_PATCH,
    MAPGEN4_PATCH_ELEVATION_RANGE,
    MAPGEN4_PATCH_WINDOW_UNITS,
    type Mapgen4PatchData,
} from './mapgen4-patch-data';

/**
 * A {@link TerrainSampler} over real mapgen4 terrain.
 *
 * ## What this adapts, and how the data got here
 *
 * mapgen4 (Red Blob Games) stores elevation on an irregular **dual mesh**: `elevation_r` per Delaunay
 * region and `elevation_t` per triangle. There is no raster anywhere in it, and — this is the part
 * that shapes the adapter — it ships **no point-location helper at all**. Its own renderer never
 * needs one, because it hands the whole mesh to the GPU and lets the rasteriser do it. Locating the
 * triangle under an arbitrary position is therefore work this file has to do itself, and it is most
 * of what is below.
 *
 * The mapgen4 fork was **read, not imported**. Importing it was possible but not worth it: its
 * modules use `.ts` import specifiers that need a bundler, its mesh builder `fetch`es a binary points
 * file over HTTP by relative URL, one of its modules installs DOM event handlers at module-evaluation
 * time, and its PRNG is a git dependency. Dragging all of that into `@proc-geo/core` would trade a
 * pure, dependency-free package for a build problem. Instead the fork's `golden/` dump — raw
 * little-endian arrays of exactly the mesh and elevation state, generated from the real pipeline —
 * was read directly, one window of it cut out, and written to
 * {@link module:terrain/mapgen4-patch-data} as plain numbers. Reproduce it with
 * `packages/core/scripts/extract-mapgen4-patch.mjs`. Core imports no mapgen4 code and the fork was
 * not modified.
 *
 * ## The surface
 *
 * The patch is the same surface mapgen4's own renderer draws, which is *not* the Delaunay
 * triangulation. Each Delaunay triangle is fanned into three sub-triangles meeting at its centroid;
 * the corners carry `elevation_r` and the centroid carries the mountain-folded `elevation_t`. That
 * fan is where mapgen4's ridge detail lives, and a plain corner-only interpolation would smooth it
 * away — so the fan is reproduced here rather than simplified out.
 *
 * Normals are **area-weighted vertex normals interpolated across each face**, not flat per-face
 * normals. Flat normals would make every sub-triangle a constant-slope facet and a slope map of the
 * patch would read as mesh topology rather than terrain. Interpolated normals also match what the
 * Unreal side returns, where the normal comes from a smooth density-field gradient.
 *
 * ## Metric mapping — the part that must not be skipped
 *
 * mapgen4's numbers are unitless in both axes: its map is 1000 arbitrary units across and its
 * elevation is sea-level-relative on roughly `[-1, +1]`. A slope threshold tuned against those is
 * meaningless, so this adapter is where metres are imposed, via exactly two numbers:
 *
 * - **{@link Mapgen4SamplerOptions.horizontalExtentMetres}** — how wide the window is on the ground.
 *   The window is {@link MAPGEN4_PATCH_WINDOW_UNITS} mapgen4 units square, so this fixes the
 *   horizontal scale at `horizontalExtentMetres / 110` metres per mapgen4 unit. At the default it is
 *   21.8 m per unit, and mapgen4's 5.5-unit region spacing becomes a terrain sample every 120 m.
 * - **{@link Mapgen4SamplerOptions.verticalScaleMetres}** — metres of height per 1.0 of mapgen4
 *   elevation. `height = seaLevelMetres + elevation * verticalScaleMetres`.
 *
 * The defaults are {@link DEFAULT_HORIZONTAL_EXTENT_METRES} = 2400 m and
 * {@link DEFAULT_VERTICAL_SCALE_METRES} = 500 m, chosen by measuring the window rather than guessing:
 * they give 2.4 km of ground carrying 383 m of relief, a mean slope of 22 degrees, a 10th-to-90th
 * percentile spread of 9 to 36 degrees, and a peak near 49. A 30-degree buildability threshold then
 * rejects about a quarter of the patch, which is the point — a threshold that rejected nothing or
 * everything would demonstrate nothing.
 *
 * Note what that vertical scale is **not**. mapgen4's renderer draws elevation 1.0 as 50 of its map
 * units, which over this window would be 1090 m per elevation unit. The default here is 500, a
 * deliberate flattening to 0.46 of mapgen4's own rendered proportions. The generator is continental:
 * at its own vertical exaggeration a 2.4 km patch of mountain flank comes out at a 37-degree mean
 * slope with two thirds of it past 30, which is a cliff, not a ski resort. Both numbers are
 * arguments, so a caller who wants the continental proportions back can simply pass 1090.
 */

/** Width and depth of the shipped window on the ground, in metres. See the module note above. */
export const DEFAULT_HORIZONTAL_EXTENT_METRES = 2400;

/** Metres of height per 1.0 of mapgen4 elevation. See the module note above. */
export const DEFAULT_VERTICAL_SCALE_METRES = 500;

export interface Mapgen4SamplerOptions {
    /** Side length of the square terrain patch in metres. Defaults to {@link DEFAULT_HORIZONTAL_EXTENT_METRES}. */
    horizontalExtentMetres?: number;
    /** Metres of height per 1.0 of mapgen4 elevation. Defaults to {@link DEFAULT_VERTICAL_SCALE_METRES}. */
    verticalScaleMetres?: number;
    /** Height in metres that mapgen4 elevation `0` maps to. Defaults to `0`. */
    seaLevelMetres?: number;
    /** The window to sample. Defaults to the one shipped in {@link module:terrain/mapgen4-patch-data}. */
    patch?: Mapgen4PatchData;
}

/** Everything the metric mapping settled, reported so a display can quote it rather than guess it. */
export interface Mapgen4SamplerMetrics {
    horizontalExtentMetres: number;
    verticalScaleMetres: number;
    /** Metres on the ground per mapgen4 map unit. */
    metresPerMapUnit: number;
    /** Lowest and highest region height in the patch, in metres. */
    minHeightMetres: number;
    maxHeightMetres: number;
    /** `maxHeightMetres - minHeightMetres`. */
    reliefMetres: number;
}

/** A mapgen4 sampler, plus the metric mapping it was built with. */
export interface Mapgen4TerrainSampler extends TerrainSampler {
    readonly metrics: Mapgen4SamplerMetrics;
}

/** Barycentric slack, in units of the coordinate itself. Absorbs the seams between adjacent faces. */
const BARYCENTRIC_EPSILON = 1e-9;

/**
 * Builds a sampler over a mapgen4 window.
 *
 * All the mesh preparation — the centroid fan, the vertex normals, the point-location grid — happens
 * once, here. {@link TerrainSampler.sample} then does no allocation beyond its result array, which is
 * what makes a batch of thousands of positions cheap enough to be worth batching.
 */
export function createMapgen4Sampler(options: Mapgen4SamplerOptions = {}): Mapgen4TerrainSampler {
    const {
        horizontalExtentMetres = DEFAULT_HORIZONTAL_EXTENT_METRES,
        verticalScaleMetres = DEFAULT_VERTICAL_SCALE_METRES,
        seaLevelMetres = 0,
        patch = MAPGEN4_PATCH,
    } = options;

    const regionCount = patch.regionElevation.length;
    const triangleCount = patch.triangleElevation.length;
    const vertexCount = regionCount + triangleCount;
    const faceCount = triangleCount * 3;

    // ── Vertices: the regions, then one centroid per Delaunay triangle. ──────────────────────────
    const vx = new Float64Array(vertexCount);
    const vy = new Float64Array(vertexCount);
    const vz = new Float64Array(vertexCount);
    const toHeight = (elevation: number) => seaLevelMetres + elevation * verticalScaleMetres;

    for (let r = 0; r < regionCount; r++) {
        vx[r] = patch.positions[2 * r] * horizontalExtentMetres;
        vy[r] = patch.positions[2 * r + 1] * horizontalExtentMetres;
        vz[r] = toHeight(patch.regionElevation[r]);
    }
    for (let t = 0; t < triangleCount; t++) {
        const a = patch.triangles[3 * t];
        const b = patch.triangles[3 * t + 1];
        const c = patch.triangles[3 * t + 2];
        const v = regionCount + t;
        vx[v] = (vx[a] + vx[b] + vx[c]) / 3;
        vy[v] = (vy[a] + vy[b] + vy[c]) / 3;
        vz[v] = toHeight(patch.triangleElevation[t]);
    }

    // ── Faces: each Delaunay triangle fanned into three sub-triangles at its centroid. ───────────
    const faceVertex = new Int32Array(faceCount * 3);
    for (let t = 0; t < triangleCount; t++) {
        const corner = [patch.triangles[3 * t], patch.triangles[3 * t + 1], patch.triangles[3 * t + 2]];
        for (let i = 0; i < 3; i++) {
            const f = t * 3 + i;
            faceVertex[3 * f] = corner[i];
            faceVertex[3 * f + 1] = corner[(i + 1) % 3];
            faceVertex[3 * f + 2] = regionCount + t;
        }
    }

    // ── Vertex normals: sum of incident face cross products, whose length is twice the face area,
    //    so the sum is area-weighted for free. Orientation is forced upward per face because the
    //    patch carries no winding guarantee. ──────────────────────────────────────────────────────
    const nx = new Float64Array(vertexCount);
    const ny = new Float64Array(vertexCount);
    const nz = new Float64Array(vertexCount);
    for (let f = 0; f < faceCount; f++) {
        const i = faceVertex[3 * f];
        const j = faceVertex[3 * f + 1];
        const k = faceVertex[3 * f + 2];
        const ux = vx[j] - vx[i];
        const uy = vy[j] - vy[i];
        const uz = vz[j] - vz[i];
        const wx = vx[k] - vx[i];
        const wy = vy[k] - vy[i];
        const wz = vz[k] - vz[i];
        let cx = uy * wz - uz * wy;
        let cy = uz * wx - ux * wz;
        let cz = ux * wy - uy * wx;
        if (cz < 0) {
            cx = -cx;
            cy = -cy;
            cz = -cz;
        }
        for (const v of [i, j, k]) {
            nx[v] += cx;
            ny[v] += cy;
            nz[v] += cz;
        }
    }
    for (let v = 0; v < vertexCount; v++) {
        const unit = normaliseUpward({ x: nx[v], y: ny[v], z: nz[v] });
        nx[v] = unit.x;
        ny[v] = unit.y;
        nz[v] = unit.z;
    }

    // ── Barycentric setup, precomputed per face. ─────────────────────────────────────────────────
    // For face (a, b, c) and query p: u, v solve p - a = u (b - a) + v (c - a), and the face contains
    // p when u, v and 1 - u - v are all non-negative.
    const edge = new Float64Array(faceCount * 4); // (b-a).x, (b-a).y, (c-a).x, (c-a).y
    const inverseDeterminant = new Float64Array(faceCount);
    for (let f = 0; f < faceCount; f++) {
        const a = faceVertex[3 * f];
        const b = faceVertex[3 * f + 1];
        const c = faceVertex[3 * f + 2];
        const e0x = vx[b] - vx[a];
        const e0y = vy[b] - vy[a];
        const e1x = vx[c] - vx[a];
        const e1y = vy[c] - vy[a];
        edge[4 * f] = e0x;
        edge[4 * f + 1] = e0y;
        edge[4 * f + 2] = e1x;
        edge[4 * f + 3] = e1y;
        const determinant = e0x * e1y - e1x * e0y;
        // A face with no area in plan can never contain a point; zero here makes every barycentric
        // test against it fail rather than divide by zero.
        inverseDeterminant[f] = determinant === 0 ? 0 : 1 / determinant;
    }

    // ── Point location: a uniform bucket grid over the faces' bounding boxes. ────────────────────
    // A grid rather than a mesh walk because a walk needs adjacency and a consistent winding, and
    // this patch is a bag of triangles with neither. Sized for a couple of faces per cell.
    const gridSize = Math.max(1, Math.round(Math.sqrt(faceCount / 2)));
    const cellSize = horizontalExtentMetres / gridSize;
    const buckets: number[][] = Array.from({ length: gridSize * gridSize }, () => []);
    const cellOf = (value: number) => Math.min(gridSize - 1, Math.max(0, Math.floor(value / cellSize)));
    for (let f = 0; f < faceCount; f++) {
        const a = faceVertex[3 * f];
        const b = faceVertex[3 * f + 1];
        const c = faceVertex[3 * f + 2];
        const x0 = cellOf(Math.min(vx[a], vx[b], vx[c]));
        const x1 = cellOf(Math.max(vx[a], vx[b], vx[c]));
        const y0 = cellOf(Math.min(vy[a], vy[b], vy[c]));
        const y1 = cellOf(Math.max(vy[a], vy[b], vy[c]));
        for (let gy = y0; gy <= y1; gy++) {
            for (let gx = x0; gx <= x1; gx++) buckets[gy * gridSize + gx].push(f);
        }
    }

    const domain: TerrainDomain = squareDomain(horizontalExtentMetres);

    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let r = 0; r < regionCount; r++) {
        if (vz[r] < minHeight) minHeight = vz[r];
        if (vz[r] > maxHeight) maxHeight = vz[r];
    }

    /**
     * Interpolates the face's three vertices at barycentric `(u, v)`.
     *
     * The normal is interpolated then renormalised — the Phong construction — so the result varies
     * smoothly across a face and still satisfies the seam's unit-length contract exactly.
     */
    function interpolate(face: number, u: number, v: number, inDomain: boolean): TerrainSample {
        const a = faceVertex[3 * face];
        const b = faceVertex[3 * face + 1];
        const c = faceVertex[3 * face + 2];
        const w = 1 - u - v;
        const normal: Vector3 = normaliseUpward({
            x: w * nx[a] + u * nx[b] + v * nx[c],
            y: w * ny[a] + u * ny[b] + v * ny[c],
            z: w * nz[a] + u * nz[b] + v * nz[c],
        });
        return { height: w * vz[a] + u * vz[b] + v * vz[c], normal, inDomain };
    }

    function sampleAt(x: number, y: number, inDomain: boolean): TerrainSample {
        const candidates = buckets[cellOf(y) * gridSize + cellOf(x)];

        // Best-effort fallback, tracked while searching so a miss costs no second pass. "Best" is
        // the face whose most-violated barycentric coordinate is least negative — the nearest face
        // in barycentric terms. It only ever fires on the ragged outer edge of the patch, where the
        // shipped window's triangles do not quite reach the square domain corner.
        let bestFace = -1;
        let bestU = 0;
        let bestV = 0;
        let bestViolation = -Infinity;

        for (const f of candidates) {
            const inverse = inverseDeterminant[f];
            if (inverse === 0) continue;
            const a = faceVertex[3 * f];
            const px = x - vx[a];
            const py = y - vy[a];
            const e0x = edge[4 * f];
            const e0y = edge[4 * f + 1];
            const e1x = edge[4 * f + 2];
            const e1y = edge[4 * f + 3];
            const u = (px * e1y - e1x * py) * inverse;
            const v = (e0x * py - px * e0y) * inverse;
            const w = 1 - u - v;
            if (u >= -BARYCENTRIC_EPSILON && v >= -BARYCENTRIC_EPSILON && w >= -BARYCENTRIC_EPSILON) {
                return interpolate(f, u, v, inDomain);
            }
            const violation = Math.min(u, v, w);
            if (violation > bestViolation) {
                bestViolation = violation;
                bestFace = f;
                bestU = u;
                bestV = v;
            }
        }

        if (bestFace >= 0) {
            // Clamp onto the near face rather than extrapolating off its plane, so a corner of the
            // domain that no triangle covers reads as the nearest real ground.
            const u = Math.min(1, Math.max(0, bestU));
            const v = Math.min(1 - u, Math.max(0, bestV));
            return interpolate(bestFace, u, v, inDomain);
        }

        // No face within the cell at all. Level ground at the patch floor keeps the seam total.
        return { height: minHeight, normal: { x: 0, y: 0, z: 1 }, inDomain };
    }

    return {
        domain,
        metrics: {
            horizontalExtentMetres,
            verticalScaleMetres,
            metresPerMapUnit: horizontalExtentMetres / MAPGEN4_PATCH_WINDOW_UNITS,
            minHeightMetres: minHeight,
            maxHeightMetres: maxHeight,
            reliefMetres: maxHeight - minHeight,
        },
        sample(positions: readonly Vector2[]): TerrainSample[] {
            const samples: TerrainSample[] = new Array<TerrainSample>(positions.length);
            for (let i = 0; i < positions.length; i++) {
                const requested = positions[i];
                const inside = isInDomain(requested, domain);
                const at = inside ? requested : clampToDomain(requested, domain);
                samples[i] = sampleAt(at.x, at.y, inside);
            }
            return samples;
        },
    };
}

/** Relief the shipped patch carries at a given vertical scale, in metres. Handy for a UI readout. */
export function mapgen4ReliefMetres(verticalScaleMetres = DEFAULT_VERTICAL_SCALE_METRES): number {
    return (MAPGEN4_PATCH_ELEVATION_RANGE.max - MAPGEN4_PATCH_ELEVATION_RANGE.min) * verticalScaleMetres;
}
