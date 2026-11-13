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
// - Journal decision 243 (F80), three named pieces: rule 1, a hip slope a gable of its wall replaces over the walk line
//   does not limit (`gableOverWalk`); rule 2, a rise that meets such a wall runs to it and ends there, its walk and its
//   reach (`gableEnd`); rule 3, a gable band wholly covered at plate level is built too (`coveredBands`,
//   `bandCountsOnExtent`).
// Every default here is provisional until the user confirms (journal decision 204), so each is one named policy or
// constant, replaceable without touching its neighbours.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {RiseLimit, ShellFixture, StoreyRing, storeyRings, storeysOf} from './fixture.ts';
import {GableRise, LineId, UnionWall, WallLine, claimedBands, ringSideLines, tanDeg} from './ring-forms.ts';
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

/** A stretch `[lo, hi]` along a line. */
export type AlongSpan = Pick<WallLine, 'lo' | 'hi'>;

const overlapsAlong = (w: AlongSpan, r: AlongSpan): boolean => Math.min(w.hi, r.hi) - Math.max(w.lo, r.lo) > ALONG_EPS;

/**
 * Journal decision 243, rule 3 (the band rule, on an extent): **a claimed band counts on algorithm B's extent where it
 * overlaps the extent's span**, whether or not any of it is on a union wall. STRUCK by rule 3: decision 220's "a band
 * counts only where it is on a union wall", which read the extent's walls here. A band wholly covered at plate level
 * inside the span is a buried stretch of the line, as decision 220 counts buried stretches.
 */
export type BandCountsOnExtent = (span: readonly [number, number], band: GableRise) => boolean;

/** Journal decision 243, rule 3: a band counts on the extent whose span it overlaps. */
export const bandCountsOnExtent: BandCountsOnExtent = (span, band) => overlapsAlong({lo: span[0], hi: span[1]}, band);

/**
 * Journal decision 243, rule 3: a claimed gable band that lies on no union wall, wholly covered at plate level by a
 * neighbouring Ring, and the rise built for it: its line and the band. The rise stands on that line (`riseWall`).
 */
export type CoveredRise = RiseOnLine;

/** Every distinct line of a storey's Ring sides, with its inward normal: where claimed bands can lie. */
export function ringSideLineIds(rings: readonly StoreyRing[]): LineId[] {
  const out: LineId[] = [];
  for (const {ring} of rings) {
    for (const l of Object.values(ringSideLines(ring.rect))) if (!out.some(o => sameLineId(o, l))) out.push({axis: l.axis, at: l.at, n: l.n});
  }
  return out;
}

/** The claimed bands of each line, read once per line. */
export type BandsOfLine = (line: LineId) => GableRise[];

/**
 * Journal decision 243, rule 3 (the band rule, for covered bands): **a gable stretch is built even where a neighbouring
 * Ring covers all of it at plate level**; the union shows whatever stands above the neighbour's roof. Every claimed band
 * of every Ring side line that algorithm B and the union walls have not taken, and that overlaps no union wall on its
 * line, is one rise. STRUCK by rule 3: decision 220's "a band counts only if part of it is on a union wall".
 */
export type CoveredBands = (rings: readonly StoreyRing[], walls: readonly UnionWall[], bandsOf: BandsOfLine, taken: ReadonlySet<GableRise>) => CoveredRise[];

/** Journal decision 243, rule 3: every band no wall carries and algorithm B does not build is a covered rise. */
export const coveredBands: CoveredBands = (rings, walls, bandsOf, taken) => ringSideLineIds(rings).flatMap(line => bandsOf(line)
  .filter(r => !taken.has(r) && !walls.some(w => sameLineId(w, line) && overlapsAlong(w, r)))
  .map((rise): CoveredRise => ({line, rise})));

/** The walls `claimedWalls` gives, whether any changed form, and the covered rises (journal decision 243, rule 3). */
export interface ClaimedForms { walls: UnionWall[]; changed: boolean; covered: CoveredRise[] }

/**
 * Gable rise decision 5 as amended (journal decisions 220 and 243), on a storey's union walls as `unionWallForms`
 * derives them and the Building built from them (`b`):
 * - The all-gable walls are grouped by algorithm B's extent (their line and `algorithmBSpan`). The claimed bands that
 *   count on an extent are those `bandCountsOnExtent` gives: those overlapping its span (journal decision 243, rule 3).
 *   `algorithmBBuildsGable` decides the extent once, and every wall on it takes that verdict.
 * - A kept extent's walls are returned unchanged, and its bands are algorithm B's: no rise is built over them.
 * - A given-up extent's walls become hips at their decision 5 pitch, and each of its bands is one rise.
 * - A mixed wall's rises are its claimed bands too (the WP-G4.1 measurement's interpretation 1). Where every band is
 *   one of the wall's rises, as on every mixed wall the corpus holds, the wall is returned unchanged.
 * - Every band left, which lies on no union wall, is a covered rise (`coveredBands`, journal decision 243, rule 3).
 * Every band is built once: by algorithm B, as one rise carried by the first wall, in order, that overlaps it, or as a
 * covered rise. `changed` says whether any wall changed form, so the caller rebuilds the Building only then.
 */
export function claimedWalls(rings: StoreyRing[], walls: readonly UnionWall[], b: Building, covered: CoveredBands = coveredBands): ClaimedForms {
  const lines: {line: LineId; bands: GableRise[]}[] = [];
  const bandsOf: BandsOfLine = l => {
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
    e.bands = bandsOf(e.line).filter(r => bandCountsOnExtent(e.span, r));
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
  return {walls: out, changed, covered: covered(rings, out, bandsOf, taken)};
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
 * The skeleton's faces of one island: their planes and polygons, the walk's hip roof, whether each face's slope is in
 * the finished building (`built`, `SlopeInBuilding`, journal decision 231), and whether a gable of its wall stands over
 * the walk line in its place (`replaced`, `GableOverWalk`, journal decision 243, rule 1).
 */
interface FacePoly { plane: number; poly: Pt[]; built: boolean; replaced: boolean }

/** A face whose slope is on the walk: built (journal decision 231), and not replaced over the walk line (decision 243). */
const onWalk = (f: FacePoly): boolean => f.built && !f.replaced;

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
 * on the walk (`onWalk`) before one whose slope is not, then the lowest plane id.
 */
function hipFace(faces: readonly FacePoly[]): (p: Pt) => FacePoly | undefined {
  return p => {
    const strict = faces.filter(f => inPoly(p, f.poly, false));
    const held = strict.length ? strict : faces.filter(f => onBoundary(p, f.poly));
    const built = held.filter(onWalk);
    const pick = built.length ? built : held;
    return pick.length ? pick.reduce((m, f) => (f.plane < m.plane ? f : m)) : undefined;
  };
}

/**
 * The plane of the hip roof's face at `p` where that face's slope is on the walk; undefined where it is not built
 * (journal decision 231) or a gable stands over the walk line in its place (journal decision 243, rule 1).
 */
function hipSurface(faces: readonly FacePoly[]): Surface {
  const face = hipFace(faces);
  return p => {
    const f = face(p);
    return f && onWalk(f) ? f.plane : undefined;
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
 * its far wall short of the face's depth, the face is the roof as built, and the surface gives its plane. Journal
 * decision 243, rule 1: a face a gable replaces over the walk line (`replaced`) gives no plane where no piece wins; the
 * gable over it is a rise, which is no piece of the roof before rises, and its slope is not on the walk.
 */
function builtSurface(b: Building, comp: Comp, faces: readonly FacePoly[], pieces: readonly Piece[]): Surface {
  const hip = hipFace(faces);
  return p => {
    const base = hip(p);
    if (base === undefined) return undefined;
    let best = base.plane, h = planeAt(b.planes[base.plane], p), unbuiltBase = !base.built, fromBase = true;
    for (const piece of pieces) {
      if (!inPoly(p, pieceRect(b, piece), true) || !inPoly(p, comp.outer, true)) continue;
      const id = piece.planes.reduce((m, k) => (planeAt(b.planes[k], p) < planeAt(b.planes[m], p) ? k : m));
      const v = planeAt(b.planes[id], p);
      if (v > h + WALK_EPS || (Math.abs(v - h) <= WALK_EPS && (unbuiltBase || id < best))) { best = id; h = v; unbuiltBase = false; fromBase = false; }
    }
    return fromBase && base.replaced ? undefined : best;
  };
}

/**
 * Decision 11's walk, exact: the line from `o` along `n` is cut at every point where it meets a face boundary, a
 * region boundary or the footprint's, and where any two of `planes` are equal along it. Between cuts the surface holds
 * one plane, read at the stretch's middle. The answer is the first stretch's plane that falls along `n`, before the line
 * leaves the island's footprint (a stretch whose middle is not strictly inside it) and before `end` (journal decision
 * 243, rule 2: the rise ends at a wall whose gable stands over its walk line); undefined when there is none.
 */
function walk(b: Building, comp: Comp, o: Pt, n: Pt, polys: readonly (readonly Pt[])[], planes: readonly number[], surface: Surface, end?: number): number | undefined {
  const cuts = new Set<number>([0]);
  if (end !== undefined) cuts.add(end);
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
    if (end !== undefined && m > end) return undefined;
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

/**
 * Journal decision 243: one gable a storey builds, as a stretch `[lo, hi]` of a line facing its way: an algorithm B
 * gable piece's band, a union wall's rise, or a covered rise. Read from bands, never from heights.
 */
export type StoreyGable = WallLine;

/** What a limit policy reads: the storey, the rise's wall and island, the storey's gables, and where its walk starts. */
export interface LimitContext { plan: StoreyPlan; wall: Wall; comp: Comp; rise: GableRise; gables: readonly StoreyGable[] }

/** One reading of `ridgeSlope`'s walk: the plane it finds, or undefined. */
export type RidgeSlopeReading = (ctx: LimitContext) => number | undefined;

/** The line a storey wall stands on, facing its way. */
export function wallLineId(w: Wall): LineId {
  return alongX(w) ? {axis: 'y', at: w.a.y, n: w.n.y > 0 ? '+y' : '-y'} : {axis: 'x', at: w.a.x, n: w.n.x > 0 ? '+x' : '-x'};
}

/** The middle of the rise's band: where its walk starts along its wall's line. */
const walkAt = (ctx: LimitContext): number => (ctx.rise.lo + ctx.rise.hi) / 2;

/** Whether a gable's band holds the walk line strictly inside it: at a band's end its gable has no height. */
const holdsWalk = (g: StoreyGable, s: number): boolean => g.lo + ALONG_EPS < s && s < g.hi - ALONG_EPS;

/**
 * Journal decision 243, rule 1: whether a gable of the storey, whole or a stretch, stands on `wall`'s line, facing its
 * way, over the rise's walk line. Where one does, the wall's hip slope is replaced there and does not limit the rise.
 * Only a wall parallel to the rise's has a stretch the walk line crosses.
 */
export type GableOverWalk = (ctx: LimitContext, wall: Wall) => boolean;

/** Journal decision 243, rule 1: a storey gable on the wall's line, facing its way, holding the walk line. */
export const gableOverWalk: GableOverWalk = (ctx, wall) => {
  if (alongX(wall) !== alongX(ctx.wall)) return false;
  const line = wallLineId(wall), s = walkAt(ctx);
  return ctx.gables.some(g => sameLineId(g, line) && holdsWalk(g, s));
};

/** The parameters along the walk's line where it crosses the island's outline: its outer loop and its holes. */
const islandCuts = (comp: Comp, o: Pt, n: Pt): number[] => [comp.outer, ...comp.holes].flatMap(poly => lineCuts(o, n, poly));

/** Whether the walk from `o` along `n` stays strictly inside the island over `(0, d)`. */
function staysInside(comp: Comp, o: Pt, n: Pt, d: number): boolean {
  const ts = [...new Set([0, d, ...islandCuts(comp, o, n).filter(t => t > 0 && t < d)])].sort((p, q) => p - q);
  for (let k = 0; k + 1 < ts.length; k++) {
    if (ts[k + 1] - ts[k] <= WALK_EPS) continue;
    const m = (ts[k] + ts[k + 1]) / 2;
    if (!insideIsland(comp, {x: o.x + n.x * m, y: o.y + n.y * m})) return false;
  }
  return true;
}

/**
 * Journal decision 243, rule 2: where a rise ends. **A rise that meets a wall whose own gable stands over its walk line
 * runs to that wall and ends there**, joining the gable on it: the distance from the rise's wall to the nearest line,
 * facing back, that holds a storey gable over the walk line, reached without leaving the island. Undefined where there
 * is none. The walk reads nothing beyond it, and the rise's reach stops there.
 */
export type RiseEnd = (ctx: LimitContext) => number | undefined;

/** Journal decision 243, rule 2: the nearest facing-back line whose gable holds the walk line, reached inside the island. */
export const gableEnd: RiseEnd = ctx => {
  const x = alongX(ctx.wall), s = walkAt(ctx);
  const o = atAlong(ctx.wall, s, 0), n = ctx.wall.n;
  let best: number | undefined;
  for (const g of ctx.gables) {
    if ((g.axis === 'y') !== x || dot(inwardOf(g.n), n) > -0.5 || !holdsWalk(g, s)) continue;
    const d = (g.at - (x ? o.y : o.x)) * (x ? n.y : n.x);
    if (d <= WALK_EPS || (best !== undefined && d >= best)) continue;
    if (staysInside(ctx.comp, o, n, d)) best = d;
  }
  return best;
};

/**
 * The rules the walk reads (journal decisions 231 and 243), each a named piece: which slopes are in the finished
 * building (`slopeIn`), which a gable replaces over the walk line (`gableOver`, rule 1), and where the rise ends (`end`,
 * rule 2). A later change swaps one without touching the others.
 */
export interface WalkRules { slopeIn: SlopeInBuilding; gableOver: GableOverWalk; end: RiseEnd }

/** The walk's rules as built: decision 231's predicate and decision 243's rules 1 and 2. */
export const WALK_RULES: WalkRules = {slopeIn: slopeInBuilding, gableOver: gableOverWalk, end: gableEnd};

/** The island's skeleton faces, each marked by whether its slope is built (`slopeIn`) and replaced (`gableOver`). */
function islandFaces(ctx: LimitContext, rules: WalkRules): FacePoly[] {
  return ctx.plan.roof.faces.filter(f => f.wall.comp === ctx.wall.comp)
    .map(f => ({plane: f.wall.plane, poly: f.poly, built: rules.slopeIn(ctx.plan, f.wall), replaced: rules.gableOver(ctx, f.wall)}));
}

/** The walk's start, the middle of the band on the wall's line, and its direction, inward. */
const walkStart = (ctx: LimitContext): [Pt, Pt] => [atAlong(ctx.wall, walkAt(ctx), 0), ctx.wall.n];

/**
 * Decision 11 (journal decisions 204, 231 and 243, F70): the walk over the solved hip roof, no rise added, passing over
 * every face whose slope is not in the finished building or is replaced over the walk line, and ending where the rise
 * ends (`rules.end`).
 */
export const hipRoofReadingOf = (rules: WalkRules): RidgeSlopeReading => ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx, rules);
  const [o, n] = walkStart(ctx);
  return walk(b, ctx.comp, o, n, [...faces.map(f => f.poly), ctx.comp.outer, ...ctx.comp.holes], faces.map(f => f.plane), hipSurface(faces), rules.end(ctx));
};

/**
 * Decision 11's fallback (journal decisions 204, 231 and 243): the same walk over the roof as built before any rise,
 * read literally. It may return the plane of a gabled wall's face, which `slopeIn` says is not built, but only where no
 * piece stands level with or above that face, as where the gable's piece stops at its far wall short of the face's
 * depth. There the face is the roof as built, so its slope is in the finished building and limits (journal decision
 * 233). A face a gable replaces over the walk line gives no plane (journal decision 243, rule 1).
 */
export const builtRoofReadingOf = (rules: WalkRules): RidgeSlopeReading => ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx, rules);
  const pieces = ctx.plan.roof.pieces.filter(p => p.wall.comp === ctx.wall.comp);
  const [o, n] = walkStart(ctx);
  const polys = [...faces.map(f => f.poly), ...pieces.map(p => pieceRect(b, p)), ctx.comp.outer, ...ctx.comp.holes];
  return walk(b, ctx.comp, o, n, polys, [...faces.map(f => f.plane), ...pieces.flatMap(p => p.planes)], builtSurface(b, ctx.comp, faces, pieces), rules.end(ctx));
};

/** `ridgeSlope`'s readings under one set of walk rules, in order: the first that finds a plane gives the limit. */
export const ridgeSlopeReadings = (rules: WalkRules): readonly RidgeSlopeReading[] => [hipRoofReadingOf(rules), builtRoofReadingOf(rules)];

/** `ridgeSlope`'s readings, under journal decision 231's predicate and decision 243's rules 1 and 2. */
export const RIDGE_SLOPE_READINGS: readonly RidgeSlopeReading[] = ridgeSlopeReadings(WALK_RULES);

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
 * replaces decision 206's `PlanRefusal`): its rakes and caps alone bound it. Such a rise runs to its far wall, and where
 * it stands above the roof there it shows as a second gable on that wall (journal decision 233: accepted as built).
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
 * The walls share the line, so the choice moves no plane, reach or limit of the piece. A band on no wall of its line, a
 * covered rise (journal decision 243, rule 3), stands where `coveredRiseWall` puts it.
 */
function riseWall(b: Building, line: LineId, rise: GableRise): Wall {
  const mid = (rise.lo + rise.hi) / 2;
  const cands = wallsOnLine(b, line).filter(w => Math.min(spanOf(w)[1], rise.hi) - Math.max(spanOf(w)[0], rise.lo) > ALONG_EPS);
  if (!cands.length) return coveredRiseWall(b, line, rise);
  const length = (w: Wall): number => spanOf(w)[1] - spanOf(w)[0];
  return cands.find(x => spanOf(x)[0] <= mid && mid <= spanOf(x)[1])
    ?? [...cands].sort((p, q) => length(q) - length(p) || spanOf(p)[0] - spanOf(q)[0])[0];
}

/** A wall the Building does not hold, on a covered rise's line: `NO_WALL` for its id and plane. */
export const NO_WALL = -1;

/**
 * Journal decision 243, rule 3: the wall a covered rise stands on. Its island is the one holding the band's middle just
 * inward of its line. It stands on the nearest wall of its line in that island, facing its way (by the gap along the
 * line, then the lowest start), as `riseWall` picks among walls the band overlaps: the walls share the line, so the
 * choice moves no plane, reach or limit. Where the line holds no wall in that island, the band's line is wholly inside
 * the building and the rise stands on a wall made for it over its band, its id and plane `NO_WALL`, which no Building
 * lookup reads: a piece's wall is read for its line, facing, island and label, and its id is carried on its tags.
 */
function coveredRiseWall(b: Building, line: LineId, rise: GableRise): Wall {
  const n = inwardOf(line.n), mid = (rise.lo + rise.hi) / 2;
  const onLine = (s: number, d: number): Pt => (line.axis === 'y' ? {x: s, y: line.at + n.y * d} : {x: line.at + n.x * d, y: s});
  const comp = b.comps.findIndex(c => insideIsland(c, onLine(mid, EPS)));
  if (comp < 0) throw new Error(`no island holds the covered rise [${rise.lo}, ${rise.hi}] on ${line.axis} = ${line.at}`);
  const gap = (w: Wall): number => Math.max(spanOf(w)[0] - rise.hi, rise.lo - spanOf(w)[1], 0);
  const near = wallsOnLine(b, line).filter(w => w.comp === comp).sort((p, q) => gap(p) - gap(q) || spanOf(p)[0] - spanOf(q)[0])[0];
  if (near) return near;
  const dir: Pt = {x: n.y, y: -n.x};
  const forward = dir.x + dir.y > 0;
  const a = onLine(forward ? rise.lo : rise.hi, 0), c = onLine(forward ? rise.hi : rise.lo, 0);
  return {id: NO_WALL, comp, a, b: c, dir, n, len: rise.hi - rise.lo, tan: tanDeg(rise.deg), form: 'hip', dead: false, plane: NO_WALL};
}

/** A rise and the line it stands on: a union wall's rise, or a covered one (journal decision 243, rule 3). */
export interface RiseOnLine { line: LineId; rise: GableRise }

/**
 * A storey gable whose rise its own `maxHeight` holds at or below the plate builds no piece, so it replaces no slope
 * (journal decision 243, rule 1). The floor and wall-top caps stand at least a storey height less `FLOOR_CAP_GAP_CM`
 * above the plate, so only `maxHeight` can, and the gables are read from bands without heights.
 */
const standsAbovePlate = (rise: GableRise): boolean => rise.maxHeight === undefined || rise.maxHeight > SHELL_TOLERANCE_CM;

/**
 * Journal decision 243: every gable a storey builds, from bands alone: algorithm B's gable pieces, the union walls'
 * rises and the covered rises. Rules 1 and 2 read these, never a rise's height, so no rise's limit or reach depends on
 * another's: the bands are fixed by `claimedWalls` before any rise is built.
 */
export function storeyGables(plan: StoreyPlan, rises: readonly RiseOnLine[]): StoreyGable[] {
  const pieces = plan.roof.pieces.filter(p => p.wall.form === 'gable').map((p): StoreyGable => ({...wallLineId(p.wall), lo: p.bandLo, hi: p.bandHi}));
  return [...pieces, ...rises.filter(r => standsAbovePlate(r.rise)).map(({line, rise}): StoreyGable => ({axis: line.axis, at: line.at, n: line.n, lo: rise.lo, hi: rise.hi}))];
}

/** A storey's rises, each with its line: its union walls' rises in order, then its covered rises. */
export const storeyRises = (walls: readonly UnionWall[], covered: readonly CoveredRise[] = []): RiseOnLine[] =>
  [...walls.flatMap(w => (w.rises ?? []).map((rise): RiseOnLine => ({line: {axis: w.axis, at: w.at, n: w.n}, rise}))), ...covered];

/**
 * Decisions 8 to 12: one storey's rises as pieces, from its union walls' `rises` and its covered rises (journal
 * decision 243, rule 3), each beside the storey's own pieces and built by the unchanged `gablePiece`. A rise whose lowest
 * cap is at or below its plate builds no piece. Every plane a rise adds is keyed into the storey's Building (decision
 * 9). The limit reads the storey's roof without any rise, so rises never limit one another (journal decision 204); it
 * reads the storey's gables by their bands alone (journal decision 243, rule 1). A rise its policy gives no limit
 * carries only its rakes and caps (journal decision 231). Its reach stops where it ends (`WALK_RULES.end`, journal
 * decision 243, rule 2). `policies` is the policy table, `RISE_LIMIT_POLICIES` unless a caller swaps it.
 */
export function risePieces(f: ShellFixture, plan: StoreyPlan, walls: readonly UnionWall[], covered: readonly CoveredRise[] = [], policies: LimitPolicies = RISE_LIMIT_POLICIES): RisePiece[] {
  const b = plan.building;
  const book = planeBook(b);
  const out: RisePiece[] = [];
  const rises = storeyRises(walls, covered);
  const gables = storeyGables(plan, rises);
  for (const {line, rise} of rises) {
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
    const ctx: LimitContext = {plan, wall, comp, rise, gables};
    const limitPlane = policies[rise.limit](ctx);
    if (limitPlane !== undefined) use(limitPlane);
    const far = farWall(comp, wall, rise.lo, rise.hi);
    // Journal decision 243, rule 2: the reach stops at the wall whose gable the rise joins.
    const farDist = Math.min(far ? dot(sub(far.a, wall.a), wall.n) : Infinity, WALK_RULES.end(ctx) ?? Infinity);
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
  return out;
}
