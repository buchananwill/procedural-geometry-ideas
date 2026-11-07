// Spec decision 32's invariants and the net's own (journal decisions 58 to 60), as one function returning every
// violation found, so a sweep of hundreds of builds reports each failing case by name rather than one expect at a time.
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {snapPoint} from '../src/edges.ts';
import {ShellFace, loopArea, meshSurfaceArea} from '../src/faces.ts';
import type {ShellBuild} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';

/** Tagged and summed areas to 0.05 cm², as `union.test.ts` asserts them. */
export const AREA_TOL = 0.05;
/** The furthest `snapCm` moves a 3D point: half a 1/1024 cm step on each axis. */
export const SNAP_MOVE = Math.sqrt(3) / (2 * SNAP_STEPS_PER_CM);

const dist = (p: Vec3, q: Vec3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Whether plan point (x, y) lies in a face's plan projection, its boundary within tolerance included. */
export function planHolds(f: ShellFace, x: number, y: number): boolean {
  let winding = 0;
  for (const loop of f.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], c = loop[(i + 1) % loop.length];
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
      if (Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) <= SHELL_TOLERANCE_CM) return true;
      if ((a[1] <= y) !== (c[1] <= y)) {
        const xi = a[0] + ((y - a[1]) * dx) / dy;
        if (xi > x) winding += c[1] > a[1] ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

/** How closely a pinned residual must recur, in cm². */
export const RESIDUAL_TOL = 1e-3;

/**
 * What a build is expected to measure: its genus and its Cheek ShellFaces. `areaResidual`, where given, is a measured
 * gap between the face areas and the mesh's above `AREA_TOL`, pinned exactly: the gap must recur within
 * `RESIDUAL_TOL`, so both a worse gap and a cure break the test.
 */
export interface ShellExpectation { genus: number; cheeks: number; areaResidual?: number }

/**
 * Every violation of spec decision 32 and of the net's invariants in one build, as text; empty when it passes.
 * - decision 32: Manifold's status OK; closed, with the expected genus; `survivingInternal` 0; `cheeks` as expected;
 *   every Cell's polygon on its face's plane and inside its region; the face areas summing to the mesh's;
 * - the net: each face's Cells tile its lattice projection; NetEdges pair Cell sides one to one; every Cell winds
 *   counter-clockwise from outside; vertices are distinct grid points; every vertex names only real faces.
 */
export function invariantViolations(b: ShellBuild, want: ShellExpectation): string[] {
  const out: string[] = [];
  const {union: u, shell} = b;
  if (u.status !== 'NoError') out.push(`status ${u.status}`);
  if (!u.closed) out.push('not closed');
  if (u.genus !== want.genus) out.push(`genus ${u.genus}, expected ${want.genus}`);
  if (u.survivingInternal !== 0) out.push(`survivingInternal ${u.survivingInternal}`);
  if (shell.report.cheeks !== want.cheeks) out.push(`cheeks ${shell.report.cheeks}, expected ${want.cheeks}`);

  const tiled = new Map<number, number>();
  for (const c of shell.cells) {
    const f = shell.faces[c.face];
    const fr = b.frames[c.face];
    if (!fr) { out.push(`cell ${c.id} on face ${c.face}, which has no lattice`); continue; }
    for (const p of c.polygon) {
      const off = Math.abs(f.normal[0] * p[0] + f.normal[1] * p[1] + f.normal[2] * p[2] - f.offset);
      if (off > SHELL_TOLERANCE_CM) out.push(`cell ${c.id} corner (${p}) lies ${off} off its face's plane`);
    }
    const flat = (p: Vec3): Vec3 => [p[fr.s], p[fr.t], 0];
    const projected: ShellFace = {...f, loops: f.loops.map(l => l.map(flat))};
    for (const p of c.polygon) if (!planHolds(projected, p[fr.s], p[fr.t])) out.push(`cell ${c.id} corner (${p}) lies outside its face`);
    const area = loopArea(c.polygon.map(flat), [0, 0, 1]);
    if (loopArea(c.polygon, f.normal) <= 0) out.push(`cell ${c.id} winds clockwise from outside`);
    tiled.set(c.face, (tiled.get(c.face) ?? 0) + Math.abs(area));
  }
  const faceSum = shell.faces.reduce((s, f) => s + f.area, 0);
  const meshArea = meshSurfaceArea(u.mesh);
  const areaGap = Math.abs(faceSum - meshArea);
  if (want.areaResidual === undefined) {
    if (areaGap >= AREA_TOL) out.push(`face areas sum to ${faceSum}, the mesh's to ${meshArea}`);
  } else if (Math.abs(areaGap - want.areaResidual) >= RESIDUAL_TOL) {
    out.push(`face areas part from the mesh's by ${areaGap}, pinned at ${want.areaResidual}`);
  }
  b.frames.forEach((fr, f) => {
    if (!fr) return;
    const face = shell.faces[f];
    const r = 3 - fr.s - fr.t;
    const perimeter = face.loops.reduce((s, l) => s + l.reduce((t, p, i) => t + dist(p, l[(i + 1) % l.length]), 0), 0);
    const gap = Math.abs((tiled.get(f) ?? 0) - face.area * Math.abs(face.normal[r]));
    if (gap >= AREA_TOL + SNAP_MOVE * perimeter) out.push(`face ${f}'s Cells miss its projection by ${gap}`);
  });

  for (const n of shell.netEdges) {
    if (n.shellEdge < 0) {
      if (n.cells.length !== 2 || shell.cells[n.cells[0]].face !== shell.cells[n.cells[1]].face) out.push(`interior NetEdge ${n.id} borders cells ${n.cells}`);
      continue;
    }
    const faces = shell.edges[n.shellEdge].faces.filter(f => b.frames[f] !== null).sort();
    const got = n.cells.map(c => shell.cells[c].face).sort();
    if (got.join(',') !== faces.join(',')) out.push(`NetEdge ${n.id} on ShellEdge ${n.shellEdge} borders faces ${got}, expected ${faces}`);
  }
  for (const c of shell.cells) {
    c.sides.forEach((s, i) => {
      const n = shell.netEdges[s];
      const ends = [c.corners[i], c.corners[(i + 1) % c.corners.length]].sort().join(',');
      if (!n.cells.includes(c.id) || [...n.v].sort().join(',') !== ends) out.push(`cell ${c.id} side ${i} is not its NetEdge ${s}`);
    });
  }
  const keys = new Set(shell.vertices.map(v => v.p.join(',')));
  if (keys.size !== shell.vertices.length) out.push('two vertices share a position');
  for (const v of shell.vertices) {
    if (snapPoint(v.p).join(',') !== v.p.join(',')) out.push(`vertex ${v.id} is off the grid`);
    if (v.faces.some(f => !Number.isInteger(f) || f < 0 || f >= shell.faces.length)) out.push(`vertex ${v.id} names faces ${v.faces}`);
  }
  return out;
}
