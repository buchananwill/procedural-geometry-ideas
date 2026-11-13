// Gable rise decisions 8 to 12 (journal decision 204): each rise of a storey's union walls as one synthetic gable
// `Piece`, built by the unchanged `gablePiece` beside the storey's own pieces. The rise is never part of the roof solve:
// its wall enters the skeleton as a hip (decision 6), and the rise is one more raw solid for the union.
// - Decision 8: wall = the union wall, band = the rise, far distance = algorithm B's piece rule (`farWall`), planes =
//   two rakes plus the limit and cap planes.
// - Decision 9: every plane the rise adds takes an existing plane's id when it coincides, keyed as `finishBuilding` keys.
// - Decision 10: at a convex corner the rise takes the end wall's plane as its rake (algorithm B's `endWall`).
// - Decision 11: the limit is a named policy (`RISE_LIMIT_POLICIES`); `ridgeSlope` is the only one. As amended by journal
//   decision 231, its walk passes over a slope that is not in the finished building (`slopeInBuilding`), and a rise it
//   finds no slope for has no slope limit.
// - Decision 12: the caps are named policies (`RISE_CAPS`); the lowest applies, and a cap at or below the plate builds
//   no piece.
// Every default here is provisional until the user confirms (journal decision 204), so each is one named policy or
// constant, replaceable without touching its neighbours.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {RiseLimit, ShellFixture, StoreyRing, storeyRings, storeysOf} from './fixture.ts';
import {GableRise, LineId, UnionWall, WallLine, claimedBands, tanDeg} from './ring-forms.ts';
import type {Piece} from './roof/algoB.ts';
import {Building, Comp, Plane, Pt, Wall, dot, planeAt, pointInPoly, sub, wallLabel} from './roof/model.ts';
import type {StoreyPlan} from './storey.ts';

/**
 * One rise as built: the rise, its piece, the plane its limit policy chose (absent where the rise has no slope limit,
 * journal decision 231), and the cap that applies, if any, by its height above the plate and its name (journal decision
 * 209, N1).
 */
export interface RisePiece { rise: GableRise; piece: Piece; limitPlane?: number; capCm?: number; cap?: RiseCapName }

/** Decision 12 (journal decision 204): the floor cap stands this far below an overhanging storey's floor. */
export const FLOOR_CAP_GAP_CM = 1;

const EPS = 0.01;
/** Coordinates within this are one point, for the walk's exact intersections. */
const WALK_EPS = 1e-7;

const alongX = (w: Wall): boolean => Math.abs(w.dir.x) > 0.5;
const along = (w: Wall, p: Pt): number => (alongX(w) ? p.x : p.y);
const spanOf = (w: Wall): [number, number] => { const a = along(w, w.a), b = along(w, w.b); return [Math.min(a, b), Math.max(a, b)]; };
const atAlong = (w: Wall, s: number, d: number): Pt => (alongX(w) ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s});

/** algoB.ts's `farWall`, copied (it is not exported, and `src/roof/` is pinned): the nearest wall facing back across the band. */
function farWall(comp: Comp, w: Wall, lo: number, hi: number): Wall | undefined {
  let best: Wall | undefined;
  let bestD = Infinity;
  for (const o of comp.walls) {
    if (dot(o.n, w.n) > -0.5) continue;
    const d = dot(sub(o.a, w.a), w.n);
    if (d <= EPS) continue;
    const [p, q] = spanOf(o);
    if (Math.min(q, hi) - Math.max(p, lo) <= EPS) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** algoB.ts's `endWall`, copied: the wall standing across the line's end at `s`, its inward normal pointing back along it. */
function endWall(comp: Comp, w: Wall, s: number, intoLine: number): Wall | undefined {
  const point = atAlong(w, s, EPS);
  const axis: Pt = alongX(w) ? {x: 1, y: 0} : {x: 0, y: 1};
  return comp.walls.find(o => {
    if (Math.abs(dot(o.n, axis)) < 0.5) return false;
    if (dot(o.n, axis) * intoLine < 0) return false;
    if (Math.abs(along(w, o.a) - s) > 1e-6) return false;
    const t = dot(sub(point, o.a), o.dir);
    return t >= -1e-6 && t <= o.len + 1e-6;
  });
}

/**
 * algoB.ts's `extentOf`, copied (it is not exported, and `src/roof/` is pinned): the span along `w`'s line that
 * algorithm B's gable piece for `w` covers. It is the wall's own span, run on past each end, one ring vertex at a time,
 * while the line just inside the wall stays inside the building. `tests/rise.test.ts` ties this copy to algorithm B's
 * own pieces over the corpus, so a drift on either side fails.
 */
export function extentOf(b: Building, comp: Comp, w: Wall): [number, number] {
  const breaks = [...new Set(comp.ring.map(p => along(w, p)))].sort((p, q) => p - q);
  let [lo, hi] = spanOf(w);
  for (;;) { const prev = breaks.filter(s => s < lo).pop(); if (prev === undefined || !b.inside(atAlong(w, (prev + lo) / 2, EPS))) break; lo = prev; }
  for (;;) { const next = breaks.find(s => s > hi); if (next === undefined || !b.inside(atAlong(w, (next + hi) / 2, EPS))) break; hi = next; }
  return [lo, hi];
}

/** storey.ts's `bboxReach`: how far the storey's bounding box reaches from the wall's line along its inward normal. */
function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
}

// ---- Which gables algorithm B keeps (decision 5 as amended, journal decision 220) -----------------------------------

/**
 * Algorithm B's span for an all-gable union wall: `extentOf` read from the first storey wall standing on it (every
 * storey wall of one union wall runs on to the same span).
 */
export function algorithmBSpan(b: Building, uw: UnionWall): [number, number] {
  const w = wallsOnLine(b, uw).find(x => spanOf(x)[0] >= uw.lo - ALONG_EPS && spanOf(x)[1] <= uw.hi + ALONG_EPS);
  if (!w) throw new Error(`no storey wall stands on the union wall ${uw.axis} = ${uw.at} [${uw.lo}, ${uw.hi}]`);
  return extentOf(b, b.comps[w.comp], w);
}

/** Coordinates along a line within this are one point: the overlap filter's, `algorithmBSpan`'s and the tiling's. */
const ALONG_EPS = 1e-9;

/**
 * Gable rise decision 5 as amended (journal decision 220), **decided once per line extent**: algorithm B builds one
 * piece per extent of a line (`extentOf`), so the extent, not a union wall, is what it keeps or gives up. **Algorithm B
 * keeps an extent exactly where the claimed bands that count on it tile its span end to end**, within `ALONG_EPS`.
 * `bands` are those bands, in order along the line; `span` is algorithm B's (`algorithmBSpan`).
 * - One band: the plain rule.
 * - **The sub-rule (decision 220)**: two or more bands that tile the span are one gable to algorithm B, at decision 5's
 *   pitch, the lowest index's. Bands are split where pitch, limit or `maxHeight` differ (decision 6); algorithm B reads
 *   none of the three beyond that one pitch, and a single band's limit and `maxHeight` are not read on a kept gable
 *   either (decision 5: no rise is built for it), so bands differing only in limit or `maxHeight` keep algorithm B too.
 */
export function algorithmBBuildsGable(bands: readonly GableRise[], span: readonly [number, number]): boolean {
  if (!bands.length) return false;
  const near = (p: number, q: number): boolean => Math.abs(p - q) <= ALONG_EPS;
  const tiles = near(bands[0].lo, span[0]) && near(bands[bands.length - 1].hi, span[1]) && bands.every((x, k) => k === 0 || near(x.lo, bands[k - 1].hi));
  // Without the sub-rule this would read `tiles && bands.length === 1`, and a two-pitch extent would become two rises.
  return tiles;
}

/** One extent of algorithm B on a line: its span, the all-gable union walls on it, the bands that count there, its verdict. */
interface LineExtent { line: LineId; span: [number, number]; walls: UnionWall[]; bands: GableRise[]; keep: boolean }

const sameLineId = (p: LineId, q: LineId): boolean => p.axis === q.axis && p.at === q.at && p.n === q.n;
const overlapsAlong = (w: {lo: number; hi: number}, r: {lo: number; hi: number}): boolean => Math.min(w.hi, r.hi) - Math.max(w.lo, r.lo) > ALONG_EPS;

/**
 * Gable rise decision 5 as amended (journal decision 220), on a storey's union walls as `unionWallForms` derives them
 * and the Building built from them (`b`):
 * - The all-gable walls are grouped by algorithm B's extent (their line and `algorithmBSpan`). The claimed bands that
 *   count on an extent are those overlapping one of its walls (decision 220: a band counts only where it is on a union
 *   wall). `algorithmBBuildsGable` decides the extent once, and every wall on it takes that verdict.
 * - A kept extent's walls are returned unchanged, and its bands are algorithm B's: no rise is built over them.
 * - A given-up extent's walls become hips at their decision 5 pitch, and each of its bands is one rise.
 * - A mixed wall's rises are its claimed bands too (the WP-G4.1 measurement's interpretation 1). Where every band is
 *   one of the wall's rises, as on every mixed wall the corpus holds, the wall is returned unchanged.
 * Every band is built once: by algorithm B, or as one rise carried by the first wall, in order, that overlaps it.
 * `changed` says whether any wall changed form, so the caller rebuilds the Building only then.
 */
export function claimedWalls(rings: StoreyRing[], walls: readonly UnionWall[], b: Building): {walls: UnionWall[]; changed: boolean} {
  const lines: {line: LineId; bands: GableRise[]}[] = [];
  const bandsOf = (l: LineId): GableRise[] => {
    let hit = lines.find(x => sameLineId(x.line, l));
    if (!hit) lines.push(hit = {line: l, bands: claimedBands(rings, l)});
    return hit.bands;
  };
  const extents: LineExtent[] = [];
  for (const w of walls) {
    if (w.form !== 'gable') continue;
    const span = algorithmBSpan(b, w);
    let e = extents.find(x => sameLineId(x.line, w) && Math.abs(x.span[0] - span[0]) <= ALONG_EPS && Math.abs(x.span[1] - span[1]) <= ALONG_EPS);
    if (!e) extents.push(e = {line: w, span, walls: [], bands: [], keep: false});
    e.walls.push(w);
  }
  for (const e of extents) {
    e.bands = bandsOf(e.line).filter(r => e.walls.some(w => overlapsAlong(w, r)));
    e.keep = algorithmBBuildsGable(e.bands, e.span);
  }
  const taken = new Set<GableRise>(extents.filter(e => e.keep).flatMap(e => e.bands));
  const take = (bands: readonly GableRise[]): GableRise[] => bands.filter(r => !taken.has(r) && taken.add(r));
  const same = (p: readonly GableRise[], q: readonly GableRise[]): boolean => p.length === q.length
    && p.every((r, k) => r.lo === q[k].lo && r.hi === q[k].hi && r.deg === q[k].deg && r.limit === q[k].limit && r.maxHeight === q[k].maxHeight);
  let changed = false;
  const out = walls.map((w): UnionWall => {
    if (w.form === 'hip' && !w.rises?.length) return w;
    const bands = bandsOf(w).filter(r => overlapsAlong(w, r));
    if (w.form === 'gable') {
      if (extents.find(e => e.walls.includes(w))?.keep) return w;
      changed = true;
      const rises = take(bands);
      return {axis: w.axis, at: w.at, n: w.n, lo: w.lo, hi: w.hi, form: 'hip', deg: w.deg, ...(rises.length ? {rises} : {})};
    }
    const rises = take(bands);
    if (same(rises, w.rises ?? [])) return w;
    return {axis: w.axis, at: w.at, n: w.n, lo: w.lo, hi: w.hi, form: w.form, deg: w.deg, ...(rises.length ? {rises} : {})};
  });
  return {walls: out, changed};
}

// ---- Planes (decision 9) -------------------------------------------------------------------------------------------

/** `finishBuilding`'s plane key: an island, a gradient to 1e-9 and an offset to 1e-6. */
const planeKey = (comp: number, gx: number, gy: number, c: number): string => `${comp}|${gx.toFixed(9)}|${gy.toFixed(9)}|${c.toFixed(6)}`;

/** A storey Building's planes by key, so a plane a rise adds takes an existing id where one coincides (decision 9). */
interface PlaneBook { plane(comp: number, gx: number, gy: number, c: number, label: string): number }

function planeBook(b: Building): PlaneBook {
  const ids = new Map<string, number>();
  for (const pl of b.planes) if (pl.walls.length) ids.set(planeKey(b.walls[pl.walls[0]].comp, pl.gx, pl.gy, pl.c), pl.id);
  return {
    plane(comp, gx, gy, c, label) {
      const k = planeKey(comp, gx, gy, c);
      const hit = ids.get(k);
      if (hit !== undefined) return hit;
      const pl: Plane = {id: b.planes.length, gx, gy, c, walls: [], label};
      b.planes.push(pl);
      ids.set(k, pl.id);
      return pl.id;
    },
  };
}

// ---- The walk (decision 11, ridgeSlope) ----------------------------------------------------------------------------

/** One surface the walk reads: at a plan point, the plane of the face standing there, or undefined where none does. */
type Surface = (p: Pt) => number | undefined;

/** Whether `p` lies within `WALK_EPS` of a polygon's boundary. */
function onBoundary(p: Pt, poly: readonly Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= WALK_EPS) return true;
  }
  return false;
}

/** Whether `p` lies in a polygon, its boundary included (`closed`) or not. */
const inPoly = (p: Pt, poly: readonly Pt[], closed: boolean): boolean => (onBoundary(p, poly) ? closed : pointInPoly(p, [...poly]));

/** The parameters `t` at which the line `o + t n` meets a polygon's boundary: every crossing and every vertex on it. */
function lineCuts(o: Pt, n: Pt, poly: readonly Pt[]): number[] {
  // The walk runs square to an axis-aligned wall, so `n` is a unit axis: `x` (or `y`) is fixed along the line.
  const fixedX = Math.abs(n.y) > 0.5;
  const fixed = fixedX ? o.x : o.y;
  const param = (q: Pt): number => (fixedX ? (q.y - o.y) * n.y : (q.x - o.x) * n.x);
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = (fixedX ? a.x : a.y) - fixed, fb = (fixedX ? b.x : b.y) - fixed;
    if (Math.abs(fa) <= WALK_EPS) out.push(param(a));
    if (fa * fb < 0 && Math.abs(fb) > WALK_EPS) {
      const k = fa / (fa - fb);
      out.push(param({x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k}));
    }
  }
  return out;
}

/** Whether `p` lies strictly inside an island's true footprint: inside its outer loop and outside every hole, off both. */
const insideIsland = (comp: Comp, p: Pt): boolean => inPoly(p, comp.outer, false) && !comp.holes.some(h => inPoly(p, h, true));

/**
 * The skeleton's faces of one island: their planes and polygons, the walk's hip roof, and whether each face's slope is
 * in the finished building (`SlopeInBuilding`, journal decision 231).
 */
interface FacePoly { plane: number; poly: Pt[]; built: boolean }

/**
 * Journal decision 231: whether the hip slope of a storey wall, its skeleton face, is in the finished building, read
 * from how the storey is planned.
 */
export type SlopeInBuilding = (plan: StoreyPlan, wall: Wall) => boolean;

/** Whether one of algorithm B's gable pieces stands on `wall`'s line, facing its way, over the wall's whole span. */
function pieceCovers(piece: Piece, wall: Wall): boolean {
  const p = piece.wall;
  if (p.form !== 'gable' || dot(p.n, wall.n) < 0.5 || alongX(p) !== alongX(wall)) return false;
  if (Math.abs((alongX(wall) ? p.a.y - wall.a.y : p.a.x - wall.a.x)) > ALONG_EPS) return false;
  const [lo, hi] = spanOf(wall);
  return piece.bandLo <= lo + ALONG_EPS && piece.bandHi >= hi - ALONG_EPS;
}

/**
 * Journal decision 231, the one predicate: **a wall the roof solve takes as a gable, and one of algorithm B's pieces
 * builds over its whole span, has no hip slope in the finished building**, because the gable stands in its place. Every
 * other wall keeps its slope: a hip; a hip carrying rises, on part of its length or (journal decision 220) on all of it,
 * since it enters the solve as a hip; and a courtyard's cut, which is no gable, its plane the collinear hole wall's or
 * the island's steepest. A whole-wall gable whose piece spans more than the wall (past an inside corner) covers it too.
 */
export const slopeInBuilding: SlopeInBuilding = (plan, wall) => !(wall.form === 'gable' && plan.roof.pieces.some(p => pieceCovers(p, wall)));

/**
 * The hip roof's face at `p`: a face holding `p` in its interior, else one holding it on its boundary (a walk along a
 * ridge or a cut runs on two faces' boundary, and both rise or fall alike along it); among those, a face whose slope is
 * built before one whose slope is not, then the lowest plane id.
 */
function hipFace(faces: readonly FacePoly[]): (p: Pt) => FacePoly | undefined {
  return p => {
    const strict = faces.filter(f => inPoly(p, f.poly, false));
    const held = strict.length ? strict : faces.filter(f => onBoundary(p, f.poly));
    const built = held.filter(f => f.built);
    const pick = built.length ? built : held;
    return pick.length ? pick.reduce((m, f) => (f.plane < m.plane ? f : m)) : undefined;
  };
}

/** The plane of the hip roof's face at `p` where that face's slope is built; undefined where it is not (journal decision 231). */
function hipSurface(faces: readonly FacePoly[]): Surface {
  const face = hipFace(faces);
  return p => {
    const f = face(p);
    return f?.built ? f.plane : undefined;
  };
}

/** A piece's region in plan: its band from its wall to its far reach (as `gablePiece` builds it), within its outline. */
function pieceRect(b: Building, piece: Piece): Pt[] {
  const far = Math.min(piece.farDist, bboxReach(b, piece.wall));
  const w = piece.wall;
  return [atAlong(w, piece.bandLo, 0), atAlong(w, piece.bandHi, 0), atAlong(w, piece.bandHi, far), atAlong(w, piece.bandLo, far)];
}

/**
 * The roof as built before any rise (decision 11's fallback): the hip roof raised by the storey's own pieces (its
 * whole-wall gables and its cut), each the lowest of its planes over its region, the highest surface winning, the
 * lowest plane id among equals. Journal decision 231: a piece level with a hip face whose slope `SlopeInBuilding` says
 * is not built wins, since the piece stands there. Where no piece reaches such a face, as where a gable's piece stops at
 * its far wall short of the face's depth, the face is the roof as built, and the surface gives its plane.
 */
function builtSurface(b: Building, comp: Comp, faces: readonly FacePoly[], pieces: readonly Piece[]): Surface {
  const hip = hipFace(faces);
  return p => {
    const base = hip(p);
    if (base === undefined) return undefined;
    let best = base.plane, h = planeAt(b.planes[base.plane], p), unbuiltBase = !base.built;
    for (const piece of pieces) {
      if (!inPoly(p, pieceRect(b, piece), true) || !inPoly(p, comp.outer, true)) continue;
      const id = piece.planes.reduce((m, k) => (planeAt(b.planes[k], p) < planeAt(b.planes[m], p) ? k : m));
      const v = planeAt(b.planes[id], p);
      if (v > h + WALK_EPS || (Math.abs(v - h) <= WALK_EPS && (unbuiltBase || id < best))) { best = id; h = v; unbuiltBase = false; }
    }
    return best;
  };
}

/**
 * Decision 11's walk, exact: the line from `o` along `n` is cut at every point where it meets a face boundary, a
 * region boundary or the footprint's, and where any two of `planes` are equal along it. Between cuts the surface holds
 * one plane, read at the stretch's middle. The answer is the first stretch's plane that falls along `n`, before the line
 * leaves the island's footprint (a stretch whose middle is not strictly inside it); undefined when there is none.
 */
function walk(b: Building, comp: Comp, o: Pt, n: Pt, polys: readonly (readonly Pt[])[], planes: readonly number[], surface: Surface): number | undefined {
  const cuts = new Set<number>([0]);
  for (const poly of polys) for (const t of lineCuts(o, n, poly)) if (t > 0) cuts.add(t);
  // Where two planes are equal along the line, the surface may change from one to the other.
  const at = (id: number): [number, number] => {
    const pl = b.planes[id];
    return [planeAt(pl, o), pl.gx * n.x + pl.gy * n.y];
  };
  const lines = [...new Set(planes)].map(at);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const ds = lines[i][1] - lines[j][1];
      if (Math.abs(ds) > 1e-12) { const t = (lines[j][0] - lines[i][0]) / ds; if (t > 0) cuts.add(t); }
    }
  }
  const ts = [...cuts].sort((p, q) => p - q);
  for (let k = 0; k + 1 < ts.length; k++) {
    if (ts[k + 1] - ts[k] <= WALK_EPS) continue;
    const m = (ts[k] + ts[k + 1]) / 2;
    const p = {x: o.x + n.x * m, y: o.y + n.y * m};
    if (!insideIsland(comp, p)) return undefined;
    const id = surface(p);
    // The faces tile the footprint, so a stretch inside it that no face holds is a sliver of round-off; a stretch whose
    // face's slope is not built (journal decision 231) has no plane either. Both are passed over.
    if (id === undefined) continue;
    const pl = b.planes[id];
    if (pl.gx * n.x + pl.gy * n.y < -1e-9) return id;
  }
  return undefined;
}

/** What a limit policy reads: the storey, the rise's wall and island, and where its walk starts. */
export interface LimitContext { plan: StoreyPlan; wall: Wall; comp: Comp; rise: GableRise }

/** One reading of `ridgeSlope`'s walk: the plane it finds, or undefined. */
export type RidgeSlopeReading = (ctx: LimitContext) => number | undefined;

/** The island's skeleton faces, each marked by whether `slopeIn` says its slope is in the finished building. */
function islandFaces(ctx: LimitContext, slopeIn: SlopeInBuilding): FacePoly[] {
  return ctx.plan.roof.faces.filter(f => f.wall.comp === ctx.wall.comp).map(f => ({plane: f.wall.plane, poly: f.poly, built: slopeIn(ctx.plan, f.wall)}));
}

/** The walk's start, the middle of the band on the wall's line, and its direction, inward. */
const walkStart = (ctx: LimitContext): [Pt, Pt] => [atAlong(ctx.wall, (ctx.rise.lo + ctx.rise.hi) / 2, 0), ctx.wall.n];

/**
 * Decision 11 (journal decisions 204 and 231, F70): the walk over the solved hip roof, no rise added, passing over every
 * face whose slope `slopeIn` says is not in the finished building.
 */
export const hipRoofReadingOf = (slopeIn: SlopeInBuilding): RidgeSlopeReading => ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx, slopeIn);
  const [o, n] = walkStart(ctx);
  return walk(b, ctx.comp, o, n, [...faces.map(f => f.poly), ctx.comp.outer, ...ctx.comp.holes], faces.map(f => f.plane), hipSurface(faces));
};

/**
 * Decision 11's fallback (journal decisions 204 and 231): the same walk over the roof as built before any rise. It
 * returns the plane of a hip face whose slope `slopeIn` says is not built only where no piece stands level with or above
 * that face, so only where that slope is in the finished building after all.
 */
export const builtRoofReadingOf = (slopeIn: SlopeInBuilding): RidgeSlopeReading => ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx, slopeIn);
  const pieces = ctx.plan.roof.pieces.filter(p => p.wall.comp === ctx.wall.comp);
  const [o, n] = walkStart(ctx);
  const polys = [...faces.map(f => f.poly), ...pieces.map(p => pieceRect(b, p)), ctx.comp.outer, ...ctx.comp.holes];
  return walk(b, ctx.comp, o, n, polys, [...faces.map(f => f.plane), ...pieces.flatMap(p => p.planes)], builtSurface(b, ctx.comp, faces, pieces));
};

/** `ridgeSlope`'s readings under one reading of which slopes are built, in order: the first that finds a plane gives the limit. */
export const ridgeSlopeReadings = (slopeIn: SlopeInBuilding): readonly RidgeSlopeReading[] => [hipRoofReadingOf(slopeIn), builtRoofReadingOf(slopeIn)];

/** `ridgeSlope`'s readings, under journal decision 231's predicate. */
export const RIDGE_SLOPE_READINGS: readonly RidgeSlopeReading[] = ridgeSlopeReadings(slopeInBuilding);

/** Decision 11 (journal decisions 204 and 231): the walk over the hip roof, the first of `RIDGE_SLOPE_READINGS`. */
export const hipRoofReading: RidgeSlopeReading = RIDGE_SLOPE_READINGS[0];

/** Decision 11's fallback (journal decisions 204 and 231): the walk over the built roof, the second of `RIDGE_SLOPE_READINGS`. */
export const builtRoofReading: RidgeSlopeReading = RIDGE_SLOPE_READINGS[1];

/**
 * A limit policy (decision 11): the plane that bounds a rise besides its rakes, or undefined where the rise has no slope
 * limit and only its caps bound it (journal decision 231).
 */
export type LimitPolicy = (ctx: LimitContext) => number | undefined;

/** A limit policy for each name of `RISE_LIMITS`. */
export type LimitPolicies = Readonly<Record<RiseLimit, LimitPolicy>>;

/**
 * Decision 11 (journal decisions 204 and 231, F70): no point of the rise stands above the roof slope just beyond the main
 * ridge its own ridge runs into, extended back to its wall; a slope that is not in the finished building is no such
 * slope. Read by `RIDGE_SLOPE_READINGS`. **A rise none of them limits has no slope limit** (journal decision 231, which
 * replaces decision 206's `PlanRefusal`): its rakes and caps alone bound it.
 */
export const ridgeSlope: LimitPolicy = ctx => {
  for (const reading of RIDGE_SLOPE_READINGS) {
    const id = reading(ctx);
    if (id !== undefined) return id;
  }
  return undefined;
};

/** Every limit policy by name (decision 11). A second policy is one more entry. */
export const RISE_LIMIT_POLICIES: LimitPolicies = {ridgeSlope};

// ---- Caps (decision 12) --------------------------------------------------------------------------------------------

/** What a cap reads: the fixture, the storey, the rise, and the plan rectangle it reaches over. */
export interface CapContext { f: ShellFixture; plan: StoreyPlan; rise: GableRise; reach: Pt[] }

/** A cap (decision 12): a horizontal plane at this height above the rise's plate, or undefined where it does not apply. */
export type CapPolicy = (ctx: CapContext) => number | undefined;

/** Whether a Ring of storey `m` overlaps the rise's reach in plan, by more than `SHELL_TOLERANCE_CM` each way. */
function overlaps(ctx: CapContext, m: number): boolean {
  const xs = ctx.reach.map(p => p.x), ys = ctx.reach.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return storeyRings(ctx.f, m).some(({ring: {rect}}) =>
    Math.min(rect[2], x1) - Math.max(rect[0], x0) > SHELL_TOLERANCE_CM && Math.min(rect[3], y1) - Math.max(rect[1], y0) > SHELL_TOLERANCE_CM);
}

/** Decision 12: the rise's own `maxHeight`. */
export const maxHeightCap: CapPolicy = ctx => ctx.rise.maxHeight;

/**
 * Decision 12 (journal decision 204): `FLOOR_CAP_GAP_CM` below the floor of the lowest storey that overhangs the rise,
 * one whose floor is above its plate (two or more storeys up) and whose plan overlaps its reach.
 */
export const floorCap: CapPolicy = ctx => {
  const m = storeysOf(ctx.f).find(s => s >= ctx.plan.storey + 2 && overlaps(ctx, s));
  return m === undefined ? undefined : m * ctx.f.storeyHeight - ctx.plan.plate - FLOOR_CAP_GAP_CM;
};

/** Decision 12 (journal decision 204, F72): the wall top (the plate) of the storey directly above, where it overlaps the reach. */
export const wallTopCap: CapPolicy = ctx => (storeysOf(ctx.f).includes(ctx.plan.storey + 1) && overlaps(ctx, ctx.plan.storey + 1) ? ctx.f.storeyHeight : undefined);

/** Decision 12's caps by name (journal decision 209, N1), in the order a tie between them is read. */
export const RISE_CAP_NAMES = ['maxHeight', 'floor', 'wallTop'] as const;

/** One of `RISE_CAP_NAMES`. */
export type RiseCapName = typeof RISE_CAP_NAMES[number];

/** Decision 12's caps. The lowest that applies caps the rise, the first by `RISE_CAP_NAMES` among equals. */
export const RISE_CAPS: Readonly<Record<RiseCapName, CapPolicy>> = {maxHeight: maxHeightCap, floor: floorCap, wallTop: wallTopCap};

// ---- The piece (decisions 8 to 10) ---------------------------------------------------------------------------------

const inwardOf = (n: WallLine['n']): Pt => ({'+x': {x: 1, y: 0}, '-x': {x: -1, y: 0}, '+y': {x: 0, y: 1}, '-y': {x: 0, y: -1}}[n]);

/** The storey walls standing on a line, facing its way, a cut's excepted. */
function wallsOnLine(b: Building, line: LineId): Wall[] {
  const n = inwardOf(line.n);
  return b.walls.filter(w => w.form !== 'cut' && dot(w.n, n) > 0.5
    && (line.axis === 'y' ? w.a.y === line.at && w.b.y === line.at : w.a.x === line.at && w.b.x === line.at));
}

/**
 * The storey wall a rise stands on: the one on its union wall's line, facing its way, holding its band's middle. A band
 * claimed across a buried stretch (journal decision 220) may have its middle buried; it then stands on the longest wall
 * of its line that it overlaps (the WP-G4.1 probe's `bandPiece`, its interpretation 6), and among walls of equal length
 * on the one that starts lowest along the line (journal decision 222, M1), whatever order the Building lists them in.
 * The walls share the line, so the choice moves no plane, reach or limit of the piece.
 */
function riseWall(b: Building, line: WallLine, rise: GableRise): Wall {
  const mid = (rise.lo + rise.hi) / 2;
  const cands = wallsOnLine(b, line).filter(w => Math.min(spanOf(w)[1], rise.hi) - Math.max(spanOf(w)[0], rise.lo) > ALONG_EPS);
  const length = (w: Wall): number => spanOf(w)[1] - spanOf(w)[0];
  const w = cands.find(x => spanOf(x)[0] <= mid && mid <= spanOf(x)[1])
    ?? [...cands].sort((p, q) => length(q) - length(p) || spanOf(p)[0] - spanOf(q)[0])[0];
  if (!w) throw new Error(`no wall holds the rise [${rise.lo}, ${rise.hi}] on ${line.axis} = ${line.at}`);
  return w;
}

/**
 * Decisions 8 to 12: one storey's rises as pieces, from its union walls' `rises`, each beside the storey's own pieces
 * and built by the unchanged `gablePiece`. A rise whose lowest cap is at or below its plate builds no piece. Every plane
 * a rise adds is keyed into the storey's Building (decision 9). The limit reads the storey's roof without any rise, so
 * rises never limit one another (journal decision 204); a rise its policy gives no limit carries only its rakes and caps
 * (journal decision 231). `policies` is the policy table, `RISE_LIMIT_POLICIES` unless a caller swaps it.
 */
export function risePieces(f: ShellFixture, plan: StoreyPlan, walls: readonly UnionWall[], policies: LimitPolicies = RISE_LIMIT_POLICIES): RisePiece[] {
  const b = plan.building;
  const book = planeBook(b);
  const out: RisePiece[] = [];
  for (const line of walls) {
    for (const rise of line.rises ?? []) {
      const wall = riseWall(b, line, rise);
      const comp = b.comps[wall.comp];
      const t = tanDeg(rise.deg);
      const x = alongX(wall);
      const planes: number[] = [];
      const use = (id: number): void => { if (!planes.includes(id)) planes.push(id); };
      // Decision 10: a convex corner's end wall gives its plane, as `endPlanes` reads it (a dead or cut wall gives none).
      const corner = (s: number, into: number): Wall | undefined => {
        const e = endWall(comp, wall, s, into);
        return e && !e.dead && e.form !== 'cut' ? e : undefined;
      };
      const lo = corner(rise.lo, 1), hi = corner(rise.hi, -1);
      use(lo ? lo.plane : book.plane(wall.comp, x ? t : 0, x ? 0 : t, -t * rise.lo, `rake from ${rise.lo} on ${wallLabel(wall)}`));
      use(hi ? hi.plane : book.plane(wall.comp, x ? -t : 0, x ? 0 : -t, t * rise.hi, `rake from ${rise.hi} on ${wallLabel(wall)}`));
      const limitPlane = policies[rise.limit]({plan, wall, comp, rise});
      if (limitPlane !== undefined) use(limitPlane);
      const far = farWall(comp, wall, rise.lo, rise.hi);
      const farDist = far ? dot(sub(far.a, wall.a), wall.n) : Infinity;
      const reachD = Math.min(farDist, bboxReach(b, wall));
      const reach = [atAlong(wall, rise.lo, 0), atAlong(wall, rise.hi, 0), atAlong(wall, rise.hi, reachD), atAlong(wall, rise.lo, reachD)];
      let won: {cap: RiseCapName; capCm: number} | undefined;
      for (const name of RISE_CAP_NAMES) {
        const c = RISE_CAPS[name]({f, plan, rise, reach});
        if (c !== undefined && (!won || c < won.capCm)) won = {cap: name, capCm: c};
      }
      if (won && won.capCm <= SHELL_TOLERANCE_CM) continue;
      if (won) use(book.plane(wall.comp, 0, 0, won.capCm, `cap ${won.capCm} on ${wallLabel(wall)}`));
      const piece: Piece = {wall, bandLo: rise.lo, bandHi: rise.hi, farDist, planes, label: `rise [${rise.lo},${rise.hi}] of ${wallLabel(wall)} at ${rise.deg}`};
      out.push({rise, piece, ...(limitPlane !== undefined ? {limitPlane} : {}), ...(won ?? {})});
    }
  }
  return out;
}
