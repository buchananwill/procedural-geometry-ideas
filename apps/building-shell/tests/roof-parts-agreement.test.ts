// `solveRoofParts` re-types `runB`'s logic (the weights, the solve loop, the default faces, the pieces loop), so this
// checks the two agree: every hole-free roof-gable case, built as one storey of raw parts from `solveRoofParts` and
// unioned, must stand at `runB`'s height plus the plate at every grid point strictly inside its footprint.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {Wasm, getManifold} from '../src/manifold.ts';
import {CASES} from '../src/roof/cases.ts';
import {runB} from '../src/roof/algoB.ts';
import {Building, Pt, cross, dot, sub} from '../src/roof/model.ts';
import {planBuilding} from '../src/storey.ts';
import {ShellMesh, unionPlans} from '../src/union.ts';

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

const holeFree = CASES.filter(c => c.build().comps.every(comp => comp.holes.length === 0));

describe('solveRoofParts agrees with runB', () => {
  it('covers every hole-free case', () => {
    expect(holeFree.length).toBeGreaterThan(40);
  });

  it.each(holeFree.map(c => [c.id, c] as const))('case %s: the union top surface is runB plus the plate', (_id, c) => {
    const b = c.build();
    const u = unionPlans(wasm, `case ${c.id}`, [planBuilding(`case ${c.id}`, 0, 0, PLATE, b)]);
    expect(u.status).toBe('NoError');
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
