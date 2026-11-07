// Steps 2 and 3 of the four-step model: the storeys' raw parts, stacked at their storey heights, go through one
// `Manifold.union` (spec decision 12), and every output triangle's tag is its faceID's (13), re-tagged where
// coplanar raw faces overlap (14, 15). Nothing else removes geometry.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {ShellFixture, storeysOf} from './fixture.ts';
import {Wasm, getManifold} from './manifold.ts';
import {PartContext, RawPart, StoreyPlan, buildStoreyParts, makePartContext, planStorey} from './storey.ts';
import {FaceTag, Plane3, ShellTags, Vec3, identityKey, makeShellTags, planeLabel, retagCompare, tagLabel} from './tags.ts';
import type {Manifold} from 'manifold-3d';

/** The union's output mesh: float32 positions, merged vertex indices, one input faceID per triangle. */
export interface ShellMesh { positions: Float32Array; tris: Uint32Array; faceIDs: Uint32Array }

export interface ShellUnion {
  label: string;
  /** Manifold's status of the union. */
  status: string;
  /** Every directed edge of the output is matched by exactly one reverse edge. */
  closed: boolean;
  mesh: ShellMesh;
  tags: ShellTags;
  /** Every raw part before the union, still addressable (spec decision 29's raw mode). */
  parts: RawPart[];
  plans: StoreyPlan[];
  /** Per output triangle: its tag after the re-tag pass. */
  triTags: FaceTag[];
  /** Spec decision 15: every coplanar conflict, with its label, plane and both tags. */
  conflicts: string[];
  /** Spec decision 17: output triangles whose faceID is Internal. */
  survivingInternal: number;
  /** Surviving Cheek identities with area above `SHELL_TOLERANCE_CM`². */
  cheeks: number;
}

/** Spec decision 11: a raw part enters Manifold through `ofMesh`; a refusal is a hard error naming the part. */
export function partManifold(wasm: Wasm, part: RawPart): Manifold {
  const {soup} = part;
  let m: Manifold;
  try {
    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(soup.positions),
      triVerts: new Uint32Array(soup.tris),
      faceID: new Uint32Array(soup.faceIDs),
    });
    m = wasm.Manifold.ofMesh(mesh);
  } catch (e) {
    throw new Error(`${part.name}: Manifold refuses the part: ${(e as Error).message ?? e}`);
  }
  const status = m.status();
  if (status !== 'NoError') { m.delete(); throw new Error(`${part.name}: Manifold refuses the part as ${status}`); }
  return m;
}

function isClosed(tris: Uint32Array): boolean {
  const half = new Map<string, number>();
  for (let t = 0; t < tris.length / 3; t++) {
    for (let j = 0; j < 3; j++) {
      const k = `${tris[3 * t + j]},${tris[3 * t + (j + 1) % 3]}`;
      half.set(k, (half.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of half) {
    const [a, b] = k.split(',');
    if (n !== 1 || half.get(`${b},${a}`) !== 1) return false;
  }
  return true;
}

/** The one union over every raw part. */
export function unionParts(wasm: Wasm, parts: RawPart[]): {status: string; closed: boolean; mesh: ShellMesh} {
  const ms = parts.map(p => partManifold(wasm, p));
  const u = wasm.Manifold.union(ms);
  const status = u.status();
  const out = u.getMesh();
  ms.forEach(m => m.delete());
  u.delete();
  const np = out.numProp;
  const merge = new Map<number, number>();
  for (let i = 0; i < out.mergeFromVert.length; i++) merge.set(out.mergeFromVert[i], out.mergeToVert[i]);
  const positions = new Float32Array(3 * out.numVert);
  for (let v = 0; v < out.numVert; v++) for (let a = 0; a < 3; a++) positions[3 * v + a] = out.vertProperties[np * v + a];
  const tris = Uint32Array.from(out.triVerts, v => merge.get(v) ?? v);
  const mesh: ShellMesh = {positions, tris, faceIDs: Uint32Array.from(out.faceID)};
  return {status, closed: tris.length > 0 && isClosed(tris), mesh};
}

// ---- The re-tag pass (spec decision 15) ---------------------------------------------------------------------------

export const PLANE_NORMAL_TOL = 1e-5;

/** Same oriented plane: normals within 1e-5, offsets within `SHELL_TOLERANCE_CM`. */
export const samePlane = (p: Plane3, q: Plane3): boolean =>
  Math.abs(p.n[0] - q.n[0]) <= PLANE_NORMAL_TOL && Math.abs(p.n[1] - q.n[1]) <= PLANE_NORMAL_TOL
  && Math.abs(p.n[2] - q.n[2]) <= PLANE_NORMAL_TOL && Math.abs(p.d - q.d) <= SHELL_TOLERANCE_CM;

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A raw triangle prepared for the containment test on its face's plane. */
interface RawTri { a: Vec3; edges: {o: Vec3; m: Vec3}[]; lo: Vec3; hi: Vec3 }

function prepare(a: Vec3, b: Vec3, c: Vec3, n: Vec3): RawTri | null {
  const area = Math.hypot(...cross3(sub3(b, a), sub3(c, a))) / 2;
  if (area < SHELL_TOLERANCE_CM ** 2) return null;
  const edges = [[a, b], [b, c], [c, a]].map(([o, e]) => {
    const m = cross3(n, sub3(e, o));
    const L = Math.hypot(...m);
    return {o, m: [m[0] / L, m[1] / L, m[2] / L] as Vec3};
  });
  const lo = [0, 1, 2].map(i => Math.min(a[i], b[i], c[i]) - SHELL_TOLERANCE_CM) as Vec3;
  const hi = [0, 1, 2].map(i => Math.max(a[i], b[i], c[i]) + SHELL_TOLERANCE_CM) as Vec3;
  return {a, edges, lo, hi};
}

const holds = (t: RawTri, q: Vec3): boolean =>
  q[0] >= t.lo[0] && q[0] <= t.hi[0] && q[1] >= t.lo[1] && q[1] <= t.hi[1] && q[2] >= t.lo[2] && q[2] <= t.hi[2]
  && t.edges.every(e => dot3(e.m, sub3(q, e.o)) >= -SHELL_TOLERANCE_CM);

export function retagPass(label: string, mesh: ShellMesh, parts: RawPart[], tags: ShellTags): {triTags: FaceTag[]; conflicts: string[]} {
  const {table, planes} = tags;
  // Raw triangles per faceID, on their face's exact generating plane.
  const raw: RawTri[][] = table.map(() => []);
  for (const part of parts) {
    const {positions: P, tris, faceIDs} = part.soup;
    for (let t = 0; t < tris.length / 3; t++) {
      const f = faceIDs[t];
      const v = (j: number): Vec3 => [P[3 * tris[3 * t + j]], P[3 * tris[3 * t + j] + 1], P[3 * tris[3 * t + j] + 2]];
      const r = prepare(v(0), v(1), v(2), planes[f].n);
      if (r) raw[f].push(r);
    }
  }
  // Faces sharing an oriented plane, Internal excluded.
  const coplanar = new Map<number, number[]>();
  const peersOf = (f: number): number[] => {
    let got = coplanar.get(f);
    if (!got) {
      got = table.map((_, g) => g).filter(g => table[g].kind !== 'Internal' && samePlane(planes[f], planes[g]));
      coplanar.set(f, got);
    }
    return got;
  };

  const conflicts = new Set<string>();
  const triTags: FaceTag[] = [];
  const P = mesh.positions;
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const f = mesh.faceIDs[t];
    const own = table[f];
    if (!own) throw new Error(`${label}: output triangle ${t} carries faceID ${f}, which no raw part issued`);
    if (own.kind === 'Internal') { triTags.push(own); continue; }
    const q = [0, 1, 2].map(ax => (P[3 * mesh.tris[3 * t] + ax] + P[3 * mesh.tris[3 * t + 1] + ax] + P[3 * mesh.tris[3 * t + 2] + ax]) / 3) as Vec3;
    const found = new Map<string, FaceTag>([[identityKey(own), own]]);
    for (const g of peersOf(f)) {
      const k = identityKey(table[g]);
      if (found.has(k)) continue;
      if (raw[g].some(r => holds(r, q))) found.set(k, table[g]);
    }
    const ranked = [...found.values()].sort(retagCompare);
    const winner = ranked[0];
    for (const loser of ranked.slice(1)) conflicts.add(`${label}: ${planeLabel(planes[f])}: ${tagLabel(winner)} over ${tagLabel(loser)}`);
    triTags.push(winner);
  }
  return {triTags, conflicts: [...conflicts].sort()};
}

// ---- Measures -----------------------------------------------------------------------------------------------------

export function triArea(mesh: ShellMesh, t: number): number {
  const P = mesh.positions;
  const v = (j: number): Vec3 => { const i = 3 * mesh.tris[3 * t + j]; return [P[i], P[i + 1], P[i + 2]]; };
  const a = v(0);
  return Math.hypot(...cross3(sub3(v(1), a), sub3(v(2), a))) / 2;
}

/** Total output area whose (re-tagged) tag satisfies `pred`. */
export function taggedArea(u: Pick<ShellUnion, 'mesh' | 'triTags'>, pred: (t: FaceTag) => boolean): number {
  let s = 0;
  u.triTags.forEach((tag, t) => { if (pred(tag)) s += triArea(u.mesh, t); });
  return s;
}

/** Output area per identity, for every identity whose tag satisfies `pred`. */
export function areaByIdentity(u: Pick<ShellUnion, 'mesh' | 'triTags'>, pred: (t: FaceTag) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  u.triTags.forEach((tag, t) => {
    if (!pred(tag)) return;
    const k = identityKey(tag);
    out.set(k, (out.get(k) ?? 0) + triArea(u.mesh, t));
  });
  return out;
}

// ---- Entry points --------------------------------------------------------------------------------------------------

/** Unions already-planned storeys: builds every raw part, takes the one union, re-tags and counts. */
export function unionPlans(wasm: Wasm, label: string, plans: StoreyPlan[]): ShellUnion {
  const tags = makeShellTags();
  const ctx: PartContext = makePartContext(wasm, tags);
  for (const plan of plans) buildStoreyParts(ctx, plan);
  const {status, closed, mesh} = unionParts(wasm, ctx.parts);
  const {triTags, conflicts} = retagPass(label, mesh, ctx.parts, tags);
  const base = {mesh, triTags};
  const survivingInternal = triTags.filter(t => t.kind === 'Internal').length;
  const cheeks = [...areaByIdentity(base, t => t.kind === 'Cheek').values()].filter(a => a > SHELL_TOLERANCE_CM ** 2).length;
  return {label, status, closed, mesh, tags, parts: ctx.parts, plans, triTags, conflicts, survivingInternal, cheeks};
}

/** Spec decisions 2, 12 to 17: every storey of the fixture planned, stacked and unioned. */
export async function unionShell(fixture: ShellFixture): Promise<ShellUnion> {
  const wasm = await getManifold();
  return unionPlans(wasm, fixture.name, storeysOf(fixture).map(n => planStorey(fixture, n)));
}
