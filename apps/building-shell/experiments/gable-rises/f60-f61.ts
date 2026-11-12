// F60 and F61 as first measured (journal 02), ported from the session scratch probe `midgable/dormer.ts` with only its
// imports changed: a fully hipped storey plus one synthetic algorithm-B Piece whose planes are its own two rakes
// (rising from x = lo and x = hi at `deg`) and the far hip plane, fed through the unchanged union and step 4. No
// canonicalisation and no corner rule: this is the harness check every other probe rests on.
import {getManifold} from '../../src/manifold.ts';
import {type ShellUnion, unionPlans} from '../../src/union.ts';
import {planChecked} from '../../src/storey.ts';
import {buildShellFromUnion} from '../../src/shell.ts';
import {ring, type ShellFixture} from '../../src/fixture.ts';
import {buildFromRects, type Plane} from '../../src/roof/model.ts';

function topAt(u: ShellUnion, x: number, y: number): number {
  const P = u.mesh.positions, T = u.mesh.tris;
  let best = -Infinity;
  for (let t = 0; t < T.length / 3; t++) {
    const [a, b, c] = [T[3 * t], T[3 * t + 1], T[3 * t + 2]];
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [P[3 * a], P[3 * a + 1], P[3 * a + 2], P[3 * b], P[3 * b + 1], P[3 * b + 2], P[3 * c], P[3 * c + 1], P[3 * c + 2]];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    best = Math.max(best, l1 * az + l2 * bz + l3 * cz);
  }
  return best;
}

async function run(lo: number, hi: number, wallDeg: number, gableDeg: number): Promise<void> {
  const name = `dormer [${lo},${hi}] wall ${wallDeg} gable ${gableDeg}`;
  console.log(`\n== ${name}`);
  const wasm = await getManifold();
  try {
    const b = buildFromRects([[0, 0, 1000, 500]], [{deg: wallDeg}]);
    const plan = planChecked(name, 0, 0, 250, b);
    const t = Math.tan((gableDeg * Math.PI) / 180);
    const mk = (gx: number, c: number, label: string): number => {
      const pl: Plane = {id: b.planes.length, gx, gy: 0, c, walls: [], label};
      b.planes.push(pl);
      return pl.id;
    };
    const pLo = mk(t, -lo * t, `rake from x=${lo}`), pHi = mk(-t, hi * t, `rake from x=${hi}`);
    const wall = b.comps[0].walls.find(w => w.a.y === 0 && w.b.y === 0)!;
    const far = b.comps[0].walls.find(w => w.a.y === 500 && w.b.y === 500)!;
    plan.roof.pieces.push({wall, bandLo: lo, bandHi: hi, farDist: 500, planes: [pLo, pHi, far.plane], label: 'synthetic mid-wall gable'});
    const u = unionPlans(wasm, name, [plan]);
    const f: ShellFixture = {name, cellSize: 50, storeyHeight: 250, rings: [ring([0, 0, 1000, 500], 0, 1, wallDeg)]};
    const sb = buildShellFromUnion(wasm, f, u);
    const r = sb.shell.report;
    console.log(`  closed=${u.closed} genus=${u.genus} cheeks=${r.cheeks} internal=${r.survivingInternal} unclassified=${r.unclassifiedEdges} conflicts=${r.conflicts.length} cells=${sb.shell.cells.length}`);
    for (const c of r.conflicts) console.log(`  conflict: ${c}`);
    const kinds = new Map<string, number>();
    for (const e of sb.shell.edges) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    console.log(`  edge kinds: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(' ')}`);
    console.log(`  face kinds: ${sb.shell.faces.map(fc => fc.tag.kind).sort().join(',')}`);
    const xs = [lo - 50, lo + 10, (lo + hi) / 2, hi - 10, hi + 50];
    for (const y of [0.5, 50, 99, 150]) console.log(`  top at y=${y}: ${xs.map(x => `${x}:${topAt(u, x, y).toFixed(1)}`).join(' ')}`);
    const gableCells = sb.shell.cells.filter(c => sb.shell.faces[c.face].tag.kind === 'Gable');
    console.log(`  gable cells=${gableCells.length} sources=${[...new Set(gableCells.map(c => JSON.stringify(c.source)))].join(' ')}`);
  } catch (e) {
    console.log(`  THROWS: ${(e as Error).message.slice(0, 500)}`);
  }
}

export async function main(): Promise<void> {
  await run(400, 600, 45, 45);
  await run(330, 610, 30, 45);
  await run(800, 1000, 45, 45);
}
