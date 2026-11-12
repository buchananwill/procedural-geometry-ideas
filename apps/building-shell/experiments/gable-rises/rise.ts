// The probe's model of the gable rise proposal (docs/notes/building-shell-gable-rise-proposal.md, decisions 1 to 12 and
// 19), built on the unchanged pipeline. Nothing under src/ changes: every rule the proposal adds lives here.
// - Decision 1: a Ring side may carry `runs`, each `{from, to, form, deg?}` in cm from the side's start.
// - Decisions 3 to 6: form per extent, lowest index winning at each point; one hip pitch per union wall; a wall whose
//   every extent is a gable is today's whole-wall gable; every other gable extent is a rise.
// - Decision 8: a rise is one synthetic `Piece` pushed into the storey's `plan.roof.pieces` before the unchanged
//   `gablePiece`, union and step 4 run.
// - Decision 9: rake and cap planes take an existing plane's id when they coincide (`canonicalise`).
// - Decision 10: at a convex corner the rise takes the end wall's plane as its rake (`cornerRule`).
// - Decision 11: `farSlope` adds the far wall's hip plane, the far wall chosen by the existing piece rule (`farWall`).
// - Decision 12: the floor cap of an overhanging storey, and an optional `maxHeight`, as horizontal planes.
// - Decision 19: the oracle `max(hip surface, min(rake A, rake B, limit planes))`, sampled against the built mesh.
import {getManifold} from '../../src/manifold.ts';
import {unionPlans, type ShellUnion} from '../../src/union.ts';
import {planChecked, type StoreyPlan} from '../../src/storey.ts';
import {buildShellDetailed, buildShellFromUnion, type ShellBuild} from '../../src/shell.ts';
import {
  RING_SIDES, storeyRings, storeysOf, type FixtureRing, type RingForm, type RingSide, type ShellFixture, type SideForm,
  type StoreyRing,
} from '../../src/fixture.ts';
import {loopRuns, ringSideLines, storeyLoops, tanDeg, unionWallForms, wallSel, selPicks, type UnionWall, type WallLine} from '../../src/ring-forms.ts';
import {selectCut, spliceCourtyard} from '../../src/courtyard.ts';
import {
  buildFromRects, dot, finishBuilding, planeAt, polyArea, sub, wallLabel, type Building, type Comp, type Plane, type Pt,
  type Wall,
} from '../../src/roof/model.ts';
import type {Piece} from '../../src/roof/algoB.ts';
import {evalFaces} from '../../src/roof/surface.ts';
import {componentGenera, invariantViolations} from '../../tests/shell-invariants.ts';

// ---- Authoring (decisions 1, 2, 11, 12) ---------------------------------------------------------------------------

/**
 * `farSlope` is decision 11's default. `none` drops it (for the harness check). `ridgeSlope` is the probe's own, not in
 * the proposal: the plane of the face the band's midline meets just past the first ridge it crosses on the hip surface.
 */
export type Limit = 'farSlope' | 'none' | 'ridgeSlope';

/** One run of a Ring side, in cm from the side's start (side i runs from corner i to corner i + 1). */
export interface Run { from: number; to: number; form: RingForm; deg?: number; maxHeight?: number; limit?: Limit }
export interface RunSide extends SideForm { runs?: Run[] }
export type RunSides = Partial<Record<RingSide, RunSide>>;
export interface RunRing extends FixtureRing { sides?: RunSides }
export interface RunFixture extends ShellFixture { rings: RunRing[] }

export const ring = (rect: [number, number, number, number], baseStorey: number, storeys: number, defaultDeg: number, sides: RunSides = {}): RunRing =>
  ({rect, baseStorey, storeys, defaultDeg, sides});
export const fx = (name: string, rings: RunRing[], storeyHeight = 250): RunFixture => ({name, cellSize: 50, storeyHeight, rings});
/** A side hipped at the Ring's pitch, with runs. */
export const runs = (...rs: Run[]): RunSide => ({form: 'hip', runs: rs});
export const gableRun = (from: number, to: number, deg?: number, extra: Partial<Run> = {}): Run => ({from, to, form: 'gable', deg, ...extra});

export interface RiseOptions {
  /** Decision 3: form per extent. False is today's whole-wall winner, under which no rise exists. */
  perExtent: boolean;
  /** Decision 9. */
  canonicalise: boolean;
  /** Decision 10. */
  cornerRule: boolean;
  /** Decision 12's floor cap. */
  floorCap: boolean;
  /** Not the lead's reading of decision 12: the storey directly above caps too (its floor is this storey's plate). */
  capDirectlyAbove: boolean;
}
export const DEFAULTS: RiseOptions = {perExtent: true, canonicalise: true, cornerRule: true, floorCap: true, capDirectlyAbove: false};

// ---- Derivation (decisions 3 to 6) --------------------------------------------------------------------------------

/** A side's offset from its start, as a world coordinate along its line. */
function sideWorld(r: FixtureRing, side: RingSide, s: number): number {
  const [x0, y0, x1, y1] = r.rect;
  return side === 'S' ? x0 + s : side === 'E' ? y0 + s : side === 'N' ? x1 - s : y1 - s;
}

const sameLine = (p: WallLine, q: WallLine): boolean => p.axis === q.axis && p.at === q.at && p.n === q.n;

interface Claim { form: RingForm; deg: number; maxHeight?: number; limit: Limit; ring: number; side: RingSide }

/** What Ring `index`'s side says at world coordinate `m` on its line: the run there, else the side's own form. */
function claimAt(index: number, r: RunRing, side: RingSide, m: number): Claim {
  const sf = r.sides?.[side];
  const deg = sf?.deg ?? r.defaultDeg;
  for (const run of sf?.runs ?? []) {
    const a = sideWorld(r, side, run.from), b = sideWorld(r, side, run.to);
    if (m > Math.min(a, b) && m < Math.max(a, b)) {
      // Interpretation: a run with no `deg` takes its side's pitch, then the Ring's default.
      return {form: run.form, deg: run.deg ?? deg, maxHeight: run.maxHeight, limit: run.limit ?? 'farSlope', ring: index, side};
    }
  }
  return {form: sf?.form ?? 'hip', deg, limit: 'farSlope', ring: index, side};
}

/** Every Ring side end and run end on a line, as world coordinates along it. */
function breaksOn(rings: StoreyRing[], line: WallLine): number[] {
  const out: number[] = [];
  for (const {ring: r} of rings) {
    const lines = ringSideLines(r.rect);
    for (const side of RING_SIDES) {
      if (!sameLine(lines[side], line)) continue;
      out.push(lines[side].lo, lines[side].hi);
      for (const run of (r as RunRing).sides?.[side]?.runs ?? []) out.push(sideWorld(r, side, run.from), sideWorld(r, side, run.to));
    }
  }
  return out;
}

export interface Extent extends Claim { lo: number; hi: number }
export interface RiseSpec extends Extent { storey: number; line: WallLine }

/** Decision 3: a union wall's extents, adjacent ones with the same claim merged (decision 6 for gables). */
export function extentsOf(rings: StoreyRing[], line: WallLine): Extent[] {
  const stops = [...new Set([line.lo, line.hi, ...breaksOn(rings, line).filter(s => s > line.lo && s < line.hi)])].sort((a, b) => a - b);
  const out: Extent[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const m = (stops[i] + stops[i + 1]) / 2;
    let claim: Claim | undefined;
    for (const {index, ring: r} of rings) {
      const lines = ringSideLines(r.rect);
      const side = RING_SIDES.find(sd => sameLine(lines[sd], line) && lines[sd].lo < m && m < lines[sd].hi);
      if (side) { claim = claimAt(index, r as RunRing, side, m); break; }
    }
    if (!claim) throw new Error(`no Ring side holds ${line.axis}=${line.at} at ${m}`);
    const last = out[out.length - 1];
    // Interpretation: equal pitch merges two gable extents only when their caps and limits agree too.
    const merges = last && last.hi === stops[i] && last.form === claim.form && last.deg === claim.deg && last.maxHeight === claim.maxHeight && last.limit === claim.limit
      && (claim.form === 'gable' || last.ring === claim.ring);
    if (merges) last.hi = stops[i + 1];
    else out.push({...claim, lo: stops[i], hi: stops[i + 1]});
  }
  return out;
}

export interface Derived { walls: UnionWall[]; rises: RiseSpec[]; extents: Map<string, Extent[]> }

/** Decisions 3 to 6 on one storey: each union wall's form and pitch for the roof solve, and its rises. */
export function deriveWalls(rings: StoreyRing[], loops: Pt[][], storey: number, opt: RiseOptions): Derived {
  if (!opt.perExtent) return {walls: unionWallForms(rings, loops), rises: [], extents: new Map()};
  const walls: UnionWall[] = [], rises: RiseSpec[] = [], extents = new Map<string, Extent[]>();
  for (const line of loops.flatMap(l => loopRuns(l))) {
    const ex = extentsOf(rings, line);
    extents.set(`${line.axis}=${line.at} ${line.n} [${line.lo},${line.hi}]`, ex);
    const byIndex = (xs: Extent[]): Extent => [...xs].sort((a, b) => a.ring - b.ring)[0];
    const hips = ex.filter(e => e.form === 'hip');
    if (!hips.length) { walls.push({...line, form: 'gable', deg: byIndex(ex).deg}); continue; }
    walls.push({...line, form: 'hip', deg: byIndex(hips).deg});
    for (const e of ex) if (e.form === 'gable') rises.push({...e, storey, line});
  }
  return {walls, rises, extents};
}

/** `storey.ts`'s `storeyBuilding`, with the union walls supplied instead of derived by the whole-wall rule. */
export function storeyBuildingWith(rings: StoreyRing[], loops: Pt[][], walls: UnionWall[]): Building {
  const rects = rings.map(r => r.ring.rect);
  const sels = walls.map(wallSel);
  const outers = loops.filter(l => polyArea(l) > 0);
  const holes = loops.filter(l => polyArea(l) < 0);
  if (!holes.length) return buildFromRects(rects, sels);
  const picked = (a: Pt, b: Pt): Partial<Wall> => {
    const sel = sels.find(s => selPicks(s, a, b));
    if (!sel?.form || sel.deg === undefined) throw new Error(`no union wall holds (${a.x}, ${a.y}) to (${b.x}, ${b.y})`);
    return {form: sel.form, tan: tanDeg(sel.deg)};
  };
  const cuts = holes.map(h => {
    const cut = selectCut(rings, outers, h, walls);
    if (!cut) throw new Error('no raw Ring wall cuts the courtyard');
    return cut;
  });
  return finishBuilding(outers.map((outer, i) => {
    const k = cuts.findIndex(c => c.outer === i);
    if (k < 0) return {ring: outer, outer, holes: [], attrs: outer.map((a, j) => picked(a, outer[(j + 1) % outer.length]))};
    const {ring: rg, cutWalls} = spliceCourtyard(outer, holes[k], cuts[k]);
    const cutAttrs: Partial<Wall> = {form: 'cut', tan: tanDeg(cuts[k].deg)};
    return {ring: rg, outer, holes: [holes[k]], attrs: rg.map((a, j) => (cutWalls.includes(j) ? cutAttrs : picked(a, rg[(j + 1) % rg.length])))};
  }));
}

// ---- Geometry (decisions 8 to 12) ----------------------------------------------------------------------------------

const EPS = 0.01;
const alongX = (w: Wall): boolean => Math.abs(w.dir.x) > 0.5;
const along = (w: Wall, p: Pt): number => (alongX(w) ? p.x : p.y);
const spanOf = (w: Wall): [number, number] => { const a = along(w, w.a), b = along(w, w.b); return [Math.min(a, b), Math.max(a, b)]; };
const atAlong = (w: Wall, s: number, d: number): Pt => (alongX(w) ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s});

/** algoB.ts's `farWall`, copied verbatim (it is not exported): the nearest wall facing back at `w` across the band. */
export function farWall(comp: Comp, w: Wall, lo: number, hi: number): Wall | undefined {
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

/** algoB.ts's `endWall`, copied verbatim: the wall standing across the line's end at `s`, facing back along it. */
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

/** storey.ts's `bboxReach`, copied: how far the storey's bounding box reaches from the wall line inward. */
function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
}

const inwardOf = (n: WallLine['n']): Pt => ({'+x': {x: 1, y: 0}, '-x': {x: -1, y: 0}, '+y': {x: 0, y: 1}, '-y': {x: 0, y: -1}}[n]);

/** The plane's island, for decision 9's comparison: a wall's plane carries its comp, a synthetic one is recorded here. */
const syntheticComp = new WeakMap<Plane, number>();
const compOfPlane = (b: Building, pl: Plane): number => (pl.walls.length ? b.walls[pl.walls[0]].comp : syntheticComp.get(pl) ?? -1);

/** A plane `z = plate + gx x + gy y + c`; with `canon`, an existing plane of the island with these coefficients (decision 9). */
function addPlane(b: Building, comp: number, gx: number, gy: number, c: number, label: string, canon: boolean): number {
  if (canon) {
    const hit = b.planes.find(pl => compOfPlane(b, pl) === comp && Math.abs(pl.gx - gx) < 1e-9 && Math.abs(pl.gy - gy) < 1e-9 && Math.abs(pl.c - c) < 1e-6);
    if (hit) return hit.id;
  }
  const pl: Plane = {id: b.planes.length, gx, gy, c, walls: [], label};
  syntheticComp.set(pl, comp);
  b.planes.push(pl);
  return pl.id;
}

export interface RisePiece {
  spec: RiseSpec;
  piece: Piece;
  wall: Wall;
  far?: Wall;
  /** Which planes bound it, by role. */
  roles: string[];
  cap?: number;
  /** Planes that decision 9 matched to an existing id. */
  canonicalised: string[];
}

/** Decision 8 to 12: the synthetic gable piece for one rise. */
export function risePiece(f: RunFixture, plan: StoreyPlan, spec: RiseSpec, opt: RiseOptions): RisePiece {
  const b = plan.building;
  const inward = inwardOf(spec.line.n);
  const mid = (spec.lo + spec.hi) / 2;
  const onLine = (w: Wall): boolean => w.form !== 'cut' && dot(w.n, inward) > 0.5 && (spec.line.axis === 'y' ? w.a.y === spec.line.at && w.b.y === spec.line.at : w.a.x === spec.line.at && w.b.x === spec.line.at);
  const wall = b.walls.find(w => onLine(w) && spanOf(w)[0] <= mid && mid <= spanOf(w)[1]);
  if (!wall) throw new Error(`no wall of storey ${plan.storey} holds the rise's middle on ${spec.line.axis}=${spec.line.at}`);
  const comp = b.comps[wall.comp];
  const t = tanDeg(spec.deg);
  const x = spec.line.axis === 'y';
  const roles: string[] = [], canonicalised: string[] = [];
  const planes: number[] = [];
  const add = (gx: number, gy: number, c: number, role: string): void => {
    const before = b.planes.length;
    const id = addPlane(b, wall.comp, gx, gy, c, role, opt.canonicalise);
    if (b.planes.length === before) canonicalised.push(`${role} -> plane ${id} (${b.planes[id].label})`);
    if (!planes.includes(id)) planes.push(id);
    roles.push(`${role}=p${id}`);
  };
  const end = (s: number, into: number): Wall | undefined => {
    if (!opt.cornerRule) return undefined;
    const e = endWall(comp, wall, s, into);
    return e && !e.dead && e.form !== 'cut' ? e : undefined;
  };
  const eLo = end(spec.lo, 1), eHi = end(spec.hi, -1);
  if (eLo) { planes.includes(eLo.plane) || planes.push(eLo.plane); roles.push(`corner lo=${wallLabel(eLo)} p${eLo.plane}`); }
  else add(x ? t : 0, x ? 0 : t, -t * spec.lo, `rake from ${spec.lo}`);
  if (eHi) { planes.includes(eHi.plane) || planes.push(eHi.plane); roles.push(`corner hi=${wallLabel(eHi)} p${eHi.plane}`); }
  else add(x ? -t : 0, x ? 0 : -t, t * spec.hi, `rake from ${spec.hi}`);

  const far = farWall(comp, wall, spec.lo, spec.hi);
  const farDist = far ? dot(sub(far.a, wall.a), wall.n) : Infinity;
  if (spec.limit === 'farSlope' && far && far.form === 'hip' && !far.dead) {
    if (!planes.includes(far.plane)) planes.push(far.plane);
    roles.push(`farSlope=${wallLabel(far)} p${far.plane}`);
  }
  if (spec.limit === 'ridgeSlope') {
    const beyond = slopeBeyondRidge(plan, wall, mid);
    if (beyond) {
      if (!planes.includes(beyond.plane)) planes.push(beyond.plane);
      roles.push(`ridgeSlope=p${beyond.plane} (${b.planes[beyond.plane].label})`);
    }
  }

  // Decision 12: the floor of a storey that overhangs the rise, and the rise's own maxHeight.
  const H = f.storeyHeight;
  const reach = Math.min(farDist, bboxReach(b, wall));
  const corners = [atAlong(wall, spec.lo, 0), atAlong(wall, spec.hi, reach)];
  const rx0 = Math.min(corners[0].x, corners[1].x), rx1 = Math.max(corners[0].x, corners[1].x);
  const ry0 = Math.min(corners[0].y, corners[1].y), ry1 = Math.max(corners[0].y, corners[1].y);
  let cap: number | undefined;
  if (opt.floorCap) {
    const first = opt.capDirectlyAbove ? plan.storey + 1 : plan.storey + 2;
    for (const m of storeysOf(f).filter(s => s >= first)) {
      const over = storeyRings(f, m).some(({ring: r}) => Math.min(r.rect[2], rx1) - Math.max(r.rect[0], rx0) > EPS && Math.min(r.rect[3], ry1) - Math.max(r.rect[1], ry0) > EPS);
      if (over) { cap = m * H - (plan.storey + 1) * H; break; }
    }
    if (cap !== undefined) roles.push(`floorCap=${cap}`);
  }
  if (spec.maxHeight !== undefined) { roles.push(`maxHeight=${spec.maxHeight}`); cap = Math.min(cap ?? Infinity, spec.maxHeight); }
  if (cap !== undefined) add(0, 0, cap, `cap ${cap}`);

  const piece: Piece = {wall, bandLo: spec.lo, bandHi: spec.hi, farDist, planes, label: `rise [${spec.lo},${spec.hi}] on ${spec.line.axis}=${spec.line.at} at ${spec.deg}`};
  return {spec, piece, wall, far, roles, cap, canonicalised};
}

// ---- Building ------------------------------------------------------------------------------------------------------

export interface RiseBuild {
  name: string;
  plans: StoreyPlan[];
  rises: RisePiece[];
  derived: Derived[];
  build: ShellBuild;
}

/** Every storey planned with decisions 3 to 6, each rise pushed as a piece, then the unchanged union and step 4. */
export async function buildWithRises(f: RunFixture, opt: RiseOptions = DEFAULTS, withRises = true): Promise<RiseBuild> {
  const wasm = await getManifold();
  const plans: StoreyPlan[] = [], rises: RisePiece[] = [], derived: Derived[] = [];
  for (const n of storeysOf(f)) {
    const rings = storeyRings(f, n);
    const loops = storeyLoops(rings.map(r => r.ring.rect));
    const d = deriveWalls(rings, loops, n, opt);
    derived.push(d);
    const plan = planChecked(f.name, n, n * f.storeyHeight, (n + 1) * f.storeyHeight, storeyBuildingWith(rings, loops, d.walls));
    if (withRises) for (const spec of d.rises) {
      const rp = risePiece(f, plan, spec, opt);
      rises.push(rp);
      plan.roof.pieces.push(rp.piece);
    }
    plans.push(plan);
  }
  const u = unionPlans(wasm, f.name, plans);
  return {name: f.name, plans, rises, derived, build: buildShellFromUnion(wasm, f, u)};
}

// ---- Measures ------------------------------------------------------------------------------------------------------

/** z of every triangle over plan point (x, y), with whether it faces up (an exit going upward). */
function crossings(u: ShellUnion, x: number, y: number): {z: number; up: boolean}[] {
  const P = u.mesh.positions, T = u.mesh.tris;
  const out: {z: number; up: boolean}[] = [];
  for (let t = 0; t < T.length / 3; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const ax = P[3 * a], ay = P[3 * a + 1], bx = P[3 * b], by = P[3 * b + 1], cx = P[3 * c], cy = P[3 * c + 1];
    if (Math.max(ax, bx, cx) < x || Math.min(ax, bx, cx) > x || Math.max(ay, by, cy) < y || Math.min(ay, by, cy) > y) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    out.push({z: l1 * P[3 * a + 2] + l2 * P[3 * b + 2] + l3 * P[3 * c + 2], up: d > 0});
  }
  return out.sort((p, q) => p.z - q.z);
}

/** The top of the solid interval holding height z0 at (x, y), or null when z0 is outside the solid. */
export function intervalTop(u: ShellUnion, x: number, y: number, z0: number): number | null {
  const cs = crossings(u, x, y);
  const next = cs.find(c => c.z > z0);
  return next && next.up ? next.z : null;
}

/** The piece's own height at p, as runB's `evalPiece` reads it, also clipped to the footprint and the bounding box. */
function pieceHeight(b: Building, piece: Piece, p: Pt): number | null {
  const w = piece.wall;
  const d = dot(sub(p, w.a), w.n);
  if (d < 0 || d > Math.min(piece.farDist, bboxReach(b, w))) return null;
  const s = along(w, p);
  if (s < piece.bandLo || s > piece.bandHi) return null;
  const h = Math.min(...piece.planes.map(id => planeAt(b.planes[id], p)));
  return h >= 0 ? h : null;
}

/** Decision 19's oracle, above the plate: the hip surface, raised by every piece the storey holds. */
export function oracleHeight(plan: StoreyPlan, p: Pt): number | null {
  const b = plan.building;
  if (!b.inside(p)) return null;
  let best = evalFaces(plan.roof.defaults, p)?.h ?? null;
  for (const piece of plan.roof.pieces) {
    const h = pieceHeight(b, piece, p);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

export interface OracleResult { samples: number; covered: number; worst: number; worstAt: string; bandSamples: number; bandWorst: number; bandWorstAt: string }

/**
 * Samples the built mesh against the oracle over each storey's footprint (25 cm grid) and over every rise's band out to
 * its far reach (10 cm grid). A point under a higher storey whose floor the oracle reaches is `covered` and skipped,
 * since the solid runs on up into that storey.
 */
export function sampleOracle(rb: RiseBuild): OracleResult {
  const u = rb.build.union;
  const res: OracleResult = {samples: 0, covered: 0, worst: 0, worstAt: '', bandSamples: 0, bandWorst: 0, bandWorstAt: ''};
  const coveredAt = (plan: StoreyPlan, p: Pt, e: number): boolean => rb.plans.some(q => q.storey > plan.storey && q.floor <= plan.plate + e + 0.05 && q.building.inside(p));
  const one = (plan: StoreyPlan, p: Pt, band: boolean): void => {
    const e = oracleHeight(plan, p);
    if (e === null || e < 1) return;
    if (coveredAt(plan, p, e)) { res.covered++; return; }
    const top = intervalTop(u, p.x, p.y, plan.plate + 0.5);
    const dev = top === null ? Infinity : Math.abs(top - plan.plate - e);
    const at = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) storey ${plan.storey}: mesh ${top === null ? 'none' : (top - plan.plate).toFixed(3)} oracle ${e.toFixed(3)}`;
    if (band) { res.bandSamples++; if (dev > res.bandWorst) { res.bandWorst = dev; res.bandWorstAt = at; } }
    else { res.samples++; if (dev > res.worst) { res.worst = dev; res.worstAt = at; } }
  };
  for (const plan of rb.plans) {
    const bb = plan.building.bbox;
    for (let x = bb.x0 + 12.37; x < bb.x1; x += 25) for (let y = bb.y0 + 12.41; y < bb.y1; y += 25) one(plan, {x, y}, false);
  }
  for (const rp of rb.rises) {
    const plan = rb.plans.find(p => p.storey === rp.spec.storey)!;
    const w = rp.wall;
    const reach = Math.min(rp.piece.farDist, bboxReach(plan.building, w));
    for (let s = rp.spec.lo + 0.37; s < rp.spec.hi; s += 10) for (let d = 0.41; d < reach; d += 10) one(plan, atAlong(w, s, d), true);
  }
  return res;
}

/**
 * The covered-storeys precondition (a lower roof stays beneath the top of the storey over it), on a 2 cm grid over each
 * rise's band: how far the rise's storey surface stands above the top of any higher storey whose plan holds the point,
 * with and without the rises (so a breakthrough the hip already had is not laid on the rise).
 */
export function breakthrough(rb: RiseBuild): {withRise: number; hipOnly: number; at: string} {
  let withRise = 0, hipOnly = 0, at = '';
  for (const rp of rb.rises) {
    const plan = rb.plans.find(p => p.storey === rp.spec.storey)!;
    const uppers = rb.plans.filter(q => q.storey > plan.storey);
    if (!uppers.length) continue;
    const reach = Math.min(rp.piece.farDist, bboxReach(plan.building, rp.wall));
    for (let s = rp.spec.lo + 0.13; s < rp.spec.hi; s += 2) for (let d = 0.17; d < reach; d += 2) {
      const p = atAlong(rp.wall, s, d);
      const e = oracleHeight(plan, p);
      if (e === null) continue;
      const hip = evalFaces(plan.roof.defaults, p)?.h ?? 0;
      for (const q of uppers) {
        if (!q.building.inside(p)) continue;
        const top = q.plate + (oracleHeight(q, p) ?? 0);
        const over = plan.plate + e - top, overHip = plan.plate + hip - top;
        if (over > withRise) { withRise = over; at = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) under storey ${q.storey}`; }
        if (overHip > hipOnly) hipOnly = overHip;
      }
    }
  }
  return {withRise, hipOnly, at};
}

/** The ShellEdge kinds, as `kind=count`, in first-seen order. */
export function edgeHistogram(b: ShellBuild): string {
  const kinds = new Map<string, number>();
  for (const e of b.shell.edges) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  return [...kinds].sort().map(([k, n]) => `${k}=${n}`).join(' ');
}

export function faceHistogram(b: ShellBuild): string {
  const kinds = new Map<string, number>();
  for (const f of b.shell.faces) kinds.set(f.tag.kind, (kinds.get(f.tag.kind) ?? 0) + 1);
  return [...kinds].sort().map(([k, n]) => `${k}=${n}`).join(' ');
}

const SIDE_NAMES = ['S', 'E', 'N', 'W'];
const srcText = (s: {ringModelIndex: number; side: number} | null): string => (s ? `R${s.ringModelIndex}${SIDE_NAMES[s.side]}` : 'none');

/** The Gable faces standing on a rise's wall line over its band, with their Cells' sources. */
export function riseGables(rb: RiseBuild, rp: RisePiece): string {
  const {shell} = rb.build;
  const ax = rp.spec.line.axis === 'y' ? 1 : 0, al = 1 - ax;
  const faces = shell.faces.filter(f => f.tag.kind === 'Gable' && f.tag.storey === rp.spec.storey && Math.abs(f.normal[ax]) > 0.99
    && f.loops[0].every(p => Math.abs(p[ax] - rp.spec.line.at) < 0.05)
    && Math.min(...f.loops[0].map(p => p[al])) < rp.spec.hi - 0.05 && Math.max(...f.loops[0].map(p => p[al])) > rp.spec.lo + 0.05);
  if (!faces.length) return 'no Gable face over the band';
  return faces.map(f => {
    const cells = shell.cells.filter(c => c.face === f.id);
    const srcs = [...new Set(cells.map(c => srcText(c.source)))].join(',');
    const zs = f.loops[0].map(p => p[2]);
    const lo = Math.min(...f.loops[0].map(p => p[al])), hi = Math.max(...f.loops[0].map(p => p[al]));
    return `Gable f${f.id} [${lo.toFixed(1)},${hi.toFixed(1)}] apex ${Math.max(...zs).toFixed(1)}, ${cells.length} Cells from ${srcs || 'none'}`;
  }).join('; ');
}

/** Every horizontal upward Roof face: its tag, plane, area, bounding Edge kinds and Cells. */
export function flatTops(rb: RiseBuild): string[] {
  const {shell} = rb.build;
  return shell.faces.filter(f => f.tag.kind === 'Roof' && f.normal[2] > 1 - 1e-6).map(f => {
    const edges = shell.edges.filter(e => e.faces.includes(f.id)).map(e => `${e.kind}(${shell.faces[e.faces[0] === f.id ? e.faces[1] : e.faces[0]].tag.kind})`);
    const cells = shell.cells.filter(c => c.face === f.id);
    const plan = rb.plans.find(p => p.storey === f.tag.storey)!;
    const pl = plan.building.planes[f.tag.plane];
    return `flat top f${f.id} tag ${f.tag.kind} storey ${f.tag.storey} plane p${f.tag.plane} (${pl?.label}) z=${f.offset.toFixed(2)} area ${f.area.toFixed(0)}; `
      + `edges ${edges.join(' ')}; ${cells.length} Cells (${cells.filter(c => c.whole).length} whole), sources ${[...new Set(cells.map(c => srcText(c.source)))].join(',')}`;
  });
}

/**
 * The far-wall question: walking the band's middle line inward over the hip surface, the face it meets just past the
 * first ridge it crosses, against the plane the existing piece rule (`farWall`) chose.
 */
export function ridgeFar(plan: StoreyPlan, rp: RisePiece): string {
  const b = plan.building;
  const beyond = slopeBeyondRidge(plan, rp.wall, (rp.spec.lo + rp.spec.hi) / 2);
  if (!beyond) return 'no ridge crossed on the midline inside the footprint';
  const rule = rp.far && rp.far.form === 'hip' && !rp.far.dead ? rp.far.plane : -1;
  const ruleText = rule < 0 ? `rule far ${rp.far ? `${wallLabel(rp.far)} (${rp.far.form}, no plane)` : 'none'}` : `rule far p${rule} (${b.planes[rule].label})`;
  return `beyond the ridge (d=${beyond.d.toFixed(1)}, h=${beyond.h.toFixed(1)}): p${beyond.plane} (${b.planes[beyond.plane].label}); ${ruleText}; ${beyond.plane === rule ? 'SAME' : 'DIFFERENT'}`;
}

/** Walks the line `s = mid` inward over the hip surface; the face it meets just past the first ridge, and where. */
function slopeBeyondRidge(plan: StoreyPlan, w: Wall, mid: number): {plane: number; d: number; h: number} | undefined {
  const b = plan.building;
  const reach = bboxReach(b, w);
  let prev = -Infinity;
  for (let d = 0.5; d < reach; d += 1) {
    const p = atAlong(w, mid, d);
    if (!b.inside(p)) return undefined;
    const s = evalFaces(plan.roof.defaults, p);
    if (!s) continue;
    if (s.h < prev - 1e-6) return {plane: s.plane, d: d - 1, h: prev};
    prev = s.h;
  }
  return undefined;
}

/** How far back the rise stands proud of the rest of its storey's roof on its band's midline, and how high it is there. */
export function riseReach(plan: StoreyPlan, rp: RisePiece): string {
  const b = plan.building, w = rp.wall;
  const mid = (rp.spec.lo + rp.spec.hi) / 2;
  const reach = Math.min(rp.piece.farDist, bboxReach(b, w));
  let last = 0, top = 0;
  for (let d = 0.5; d < reach; d += 0.5) {
    const p = atAlong(w, mid, d);
    const own = pieceHeight(b, rp.piece, p);
    if (own === null) break;
    let other = evalFaces(plan.roof.defaults, p)?.h ?? 0;
    for (const q of plan.roof.pieces) if (q !== rp.piece) { const h = pieceHeight(b, q, p); if (h !== null && h > other) other = h; }
    if (own <= other + 1e-6) break;
    last = d; top = Math.max(top, own);
  }
  return `stands proud on its midline to d=${last.toFixed(1)} of ${reach.toFixed(0)}, highest ${top.toFixed(1)} above the plate`;
}

export interface Verdict { clean: boolean; line: string; details: string[] }

/** Spec 32's invariants (decision 20), with the genus of the same storeys built without their rises, plus the oracle. */
export async function measure(f: RunFixture, opt: RiseOptions = DEFAULTS, oracleTol = 0.05): Promise<Verdict> {
  const details: string[] = [];
  let rb: RiseBuild;
  try {
    rb = await buildWithRises(f, opt);
  } catch (e) {
    return {clean: false, line: `THROWS ${(e as Error).message.slice(0, 300)}`, details};
  }
  let genus: number[];
  try {
    genus = componentGenera((await buildWithRises(f, opt, false)).build.union.mesh);
  } catch (e) {
    genus = [];
    details.push(`baseline without rises throws: ${(e as Error).message.slice(0, 200)}`);
  }
  const b = rb.build, r = b.shell.report;
  const viol = genus.length ? invariantViolations(b, {genus, cheeks: 0}) : ['no baseline genus'];
  const o = sampleOracle(rb);
  const oracleOk = o.worst <= oracleTol && o.bandWorst <= oracleTol;
  const bt = breakthrough(rb);
  const precondition = bt.withRise <= oracleTol;
  const clean = !viol.length && !r.conflicts.length && oracleOk && precondition;
  const line = `${clean ? 'CLEAN' : 'NOT CLEAN'} closed=${b.union.closed} genus=${componentGenera(b.union.mesh).join(',')} (baseline ${genus.join(',')}) cheeks=${r.cheeks} conflicts=${r.conflicts.length} `
    + `unclassified=${r.unclassifiedEdges} internal=${r.survivingInternal} oracle band ${fmt(o.bandWorst)} over ${o.bandSamples} / footprint ${fmt(o.worst)} over ${o.samples}${o.covered ? `, ${o.covered} covered` : ''}`
    + `${bt.withRise > 0 || bt.hipOnly > 0 ? `; breaks through the storey above by ${fmt(bt.withRise)} (hip alone ${fmt(bt.hipOnly)}) at ${bt.at}` : ''}`;
  for (const rp of rb.rises) details.push(`rise ${rp.piece.label}: wall ${wallLabel(rp.wall)} far ${rp.far ? wallLabel(rp.far) : 'none'} farDist ${rp.piece.farDist}; ${rp.roles.join(', ')}${rp.canonicalised.length ? `; canonicalised ${rp.canonicalised.join('; ')}` : ''}`);
  for (const rp of rb.rises) details.push(`  ${riseGables(rb, rp)}`);
  for (const rp of rb.rises) details.push(`  far slope: ${ridgeFar(rb.plans.find(p => p.storey === rp.spec.storey)!, rp)}`);
  for (const rp of rb.rises) details.push(`  ${riseReach(rb.plans.find(p => p.storey === rp.spec.storey)!, rp)}`);
  details.push(`edges ${edgeHistogram(b)}`);
  details.push(`faces ${faceHistogram(b)}`);
  details.push(...flatTops(rb));
  for (const c of r.conflicts) details.push(`conflict ${c}`);
  for (const v of viol.slice(0, 8)) details.push(`violation ${v.slice(0, 400)}`);
  if (viol.length > 8) details.push(`... ${viol.length - 8} more violations`);
  if (!(o.bandWorst <= oracleTol)) details.push(`oracle band worst at ${o.bandWorstAt}`);
  if (!(o.worst <= oracleTol)) details.push(`oracle footprint worst at ${o.worstAt}`);
  return {clean, line, details};
}

const fmt = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : String(x));

/** What the pipeline builds today for the same fixture (runs ignored): its forms per wall and its counts. */
export async function today(f: RunFixture): Promise<string> {
  try {
    const b = await buildShellDetailed(f);
    const r = b.shell.report;
    const walls = b.union.plans.map(p => p.building.walls.map(w => `${wallLabel(w)}:${w.form}`).join(' ')).join(' | ');
    const gables = b.shell.faces.filter(fc => fc.tag.kind === 'Gable').map(fc => `apex ${Math.max(...fc.loops[0].map(p => p[2])).toFixed(1)} sources ${fc.sources.map(srcText).join(',')}`);
    return `today: closed=${b.union.closed} genus=${componentGenera(b.union.mesh).join(',')} cheeks=${r.cheeks} conflicts=${r.conflicts.length} unclassified=${r.unclassifiedEdges}; walls ${walls}; Gables ${gables.join('; ') || 'none'}`;
  } catch (e) {
    return `today: THROWS ${(e as Error).message.slice(0, 300)}`;
  }
}

/** Prints one case. */
export async function report(f: RunFixture, opt: RiseOptions = DEFAULTS, withToday = false): Promise<Verdict> {
  const v = await measure(f, opt);
  console.log(`\n== ${f.name}`);
  console.log(`  ${v.line}`);
  for (const d of v.details) console.log(`  ${d}`);
  if (withToday) console.log(`  ${await today(f)}`);
  return v;
}
