// Step 1 of the four-step model: every storey built as if it were the only storey, as separate raw tagged parts
// (spec decisions 2 to 11). Parts are never pre-unioned: the one union is `union.ts`'s.
import type {Mesh, Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {selectCut, spliceCourtyard} from './courtyard.ts';
import {ShellFixture, StoreyRing, storeyRings} from './fixture.ts';
import {Wasm} from './manifold.ts';
import {UnionWall, selPicks, storeyLoops, tanDeg, unionWallForms, wallSel} from './ring-forms.ts';
import {RisePiece, risePieces} from './rise.ts';
import {Piece, RoofParts, solveRoofParts} from './roof/algoB.ts';
import {
  Building, Comp, Plane, Pt, Rect, Sel, Wall, buildFromRects, finishBuilding, planeAt, polyArea, wallLabel,
} from './roof/model.ts';
import {PlanRefusal, errorMessage} from './errors.ts';
import {LocalTag, PartlessTag, Plane3, ShellTags, Vec3, addFace, samePlane} from './tags.ts';
import {TriIndices, TriSoup, WeldStats, triCross, weldAndSnap} from './weld.ts';
import {add3, dot3, scale3, sub3} from './vec3.ts';

/** One storey's union outline (as a roof-gable `Building`) and its solved roof. */
export interface StoreyPlan {
  /** The fixture (or case) name, for every error this storey raises. */
  label: string;
  storey: number;
  floor: number;
  plate: number;
  building: Building;
  roof: RoofParts;
  /**
   * Gable rise decision 8: the storey's rises, each one more gable piece beside `roof.pieces`, never part of the roof
   * solve. Set by `planStorey`; absent on a plan built from a Building alone.
   */
  rises?: RisePiece[];
}

/** Every gable piece a storey builds: its own, then its rises' (gable rise decision 8). */
export const storeyPieces = (plan: StoreyPlan): Piece[] => [...plan.roof.pieces, ...(plan.rises ?? []).map(r => r.piece)];

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

/** Solves one storey's roof. A skeleton refusal is a hard error naming the label and storey (journal decision 51). */
export function planBuilding(label: string, storey: number, floor: number, plate: number, building: Building): StoreyPlan {
  let roof: RoofParts;
  try {
    roof = solveRoofParts(building, {far: 'plane'});
  } catch (e) {
    throw new Error(`${label} storey ${storey}: ${errorMessage(e)}`, {cause: e});
  }
  return {label, storey, floor, plate, building, roof};
}

/** The wall attributes the derived `Sel`s give the traced wall `a` to `b`, as roof-gable's `applySelectors` would. */
function pickedAttrs(sels: Sel[], a: Pt, b: Pt): Partial<Wall> {
  const sel = sels.find(s => selPicks(s, a, b));
  if (!sel?.form || sel.deg === undefined) throw new Error(`no union wall holds the traced wall (${a.x}, ${a.y}) to (${b.x}, ${b.y})`);
  return {form: sel.form, tan: tanDeg(sel.deg)};
}

/**
 * Spec decisions 2 and 3 as amended (journal decisions 115, 116, 132 and 135): one storey's Building from its Rings.
 * Every union wall takes its Rings' form and pitch as a roof-gable `Sel`.
 * - With no hole, the plan goes through roof-gable's own `buildFromRects` with those `Sel`s.
 * - An island with a hole is spliced through its cut into a slit polygon, its walls picked by the same `Sel`s and its
 *   two cut sides `form: 'cut'` at the cut's pitch: that of the union wall it is collinear with, else the island's
 *   steepest wall's, hip or gable (`freeCutPitch`, journal decisions 151 and 153).
 *   An island with more than one hole, or a hole no raw Ring wall segment can cut, is a hard error.
 */
export function storeyBuilding(rings: StoreyRing[]): Building {
  return storeyForms(rings).building;
}

/** A storey's Building and the union walls it was derived from, whose `rises` gable rise decision 8 builds. */
export interface StoreyForms { building: Building; walls: UnionWall[] }

/** `storeyBuilding`, with the union walls it read. */
export function storeyForms(rings: StoreyRing[]): StoreyForms {
  const rects = rings.map(r => r.ring.rect);
  const loops = storeyLoops(rects);
  const walls = unionWallForms(rings, loops);
  return {building: buildingOf(rings, rects, loops, walls), walls};
}

function buildingOf(rings: StoreyRing[], rects: Rect[], loops: Pt[][], walls: UnionWall[]): Building {
  const sels = walls.map(wallSel);
  const outers = loops.filter(l => polyArea(l) > 0);
  const holes = loops.filter(l => polyArea(l) < 0);
  if (!holes.length) return buildFromRects(rects, sels);
  const cuts = holes.map(h => {
    const cut = selectCut(rings, outers, h, walls);
    if (!cut) throw new Error(`no raw Ring wall cuts the courtyard ring from the hole at (${h[0].x}, ${h[0].y}) to its outer loop`);
    return cut;
  });
  outers.forEach((o, i) => {
    const n = cuts.filter(c => c.outer === i).length;
    if (n > 1) throw new Error(`the island at (${o[0].x}, ${o[0].y}) holds ${n} holes; a courtyard roof takes one`);
  });
  return finishBuilding(outers.map((outer, i) => {
    const k = cuts.findIndex(c => c.outer === i);
    if (k < 0) return {ring: outer, outer, holes: [], attrs: outer.map((a, j) => pickedAttrs(sels, a, outer[(j + 1) % outer.length]))};
    const cut = cuts[k];
    const {ring, cutWalls} = spliceCourtyard(outer, holes[k], cut);
    const cutAttrs: Partial<Wall> = {form: 'cut', tan: tanDeg(cut.deg)};
    const attrs = ring.map((a, j) => (cutWalls.includes(j) ? cutAttrs : pickedAttrs(sels, a, ring[(j + 1) % ring.length])));
    return {ring, outer, holes: [holes[k]], attrs};
  }));
}

/**
 * Solves an already-built storey Building, with every check a fixture's storey must pass. Each is a hard error naming
 * the label and storey:
 * - a `cut` wall anywhere but the two sides of one courtyard's cut, or a hole without them (journal decision 73: a lone
 *   cut would silently roof as a hip);
 * - a skeleton refusal (journal decision 51);
 * - any `solveRoofParts` note, since `buildPieces` writes one only when it drops a piece (journal decisions 64, 73).
 */
export function planChecked(label: string, storey: number, floor: number, plate: number, building: Building): StoreyPlan {
  for (const comp of building.comps) {
    const cuts = comp.walls.filter(w => w.form === 'cut');
    if ((cuts.length || comp.holes.length) && !(cuts.length === 2 && comp.holes.length === 1)) {
      throw new Error(`${label} storey ${storey}: a cut wall stands outside a courtyard's cut: ${cuts.map(wallLabel).join('; ')}`);
    }
  }
  const plan = planBuilding(label, storey, floor, plate, building);
  if (plan.roof.notes.length) throw new Error(`${label} storey ${storey}: gable piece dropped: ${plan.roof.notes.join('; ')}`);
  return plan;
}

/**
 * Spec decisions 2 to 4 and 9: storey `n`'s plan is the union of its Rings' rectangles, its walls' forms derived from
 * the Rings', roofed as if it were the top storey (`storeyBuilding`, then `planChecked`). A Ring side authored with a
 * form other than hip or gable, a cut among them, is a hard error naming the fixture and storey.
 */
export function planStorey(f: ShellFixture, n: number): StoreyPlan {
  const rings = storeyRings(f, n);
  if (!rings.length) throw new Error(`${f.name} storey ${n}: no Ring holds this storey`);
  let forms: StoreyForms;
  try {
    forms = storeyForms(rings);
  } catch (e) {
    // A plan refusal keeps its class through the label (journal decision 146).
    const message = `${f.name} storey ${n}: ${errorMessage(e)}`;
    throw e instanceof PlanRefusal ? new PlanRefusal(message, {cause: e}) : new Error(message, {cause: e});
  }
  const plan = planChecked(f.name, n, n * f.storeyHeight, (n + 1) * f.storeyHeight, forms.building);
  // Gable rise decision 8: a storey with no rise carries none, so its plan is exactly what it was before rises.
  if (!forms.walls.some(w => w.rises?.length)) return plan;
  try {
    plan.rises = risePieces(f, plan, forms.walls);
  } catch (e) {
    throw new Error(`${f.name} storey ${n}: ${errorMessage(e)}`, {cause: e});
  }
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

/**
 * The polygons an island's caps are triangulated from, and where their vertices start in the part's positions: the
 * ring itself for an island without a hole; for a courtyard, the true outline, its outer loop and its hole's loop,
 * appended after the ring's two copies (spec decision 2 as amended).
 */
function capLoops(comp: Comp): Pt[][] {
  return comp.holes.length ? [comp.outer, ...comp.holes] : [comp.ring];
}

/** Triangulates `loops` (an outer loop and its holes), returning index triples into their concatenation. */
function triangulateLoops(wasm: Wasm, loops: Pt[][]): TriIndices[] {
  return wasm.triangulate(loops.map(l => l.map(toVec2)));
}

/**
 * The island's outline extruded from floor to plate, for part `id`: its floor cap and its Wall sides, and with
 * `plateCap` its Internal cap at the plate. A courtyard's outline is its true outline, the hole a hole in it; its cut
 * is not a wall (spec decision 2 as amended).
 */
function extrudeOutline(ctx: PartContext, plan: StoreyPlan, comp: Comp, id: number, plateCap: boolean): TriSoup {
  const tag = (t: LocalTag, pl: Plane3): number => addFace(ctx.tags, {...t, storey: plan.storey, part: id}, pl);
  const ring = comp.ring;
  const n = ring.length;
  const positions: number[] = [];
  for (const p of ring) positions.push(p.x, p.y, plan.floor);
  for (const p of ring) positions.push(p.x, p.y, plan.plate);
  const caps = capLoops(comp);
  const capBase = caps[0] === ring ? 0 : positions.length / 3;
  const m = capBase ? caps.reduce((s, l) => s + l.length, 0) : n;
  if (capBase) {
    for (const l of caps) for (const p of l) positions.push(p.x, p.y, plan.floor);
    for (const l of caps) for (const p of l) positions.push(p.x, p.y, plan.plate);
  }
  const tris: number[] = [], faceIDs: number[] = [];
  const bottom = tag({kind: plan.storey === 0 ? 'Ground' : 'Underside', wall: -1, plane: -1}, horizontal(plan.floor, false));
  const top = plateCap ? tag({kind: 'Internal', wall: -1, plane: -1}, horizontal(plan.plate, true)) : -1;
  for (const [a, b, c] of triangulateLoops(ctx.wasm, caps)) {
    tris.push(capBase + a, capBase + c, capBase + b); faceIDs.push(bottom);
    if (plateCap) { tris.push(capBase + m + a, capBase + m + b, capBase + m + c); faceIDs.push(top); }
  }
  comp.walls.forEach((w, i) => {
    if (w.form === 'cut') return;
    const j = (i + 1) % n;
    const f = tag({kind: 'Wall', wall: w.id, plane: -1}, wallPlane(w));
    tris.push(i, j, n + j, i, n + j, n + i);
    faceIDs.push(f, f);
  });
  return {positions, tris, faceIDs};
}

/** A hip solid's bottom, for part `id`: the island's ring at plate height, Internal, facing down. */
function plateBottom(ctx: PartContext, plan: StoreyPlan, comp: Comp, id: number): TriSoup {
  const positions: number[] = [], tris: number[] = [], faceIDs: number[] = [];
  const bottom = addFace(ctx.tags, {kind: 'Internal', storey: plan.storey, wall: -1, plane: -1, part: id}, horizontal(plan.plate, false));
  for (const p of comp.ring) positions.push(p.x, p.y, plan.plate);
  // Reversed winding: the bottom faces down.
  for (const [a, b, c] of triangulate(ctx.wasm, comp.ring)) { tris.push(a, c, b); faceIDs.push(bottom); }
  return {positions, tris, faceIDs};
}

/** Spec decision 6: the island's outline extruded from floor to plate, capped Internal at the plate. */
function wallPrism(ctx: PartContext, plan: StoreyPlan, ci: number, comp: Comp): RawPart {
  return finishPart(ctx, plan, 'wallPrism', `wall prism island ${ci}`, extrudeOutline(ctx, plan, comp, ctx.parts.length, true));
}

/**
 * Spec decision 7: the island's outline at plate height, closed by the default hip's skeleton faces.
 *
 * A courtyard's hip solid stands from the floor instead, its sides and floor the wall prism's own (same tags, so the
 * union merges them as one identity). On a zero-width slit the default hip falls to the plate along the whole cut, so
 * a bottom at the plate would touch its own roof along the cut. Manifold's triangulation of that bottom can then take
 * the cut as a diagonal, giving one edge four half-edges, which `ofMesh` accepts and the union turns into triangles off
 * their planes (measured on random courtyards whose cut is collinear with a hole wall). Standing from the floor, the
 * roof's crease along the cut meets nothing of its own part.
 */
function hipSolid(ctx: PartContext, plan: StoreyPlan, ci: number, comp: Comp): RawPart {
  const id = ctx.parts.length;
  const b = plan.building;
  const {positions, tris, faceIDs} = comp.holes.length ? extrudeOutline(ctx, plan, comp, id, false) : plateBottom(ctx, plan, comp, id);
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

/**
 * A stretch of a wall-line plane, `[lo, hi]` along the line, over which a face takes `kind` with `wall`: Gable on an
 * island wall, or Internal on a courtyard's cut (spec decision 2 as amended).
 */
export interface GableZone { kind: 'Gable' | 'Internal'; wall: number; lo: number; hi: number }

/**
 * Which world coordinate runs along a vertical plane: 0 (x) or 1 (y). Not cells.ts's `LatticeAxis`, which names a
 * face's own lattice axis, s or t (journal decision 155, N1): the two share values, not meaning.
 */
export type AlongAxis = 0 | 1;

/** A vertical plane's Gable zones, in priority order, and the coordinate they are measured along. */
export interface WallLineZones { axis: AlongAxis; zones: GableZone[] }

/**
 * One plane a gable piece's faces can lie on. `tag` is what a face on it takes outside every Gable zone: Roof on a
 * piece plane, Cheek on every other plane. `along` is set on a plane that holds an island wall line.
 */
export interface Generating { plane: Plane3; tag: PartlessTag; along?: WallLineZones }

/** One triangle of a divided face, with the tag it takes. */
export interface TaggedTri { tri: Vec3[]; tag: PartlessTag }

/** Below this area (cm²) a triangle has no reliable normal, and is matched by offset alone. */
const NORMAL_AREA_FLOOR = SHELL_TOLERANCE_CM ** 2;

/**
 * Journal decisions 45 and 80: the generating plane a triangle lies on. A plane matches when all three corners lie
 * within `SHELL_TOLERANCE_CM` of it and the triangle's normal points the plane's way. No normal bound applies: on
 * float32 noise a bound falsely rejects low triangles. None, or two, is a hard error naming the part.
 */
export function matchGenerating(partName: string, soup: TriSoup, t: number, gens: Generating[]): number {
  const cr = triCross(soup, t);
  const twiceArea = Math.hypot(...cr);
  const corners = [0, 1, 2].map(j => soup.tris[3 * t + j]);
  const at = (): string => [0, 1, 2].map(ax => (corners.reduce((s, v) => s + soup.positions[3 * v + ax], 0) / 3).toFixed(3)).join(', ');
  const hits = gens.flatMap((g, gi) => {
    const facing = dot3(cr, g.plane.n);
    if (twiceArea / 2 > NORMAL_AREA_FLOOR && facing <= 0) return [];
    const dist = Math.max(...corners.map(v => Math.abs(
      g.plane.n[0] * soup.positions[3 * v] + g.plane.n[1] * soup.positions[3 * v + 1] + g.plane.n[2] * soup.positions[3 * v + 2] - g.plane.d)));
    return dist <= SHELL_TOLERANCE_CM ? [gi] : [];
  });
  if (!hits.length) throw new Error(`${partName}: triangle ${t} at (${at()}) matches no generating plane`);
  if (hits.length > 1) throw new Error(`${partName}: triangle ${t} at (${at()}) ties between generating planes ${hits.join(' and ')}`);
  return hits[0];
}

/** The tag a face on `g` takes at `s` along its line: the first zone holding `s`'s kind and wall, else `g.tag`. */
function zoneTag(g: Generating, s: number, storey: number): PartlessTag {
  const z = g.along?.zones.find(zone => s >= zone.lo && s <= zone.hi);
  return z ? {kind: z.kind, storey, wall: z.kind === 'Internal' ? -1 : z.wall, plane: -1} : g.tag;
}

/**
 * Splits a convex polygon at `coord[axis] = c`. A corner within `SHELL_TOLERANCE_CM` of the line counts as on it, so
 * nothing thinner than tolerance is cut off. Returns the polygon whole when the line does not cross it.
 */
function splitPolygon(poly: Vec3[], axis: AlongAxis, c: number): Vec3[][] {
  const side = (p: Vec3): number => (p[axis] < c - SHELL_TOLERANCE_CM ? -1 : p[axis] > c + SHELL_TOLERANCE_CM ? 1 : 0);
  const sides = poly.map(side);
  if (!sides.includes(-1) || !sides.includes(1)) return [poly];
  const below: Vec3[] = [], above: Vec3[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const sp = sides[i], sq = sides[(i + 1) % poly.length];
    if (sp <= 0) below.push(p);
    if (sp >= 0) above.push(p);
    if (sp * sq < 0) {
      const t = (c - p[axis]) / (q[axis] - p[axis]);
      const x = add3(p, scale3(sub3(q, p), t));
      below.push(x);
      above.push(x);
    }
  });
  return [below, above];
}

/**
 * Journal decision 80: a triangle on a wall-line plane is divided at every zone end it straddles, so each piece lies
 * within one stretch and is tagged by where it stands, never a straddling triangle by its centroid. Returns the
 * pieces as triangles (fans of the convex pieces), with the tag each takes.
 */
export function divideAtZoneEnds(corners: Vec3[], g: Generating, storey: number): TaggedTri[] {
  let pieces: Vec3[][] = [corners];
  if (g.along) {
    const {axis, zones} = g.along;
    for (const c of [...new Set(zones.flatMap(z => [z.lo, z.hi]))]) pieces = pieces.flatMap(p => splitPolygon(p, axis, c));
  }
  return pieces.flatMap(poly => {
    const tris: Vec3[][] = [];
    for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
    return tris.map(tri => ({tri, tag: g.along ? zoneTag(g, (tri[0][g.along.axis] + tri[1][g.along.axis] + tri[2][g.along.axis]) / 3, storey) : g.tag}));
  });
}

const vertexOf = (P: number[], i: number): Vec3 => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

/** A vertical plane's coordinate along its line: y on a plane facing ±x, x on one facing ±y. */
const axisAlong = (p: Plane3): AlongAxis => (Math.abs(p.n[0]) > 0.5 ? 1 : 0);

/**
 * Spec decision 8 as amended (journal decisions 75 and 80): a gable piece's generating planes, each oriented out of
 * the part and listed once.
 * - A Roof plane for each piece plane.
 * - Every vertical plane its faces can stand on: each island wall line, both band ends and the far side. A face on
 *   one is Cheek with the piece's wall, except within a zone. The zones, first match winning, are:
 *   - for a cut piece only, the courtyard's cut on its own vertical plane, over the cut's span: Internal (spec decision
 *     2 as amended);
 *   - the own-wall zone of every piece of the island whose promoted line the plane is, over that piece's whole band,
 *     this piece first and then the storey's pieces in order (journal decision 82: one face, one identity, whichever
 *     piece made it);
 *   - then each island wall on the plane over that wall's own span, in ring order.
 *   Neither Gable zone is ever a cut wall's: a cut is not a wall.
 * - The plate, Cheek.
 */
export function gableGenerating(plan: StoreyPlan, piece: Piece, far: number): Generating[] {
  const b = plan.building;
  const w = piece.wall;
  const comp = b.comps[w.comp];
  const cheek: PartlessTag = {kind: 'Cheek', storey: plan.storey, wall: w.id, plane: -1};
  // Every promoted line of the island, this piece's own first (journal decision 82): a face on any of them takes
  // that line's piece's own-wall zone, whichever piece made the face.
  const promoted = [piece, ...storeyPieces(plan).filter(p => p !== piece && p.wall.comp === w.comp)];
  const gens: Generating[] = [];
  const addOnce = (g: Generating): void => { if (!gens.some(e => samePlane(e.plane, g.plane))) gens.push(g); };
  for (const id of piece.planes) addOnce({plane: roofPlane(b.planes[id], plan.plate), tag: {kind: 'Roof', storey: plan.storey, wall: -1, plane: id}});

  const axis: Vec3 = alongX(w) ? [1, 0, 0] : [0, 1, 0];
  const inward: Vec3 = [w.n.x, w.n.y, 0];
  const lineD = inward[0] * w.a.x + inward[1] * w.a.y;
  const vertical: Plane3[] = [
    wallPlane(w), ...comp.walls.map(wallPlane),
    {n: scale3(axis, -1), d: -piece.bandLo},
    {n: axis, d: piece.bandHi},
    {n: inward, d: lineD + far},
  ];
  for (const plane of vertical) {
    const along = axisAlong(plane);
    const span = (o: Wall, kind: GableZone['kind']): GableZone => {
      const a = along === 0 ? o.a.x : o.a.y, c = along === 0 ? o.b.x : o.b.y;
      return {kind, wall: o.id, lo: Math.min(a, c), hi: Math.max(a, c)};
    };
    const zones: GableZone[] = [];
    // A cut piece's faces on the cut's vertical plane, over its span, are Internal (spec decision 2 as amended): each has
    // its partner across the slit in the other cut piece. Another piece's face there is no part of the cut, and keeps
    // the zones below.
    if (w.form === 'cut') for (const o of comp.walls) if (o.form === 'cut' && samePlane(plane, wallPlane(o))) zones.push(span(o, 'Internal'));
    for (const p of promoted) {
      if (p.wall.form !== 'cut' && samePlane(plane, wallPlane(p.wall))) zones.push({kind: 'Gable', wall: p.wall.id, lo: p.bandLo, hi: p.bandHi});
    }
    for (const o of comp.walls) if (o.form !== 'cut' && samePlane(plane, wallPlane(o))) zones.push(span(o, 'Gable'));
    addOnce({plane, tag: cheek, along: zones.length ? {axis: along, zones} : undefined});
  }
  addOnce({plane: horizontal(plan.plate, false), tag: cheek});
  return gens;
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
  let mesh: Mesh | null;
  try {
    let m = keep(keep(keep(new wasm.CrossSection([rect.map(toVec2)])).extrude(H + 10)).translate([0, 0, plan.plate]));
    for (const id of piece.planes) {
      const pl = b.planes[id];
      const L = Math.hypot(pl.gx, pl.gy, 1);
      m = keep(m.trimByPlane([pl.gx / L, pl.gy / L, -1 / L], -(plan.plate + pl.c) / L));
    }
    m = keep(m.trimByPlane([0, 0, 1], plan.plate));
    const foot = keep(keep(keep(new wasm.CrossSection([comp.outer.map(toVec2)])).extrude(H + 30)).translate([0, 0, plan.plate - 10]));
    m = keep(m.intersect(foot));
    mesh = m.isEmpty() ? null : m.getMesh();
  } finally {
    live.forEach(x => x.delete());
  }
  if (!mesh) throw empty('nothing is left after the trims');

  // numProp is 3, so the mesh has no property seams and no merge vectors.
  const np = mesh.numProp;
  const positions: number[] = [];
  for (let v = 0; v < mesh.numVert; v++) positions.push(mesh.vertProperties[np * v], mesh.vertProperties[np * v + 1], mesh.vertProperties[np * v + 2]);
  const fromManifold: TriSoup = {positions, tris: Array.from(mesh.triVerts), faceIDs: []};

  const gens = gableGenerating(plan, piece, far);

  // Tagged on Manifold's final mesh, then welded and snapped with its faceIDs before `ofMesh` (spec decision 11). A
  // triangle on a wall-line plane is divided at its Gable zone ends first (journal decision 80).
  const id = ctx.parts.length;
  const fullName = `${plan.label} storey ${plan.storey} ${name}`;
  // Generating index and tag -> faceID. Keyed by kind, wall and plane id, not by identity, so each Gable zone keeps
  // its own wall's provenance (journal decision 96 keys identity by plane, which would merge two walls' zones).
  const ids = new Map<string, number>();
  const raw: TriSoup = {positions: [...positions], tris: [], faceIDs: []};
  for (let t = 0; t < fromManifold.tris.length / 3; t++) {
    const gi = matchGenerating(fullName, fromManifold, t, gens);
    const corners = [0, 1, 2].map(j => fromManifold.tris[3 * t + j]);
    const pieces = divideAtZoneEnds(corners.map(v => vertexOf(positions, v)), gens[gi], plan.storey);
    for (const {tri, tag} of pieces) {
      const key = `${gi}|${tag.kind}|w${tag.wall}|p${tag.plane}`;
      let f = ids.get(key);
      if (f === undefined) {
        f = addFace(ctx.tags, {...tag, part: id}, gens[gi].plane);
        ids.set(key, f);
      }
      if (pieces.length === 1) {
        raw.tris.push(...corners);
      } else {
        const start = raw.positions.length / 3;
        for (const p of tri) raw.positions.push(p[0], p[1], p[2]);
        raw.tris.push(start, start + 1, start + 2);
      }
      raw.faceIDs.push(f);
    }
  }
  return finishPart(ctx, plan, 'gable', name, raw);
}

/** Spec decision 5: one wall prism and one hip solid per island, and one solid per gable piece, a rise's included. */
export function buildStoreyParts(ctx: PartContext, plan: StoreyPlan): RawPart[] {
  const out: RawPart[] = [];
  plan.building.comps.forEach((comp, ci) => {
    out.push(wallPrism(ctx, plan, ci, comp));
    out.push(hipSolid(ctx, plan, ci, comp));
  });
  storeyPieces(plan).forEach((piece, k) => out.push(gablePiece(ctx, plan, k, piece)));
  return out;
}
