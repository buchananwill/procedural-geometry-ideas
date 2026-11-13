// Gable rise decisions 8 to 12 (journal decision 204): each rise of a storey's union walls as one synthetic gable
// `Piece`, built by the unchanged `gablePiece` beside the storey's own pieces. The rise is never part of the roof solve:
// its wall enters the skeleton as a hip (decision 6), and the rise is one more raw solid for the union.
// - Decision 8: wall = the union wall, band = the rise, far distance = algorithm B's piece rule (`farWall`), planes =
//   two rakes plus the limit and cap planes.
// - Decision 9: every plane the rise adds takes an existing plane's id when it coincides, keyed as `finishBuilding` keys.
// - Decision 10: at a convex corner the rise takes the end wall's plane as its rake (algorithm B's `endWall`).
// - Decision 11: the limit is a named policy (`RISE_LIMIT_POLICIES`); `ridgeSlope` is the only one.
// - Decision 12: the caps are named policies (`RISE_CAPS`); the lowest applies, and a cap at or below the plate builds
//   no piece.
// Every default here is provisional until the user confirms (journal decision 204), so each is one named policy or
// constant, replaceable without touching its neighbours.
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {RiseLimit, ShellFixture, storeyRings, storeysOf} from './fixture.ts';
import {GableRise, UnionWall, WallLine, tanDeg} from './ring-forms.ts';
import type {Piece} from './roof/algoB.ts';
import {Building, Comp, Plane, Pt, Wall, dot, planeAt, pointInPoly, sub, wallLabel} from './roof/model.ts';
import type {StoreyPlan} from './storey.ts';

/** One rise as built: the rise, its piece, the plane its limit policy chose, and the cap that applies, if any. */
export interface RisePiece { rise: GableRise; piece: Piece; limitPlane: number; capCm?: number }

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

/** storey.ts's `bboxReach`: how far the storey's bounding box reaches from the wall's line along its inward normal. */
function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
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

/** The skeleton's faces of one island: their planes and polygons, the walk's hip roof. */
interface FacePoly { plane: number; poly: Pt[] }

/**
 * The plane of the hip roof's face at `p`: a face holding `p` in its interior, else one holding it on its boundary (a
 * walk along a ridge or a cut runs on two faces' boundary, and both rise or fall alike along it), the lowest plane id
 * among equals.
 */
function hipSurface(faces: readonly FacePoly[]): Surface {
  return p => {
    const strict = faces.filter(f => inPoly(p, f.poly, false));
    const held = strict.length ? strict : faces.filter(f => onBoundary(p, f.poly));
    return held.length ? Math.min(...held.map(f => f.plane)) : undefined;
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
 * whole-wall gables and its cut), each the lowest of its planes over its region, the highest surface winning.
 */
function builtSurface(b: Building, comp: Comp, faces: readonly FacePoly[], pieces: readonly Piece[]): Surface {
  const hip = hipSurface(faces);
  return p => {
    const base = hip(p);
    if (base === undefined) return undefined;
    let best = base, h = planeAt(b.planes[base], p);
    for (const piece of pieces) {
      if (!inPoly(p, pieceRect(b, piece), true) || !inPoly(p, comp.outer, true)) continue;
      const id = piece.planes.reduce((m, k) => (planeAt(b.planes[k], p) < planeAt(b.planes[m], p) ? k : m));
      const v = planeAt(b.planes[id], p);
      if (v > h + WALK_EPS || (Math.abs(v - h) <= WALK_EPS && id < best)) { best = id; h = v; }
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
    // The faces tile the footprint, so a stretch inside it that no face holds is a sliver of round-off: it is passed over.
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

function islandFaces(ctx: LimitContext): FacePoly[] {
  return ctx.plan.roof.faces.filter(f => f.wall.comp === ctx.wall.comp).map(f => ({plane: f.wall.plane, poly: f.poly}));
}

/** The walk's start, the middle of the band on the wall's line, and its direction, inward. */
const walkStart = (ctx: LimitContext): [Pt, Pt] => [atAlong(ctx.wall, (ctx.rise.lo + ctx.rise.hi) / 2, 0), ctx.wall.n];

/** Decision 11 (journal decision 204, F70): the walk over the solved hip roof, no rise added. */
export const hipRoofReading: RidgeSlopeReading = ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx);
  const [o, n] = walkStart(ctx);
  return walk(b, ctx.comp, o, n, [...faces.map(f => f.poly), ctx.comp.outer, ...ctx.comp.holes], faces.map(f => f.plane), hipSurface(faces));
};

/** Decision 11's fallback (journal decision 204): the same walk over the roof as built before any rise. */
export const builtRoofReading: RidgeSlopeReading = ctx => {
  const b = ctx.plan.building, faces = islandFaces(ctx);
  const pieces = ctx.plan.roof.pieces.filter(p => p.wall.comp === ctx.wall.comp);
  const [o, n] = walkStart(ctx);
  const polys = [...faces.map(f => f.poly), ...pieces.map(p => pieceRect(b, p)), ctx.comp.outer, ...ctx.comp.holes];
  return walk(b, ctx.comp, o, n, polys, [...faces.map(f => f.plane), ...pieces.flatMap(p => p.planes)], builtSurface(b, ctx.comp, faces, pieces));
};

/** `ridgeSlope`'s readings, in order: the first that finds a plane gives the limit. */
export const RIDGE_SLOPE_READINGS: readonly RidgeSlopeReading[] = [hipRoofReading, builtRoofReading];

/** A limit policy (decision 11): the plane that bounds a rise besides its rakes. */
export type LimitPolicy = (ctx: LimitContext) => number;

/**
 * Decision 11 (journal decision 204, F70): no point of the rise stands above the roof slope just beyond the main ridge
 * its own ridge runs into, extended back to its wall. Read by `RIDGE_SLOPE_READINGS`; a rise none of them limits is a
 * hard error, never an unlimited rise.
 */
export const ridgeSlope: LimitPolicy = ctx => {
  for (const reading of RIDGE_SLOPE_READINGS) {
    const id = reading(ctx);
    if (id !== undefined) return id;
  }
  throw new Error(`the rise [${ctx.rise.lo}, ${ctx.rise.hi}] on ${wallLabel(ctx.wall)}: no reading of ridgeSlope finds a falling face on its walk`);
};

/** Every limit policy by name (decision 11). A second policy is one more entry. */
export const RISE_LIMIT_POLICIES: Readonly<Record<RiseLimit, LimitPolicy>> = {ridgeSlope};

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

/** Decision 12's caps. The lowest that applies caps the rise. */
export const RISE_CAPS: readonly CapPolicy[] = [maxHeightCap, floorCap, wallTopCap];

// ---- The piece (decisions 8 to 10) ---------------------------------------------------------------------------------

const inwardOf = (n: WallLine['n']): Pt => ({'+x': {x: 1, y: 0}, '-x': {x: -1, y: 0}, '+y': {x: 0, y: 1}, '-y': {x: 0, y: -1}}[n]);

/** The storey wall a rise stands on: the one on its union wall's line, facing its way, holding its band's middle. */
function riseWall(b: Building, line: WallLine, rise: GableRise): Wall {
  const n = inwardOf(line.n), mid = (rise.lo + rise.hi) / 2;
  const onLine = (w: Wall): boolean => w.form !== 'cut' && dot(w.n, n) > 0.5
    && (line.axis === 'y' ? w.a.y === line.at && w.b.y === line.at : w.a.x === line.at && w.b.x === line.at);
  const w = b.walls.find(x => onLine(x) && spanOf(x)[0] <= mid && mid <= spanOf(x)[1]);
  if (!w) throw new Error(`no wall holds the rise [${rise.lo}, ${rise.hi}] on ${line.axis} = ${line.at}`);
  return w;
}

/**
 * Decisions 8 to 12: one storey's rises as pieces, from its union walls' `rises`, each beside the storey's own pieces
 * and built by the unchanged `gablePiece`. A rise whose lowest cap is at or below its plate builds no piece. Every plane
 * a rise adds is keyed into the storey's Building (decision 9). The limit reads the storey's roof without any rise, so
 * rises never limit one another (journal decision 204).
 */
export function risePieces(f: ShellFixture, plan: StoreyPlan, walls: readonly UnionWall[]): RisePiece[] {
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
      const limitPlane = RISE_LIMIT_POLICIES[rise.limit]({plan, wall, comp, rise});
      use(limitPlane);
      const far = farWall(comp, wall, rise.lo, rise.hi);
      const farDist = far ? dot(sub(far.a, wall.a), wall.n) : Infinity;
      const reachD = Math.min(farDist, bboxReach(b, wall));
      const reach = [atAlong(wall, rise.lo, 0), atAlong(wall, rise.hi, 0), atAlong(wall, rise.hi, reachD), atAlong(wall, rise.lo, reachD)];
      const caps = RISE_CAPS.map(cap => cap({f, plan, rise, reach})).filter((c): c is number => c !== undefined);
      const capCm = caps.length ? Math.min(...caps) : undefined;
      if (capCm !== undefined && capCm <= SHELL_TOLERANCE_CM) continue;
      if (capCm !== undefined) use(book.plane(wall.comp, 0, 0, capCm, `cap ${capCm} on ${wallLabel(wall)}`));
      const piece: Piece = {wall, bandLo: rise.lo, bandHi: rise.hi, farDist, planes, label: `rise [${rise.lo},${rise.hi}] of ${wallLabel(wall)} at ${rise.deg}`};
      out.push(capCm === undefined ? {rise, piece, limitPlane} : {rise, piece, limitPlane, capCm});
    }
  }
  return out;
}
