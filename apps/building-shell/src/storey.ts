// Step 1 of the four-step model: every storey built as if it were the only storey, as separate raw tagged parts
// (spec decisions 2 to 11). Parts are never pre-unioned: the one union is `union.ts`'s.
import type {Mesh, Vec2} from 'manifold-3d';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {ShellFixture, StoreyRing, storeyRings} from './fixture.ts';
import {Wasm} from './manifold.ts';
import {UnionWall, storeyLoops, unionWallForms, wallSel} from './ring-forms.ts';
import {CoveredRise, RisePiece, claimedWalls, risePieces} from './rise.ts';
import {Piece, RoofParts, solveRoofParts} from './roof/algoB.ts';
import {Building, Comp, Plane, Pt, Rect, Wall, buildFromRects, compLoops, planeAt, polyArea} from './roof/model.ts';
import {alongX, atAlong, bboxReach} from './roof/wall-line.ts';
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

/**
 * Spec decisions 2 and 3 as amended (journal decisions 115, 116, 132 and 135; holed roof decisions 7 and 30): one
 * storey's Building from its Rings. Every union wall takes its Rings' form and pitch as a roof-gable `Sel`, and the plan
 * goes through roof-gable's own `buildFromRects` with those `Sel`s, holes and all: an island holds any number of holes,
 * each wall of each loop at its own union wall's form and pitch.
 */
export function storeyBuilding(rings: StoreyRing[]): Building {
  return storeyForms(rings).building;
}

/**
 * A storey's Building and the union walls it was derived from, whose `rises` gable rise decision 8 builds, and its
 * covered rises: claimed gable bands on no union wall (journal decision 243, rule 3).
 */
export interface StoreyForms { building: Building; walls: UnionWall[]; covered: CoveredRise[] }

/**
 * `storeyBuilding`, with the union walls it read. The walls are derived per extent (`unionWallForms`), then gable rise
 * decision 5 as amended by journal decisions 220 and 243 decides which all-gable walls algorithm B keeps and which bands
 * are covered rises (`claimedWalls`), which reads algorithm B's span off the Building those walls give. Where a wall
 * changes form the Building is built again.
 */
export function storeyForms(rings: StoreyRing[]): StoreyForms {
  const rects = rings.map(r => r.ring.rect);
  const loops = storeyLoops(rects);
  const derived = unionWallForms(rings, loops);
  const first = buildingOf(rings, rects, loops, derived);
  const {walls, changed, covered} = claimedWalls(rings, derived, first);
  return {building: changed ? buildingOf(rings, rects, loops, walls) : first, walls, covered};
}

/**
 * A storey's Building from its union walls as given: always roof-gable's `buildFromRects`, which takes holes and reads
 * each loop's walls by its `Sel`s (holed roof decision 7); a traced wall lies on one union wall, so on one `Sel`.
 * `storeyForms` calls it with the per-extent walls and again, where journal decision 220 changes a wall, with the walls
 * it gives. `rings` and `loops` are not read: the walls carry what the Rings say, and `buildFromRects` traces the loops.
 */
export function buildingOf(_rings: StoreyRing[], rects: Rect[], _loops: Pt[][], walls: UnionWall[]): Building {
  return buildFromRects(rects, walls.map(wallSel));
}

/**
 * Solves an already-built storey Building, with every check a fixture's storey must pass. Each is a hard error naming
 * the label and storey:
 * - a skeleton refusal, naming the island and its cause (journal decision 51, holed roof decision 17);
 * - any `solveRoofParts` note, since `buildPieces` writes one only when it drops a piece (journal decisions 64, 73).
 */
export function planChecked(label: string, storey: number, floor: number, plate: number, building: Building): StoreyPlan {
  const plan = planBuilding(label, storey, floor, plate, building);
  if (plan.roof.notes.length) throw new Error(`${label} storey ${storey}: gable piece dropped: ${plan.roof.notes.join('; ')}`);
  return plan;
}

/**
 * Spec decisions 2 to 4 and 9: storey `n`'s plan is the union of its Rings' rectangles, its walls' forms derived from
 * the Rings', roofed as if it were the top storey (`storeyBuilding`, then `planChecked`). A Ring side authored with a
 * form other than hip or gable is a hard error naming the fixture and storey.
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
  if (!forms.walls.some(w => w.rises?.length) && !forms.covered.length) return plan;
  try {
    plan.rises = risePieces(f, plan, forms.walls, forms.covered);
  } catch (e) {
    // A plan refusal keeps its class through the label (journal decisions 146 and 206).
    const message = `${f.name} storey ${n}: ${errorMessage(e)}`;
    throw e instanceof PlanRefusal ? new PlanRefusal(message, {cause: e}) : new Error(message, {cause: e});
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

/** Triangulates `loops` (an outer loop and its holes), returning index triples into their concatenation. */
function triangulateLoops(wasm: Wasm, loops: Pt[][]): TriIndices[] {
  return wasm.triangulate(loops.map(l => l.map(toVec2)));
}

/**
 * The island's outline extruded from floor to plate, for part `id`: its floor cap and its Wall sides, and with
 * `plateCap` its Internal cap at the plate (holed roof decision 24). Each loop of `compLoops` is written at the floor and
 * then each at the plate, the caps are triangulated from the loops together, the holes holes in them, and wall `j` of
 * loop `k` is the side from that loop's vertex `j` to `j + 1`. An island with no hole writes its one loop as before.
 */
function extrudeOutline(ctx: PartContext, plan: StoreyPlan, comp: Comp, id: number, plateCap: boolean): TriSoup {
  const tag = (t: LocalTag, pl: Plane3): number => addFace(ctx.tags, {...t, storey: plan.storey, part: id}, pl);
  const loops = compLoops(comp);
  const starts: number[] = [];
  const m = loops.reduce((s, l) => { starts.push(s); return s + l.length; }, 0);
  const positions: number[] = [];
  for (const l of loops) for (const p of l) positions.push(p.x, p.y, plan.floor);
  for (const l of loops) for (const p of l) positions.push(p.x, p.y, plan.plate);
  const tris: number[] = [], faceIDs: number[] = [];
  const bottom = tag({kind: plan.storey === 0 ? 'Ground' : 'Underside', wall: -1, plane: -1}, horizontal(plan.floor, false));
  const top = plateCap ? tag({kind: 'Internal', wall: -1, plane: -1}, horizontal(plan.plate, true)) : -1;
  for (const [a, b, c] of triangulateLoops(ctx.wasm, loops)) {
    tris.push(a, c, b); faceIDs.push(bottom);
    if (plateCap) { tris.push(m + a, m + b, m + c); faceIDs.push(top); }
  }
  for (const w of comp.walls) {
    const n = loops[w.loop].length;
    const i = starts[w.loop] + w.edge, j = starts[w.loop] + (w.edge + 1) % n;
    const f = tag({kind: 'Wall', wall: w.id, plane: -1}, wallPlane(w));
    tris.push(i, j, m + j, i, m + j, m + i);
    faceIDs.push(f, f);
  }
  return {positions, tris, faceIDs};
}

/** An island with no hole's hip solid bottom, for part `id`: the island at plate height, Internal, facing down. */
function plateBottom(ctx: PartContext, plan: StoreyPlan, comp: Comp, id: number): TriSoup {
  const positions: number[] = [], tris: number[] = [], faceIDs: number[] = [];
  const bottom = addFace(ctx.tags, {kind: 'Internal', storey: plan.storey, wall: -1, plane: -1, part: id}, horizontal(plan.plate, false));
  const loops = compLoops(comp);
  for (const l of loops) for (const p of l) positions.push(p.x, p.y, plan.plate);
  // Reversed winding: the bottom faces down.
  for (const [a, b, c] of triangulateLoops(ctx.wasm, loops)) { tris.push(a, c, b); faceIDs.push(bottom); }
  return {positions, tris, faceIDs};
}

/** Spec decision 6: the island's outline extruded from floor to plate, capped Internal at the plate. */
function wallPrism(ctx: PartContext, plan: StoreyPlan, ci: number, comp: Comp): RawPart {
  return finishPart(ctx, plan, 'wallPrism', `wall prism island ${ci}`, extrudeOutline(ctx, plan, comp, ctx.parts.length, true));
}

/**
 * Spec decision 7: the island's roof, closed by the default hip's skeleton faces.
 * - An island with no hole has its bottom at the plate.
 * - A holed island's hip solid stands from the floor, its sides and floor the wall prism's own (same tags, so the union
 *   merges them as one identity), as it did under the cut (journal decision 132). Holed roof decision 25 put its bottom
 *   at the plate, and with it Manifold's union left tucks on 36 all-gable split-band courtyards that build none from the
 *   floor; ISSUE-building-shell-all-gable-courtyard-tuck.md has the measurement. Why the bottom at the plate leads
 *   Manifold to leave a tuck is not established (BSA.F87 found the same of every tuck).
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

/** A stretch of a wall-line plane, `[lo, hi]` along the line, over which a face is Gable with `wall`. */
export interface GableZone { wall: number; lo: number; hi: number }

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

/** The tag a face on `g` takes at `s` along its line: Gable with the first zone holding `s`'s wall, else `g.tag`. */
function zoneTag(g: Generating, s: number, storey: number): PartlessTag {
  const z = g.along?.zones.find(zone => s >= zone.lo && s <= zone.hi);
  return z ? {kind: 'Gable', storey, wall: z.wall, plane: -1} : g.tag;
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
 *   one is Cheek with the piece's wall, except within a zone, where it is Gable. The zones, first match winning, are:
 *   - the own-wall zone of every piece of the island whose promoted line the plane is, over that piece's whole band,
 *     this piece first and then the storey's pieces in order (journal decision 82: one face, one identity, whichever
 *     piece made it);
 *   - then each island wall on the plane over that wall's own span, in `comp.walls` order, a hole's walls among them.
 * - The plate, Cheek.
 * (The Internal zone of a courtyard cut's pieces went with the cut: holed roof decision 27.)
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
    const span = (o: Wall): GableZone => {
      const a = along === 0 ? o.a.x : o.a.y, c = along === 0 ? o.b.x : o.b.y;
      return {wall: o.id, lo: Math.min(a, c), hi: Math.max(a, c)};
    };
    const zones: GableZone[] = [];
    for (const p of promoted) {
      if (samePlane(plane, wallPlane(p.wall))) zones.push({wall: p.wall.id, lo: p.bandLo, hi: p.bandHi});
    }
    for (const o of comp.walls) if (samePlane(plane, wallPlane(o))) zones.push(span(o));
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
    // Holed roof decision 26: trimmed to the island with its holes, so no piece reaches into a courtyard.
    const foot = keep(keep(keep(new wasm.CrossSection(compLoops(comp).map(l => l.map(toVec2)))).extrude(H + 30)).translate([0, 0, plan.plate - 10]));
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
