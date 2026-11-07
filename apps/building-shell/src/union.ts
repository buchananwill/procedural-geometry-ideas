// Steps 2 and 3 of the four-step model: the storeys' raw parts, stacked at their storey heights, go through one
// `Manifold.union` (spec decision 12), and every output triangle's tag is its faceID's (13), re-tagged where
// coplanar raw faces overlap (14, 15). Between the union and the re-tag pass, the output is cleaned (`clean.ts`,
// journal decision 101, F36): edges shorter than `CLEAN_TOLERANCE_CM` collapse. Nothing else removes geometry. The
// cleaned mesh is then imprinted with the winner boundaries (`imprint.ts`, spec decision 15 as amended, journal
// decision 111) before any tag is decided.
import type {ErrorStatus, Manifold} from 'manifold-3d';
import {CleanStats, cleanMesh} from './clean.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {ShellFixture, storeysOf} from './fixture.ts';
import {Wasm, getManifold} from './manifold.ts';
import {errorMessage} from './errors.ts';
import {ImprintStats, imprintRegions} from './imprint.ts';
import {RegionModel, makeRegionModel} from './regions.ts';
import {PartContext, RawPart, StoreyPlan, buildStoreyParts, makePartContext, planStorey} from './storey.ts';
import {FaceTag, ShellTags, Vec3, identityKey, makeShellTags, planeLabel, tagLabel} from './tags.ts';
import {cross3, sub3} from './vec3.ts';

export {RETAG_SLACK_CM, prepareRawTri, rawTriHolds} from './regions.ts';
export type {RawTri, RawTriEdge} from './regions.ts';

/** The union's output mesh: float32 positions, vertex indices, one input faceID per triangle. */
export interface ShellMesh { positions: Float32Array; tris: Uint32Array; faceIDs: Uint32Array }

export interface ShellUnion {
  label: string;
  /** Manifold's status of the union. */
  status: ErrorStatus;
  /** Every directed edge of the output is matched by exactly one reverse edge. */
  closed: boolean;
  /** The output manifold's genus (spec decision 32 as amended). */
  genus: number;
  /**
   * The union's output after the cleaning (journal decision 101, F36) and the imprint (journal decision 111): what the
   * re-tag pass and step 4 read.
   */
  mesh: ShellMesh;
  /** What the cleaning merged and dropped. */
  clean: CleanStats;
  /** What the imprint cut and added. */
  imprint: ImprintStats;
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

/** What the union alone yields. */
export type UnionPartsResult = Pick<ShellUnion, 'status' | 'closed' | 'genus' | 'mesh' | 'clean'>;

/** What the re-tag pass yields. */
export type RetagResult = Pick<ShellUnion, 'triTags' | 'conflicts'>;

/** An output mesh with its re-tagged triangles and each faceID's plane: all the area measures need. */
export type TaggedMesh = Pick<ShellUnion, 'mesh' | 'triTags' | 'tags'>;

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
    throw new Error(`${part.name}: Manifold refuses the part: ${errorMessage(e)}`);
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

/** The one union over every raw part. Every Manifold it makes is freed, whether or not a part is refused. */
export function unionParts(wasm: Wasm, parts: RawPart[]): UnionPartsResult {
  const ms: Manifold[] = [];
  let u: Manifold | undefined;
  try {
    for (const p of parts) ms.push(partManifold(wasm, p));
    u = wasm.Manifold.union(ms);
    const status = u.status();
    // numProp is 3, so the output has no property seams and no merge vectors.
    const out = u.getMesh();
    const np = out.numProp;
    const positions = new Float32Array(3 * out.numVert);
    for (let v = 0; v < out.numVert; v++) for (let a = 0; a < 3; a++) positions[3 * v + a] = out.vertProperties[np * v + a];
    const raw: ShellMesh = {positions, tris: Uint32Array.from(out.triVerts), faceIDs: Uint32Array.from(out.faceID)};
    // A union Manifold refuses is reported as it stands, uncleaned.
    if (status !== 'NoError') {
      return {status, closed: raw.tris.length > 0 && isClosed(raw.tris), genus: u.genus(), mesh: raw, clean: {merged: 0, collapsed: 0, flipped: 0, maxMoveCm: 0}};
    }
    const {mesh, stats} = cleanMesh(raw);
    const genus = mesh === raw ? u.genus() : remeshedGenus(wasm, mesh, 'cleaned');
    return {status, closed: mesh.tris.length > 0 && isClosed(mesh.tris), genus, mesh, clean: stats};
  } finally {
    ms.forEach(m => m.delete());
    u?.delete();
  }
}

/**
 * Journal decisions 101 (F36) and 111 (F41): the cleaned mesh, and again the imprinted one, goes back through
 * `Manifold.ofMesh`, which must accept it as a closed manifold; its genus is that mesh's. A refusal is a hard error.
 */
function remeshedGenus(wasm: Wasm, mesh: ShellMesh, what: string): number {
  let m: Manifold;
  try {
    m = wasm.Manifold.ofMesh(new wasm.Mesh({numProp: 3, vertProperties: mesh.positions, triVerts: mesh.tris, faceID: mesh.faceIDs}));
  } catch (e) {
    throw new Error(`the ${what} union is no manifold: ${errorMessage(e)}`);
  }
  try {
    const status = m.status();
    if (status !== 'NoError') throw new Error(`the ${what} union is no manifold: ${status}`);
    return m.genus();
  } finally {
    m.delete();
  }
}

// ---- The re-tag pass (spec decision 15) ---------------------------------------------------------------------------

/**
 * Spec decision 15 as amended (journal decision 111): each output triangle is tagged by the winner at its centroid among
 * the raw triangles on its oriented plane that hold it, its own faceID's included only when they hold it. The imprint
 * has already cut the mesh so that every triangle lies within one winning region. A centroid no raw face holds keeps
 * its faceID's tag.
 */
export function retagPass(label: string, mesh: ShellMesh, model: RegionModel): RetagResult {
  const {table, planes} = model.tags;
  const conflicts = new Set<string>();
  const triTags: FaceTag[] = [];
  const P = mesh.positions;
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const f = mesh.faceIDs[t];
    const own = table[f];
    if (!own) throw new Error(`${label}: output triangle ${t} carries faceID ${f}, which no raw part issued`);
    if (own.kind === 'Internal') { triTags.push(own); continue; }
    const mean = (ax: number): number => (P[3 * mesh.tris[3 * t] + ax] + P[3 * mesh.tris[3 * t + 1] + ax] + P[3 * mesh.tris[3 * t + 2] + ax]) / 3;
    const held = model.holdersAt(f, [mean(0), mean(1), mean(2)]);
    const ranked = held.length ? held : [own];
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
export function taggedArea(u: TaggedMesh, pred: (t: FaceTag) => boolean): number {
  let s = 0;
  u.triTags.forEach((tag, t) => { if (pred(tag)) s += triArea(u.mesh, t); });
  return s;
}

/** Output area per identity, for every identity whose tag satisfies `pred`. */
export function areaByIdentity(u: TaggedMesh, pred: (t: FaceTag) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  u.triTags.forEach((tag, t) => {
    if (!pred(tag)) return;
    const k = identityKey(tag, u.tags.planes[u.mesh.faceIDs[t]], u.tags.clusters);
    out.set(k, (out.get(k) ?? 0) + triArea(u.mesh, t));
  });
  return out;
}

// ---- Entry points --------------------------------------------------------------------------------------------------

/** No imprint: what a union Manifold refused reports. */
const NO_IMPRINT: ImprintStats = {split: 0, neighbours: 0, added: 0, boundaries: 0};

/**
 * Spec decision 15 as amended (journal decision 111): the cleaned union imprinted with every winner boundary. An
 * imprinted mesh must come back from `Manifold.ofMesh` as a closed manifold of the cleaned mesh's genus, or it is a
 * hard error naming the fixture.
 */
function imprintUnion(wasm: Wasm, label: string, cleaned: UnionPartsResult, model: RegionModel): UnionPartsResult & {imprint: ImprintStats} {
  if (cleaned.status !== 'NoError') return {...cleaned, imprint: NO_IMPRINT};
  const {mesh, stats} = imprintRegions(cleaned.mesh, model);
  if (mesh === cleaned.mesh) return {...cleaned, imprint: stats};
  let genus: number;
  try {
    genus = remeshedGenus(wasm, mesh, 'imprinted');
  } catch (e) {
    throw new Error(`${label}: ${errorMessage(e)}`);
  }
  if (genus !== cleaned.genus) throw new Error(`${label}: the imprint changed the genus from ${cleaned.genus} to ${genus}`);
  return {...cleaned, closed: isClosed(mesh.tris), genus, mesh, imprint: stats};
}

/** Unions raw parts already built: the one union, the imprint, the re-tag pass, and the defect counts. */
export function unionRawParts(wasm: Wasm, label: string, plans: StoreyPlan[], parts: RawPart[], tags: ShellTags): ShellUnion {
  const model = makeRegionModel(parts, tags);
  const {status, closed, genus, mesh, clean, imprint} = imprintUnion(wasm, label, unionParts(wasm, parts), model);
  const {triTags, conflicts} = retagPass(label, mesh, model);
  const survivingInternal = triTags.filter(t => t.kind === 'Internal').length;
  const cheeks = [...areaByIdentity({mesh, triTags, tags}, t => t.kind === 'Cheek').values()].filter(a => a > SHELL_TOLERANCE_CM ** 2).length;
  return {label, status, closed, genus, mesh, clean, imprint, tags, parts, plans, triTags, conflicts, survivingInternal, cheeks};
}

/** Unions already-planned storeys: builds every raw part, then `unionRawParts`. */
export function unionPlans(wasm: Wasm, label: string, plans: StoreyPlan[]): ShellUnion {
  const tags = makeShellTags();
  const ctx: PartContext = makePartContext(wasm, tags);
  for (const plan of plans) buildStoreyParts(ctx, plan);
  return unionRawParts(wasm, label, plans, ctx.parts, tags);
}

/** Spec decisions 2, 12 to 17: every storey of the fixture planned, stacked and unioned. */
export async function unionShell(fixture: ShellFixture): Promise<ShellUnion> {
  const wasm = await getManifold();
  return unionPlans(wasm, fixture.name, storeysOf(fixture).map(n => planStorey(fixture, n)));
}
