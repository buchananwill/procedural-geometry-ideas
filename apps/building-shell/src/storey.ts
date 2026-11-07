// Step 1 of the four-step model: every storey built as if it were the only storey, as separate raw tagged parts
// (spec decisions 2 to 11). Parts are never pre-unioned: the one union is `union.ts`'s.
import type {Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {ShellFixture, storeyRects} from './fixture.ts';
import {Wasm} from './manifold.ts';
import {Piece, RoofParts, solveRoofParts} from './roof/algoB.ts';
import {Building, Comp, Plane, Pt, Wall, buildFromRects, planeAt, polyArea, wallLabel} from './roof/model.ts';
import {LocalTag, PartlessTag, Plane3, ShellTags, Vec3, addFace, sameNormal, samePlane} from './tags.ts';
import {TriIndices, TriSoup, WeldStats, triCross, weldAndSnap} from './weld.ts';

/** The message of anything thrown: one helper for every catch site. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** One storey's union outline (as a roof-gable `Building`) and its solved roof. */
export interface StoreyPlan {
  /** The fixture (or case) name, for every error this storey raises. */
  label: string;
  storey: number;
  floor: number;
  plate: number;
  building: Building;
  roof: RoofParts;
}

export type PartKind = 'wallPrism' | 'hip' | 'gable';

/** One raw part, welded, snapped and tagged, kept addressable after the union for the viewer's raw mode. */
export interface RawPart {
  /** Index in the building's part list; `FaceTag.part`. */
  id: number;
  name: string;
  storey: number;
  kind: PartKind;
  soup: TriSoup;
  weld: WeldStats;
}

/** Shared by every storey of one building: the tag table and the part list `faceID`s and part ids index. */
export interface PartContext {
  wasm: Wasm;
  tags: ShellTags;
  parts: RawPart[];
}

export const makePartContext = (wasm: Wasm, tags: ShellTags): PartContext => ({wasm, tags, parts: []});

const tanDeg = (deg: number): number => Math.tan((deg * Math.PI) / 180);

/** Solves one storey's roof. A skeleton refusal is a hard error naming the label and storey (journal decision 51). */
export function planBuilding(label: string, storey: number, floor: number, plate: number, building: Building): StoreyPlan {
  let roof: RoofParts;
  try {
    roof = solveRoofParts(building, {far: 'plane'});
  } catch (e) {
    throw new Error(`${label} storey ${storey}: ${errorMessage(e)}`);
  }
  return {label, storey, floor, plate, building, roof};
}

/**
 * Spec decisions 2 to 4 and 9: storey `n`'s plan is the union of its Rings' rectangles, roofed with its own selectors
 * as if it were the top storey. Each of these is a hard error naming the fixture and storey:
 * - a hole (roof-gable refuses one);
 * - a `cut` wall (courtyards are deferred, and a lone cut would silently roof as a hip; journal decision 73);
 * - a skeleton refusal (journal decision 51);
 * - any `solveRoofParts` note, since `buildPieces` writes one only when it drops a piece (journal decisions 64, 73).
 */
export function planStorey(f: ShellFixture, n: number): StoreyPlan {
  const rects = storeyRects(f, n);
  if (!rects.length) throw new Error(`${f.name} storey ${n}: no Ring holds this storey`);
  const roof = f.roofs[n];
  if (!roof) throw new Error(`${f.name} storey ${n}: no roof authored`);
  let building: Building;
  try {
    building = buildFromRects(rects, roof.sels, tanDeg(roof.defaultDeg));
  } catch (e) {
    throw new Error(`${f.name} storey ${n}: ${errorMessage(e)}`);
  }
  const cuts = building.walls.filter(w => w.form === 'cut');
  if (cuts.length) throw new Error(`${f.name} storey ${n}: a cut wall needs a courtyard, which is deferred: ${cuts.map(wallLabel).join('; ')}`);
  const plan = planBuilding(f.name, n, n * f.storeyHeight, (n + 1) * f.storeyHeight, building);
  if (plan.roof.notes.length) throw new Error(`${f.name} storey ${n}: gable piece dropped: ${plan.roof.notes.join('; ')}`);
  return plan;
}

// ---- Planes -------------------------------------------------------------------------------------------------------

const horizontal = (z: number, up: boolean): Plane3 => (up ? {n: [0, 0, 1], d: z} : {n: [0, 0, -1], d: -z});

/** The vertical plane on a wall line, facing out of the footprint. */
function wallPlane(w: Wall): Plane3 {
  const n: Vec3 = [-w.n.x, -w.n.y, 0];
  return {n, d: n[0] * w.a.x + n[1] * w.a.y};
}

/** A roof plane `z = plate + planeAt(pl, p)`, facing up. */
function roofPlane(pl: Plane, plate: number): Plane3 {
  const L = Math.hypot(pl.gx, pl.gy, 1);
  return {n: [-pl.gx / L, -pl.gy / L, 1 / L], d: (plate + pl.c) / L};
}

// ---- Construction --------------------------------------------------------------------------------------------------

/** Anything holding WASM memory. */
export interface Deletable { delete(): void }

const toVec2 = (p: Pt): Vec2 => [p.x, p.y];

function ccw(poly: Pt[]): Pt[] {
  return polyArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** Triangulates a simple CCW polygon; returns index triples into it, CCW seen from +z. */
function triangulate(wasm: Wasm, poly: Pt[]): TriIndices[] {
  return wasm.triangulate([poly.map(toVec2)]);
}

function finishPart(ctx: PartContext, plan: StoreyPlan, kind: PartKind, name: string, raw: TriSoup): RawPart {
  const {soup, stats} = weldAndSnap(raw, SHELL_TOLERANCE_CM);
  const part: RawPart = {id: ctx.parts.length, name: `${plan.label} storey ${plan.storey} ${name}`, storey: plan.storey, kind, soup, weld: stats};
  ctx.parts.push(part);
  return part;
}

/** Spec decision 6: the island's outline extruded from floor to plate. */
function wallPrism(ctx: PartContext, plan: StoreyPlan, ci: number, comp: Comp): RawPart {
  const id = ctx.parts.length;
  const tag = (t: LocalTag, pl: Plane3): number => addFace(ctx.tags, {...t, storey: plan.storey, part: id}, pl);
  const ring = comp.ring;
  const n = ring.length;
  const positions: number[] = [];
  for (const p of ring) positions.push(p.x, p.y, plan.floor);
  for (const p of ring) positions.push(p.x, p.y, plan.plate);
  const tris: number[] = [], faceIDs: number[] = [];
  const bottom = tag({kind: plan.storey === 0 ? 'Ground' : 'Underside', wall: -1, plane: -1}, horizontal(plan.floor, false));
  const top = tag({kind: 'Internal', wall: -1, plane: -1}, horizontal(plan.plate, true));
  for (const [a, b, c] of triangulate(ctx.wasm, ring)) {
    tris.push(a, c, b); faceIDs.push(bottom);
    tris.push(n + a, n + b, n + c); faceIDs.push(top);
  }
  comp.walls.forEach((w, i) => {
    const j = (i + 1) % n;
    const f = tag({kind: 'Wall', wall: w.id, plane: -1}, wallPlane(w));
    tris.push(i, j, n + j, i, n + j, n + i);
    faceIDs.push(f, f);
  });
  return finishPart(ctx, plan, 'wallPrism', `wall prism island ${ci}`, {positions, tris, faceIDs});
}

/** Spec decision 7: the island's outline at plate height, closed by the default hip's skeleton faces. */
function hipSolid(ctx: PartContext, plan: StoreyPlan, ci: number, comp: Comp): RawPart {
  const id = ctx.parts.length;
  const b = plan.building;
  const positions: number[] = [];
  const tris: number[] = [], faceIDs: number[] = [];
  const bottom = addFace(ctx.tags, {kind: 'Internal', storey: plan.storey, wall: -1, plane: -1, part: id}, horizontal(plan.plate, false));
  for (const p of comp.ring) positions.push(p.x, p.y, plan.plate);
  // Reversed winding: the bottom faces down.
  for (const [a, bb, c] of triangulate(ctx.wasm, comp.ring)) { tris.push(a, c, bb); faceIDs.push(bottom); }
  for (const face of plan.roof.faces) {
    if (face.wall.comp !== ci) continue;
    const pl = b.planes[face.wall.plane];
    const poly = ccw(face.poly);
    const f = addFace(ctx.tags, {kind: 'Roof', storey: plan.storey, wall: -1, plane: pl.id, part: id}, roofPlane(pl, plan.plate));
    const start = positions.length / 3;
    for (const p of poly) positions.push(p.x, p.y, plan.plate + planeAt(pl, p));
    for (const [a, bb, c] of triangulate(ctx.wasm, poly)) { tris.push(start + a, start + bb, start + c); faceIDs.push(f); }
  }
  return finishPart(ctx, plan, 'hip', `hip solid island ${ci}`, {positions, tris, faceIDs});
}

const alongX = (w: Wall): boolean => Math.abs(w.dir.x) > 0.5;
const atAlong = (w: Wall, s: number, d: number): Pt => (alongX(w) ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s});

/** How far the storey's bounding box reaches from the wall line along the wall's inward normal. */
function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
}

/** One plane a gable piece's faces can lie on, with the tag a face on it takes. */
export interface Generating { tag: PartlessTag; plane: Plane3 }

/** Below this area (cm²) a triangle has no reliable normal, and is matched by offset alone. */
const NORMAL_AREA_FLOOR = SHELL_TOLERANCE_CM ** 2;

/**
 * Journal decisions 45 and 73: the generating plane a triangle lies on. Candidates are the planes whose normal agrees
 * with the triangle's within `PLANE_NORMAL_TOL` and whose offset holds all three corners within `SHELL_TOLERANCE_CM`.
 * None, or two, is a hard error naming the part. Run on Manifold's mesh before the snap: the 1/1024 cm snap tilts a
 * narrow face's normal by up to about 2e-5 (case 7f's 85 degree face), where Manifold's own float32 output stays
 * under 2e-7.
 */
function matchGenerating(partName: string, soup: TriSoup, t: number, gens: Generating[]): number {
  const cr = triCross(soup, t);
  const twiceArea = Math.hypot(...cr);
  const n: Vec3 = [cr[0] / twiceArea, cr[1] / twiceArea, cr[2] / twiceArea];
  const corners = [0, 1, 2].map(j => soup.tris[3 * t + j]);
  const at = (): string => [0, 1, 2].map(ax => (corners.reduce((s, v) => s + soup.positions[3 * v + ax], 0) / 3).toFixed(3)).join(', ');
  const hits = gens.flatMap((g, gi) => {
    if (twiceArea / 2 > NORMAL_AREA_FLOOR && !sameNormal(n, g.plane.n)) return [];
    const dist = Math.max(...corners.map(v => Math.abs(
      g.plane.n[0] * soup.positions[3 * v] + g.plane.n[1] * soup.positions[3 * v + 1] + g.plane.n[2] * soup.positions[3 * v + 2] - g.plane.d)));
    return dist <= SHELL_TOLERANCE_CM ? [gi] : [];
  });
  if (!hits.length) throw new Error(`${partName}: triangle ${t} at (${at()}) matches no generating plane`);
  if (hits.length > 1) throw new Error(`${partName}: triangle ${t} at (${at()}) ties between generating planes ${hits.join(' and ')}`);
  return hits[0];
}

/**
 * Spec decision 8: the piece's band rectangle, extruded from the plate upward and trimmed below every piece plane,
 * above the plate and to the island's footprint, with Manifold operations; then tagged on its final mesh by matching
 * each triangle to the part's generating planes (journal decision 45). A piece with nothing left is a hard error
 * naming the fixture, storey and line (journal decision 73).
 */
function gablePiece(ctx: PartContext, plan: StoreyPlan, k: number, piece: Piece): RawPart {
  const {wasm} = ctx;
  const b = plan.building;
  const w = piece.wall;
  const comp = b.comps[w.comp];
  const name = `gable piece ${k} (${piece.label})`;
  const empty = (why: string): Error => new Error(`${plan.label} storey ${plan.storey}: ${name} is empty: ${why}`);
  const far = Math.min(piece.farDist, bboxReach(b, w));
  const rect = ccw([atAlong(w, piece.bandLo, 0), atAlong(w, piece.bandHi, 0), atAlong(w, piece.bandHi, far), atAlong(w, piece.bandLo, far)]);
  // The piece's top is the lowest of its planes; no plane reaches above its own highest corner.
  const H = Math.min(...piece.planes.map(id => Math.max(...rect.map(p => planeAt(b.planes[id], p)))));
  if (!(H > SHELL_TOLERANCE_CM)) throw empty(`its planes rise ${H} cm at most over its band`);

  const live: Deletable[] = [];
  const keep = <T extends Deletable>(m: T): T => { live.push(m); return m; };
  let m = keep(keep(keep(new wasm.CrossSection([rect.map(toVec2)])).extrude(H + 10)).translate([0, 0, plan.plate]));
  for (const id of piece.planes) {
    const pl = b.planes[id];
    const L = Math.hypot(pl.gx, pl.gy, 1);
    m = keep(m.trimByPlane([pl.gx / L, pl.gy / L, -1 / L], -(plan.plate + pl.c) / L));
  }
  m = keep(m.trimByPlane([0, 0, 1], plan.plate));
  const foot = keep(keep(keep(new wasm.CrossSection([comp.outer.map(toVec2)])).extrude(H + 30)).translate([0, 0, plan.plate - 10]));
  m = keep(m.intersect(foot));
  const mesh = m.isEmpty() ? null : m.getMesh();
  live.forEach(x => x.delete());
  if (!mesh) throw empty('nothing is left after the trims');

  // numProp is 3, so the mesh has no property seams and no merge vectors.
  const np = mesh.numProp;
  const positions: number[] = [];
  for (let v = 0; v < mesh.numVert; v++) positions.push(mesh.vertProperties[np * v], mesh.vertProperties[np * v + 1], mesh.vertProperties[np * v + 2]);
  const tris = Array.from(mesh.triVerts);
  const raw: TriSoup = {positions, tris, faceIDs: new Array<number>(tris.length / 3).fill(-1)};

  // Generating planes, oriented out of the part: Roof first, then the wall line, then every Cheek-bearing plane. A
  // plane already listed (a footprint wall on the wall line, a band end on an end wall) keeps its first tag.
  const sideTag = (kind: 'Gable' | 'Cheek'): PartlessTag => ({kind, storey: plan.storey, wall: w.id, plane: -1});
  const candidates: Generating[] = piece.planes.map(id => ({tag: {kind: 'Roof', storey: plan.storey, wall: -1, plane: id}, plane: roofPlane(b.planes[id], plan.plate)}));
  candidates.push({tag: sideTag('Gable'), plane: wallPlane(w)});
  const axis: Vec3 = alongX(w) ? [1, 0, 0] : [0, 1, 0];
  const inward: Vec3 = [w.n.x, w.n.y, 0];
  const lineD = inward[0] * w.a.x + inward[1] * w.a.y;
  const minusAxis: Vec3 = [-axis[0], -axis[1], -axis[2]];
  for (const pl of [
    horizontal(plan.plate, false),
    {n: minusAxis, d: -piece.bandLo},
    {n: axis, d: piece.bandHi},
    {n: inward, d: lineD + far},
    ...comp.walls.map(wallPlane),
  ]) candidates.push({tag: sideTag('Cheek'), plane: pl});
  const gens = candidates.filter((g, i) => !candidates.slice(0, i).some(e => samePlane(e.plane, g.plane)));

  // Tagged on Manifold's final mesh, then welded and snapped with its faceIDs before `ofMesh` (spec decision 11).
  const id = ctx.parts.length;
  const fullName = `${plan.label} storey ${plan.storey} ${name}`;
  const ids = new Map<number, number>(); // generating index -> faceID
  for (let t = 0; t < raw.tris.length / 3; t++) {
    const gi = matchGenerating(fullName, raw, t, gens);
    let f = ids.get(gi);
    if (f === undefined) {
      f = addFace(ctx.tags, {...gens[gi].tag, part: id}, gens[gi].plane);
      ids.set(gi, f);
    }
    raw.faceIDs[t] = f;
  }
  return finishPart(ctx, plan, 'gable', name, raw);
}

/** Spec decision 5: one wall prism and one hip solid per island, and one solid per gable piece. */
export function buildStoreyParts(ctx: PartContext, plan: StoreyPlan): RawPart[] {
  const out: RawPart[] = [];
  plan.building.comps.forEach((comp, ci) => {
    out.push(wallPrism(ctx, plan, ci, comp));
    out.push(hipSolid(ctx, plan, ci, comp));
  });
  plan.roof.pieces.forEach((piece, k) => out.push(gablePiece(ctx, plan, k, piece)));
  return out;
}
