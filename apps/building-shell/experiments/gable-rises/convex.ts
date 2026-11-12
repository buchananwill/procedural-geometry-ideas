// Rises on a convex rectangle: F60 and F61 again through the harness (runs authored on a Ring side), more pitch pairs
// and band positions, decisions 9 and 10 at a convex corner with equal and unequal pitches, and a rise widened to the
// whole wall against today's whole-wall gable for the same input.
import {buildShellDetailed, buildShellFromUnion, type ShellBuild} from '../../src/shell.ts';
import {getManifold} from '../../src/manifold.ts';
import {planChecked} from '../../src/storey.ts';
import {storeyLoops} from '../../src/ring-forms.ts';
import {unionPlans} from '../../src/union.ts';
import {DEFAULTS, deriveWalls, fx, gableRun, report, ring, risePiece, runs, storeyBuildingWith, type RiseOptions} from './rise.ts';

const R = [0, 0, 1000, 500] as [number, number, number, number];

/** A structural signature of a shell: faces by kind, plane and area; Edge kinds; Cell count. Tags' wall ids omitted. */
function signature(b: ShellBuild): string {
  const faces = b.shell.faces.map(f => `${f.tag.kind}|${f.normal.map(v => v.toFixed(5)).join(',')}|${f.offset.toFixed(3)}|${f.area.toFixed(1)}`).sort();
  const edges = b.shell.edges.map(e => e.kind).sort();
  return JSON.stringify({faces, edges, cells: b.shell.cells.length, tris: b.union.mesh.tris.length / 3});
}

export async function main(): Promise<void> {
  console.log('# F60 and F61 through the harness');
  await report(fx('F60a band [400,600] rise 45 on 45', [ring(R, 0, 1, 45, {S: runs(gableRun(400, 600, 45))})]));
  await report(fx('F60b band [330,610] rise 45 on 30', [ring(R, 0, 1, 30, {S: runs(gableRun(330, 610, 45))})]));
  const off: RiseOptions = {...DEFAULTS, canonicalise: false, cornerRule: false};
  await report(fx('F61 band [800,1000] rise 45 on 45, decisions 9 and 10 off', [ring(R, 0, 1, 45, {S: runs(gableRun(800, 1000, 45))})]), off);

  console.log('\n# Pitch pairs and band positions, mid-wall');
  for (const [rise, wall] of [[60, 45], [30, 45], [45, 60], [45, 22.5], [60, 30]]) {
    for (const [lo, hi] of [[100, 300], [400, 600], [250, 750], [650, 900]]) {
      await report(fx(`mid band [${lo},${hi}] rise ${rise} on ${wall}`, [ring(R, 0, 1, wall, {S: runs(gableRun(lo, hi, rise))})]));
    }
  }
  console.log('\n# Rise on a short wall (E side, y 0 to 500, band from the side start)');
  for (const [rise, wall] of [[45, 45], [60, 30]]) await report(fx(`E side band [150,350] rise ${rise} on ${wall}`, [ring(R, 0, 1, wall, {E: runs(gableRun(150, 350, rise))})]));

  console.log('\n# Decisions 9 and 10 at a convex corner');
  for (const [rise, wall] of [[45, 45], [60, 45], [30, 45], [75, 30]]) {
    for (const [label, opt] of [['9 off, 10 off', off], ['9 on, 10 off', {...DEFAULTS, cornerRule: false}], ['9 off, 10 on', {...DEFAULTS, canonicalise: false}], ['9 on, 10 on', DEFAULTS]] as [string, RiseOptions][]) {
      await report(fx(`corner band [800,1000] rise ${rise} on ${wall}, ${label}`, [ring(R, 0, 1, wall, {S: runs(gableRun(800, 1000, rise))})]), opt);
    }
  }
  for (const [rise, wall] of [[45, 45], [60, 45]]) await report(fx(`corner band [0,300] rise ${rise} on ${wall} (lo end)`, [ring(R, 0, 1, wall, {S: runs(gableRun(0, 300, rise))})]));

  console.log('\n# A rise widened to the whole wall against the whole-wall gable (decision 21, last gate)');
  for (const [rise, wall] of [[45, 45], [60, 45], [30, 45]]) {
    const todayF = fx(`whole-wall gable S at ${rise}, others ${wall}`, [ring(R, 0, 1, wall, {S: {form: 'gable', deg: rise}})]);
    const t = await buildShellDetailed(todayF);
    for (const cornerRule of [true, false]) {
      // The wall enters the solve hipped at the rise's pitch (as a gable wall does today, F58), its one extent a rise.
      const rw = await buildWide(rise, wall, cornerRule);
      console.log(`\n== widened rise [0,1000] at ${rise} on ${wall}, decision 10 ${cornerRule ? 'on' : 'off'}`);
      console.log(`  ${rw.line}`);
      console.log(`  same shell as today's whole-wall gable: ${signature(rw.build) === signature(t)}; faces ${rw.build.shell.faces.length} vs ${t.shell.faces.length}, cells ${rw.build.shell.cells.length} vs ${t.shell.cells.length}`);
    }
  }
}

/** A whole-wall rise forced past decision 5: the S wall hipped at the rise's pitch, one rise over [0, 1000]. */
async function buildWide(rise: number, wall: number, cornerRule: boolean): Promise<{line: string; build: ShellBuild}> {
  const wasm = await getManifold();
  const f = fx('wide', [ring(R, 0, 1, wall, {S: {form: 'hip', deg: rise}})]);
  const rings = [{index: 0, ring: f.rings[0]}];
  const loops = storeyLoops([R]);
  const d = deriveWalls(rings, loops, 0, DEFAULTS);
  const plan = planChecked('wide', 0, 0, 250, storeyBuildingWith(rings, loops, d.walls));
  const line = d.walls.find(w => w.axis === 'y' && w.at === 0)!;
  const rp = risePiece(f, plan, {form: 'gable', deg: rise, ring: 0, side: 'S', lo: 0, hi: 1000, storey: 0, line}, {...DEFAULTS, cornerRule});
  plan.roof.pieces.push(rp.piece);
  const build = buildShellFromUnion(wasm, f, unionPlans(wasm, 'wide', [plan]));
  const r = build.shell.report;
  return {build, line: `planes ${rp.roles.join(', ')}; closed=${build.union.closed} cheeks=${r.cheeks} conflicts=${r.conflicts.length} unclassified=${r.unclassifiedEdges} internal=${r.survivingInternal}`};
}
