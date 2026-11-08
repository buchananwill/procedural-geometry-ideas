// `solveRoofParts` re-types `runB`'s logic (the weights, the solve loop, the default faces, the pieces loop), so this
// checks the two agree: every roof-gable case, built as one storey of raw parts from `solveRoofParts` and unioned, must
// stand at `runB`'s height plus the plate at every grid point strictly inside its footprint. The courtyards 9a to 9d
// go through their own cut (journal decision 115).
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {CASES} from '../src/roof/cases.ts';
import {runB} from '../src/roof/algoB.ts';
import {Building, Pt, cross, dot, sub} from '../src/roof/model.ts';
import {planBuilding} from '../src/storey.ts';
import type {ShellMesh} from '../src/mesh.ts';
import {unionPlans} from '../src/union.ts';

const PLATE = 300;
const STEP = 25;
/**
 * The grid's offsets from the bounding box corner. Half a step plus 0.3 cm in x and 0.7 cm in y keeps x - y and
 * x + y off the lattice, so no point lies on a 45 degree hip line through the cases' 50 cm corners. On such a line
 * `runB`'s point-in-polygon can fall into the float crack between two skeleton faces and return null (case 7i at
 * (62.5, 437.5), where the union stands at the right 362.5).
 */
const OFFSET_X = STEP / 2 + 0.3;
const OFFSET_Y = STEP / 2 + 0.7;
/** Grid points this close to a wall line are not strictly inside. */
const WALL_CLEARANCE = 0.5;

let wasm: Wasm;
beforeAll(async () => { wasm = await getManifold(); });

/** The highest point of the mesh above plan point `p`, or null if no non-vertical triangle covers it. */
function topHeight(mesh: ShellMesh, p: Pt): number | null {
  const P = mesh.positions;
  let best: number | null = null;
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const i = 3 * mesh.tris[3 * t], j = 3 * mesh.tris[3 * t + 1], k = 3 * mesh.tris[3 * t + 2];
    const ax = P[i], ay = P[i + 1], bx = P[j], by = P[j + 1], cx = P[k], cy = P[k + 1];
    if (p.x < Math.min(ax, bx, cx) - 1e-6 || p.x > Math.max(ax, bx, cx) + 1e-6) continue;
    if (p.y < Math.min(ay, by, cy) - 1e-6 || p.y > Math.max(ay, by, cy) + 1e-6) continue;
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-9) continue;
    const u = ((p.x - ax) * (cy - ay) - (cx - ax) * (p.y - ay)) / det;
    const v = ((bx - ax) * (p.y - ay) - (p.x - ax) * (by - ay)) / det;
    if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
    const z = P[i + 2] + u * (P[j + 2] - P[i + 2]) + v * (P[k + 2] - P[i + 2]);
    if (best === null || z > best) best = z;
  }
  return best;
}

function clearOfWalls(b: Building, p: Pt): boolean {
  return b.walls.every(w => {
    const t = dot(sub(p, w.a), w.dir);
    if (t < -WALL_CLEARANCE || t > w.len + WALL_CLEARANCE) return true;
    return Math.abs(cross(w.dir, sub(p, w.a))) > WALL_CLEARANCE;
  });
}

/** Cases 9a to 9d, the courtyards: each roofed through its own cut, as `buildCourtyard` places it (journal decision 115). */
const courtyards = CASES.filter(c => c.build().comps.some(comp => comp.holes.length > 0));

/**
 * The union's surviving Cheek identities per case, as measured after journal decision 75 put every wall-line face
 * under Gable; a case not listed has none. Each is a B CHEEK, and each surviving face is a band end on no wall line:
 * - 2b: wall 1 (x=1000 y[0,150]), on y = 150 facing +y, 11250 cm²;
 * - 4b: wall 5 (x=1000 y[150,350]), on y = 150 facing -y and on y = 350 facing +y, 11250 cm² each;
 * - 8b: wall 1 (y=0 x[800,1000]), on x = 800 facing -x, 17500 cm².
 *
 * Journal decision 96 keys a Cheek's identity by its oriented plane, not its wall, so 4b's two faces of wall 5 on two
 * planes are two identities: 4b is re-measured 1 -> 2. The faces and their areas are unchanged.
 */
const MEASURED_CHEEKS: Record<string, number> = {'2b': 1, '4b': 2, '8b': 1};

describe('solveRoofParts agrees with runB', () => {
  it('covers every case: all 53, the four courtyards 9a to 9d among them', () => {
    expect(CASES.length).toBe(53);
    expect(courtyards.map(c => c.id)).toEqual(['9a', '9b', '9c', '9d']);
  });

  it.each(CASES)('case $id: the union top surface is runB plus the plate', c => {
    const b = c.build();
    const u = unionPlans(wasm, `case ${c.id}`, [planBuilding(`case ${c.id}`, 0, 0, PLATE, b)]);
    expect(u.status).toBe('NoError');
    expect(u.closed).toBe(true);
    // A courtyard's ring is one tunnel from the ground to the sky. (Other cases are not pinned here: 8e is two islands,
    // which Manifold counts as genus -1.)
    if (courtyards.includes(c)) expect(u.genus).toBe(1);
    // The cut's faces are Internal, and each has its partner across the slit, so none survives (spec decision 2).
    expect(u.survivingInternal).toBe(0);
    expect(u.cheeks).toBe(MEASURED_CHEEKS[c.id] ?? 0);
    const surface = runB(b, {far: 'plane'});
    const misses: string[] = [];
    let checked = 0;
    for (let x = b.bbox.x0 + OFFSET_X; x < b.bbox.x1; x += STEP) {
      for (let y = b.bbox.y0 + OFFSET_Y; y < b.bbox.y1; y += STEP) {
        const p = {x, y};
        if (!b.inside(p) || !clearOfWalls(b, p)) continue;
        checked++;
        const want = surface.eval(p);
        const got = topHeight(u.mesh, p);
        if (!want || got === null) { misses.push(`(${x},${y}): runB ${want?.h ?? 'null'}, union ${got}`); continue; }
        if (Math.abs(got - (want.h + PLATE)) > SHELL_TOLERANCE_CM) misses.push(`(${x},${y}): runB ${want.h + PLATE}, union ${got}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(misses.slice(0, 10)).toEqual([]);
  }, 60_000);
});
