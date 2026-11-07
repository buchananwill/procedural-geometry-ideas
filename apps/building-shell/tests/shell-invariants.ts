// Spec decision 32's invariants and the net's own (journal decisions 58 to 60), as one function returning every
// violation found, so a sweep of hundreds of builds reports each failing case by name rather than one expect at a time.
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {snapPoint} from '../src/edges.ts';
import {ShellFace, loopArea, meshPoint} from '../src/faces.ts';
import type {ShellBuild} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';
import {winningRegionViolations} from './winning-regions.ts';

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

/** What a build is expected to measure: its genus and its Cheek ShellFaces. */
export interface ShellExpectation { genus: number; cheeks: number }

/**
 * Float epsilon for an area sum, in cm² per cm² summed: double arithmetic over float32 positions of a few thousand cm
 * rounds each term at about 1e-13 of its size, so a sum of a few hundred terms keeps 1e-9 of headroom.
 */
export const AREA_EPS_PER_CM2 = 1e-9;

/** Distance from `p` to the line through `a` and `b`. */
function lineDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L2 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2 : 0;
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}

/**
 * Spec decision 32 as amended (journal decision 110, C5): every vertex loop reduction drops lies within
 * `SHELL_TOLERANCE_CM` of the chord it is dropped onto, and each face's loop area equals its own triangles' area less
 * the exact area of the dropped chains, within float epsilon. Its triangles are summed projected on the face's normal,
 * as its loops are; each dropped chain's polygon is its kept ends with its dropped vertices between.
 */
export function faceAreaViolations(b: ShellBuild): string[] {
  const {mesh} = b.union;
  const P = (v: number): Vec3 => meshPoint(mesh.positions, v);
  const own = new Array<number>(b.shell.faces.length).fill(0);
  const scale = new Array<number>(b.shell.faces.length).fill(0);
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const f = b.faces.triFace[t];
    const a = loopArea([0, 1, 2].map(j => P(mesh.tris[3 * t + j])), b.shell.faces[f].normal);
    own[f] += a;
    scale[f] += Math.abs(a);
  }
  const out: string[] = [];
  for (const face of b.shell.faces) {
    const chains = b.faces.dropped[face.id];
    const cut = chains.reduce((s, d) => s + loopArea([d.from, ...d.dropped, d.to].map(P), face.normal), 0);
    const gap = Math.abs(face.area - (own[face.id] - cut));
    if (gap > AREA_EPS_PER_CM2 * Math.max(1, scale[face.id])) {
      out.push(`face ${face.id}'s loop area ${face.area} is not its triangles' ${own[face.id]} less the ${cut} dropped (gap ${gap})`);
    }
    for (const d of chains) {
      for (const v of d.dropped) {
        const off = lineDistance(P(v), P(d.from), P(d.to));
        if (off > SHELL_TOLERANCE_CM) out.push(`face ${face.id} drops vertex ${v}, ${off} cm off its chord`);
      }
    }
  }
  return out;
}

/** Journal decision 110, C3: every output triangle with a corner off its tag's generating plane. */
export function tagPlaneViolations(b: ShellBuild): string[] {
  const {mesh, tags} = b.union;
  const out: string[] = [];
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const {n, d} = tags.planes[mesh.faceIDs[t]];
    for (let j = 0; j < 3; j++) {
      const p = meshPoint(mesh.positions, mesh.tris[3 * t + j]);
      const off = Math.abs(n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d);
      if (off > SHELL_TOLERANCE_CM) { out.push(`triangle ${t} lies ${off} cm off its tag's plane`); break; }
    }
  }
  return out;
}

/**
 * Journal decision 60 (and 110, C3): each vertex lists its NetEdges and Cells in its Cells' counter-clockwise order,
 * each Cell between the side it leaves by and the one it arrives by, and every incidence exactly once. The lists are
 * runs in turn: a run either ends at a gap, or closes on its own first NetEdge, as each sheet's fan does at a pinch
 * (journal decision 110, C1), and a single closed fan is one such run.
 */
export function cyclicOrderViolations(b: ShellBuild): string[] {
  const {cells, vertices, netEdges} = b.shell;
  const out: string[] = [];
  const edgesAt: number[][] = vertices.map(() => []), cellsAt: number[][] = vertices.map(() => []);
  for (const n of netEdges) for (const v of n.v) edgesAt[v].push(n.id);
  for (const c of cells) for (const v of c.corners) cellsAt[v].push(c.id);
  const sorted = (xs: number[]): string => [...xs].sort((x, y) => x - y).join(',');
  for (const v of vertices) {
    let last = -1;
    let runStart = 0;
    let arrivedAt = -1;
    for (const cid of v.cells) {
      const c = cells[cid];
      const i = c.corners.indexOf(v.id);
      const leaving = c.sides[i], arriving = c.sides[(i - 1 + c.corners.length) % c.corners.length];
      const j = v.edges.indexOf(leaving);
      if (j !== arrivedAt) runStart = j; // a new run starts after a gap or a closed run
      const next = v.edges[j + 1] === arriving ? j + 1 : v.edges[runStart] === arriving ? -1 : -2;
      if (j <= last || next === -2) { out.push(`vertex ${v.id} lists cell ${cid} out of order`); break; }
      last = j;
      arrivedAt = next;
    }
    if (sorted(v.edges) !== sorted(edgesAt[v.id])) out.push(`vertex ${v.id} does not list each NetEdge once`);
    if (sorted(v.cells) !== sorted(cellsAt[v.id])) out.push(`vertex ${v.id} does not list each Cell once`);
  }
  return out;
}

/**
 * Every violation of spec decision 32 and of the net's invariants in one build, as text; empty when it passes.
 * - decision 32: Manifold's status OK; closed, with the expected genus; `survivingInternal` 0; `cheeks` as expected;
 *   every Cell's polygon on its face's plane and inside its region; each face's area accounted for (C5); every
 *   output triangle on its tag's plane and wholly in its winning region (WP3.5's `winningRegionViolations`), no
 *   Unclassified Edge, and no ShellEdge joining two faces of one identity (C3);
 * - the net: each face's Cells tile its lattice projection; NetEdges pair Cell sides one to one; every Cell winds
 *   counter-clockwise from outside; vertices are distinct grid points; every vertex names only real faces, and lists
 *   its NetEdges and Cells in decision 60's cyclic order.
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
  out.push(...faceAreaViolations(b), ...tagPlaneViolations(b), ...winningRegionViolations(u));
  if (shell.report.unclassifiedEdges !== 0) out.push(`${shell.report.unclassifiedEdges} Unclassified Edges`);
  for (const e of shell.edges) {
    if (b.faces.identities[e.faces[0]] === b.faces.identities[e.faces[1]]) out.push(`ShellEdge ${e.id} joins two faces of one identity`);
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
  out.push(...cyclicOrderViolations(b));
  return out;
}
