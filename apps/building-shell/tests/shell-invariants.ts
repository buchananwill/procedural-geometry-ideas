// Spec decision 32's invariants and the net's own (journal decisions 58 to 60), as one function returning every
// violation found, so a sweep of hundreds of builds reports each failing case by name rather than one expect at a time.
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {snapPoint} from '../src/edges.ts';
import {ShellFace, loopArea, meshPoint} from '../src/faces.ts';
import type {ShellBuild} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {dist3, lineDistance} from '../src/vec3.ts';
import {SNAP_STEPS_PER_CM} from '../src/weld.ts';
import {winningRegionViolations} from './winning-regions.ts';

/** Tagged and summed areas to 0.05 cm², as `union.test.ts` asserts them. */
export const AREA_TOL = 0.05;
/** The furthest `snapCm` moves a 3D point: half a 1/1024 cm step on each axis. */
export const SNAP_MOVE = Math.sqrt(3) / (2 * SNAP_STEPS_PER_CM);

/** Distance between two points: `vec3.ts`'s `dist3`, under the name the test files read it by (N8). */
export const dist = dist3;

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

/**
 * What a build is expected to measure: its genus and its Cheek ShellFaces. Spec decision 32 as amended (journal
 * decision 135): genus is asserted per connected component. A number is one component of that genus; a list is every
 * component's genus, highest first.
 */
export interface ShellExpectation { genus: number | readonly number[]; cheeks: number }

/**
 * Every connected component's genus, highest first. Components are the output triangles joined across shared edges,
 * so solids touching only at a point or along an edge, which Manifold writes on separate vertices, are separate
 * components (journal decision 140). Each one's genus is `1 - (V - E + F) / 2`.
 */
export function componentGenera(mesh: Pick<ShellBuild['union']['mesh'], 'tris'>): number[] {
  const T = mesh.tris;
  const nTri = T.length / 3;
  const up = Int32Array.from({length: nTri}, (_, i) => i);
  const find = (t: number): number => { while (up[t] !== t) { up[t] = up[up[t]]; t = up[t]; } return t; };
  const byEdge = new Map<string, number>();
  for (let t = 0; t < nTri; t++) {
    for (let j = 0; j < 3; j++) {
      const a = T[3 * t + j], b = T[3 * t + (j + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const u = byEdge.get(k);
      if (u === undefined) byEdge.set(k, t); else up[find(t)] = find(u);
    }
  }
  const comps = new Map<number, {v: Set<number>; e: number; f: number}>();
  for (let t = 0; t < nTri; t++) {
    const r = find(t);
    let c = comps.get(r);
    if (!c) { c = {v: new Set(), e: 0, f: 0}; comps.set(r, c); }
    c.f++;
    for (let j = 0; j < 3; j++) c.v.add(T[3 * t + j]);
  }
  for (const t of byEdge.values()) {
    const c = comps.get(find(t));
    if (c) c.e++;
  }
  return [...comps.values()].map(c => 1 - (c.v.size - c.e + c.f) / 2).sort((a, b) => b - a);
}

/**
 * Float epsilon for an area sum, in cm² per cm² summed: double arithmetic over float32 positions of a few thousand cm
 * rounds each term at about 1e-13 of its size, so a sum of a few hundred terms keeps 1e-9 of headroom.
 */
export const AREA_EPS_PER_CM2 = 1e-9;

/** A straight segment between two points. */
export type Segment = [Vec3, Vec3];

/** Distance from `p` to segment `s`. */
function segmentDistance(p: Vec3, [a, b]: Segment): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2)) : 0;
  return Math.hypot(a[0] + t * ab[0] - p[0], a[1] + t * ab[1] - p[1], a[2] + t * ab[2] - p[2]);
}

/** Iterations of each one-dimensional search: halves the interval 40 times, far finer than any tolerance here. */
const SEARCH_STEPS = 40;

/**
 * Whether every point of segment `s` lies within `tol` of some segment of `targets`. Each target's distance along `s`
 * is convex, so the stretch of `s` within `tol` of it is one interval, found by a ternary search for its nearest
 * point and a bisection either side; `s` is covered when those intervals leave no gap.
 */
function segmentCovered(s: Segment, targets: readonly Segment[], tol: number): boolean {
  const at = (u: number): Vec3 => [s[0][0] + u * (s[1][0] - s[0][0]), s[0][1] + u * (s[1][1] - s[0][1]), s[0][2] + u * (s[1][2] - s[0][2])];
  const lo = [0, 1, 2].map(k => Math.min(s[0][k], s[1][k]) - tol), hi = [0, 1, 2].map(k => Math.max(s[0][k], s[1][k]) + tol);
  const spans: [number, number][] = [];
  for (const t of targets) {
    if ([0, 1, 2].some(k => Math.max(t[0][k], t[1][k]) < lo[k] || Math.min(t[0][k], t[1][k]) > hi[k])) continue;
    const f = (u: number): number => segmentDistance(at(u), t);
    let a = 0, b = 1;
    for (let k = 0; k < SEARCH_STEPS; k++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      if (f(m1) <= f(m2)) b = m2; else a = m1;
    }
    const best = (a + b) / 2;
    if (f(best) > tol) continue;
    const edge = (from: number, to: number): number => {
      if (f(from) <= tol) return from;
      let inside = best, outside = from;
      for (let k = 0; k < SEARCH_STEPS; k++) { const m = (inside + outside) / 2; if (f(m) <= tol) inside = m; else outside = m; }
      return inside;
    };
    spans.push([edge(0, best), edge(1, best)]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let reach = 0;
  const gap = 1e-9;
  for (const [u0, u1] of spans) {
    if (u0 > reach + gap) return false;
    reach = Math.max(reach, u1);
  }
  return reach >= 1 - gap;
}

/** The Hausdorff test: every point of each set lies within `tol` of the other. */
export const withinHausdorff = (a: readonly Segment[], b: readonly Segment[], tol: number): boolean =>
  a.every(s => segmentCovered(s, b, tol)) && b.every(s => segmentCovered(s, a, tol));

/**
 * Spec decision 32 as amended (journal decisions 110 and 122, F-E): every vertex loop reduction drops lies within
 * `SHELL_TOLERANCE_CM` of the chord it is dropped onto, and each ShellFace's loops, as exported, lie within
 * `SHELL_TOLERANCE_CM` of its own triangles' boundary, and that boundary within it, by Hausdorff distance. (C5's area
 * half compared the loops' area with an identity of itself, and caught nothing.)
 */
export function faceLoopViolations(b: ShellBuild): string[] {
  const {mesh} = b.union;
  const P = (v: number): Vec3 => meshPoint(mesh.positions, v);
  const boundary: Segment[][] = b.shell.faces.map(() => []);
  for (let h = 0; h < mesh.tris.length; h++) {
    const f = b.faces.triFace[Math.floor(h / 3)];
    if (b.faces.triFace[Math.floor(b.faces.topo.twin[h] / 3)] === f) continue;
    boundary[f].push([P(mesh.tris[h]), P(mesh.tris[3 * Math.floor(h / 3) + (h % 3 + 1) % 3])]);
  }
  const out: string[] = [];
  for (const face of b.shell.faces) {
    for (const d of b.faces.dropped[face.id]) {
      for (const v of d.dropped) {
        const off = lineDistance(P(v), P(d.from), P(d.to));
        if (off > SHELL_TOLERANCE_CM) out.push(`face ${face.id} drops vertex ${v}, ${off} cm off its chord`);
      }
    }
    const loops: Segment[] = face.loops.flatMap(l => l.map((p, i): Segment => [p, l[(i + 1) % l.length]]));
    if (!withinHausdorff(loops, boundary[face.id], SHELL_TOLERANCE_CM)) {
      out.push(`face ${face.id}'s loops lie further than ${SHELL_TOLERANCE_CM} cm from its triangles' boundary`);
    }
  }
  return out;
}

/**
 * Journal decision 135, F3: on every storey with a hole, every raw face of the hip solid and of the cut pieces lying on
 * a cut's vertical plane within the cut's span is tagged `Internal` (spec decision 2 as amended), so the cut's residue
 * cannot go silent under another tag. A holed storey whose cut planes carry no such face at all is a violation too.
 */
export function cutPlaneViolations(u: Pick<ShellBuild['union'], 'plans' | 'parts' | 'tags'>): string[] {
  const out: string[] = [];
  const tol = SHELL_TOLERANCE_CM;
  for (const plan of u.plans) {
    plan.building.comps.forEach((comp, ci) => {
      const cuts = comp.walls.filter(w => w.form === 'cut');
      if (!cuts.length) return;
      const prefix = `${plan.label} storey ${plan.storey} `;
      const cutPieces = plan.roof.pieces.flatMap((p, k) => (p.wall.form === 'cut' && p.wall.comp === ci ? [`${prefix}gable piece ${k} (${p.label})`] : []));
      const names = new Set([`${prefix}hip solid island ${ci}`, ...cutPieces]);
      let onCut = 0;
      for (const part of u.parts) {
        if (!names.has(part.name)) continue;
        const P = part.soup.positions;
        part.soup.faceIDs.forEach((f, t) => {
          const vs = [0, 1, 2].map(j => part.soup.tris[3 * t + j]);
          const on = cuts.some(w => {
            const vertical = w.a.x === w.b.x;
            const lo = vertical ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x), hi = vertical ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
            return vs.every(v => {
              const [x, y] = [P[3 * v], P[3 * v + 1]];
              const across = vertical ? x - w.a.x : y - w.a.y, along = vertical ? y : x;
              return Math.abs(across) <= tol && along >= lo - tol && along <= hi + tol;
            });
          });
          if (!on) return;
          onCut++;
          if (u.tags.table[f].kind !== 'Internal') out.push(`${part.name}: triangle ${t} on the cut plane is ${u.tags.table[f].kind}, not Internal`);
        });
      }
      if (!onCut) out.push(`${prefix}island ${ci}: no raw face lies on its cut's plane`);
    });
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
  const genera = componentGenera(u.mesh), wanted = typeof want.genus === 'number' ? [want.genus] : [...want.genus];
  if (genera.join(',') !== wanted.join(',')) out.push(`genus per component ${genera.join(',')}, expected ${wanted.join(',')}`);
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
  out.push(...faceLoopViolations(b), ...tagPlaneViolations(b), ...winningRegionViolations(u), ...cutPlaneViolations(u));
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
