// Step 1 of the four-step model: every storey built as if it were the only storey, as separate raw tagged parts
// (spec decisions 2 to 11). Parts are never pre-unioned: the one union is `union.ts`'s.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {ShellFixture, storeyRects} from './fixture.ts';
import {Wasm} from './manifold.ts';
import {Piece, RoofParts, solveRoofParts} from './roof/algoB.ts';
import {Building, Comp, Plane, Pt, Wall, buildFromRects, planeAt, polyArea} from './roof/model.ts';
import {FaceTag, Plane3, ShellTags, Vec3, addFace} from './tags.ts';
import {TriSoup, WeldStats, triCross, weldAndSnap} from './weld.ts';

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
    throw new Error(`${label} storey ${storey}: ${(e as Error).message}`);
  }
  return {label, storey, floor, plate, building, roof};
}

/** The NoPlane notes among `buildPieces`' notes; each names the line whose piece was dropped. */
export const noPlaneNotes = (notes: string[]): string[] => notes.filter(n => n.includes(': NoPlane,'));

/**
 * Spec decisions 2 to 4 and 9: storey `n`'s plan is the union of its Rings' rectangles, roofed with its own selectors
 * as if it were the top storey. A hole, a skeleton refusal and a NoPlane piece are each a hard error naming the
 * fixture and storey (journal decision 64).
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
    throw new Error(`${f.name} storey ${n}: ${(e as Error).message}`);
  }
  const plan = planBuilding(f.name, n, n * f.storeyHeight, (n + 1) * f.storeyHeight, building);
  const dropped = noPlaneNotes(plan.roof.notes);
  if (dropped.length) throw new Error(`${f.name} storey ${n}: gable piece dropped as NoPlane: ${dropped.join('; ')}`);
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

function ccw(poly: Pt[]): Pt[] {
  return polyArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** Triangulates a simple CCW polygon; returns index triples into it, CCW seen from +z. */
function triangulate(wasm: Wasm, poly: Pt[]): [number, number, number][] {
  return wasm.triangulate([poly.map(p => [p.x, p.y] as [number, number])]) as [number, number, number][];
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
  const tag = (t: Omit<FaceTag, 'part' | 'storey'>, pl: Plane3): number => addFace(ctx.tags, {...t, storey: plan.storey, part: id}, pl);
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

interface Generating { tag: Omit<FaceTag, 'part'>; plane: Plane3 }

/**
 * Spec decision 8: the piece's band rectangle, extruded from the plate upward and trimmed below every piece plane,
 * above the plate and to the island's footprint, with Manifold operations; then tagged on its final mesh by matching
 * each triangle to the part's generating planes (journal decision 45).
 */
function gablePiece(ctx: PartContext, plan: StoreyPlan, k: number, piece: Piece): RawPart | null {
  const {wasm} = ctx;
  const b = plan.building;
  const w = piece.wall;
  const comp = b.comps[w.comp];
  const far = Math.min(piece.farDist, bboxReach(b, w));
  const rect = ccw([atAlong(w, piece.bandLo, 0), atAlong(w, piece.bandHi, 0), atAlong(w, piece.bandHi, far), atAlong(w, piece.bandLo, far)]);
  // The piece's top is the lowest of its planes; no plane reaches above its own highest corner.
  const H = Math.min(...piece.planes.map(id => Math.max(...rect.map(p => planeAt(b.planes[id], p)))));
  if (!(H > SHELL_TOLERANCE_CM)) return null;

  const live: {delete(): void}[] = [];
  const keep = <T extends {delete(): void}>(m: T): T => { live.push(m); return m; };
  let m = keep(keep(new wasm.CrossSection([rect.map(p => [p.x, p.y] as [number, number])])).extrude(H + 10)).translate([0, 0, plan.plate]);
  keep(m);
  for (const id of piece.planes) {
    const pl = b.planes[id];
    const L = Math.hypot(pl.gx, pl.gy, 1);
    m = keep(m.trimByPlane([pl.gx / L, pl.gy / L, -1 / L], -(plan.plate + pl.c) / L));
  }
  m = keep(m.trimByPlane([0, 0, 1], plan.plate));
  const foot = keep(keep(keep(new wasm.CrossSection([comp.outer.map(p => [p.x, p.y] as [number, number])])).extrude(H + 30)).translate([0, 0, plan.plate - 10]));
  m = keep(m.intersect(foot));
  const empty = m.isEmpty();
  const mesh = empty ? null : m.getMesh();
  live.forEach(x => x.delete());
  if (!mesh) return null;

  const np = mesh.numProp;
  const merge = new Map<number, number>();
  for (let i = 0; i < mesh.mergeFromVert.length; i++) merge.set(mesh.mergeFromVert[i], mesh.mergeToVert[i]);
  const positions: number[] = [];
  for (let v = 0; v < mesh.numVert; v++) positions.push(mesh.vertProperties[np * v], mesh.vertProperties[np * v + 1], mesh.vertProperties[np * v + 2]);
  const tris = Array.from(mesh.triVerts, v => merge.get(v) ?? v);
  const raw: TriSoup = {positions, tris, faceIDs: new Array(tris.length / 3).fill(-1)};

  // Generating planes, oriented out of the part. Roof first, then the wall line, then every Cheek-bearing plane.
  const sideTag = (kind: 'Gable' | 'Cheek'): Omit<FaceTag, 'part'> => ({kind, storey: plan.storey, wall: w.id, plane: -1});
  const gens: Generating[] = piece.planes.map(id => ({tag: {kind: 'Roof', storey: plan.storey, wall: -1, plane: id}, plane: roofPlane(b.planes[id], plan.plate)}));
  gens.push({tag: sideTag('Gable'), plane: wallPlane(w)});
  const axis: Vec3 = alongX(w) ? [1, 0, 0] : [0, 1, 0];
  const inward: Vec3 = [w.n.x, w.n.y, 0];
  const lineD = inward[0] * w.a.x + inward[1] * w.a.y;
  for (const pl of [
    horizontal(plan.plate, false),
    {n: axis.map(v => -v) as Vec3, d: -piece.bandLo},
    {n: axis, d: piece.bandHi},
    {n: inward, d: lineD + far},
    ...comp.walls.map(wallPlane),
  ]) gens.push({tag: sideTag('Cheek'), plane: pl});

  const part = finishPart(ctx, plan, 'gable', `gable piece ${k} (${piece.label})`, raw);
  const ids = new Map<number, number>(); // generating index -> faceID
  const {soup} = part;
  for (let t = 0; t < soup.tris.length / 3; t++) {
    const cr = triCross(soup, t);
    const A = Math.hypot(...cr);
    const vs = [0, 1, 2].map(j => soup.tris[3 * t + j]);
    let best = -1, bestDist = Infinity;
    gens.forEach((g, gi) => {
      if (A > 1e-9 && (cr[0] * g.plane.n[0] + cr[1] * g.plane.n[1] + cr[2] * g.plane.n[2]) / A <= 0) return;
      const dist = Math.max(...vs.map(v => Math.abs(g.plane.n[0] * soup.positions[3 * v] + g.plane.n[1] * soup.positions[3 * v + 1] + g.plane.n[2] * soup.positions[3 * v + 2] - g.plane.d)));
      if (dist <= SHELL_TOLERANCE_CM && dist < bestDist) { best = gi; bestDist = dist; }
    });
    if (best < 0) {
      const c = [0, 1, 2].map(ax => vs.reduce((s, v) => s + soup.positions[3 * v + ax], 0) / 3);
      throw new Error(`${part.name}: triangle ${t} at (${c.map(x => x.toFixed(3)).join(', ')}) matches no generating plane`);
    }
    let f = ids.get(best);
    if (f === undefined) {
      f = addFace(ctx.tags, {...gens[best].tag, part: part.id}, gens[best].plane);
      ids.set(best, f);
    }
    soup.faceIDs[t] = f;
  }
  return part;
}

/** Spec decision 5: one wall prism and one hip solid per island, and one solid per gable piece. */
export function buildStoreyParts(ctx: PartContext, plan: StoreyPlan): RawPart[] {
  const out: RawPart[] = [];
  plan.building.comps.forEach((comp, ci) => {
    out.push(wallPrism(ctx, plan, ci, comp));
    out.push(hipSolid(ctx, plan, ci, comp));
  });
  plan.roof.pieces.forEach((piece, k) => {
    const part = gablePiece(ctx, plan, k, piece);
    if (part) out.push(part);
  });
  return out;
}
