/**
 * Extracts one village-scale window out of the mapgen4 golden dump and writes it as a plain-data
 * TypeScript module. Reads D:/Coding/mapgen4 only; never writes to it.
 */
import fs from 'node:fs';
import path from 'node:path';

const GOLDEN = 'D:/Coding/mapgen4/golden';
const OUT = process.argv[2] ?? null;

const CENTRE_X = 540;
const CENTRE_Y = 420;
const WINDOW = 110;

function readBin(name, Ctor) {
    const buf = fs.readFileSync(path.join(GOLDEN, name));
    return new Ctor(buf.buffer, buf.byteOffset, buf.byteLength / Ctor.BYTES_PER_ELEMENT);
}

const vertexR = readBin('L1.mesh_vertex_r.float64.bin', Float64Array);
const triangles = readBin('L1.mesh_triangles.int32.bin', Int32Array);
const elevationR = readBin('L2a.elevation_r.float32.bin', Float32Array);
const foldedT = readBin('L3.folded_elevation_t.float32.bin', Float32Array);

const NUM_SOLID_TRIANGLES = 50344;

const half = WINDOW / 2;
const minX = CENTRE_X - half, maxX = CENTRE_X + half;
const minY = CENTRE_Y - half, maxY = CENTRE_Y + half;

// Keep every triangle with at least one corner in the window, so the window is fully covered even
// at its edges. Corner regions outside the window come along for the ride.
const keptTriangles = [];
for (let t = 0; t < NUM_SOLID_TRIANGLES; t++) {
    let anyInside = false;
    for (let i = 0; i < 3; i++) {
        const r = triangles[3 * t + i];
        const x = vertexR[2 * r], y = vertexR[2 * r + 1];
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) { anyInside = true; break; }
    }
    if (anyInside) keptTriangles.push(t);
}

const regionIndex = new Map();
const positions = [];
const elevations = [];
function localRegion(r) {
    let index = regionIndex.get(r);
    if (index === undefined) {
        index = positions.length / 2;
        regionIndex.set(r, index);
        // Normalised window coordinates: (0,0) at the window's min corner, 1 at its max.
        positions.push((vertexR[2 * r] - minX) / WINDOW, (vertexR[2 * r + 1] - minY) / WINDOW);
        elevations.push(elevationR[r]);
    }
    return index;
}

const triangleCorners = [];
const triangleElevations = [];
for (const t of keptTriangles) {
    triangleCorners.push(
        localRegion(triangles[3 * t]),
        localRegion(triangles[3 * t + 1]),
        localRegion(triangles[3 * t + 2]),
    );
    triangleElevations.push(foldedT[t]);
}

const numRegions = positions.length / 2;
const numTriangles = triangleElevations.length;
let eMin = Infinity, eMax = -Infinity;
for (const e of elevations) { if (e < eMin) eMin = e; if (e > eMax) eMax = e; }

console.log(`window (${minX}..${maxX}, ${minY}..${maxY}) size ${WINDOW}`);
console.log(`regions ${numRegions}  triangles ${numTriangles}  elevation [${eMin.toFixed(4)}, ${eMax.toFixed(4)}]`);

// ── Slope distribution, computed exactly as the adapter will: fan each Delaunay triangle into
//    three sub-triangles at its centroid, area-weight the face normals onto shared vertices. ────

function slopeStats(horizontalExtentMetres, verticalScaleMetres) {
    const m = horizontalExtentMetres;      // one normalised unit = m metres
    const vx = [], vy = [], vz = [];       // fan vertices: regions then centroids
    for (let i = 0; i < numRegions; i++) {
        vx.push(positions[2 * i] * m);
        vy.push(positions[2 * i + 1] * m);
        vz.push(elevations[i] * verticalScaleMetres);
    }
    for (let t = 0; t < numTriangles; t++) {
        const a = triangleCorners[3 * t], b = triangleCorners[3 * t + 1], c = triangleCorners[3 * t + 2];
        vx.push((positions[2 * a] + positions[2 * b] + positions[2 * c]) / 3 * m);
        vy.push((positions[2 * a + 1] + positions[2 * b + 1] + positions[2 * c + 1]) / 3 * m);
        vz.push(triangleElevations[t] * verticalScaleMetres);
    }
    const nx = new Float64Array(vx.length), ny = new Float64Array(vx.length), nz = new Float64Array(vx.length);
    const faces = [];
    for (let t = 0; t < numTriangles; t++) {
        const centre = numRegions + t;
        const corner = [triangleCorners[3 * t], triangleCorners[3 * t + 1], triangleCorners[3 * t + 2]];
        for (let i = 0; i < 3; i++) faces.push([corner[i], corner[(i + 1) % 3], centre]);
    }
    const faceSlope = [];
    for (const [i, j, k] of faces) {
        const ux = vx[j] - vx[i], uy = vy[j] - vy[i], uz = vz[j] - vz[i];
        const wx = vx[k] - vx[i], wy = vy[k] - vy[i], wz = vz[k] - vz[i];
        let cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
        if (cz < 0) { cx = -cx; cy = -cy; cz = -cz; }   // orient upward
        for (const v of [i, j, k]) { nx[v] += cx; ny[v] += cy; nz[v] += cz; }
        const len = Math.hypot(cx, cy, cz);
        if (len > 0) faceSlope.push(Math.acos(cz / len) * 180 / Math.PI);
    }
    const vertexSlope = [];
    for (let v = 0; v < vx.length; v++) {
        const len = Math.hypot(nx[v], ny[v], nz[v]);
        if (len > 0) vertexSlope.push(Math.acos(nz[v] / len) * 180 / Math.PI);
    }
    const sorted = [...vertexSlope].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const mean = vertexSlope.reduce((s, x) => s + x, 0) / vertexSlope.length;
    const faceSorted = [...faceSlope].sort((a, b) => a - b);
    return {
        relief: (eMax - eMin) * verticalScaleMetres,
        mean, p10: q(0.1), median: q(0.5), p90: q(0.9), max: sorted[sorted.length - 1],
        faceMean: faceSlope.reduce((s, x) => s + x, 0) / faceSlope.length,
        faceMax: faceSorted[faceSorted.length - 1],
        over25: vertexSlope.filter((s) => s > 25).length / vertexSlope.length,
        over30: vertexSlope.filter((s) => s > 30).length / vertexSlope.length,
    };
}

const H = 2400;
console.log('\nvertical-scale sweep at horizontalExtentMetres =', H);
for (const V of [200, 300, 400, 500, 600, 800, 1000]) {
    const s = slopeStats(H, V);
    console.log(
        `V=${String(V).padStart(4)}  relief=${s.relief.toFixed(0).padStart(4)}m  ` +
        `slope mean=${s.mean.toFixed(1)} p10=${s.p10.toFixed(1)} med=${s.median.toFixed(1)} p90=${s.p90.toFixed(1)} max=${s.max.toFixed(1)}  ` +
        `>25deg=${(s.over25 * 100).toFixed(0)}% >30deg=${(s.over30 * 100).toFixed(0)}%  facetMean=${s.faceMean.toFixed(1)}`,
    );
}

if (OUT !== null) {
    const round = (v, dp) => Number(v.toFixed(dp));
    const body = {
        positions: positions.map((v) => round(v, 6)),
        regionElevation: elevations.map((v) => round(v, 5)),
        triangles: triangleCorners,
        triangleElevation: triangleElevations.map((v) => round(v, 5)),
    };
    const wrap = (nums, perLine) => {
        const out = [];
        for (let i = 0; i < nums.length; i += perLine) out.push('    ' + nums.slice(i, i + perLine).join(', ') + ',');
        return out.join('\n');
    };
    const source = `// GENERATED FILE — do not edit by hand.
//
// One 110x110-unit window of the mapgen4 golden dump (D:/Coding/mapgen4/golden), centred on
// (${CENTRE_X}, ${CENTRE_Y}) of mapgen4's 1000x1000 continental map: an all-land mountain flank with no
// coastline in it. Extracted by scripts/extract-mapgen4-patch.mjs.
//
// Sources, all little-endian raw arrays from the golden dump:
//   L1.mesh_vertex_r.float64.bin     region positions
//   L1.mesh_triangles.int32.bin      Delaunay corner regions per triangle
//   L2a.elevation_r.float32.bin      per-region elevation (post-assignElevation)
//   L3.folded_elevation_t.float32.bin  per-triangle-centroid elevation, mountain-folded — the value
//                                      mapgen4's own renderer puts at a triangle centre
//
// Positions are normalised to the window: (0, 0) is its min corner and (1, 1) its max. A few corner
// regions sit slightly outside [0, 1] because every triangle touching the window is kept whole, so
// the window is covered right to its edge. Elevation is mapgen4's own unitless, sea-level-relative
// scale (0 = sea level, +1 = highest land); metres are applied by the adapter, not here.

/** A mapgen4 window as plain data: no mapgen4 code, no typed arrays, no dependencies. */
export interface Mapgen4PatchData {
    /** Interleaved \`x, y\` per region, normalised to the window. Length \`2 * regionCount\`. */
    positions: number[];
    /** Elevation per region, unitless. Length \`regionCount\`. */
    regionElevation: number[];
    /** Interleaved region indices, three per Delaunay triangle. Length \`3 * triangleCount\`. */
    triangles: number[];
    /** Folded elevation at each triangle's centroid, unitless. Length \`triangleCount\`. */
    triangleElevation: number[];
}

/** Window side length in mapgen4 map units, of the generator's 1000-unit continental extent. */
export const MAPGEN4_PATCH_WINDOW_UNITS = ${WINDOW};

/** Lowest and highest region elevation in the window, on mapgen4's unitless scale. */
export const MAPGEN4_PATCH_ELEVATION_RANGE = { min: ${round(eMin, 5)}, max: ${round(eMax, 5)} };

export const MAPGEN4_PATCH: Mapgen4PatchData = {
    positions: [
${wrap(body.positions, 12)}
    ],
    regionElevation: [
${wrap(body.regionElevation, 12)}
    ],
    triangles: [
${wrap(body.triangles, 15)}
    ],
    triangleElevation: [
${wrap(body.triangleElevation, 12)}
    ],
};
`;
    fs.writeFileSync(OUT, source, 'utf8');
    console.log(`\nwrote ${OUT} (${(source.length / 1024).toFixed(0)} KiB)`);
}
