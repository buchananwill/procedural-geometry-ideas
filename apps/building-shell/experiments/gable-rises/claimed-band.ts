// WP-G4.1 (journal decision 219, F76): the claimed-band principle, as a probe on the unchanged production pipeline.
// Nothing under src/ changes. A gable belongs to the Ring side that asked for it:
// - A gable's **band** is a maximal stretch of a line that Ring sides claim as gable, at each point by the lowest-index
//   Ring whose side lies there, buried stretches included. Adjacent claims that differ in pitch, limit or maxHeight are
//   separate bands. A band counts only if some part of it lies on a union wall of the storey.
// - **Rule A**: algorithm B builds a whole-wall gable where its piece's span (`extentOf`) equals the band; otherwise the
//   wall is a hip at its decision-5 pitch and one rise is built over the band. A mixed wall's rises are its bands too.
// - **Rule B**: every gable is a rise over its band. Every wall enters the skeleton as a hip; algorithm B supplies only
//   the hip skeleton and the courtyard cut pieces.
// A rise is built as `src/rise.ts`'s `risePieces` builds one (decisions 8 to 12), re-stated here so that a band whose
// middle or end is buried can be measured under named sub-rules (`SubRules`); `today` re-states the production rise
// exactly, and `selfCheck` in claimed-band-cases.ts holds it equal to production on `RISE_FIXTURES`.
import {SHELL_TOLERANCE_CM} from '../../src/constants.ts';
import {RING_SIDES, storeyRings, storeysOf, type RingSide, type ShellFixture, type SideForm, type StoreyRing} from '../../src/fixture.ts';
import {getManifold} from '../../src/manifold.ts';
import {
  DEFAULT_RISE_LIMIT, ringSideLines, runSpan, storeyLoops, tanDeg, unionWallForms, type GableRise, type UnionWall, type WallLine,
} from '../../src/ring-forms.ts';
import {RISE_CAPS, RISE_CAP_NAMES, RISE_LIMIT_POLICIES, type RiseCapName, type RisePiece} from '../../src/rise.ts';
import type {Piece} from '../../src/roof/algoB.ts';
import {dot, polyArea, sub, wallLabel, type Building, type Comp, type Plane, type Pt, type Wall} from '../../src/roof/model.ts';
import {buildShellDetailed, buildShellFromUnion, type ShellBuild} from '../../src/shell.ts';
import {planChecked, planStorey, storeyPieces, type StoreyPlan} from '../../src/storey.ts';
import {unionPlans} from '../../src/union.ts';
import {RISE_ORACLE_TOL_CM, oracleHeight, riseBreakthrough, riseOracle} from '../../tests/rise-oracle.ts';
import {invariantViolations} from '../../tests/shell-invariants.ts';
import {storeyBuildingWith} from './rise.ts';

/** `T` is today re-stated through this probe (the self-check); `A` and `B` are the two candidate rules. */
export type RuleName = 'T' | 'A' | 'B';

/**
 * The sub-rules the principle strains (WP-G4.1 item 4), each a named candidate:
 * - `buriedEnd`: a band end that stands inside the footprint has no end wall for decision 10. `ownRake` rakes from the
 *   end at the band's pitch; `adjacentPitch` rakes at the pitch of the claiming Ring's side that meets the end there.
 * - `walkStart`: decision 11's walk starts at the band's middle. Where that is buried, `bandMiddle` keeps it;
 *   `exposedMiddle` starts at the middle of the band's longest stretch on a union wall.
 * - `gabledFar`: decision 11's walk can land on the skeleton face of a wall that is itself gabled (F70: "a plane that is
 *   no roof face"). `skeletonPlane` keeps that plane as the limit, as production does; `none` drops the limit there,
 *   as algorithm B does when its far wall is gabled; `farRakes` replaces it with the two rakes of the band standing on
 *   that wall, so the rise stays under the far gable's own roof (and falls back to `skeletonPlane` where the gabled
 *   wall is one algorithm B keeps, which has no band piece).
 * - `pieceCaps`: decision 12's floor and wall-top caps were written for rises; algorithm B's gables have none. `capped`
 *   caps every band; `uncapped` leaves those two caps off a band that is algorithm B's piece (its span is `extentOf`),
 *   as today builds it.
 */
export interface SubRules {
  buriedEnd: 'ownRake' | 'adjacentPitch'; walkStart: 'bandMiddle' | 'exposedMiddle'; gabledFar: 'skeletonPlane' | 'none' | 'farRakes'; pieceCaps: 'capped' | 'uncapped';
  /**
   * How far back the piece's prism runs: `nearestFar` is algorithm B's piece rule, the nearest wall facing back that
   * overlaps the band (production's rise); `bbox` runs to the storey's bounding box and lets the limit plane and the
   * footprint end it; `limitZero` runs to where the limit plane meets the plate, if that is further than `nearestFar`.
   */
  reach: 'nearestFar' | 'bbox' | 'limitZero';
  /**
   * Rule A on a wall gabled along its whole length at two pitches, whose bands together are algorithm B's piece:
   * `twoRises` builds each band as a rise on a hip wall; `keepPiece` leaves algorithm B's one gable at the lower
   * index's pitch, as decision 5 has it today.
   */
  twoPitch: 'twoRises' | 'keepPiece';
}
export const SUB_DEFAULT: SubRules = {buriedEnd: 'ownRake', walkStart: 'bandMiddle', gabledFar: 'skeletonPlane', pieceCaps: 'capped', reach: 'nearestFar', twoPitch: 'twoRises'};

// ---- Bands -------------------------------------------------------------------------------------------------------------

type LineId = Pick<WallLine, 'axis' | 'at' | 'n'>;
const onLine = (l: LineId, q: LineId): boolean => l.axis === q.axis && l.at === q.at && l.n === q.n;
const lineText = (l: LineId): string => `${l.axis}=${l.at} ${l.n}`;

/** One Ring side's word at a point: production's `claimAt`, re-stated (it is not exported). */
interface Claim { ring: number; side: RingSide; form: 'hip' | 'gable'; deg: number; limit: GableRise['limit']; maxHeight?: number }

function claimOf(index: number, r: StoreyRing['ring'], side: RingSide, m: number): Claim {
  const s: SideForm | undefined = r.sides?.[side];
  const deg = s?.deg ?? r.defaultDeg;
  for (const run of s?.runs ?? []) {
    const [lo, hi] = runSpan(r.rect, side, run);
    if (m > lo && m < hi) return {ring: index, side, form: run.form, deg: run.deg ?? deg, limit: run.limit ?? DEFAULT_RISE_LIMIT, maxHeight: run.maxHeight};
  }
  return {ring: index, side, form: s?.form ?? 'hip', deg, limit: DEFAULT_RISE_LIMIT};
}

/** The lowest-index claim at `m` on a line, buried sides included, or undefined where no Ring side lies there. */
export function claimAt(rings: StoreyRing[], line: LineId, m: number): Claim | undefined {
  for (const {index, ring} of rings) {
    const side = RING_SIDES.find(sd => { const l = ringSideLines(ring.rect)[sd]; return onLine(l, line) && l.lo < m && m < l.hi; });
    if (side) return claimOf(index, ring, side, m);
  }
  return undefined;
}

/** Every Ring side end and run end on a line. */
function breaksOn(rings: StoreyRing[], line: LineId): number[] {
  const out: number[] = [];
  for (const {ring} of rings) for (const sd of RING_SIDES) {
    const l = ringSideLines(ring.rect)[sd];
    if (!onLine(l, line)) continue;
    out.push(l.lo, l.hi, ...(ring.sides?.[sd]?.runs ?? []).flatMap(r => runSpan(ring.rect, sd, r)));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** A claimed band: a stretch of a line, its pitch, limit and cap from its lowest-index claim, and its claims. */
export interface Band extends GableRise { line: WallLine; ring: number; side: RingSide; claims: Claim[] }

/** Every claimed gable band of a storey that touches one of its union walls. */
export function claimedBands(rings: StoreyRing[], walls: readonly UnionWall[]): Band[] {
  const lines: WallLine[] = [];
  for (const w of walls) if (!lines.some(l => onLine(l, w))) lines.push(w);
  const out: Band[] = [];
  for (const line of lines) {
    const stops = breaksOn(rings, line);
    let cur: Band | undefined;
    const flush = (): void => {
      if (cur && walls.some(w => onLine(w, line) && Math.min(w.hi, cur!.hi) - Math.max(w.lo, cur!.lo) > 1e-9)) out.push(cur);
      cur = undefined;
    };
    for (let k = 0; k + 1 < stops.length; k++) {
      const c = claimAt(rings, line, (stops[k] + stops[k + 1]) / 2);
      if (!c || c.form !== 'gable') { flush(); continue; }
      if (cur && cur.hi === stops[k] && cur.deg === c.deg && cur.limit === c.limit && cur.maxHeight === c.maxHeight) {
        cur.hi = stops[k + 1];
        cur.claims.push(c);
        if (c.ring < cur.ring) { cur.ring = c.ring; cur.side = c.side; }
        continue;
      }
      flush();
      cur = {line: {...line, lo: stops[k], hi: stops[k + 1]}, lo: stops[k], hi: stops[k + 1], deg: c.deg, limit: c.limit, ring: c.ring, side: c.side, claims: [c],
        ...(c.maxHeight === undefined ? {} : {maxHeight: c.maxHeight})};
    }
    flush();
  }
  return out;
}

// ---- Algorithm B's extent (algoB.ts `extentOf`, copied; it is not exported) ---------------------------------------------

const EPS = 0.01;
const alongX = (w: Wall): boolean => Math.abs(w.dir.x) > 0.5;
const along = (w: Wall, p: Pt): number => (alongX(w) ? p.x : p.y);
const spanOf = (w: Wall): [number, number] => { const a = along(w, w.a), b = along(w, w.b); return [Math.min(a, b), Math.max(a, b)]; };
const atAlong = (w: Wall, s: number, d: number): Pt => (alongX(w) ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s});
const inwardOf = (n: WallLine['n']): Pt => ({'+x': {x: 1, y: 0}, '-x': {x: -1, y: 0}, '+y': {x: 0, y: 1}, '-y': {x: 0, y: -1}}[n]);

export function extentOf(b: Building, comp: Comp, w: Wall): [number, number] {
  const breaks = [...new Set(comp.ring.map(p => along(w, p)))].sort((p, q) => p - q);
  let [lo, hi] = spanOf(w);
  for (;;) { const prev = breaks.filter(s => s < lo).pop(); if (prev === undefined || !b.inside(atAlong(w, (prev + lo) / 2, EPS))) break; lo = prev; }
  for (;;) { const next = breaks.find(s => s > hi); if (next === undefined || !b.inside(atAlong(w, (next + hi) / 2, EPS))) break; hi = next; }
  return [lo, hi];
}

/** The storey walls standing on a line, facing its way. */
export function wallsOn(b: Building, line: LineId): Wall[] {
  const n = inwardOf(line.n);
  return b.walls.filter(w => w.form !== 'cut' && dot(w.n, n) > 0.5 && (line.axis === 'y' ? w.a.y === line.at && w.b.y === line.at : w.a.x === line.at && w.b.x === line.at));
}

/** A union wall's algorithm B extent, read on a Building (`extentOf` from the first storey wall on it). */
export function wallExtent(b: Building, uw: UnionWall): [number, number] {
  const w = wallsOn(b, uw).find(x => spanOf(x)[0] >= uw.lo - 1e-9 && spanOf(x)[1] <= uw.hi + 1e-9);
  if (!w) throw new Error(`no storey wall on ${lineText(uw)} [${uw.lo},${uw.hi}]`);
  return extentOf(b, b.comps[w.comp], w);
}

// ---- F76's classes -----------------------------------------------------------------------------------------------------

/**
 * F76's class of an all-gable union wall: `notWider` where its extent is its own span; otherwise where it stands (a
 * hole's wall or an outer one) and what the line holds beyond it: the winning Ring's own buried gable side
 * (`ownGable`), another Ring's (`gableOther`), another Ring's hip side (`hipOther`, F75), or no Ring side (`noSide`).
 */
export function f76Class(rings: StoreyRing[], loops: Pt[][], uw: UnionWall, ext: [number, number], winners: Set<number>): string {
  if (ext[0] >= uw.lo - 1e-9 && ext[1] <= uw.hi + 1e-9) return 'notWider';
  const holeLoop = loops.filter(l => polyArea(l) < 0).some(l => l.some((p, i) => {
    const q = l[(i + 1) % l.length];
    return uw.axis === 'y' ? p.y === uw.at && q.y === uw.at && Math.min(p.x, q.x) >= uw.lo - 1e-9 && Math.max(p.x, q.x) <= uw.hi + 1e-9
      : p.x === uw.at && q.x === uw.at && Math.min(p.y, q.y) >= uw.lo - 1e-9 && Math.max(p.y, q.y) <= uw.hi + 1e-9;
  }));
  const kinds = new Set<string>();
  for (const [s0, s1] of [[ext[0], uw.lo], [uw.hi, ext[1]]] as const) {
    if (s1 - s0 <= 1e-9) continue;
    const st = [...new Set([s0, s1, ...breaksOn(rings, uw).filter(c => c > s0 && c < s1)])].sort((a, b) => a - b);
    for (let k = 0; k + 1 < st.length; k++) {
      const c = claimAt(rings, uw, (st[k] + st[k + 1]) / 2);
      kinds.add(!c ? 'noSide' : c.form === 'hip' ? (winners.has(c.ring) ? 'ownHip' : 'hipOther') : winners.has(c.ring) ? 'ownGable' : 'gableOther');
    }
  }
  return `${holeLoop ? 'HOLE' : 'outer'} ${[...kinds].sort().join('+')}`;
}

// ---- The rise (src/rise.ts's risePieces, re-stated with sub-rules) --------------------------------------------------------

/** `finishBuilding`'s plane key, as `rise.ts`'s `planeBook` keys it (decision 9). */
const planeKey = (comp: number, gx: number, gy: number, c: number): string => `${comp}|${gx.toFixed(9)}|${gy.toFixed(9)}|${c.toFixed(6)}`;

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

function bboxReach(b: Building, w: Wall): number {
  if (w.n.y > 0.5) return b.bbox.y1 - w.a.y;
  if (w.n.y < -0.5) return w.a.y - b.bbox.y0;
  if (w.n.x > 0.5) return b.bbox.x1 - w.a.x;
  return w.a.x - b.bbox.x0;
}

/** How a rise's end was raked: an end wall's plane (decision 10), its own rake at a reflex corner, or a buried end. */
export type EndKind = 'corner' | 'reflex' | 'buried';

/** One built rise with what the principle strained in it. */
export interface BandPiece extends RisePiece { band: Band; ends: [EndKind, EndKind]; buriedMiddle: boolean; exposed: [number, number][]; farGabled: boolean; farBand?: Band; rakes: number[] }

/** The pitch of the side of the claiming Ring that meets a band end at `s`, if the end is that Ring's corner. */
function adjacentPitch(rings: StoreyRing[], band: Band, s: number): number | undefined {
  const c = s === band.lo ? band.claims[0] : band.claims[band.claims.length - 1];
  const r = rings.find(x => x.index === c.ring)?.ring;
  if (!r) return undefined;
  const l = ringSideLines(r.rect)[c.side];
  if (s !== l.lo && s !== l.hi) return undefined;
  // A side's low end (its world lo) meets W for S and N, and S for E and W; its high end meets E or N.
  const lowAdj: Record<RingSide, RingSide> = {S: 'W', E: 'S', N: 'W', W: 'S'}, highAdj: Record<RingSide, RingSide> = {S: 'E', E: 'N', N: 'E', W: 'N'};
  const adj = s === l.lo ? lowAdj[c.side] : highAdj[c.side];
  return r.sides?.[adj]?.deg ?? r.defaultDeg;
}

/**
 * Decisions 8 to 12 for one band, as `src/rise.ts`'s `risePieces` builds a rise, with the sub-rules for a buried end and
 * a buried middle. Returns undefined where the lowest cap is at or below the plate (no piece, as production).
 */
export function bandPiece(f: ShellFixture, rings: StoreyRing[], plan: StoreyPlan, band: Band, allBands: Band[], book: PlaneBook, rules: SubRules): BandPiece | undefined {
  const b = plan.building;
  const cands = wallsOn(b, band.line).filter(w => Math.min(spanOf(w)[1], band.hi) - Math.max(spanOf(w)[0], band.lo) > 1e-9);
  if (!cands.length) throw new Error(`no storey wall on ${lineText(band.line)} touches the band [${band.lo},${band.hi}]`);
  const mid = (band.lo + band.hi) / 2;
  const exposed = cands.map(w => [Math.max(spanOf(w)[0], band.lo), Math.min(spanOf(w)[1], band.hi)] as [number, number]).sort((p, q) => p[0] - q[0]);
  const buriedMiddle = !exposed.some(([p, q]) => p <= mid && mid <= q);
  const wall = cands.find(w => spanOf(w)[0] <= mid && mid <= spanOf(w)[1]) ?? [...cands].sort((p, q) => (spanOf(q)[1] - spanOf(q)[0]) - (spanOf(p)[1] - spanOf(p)[0]))[0];
  const comp = b.comps[wall.comp];
  const x = alongX(wall);
  const planes: number[] = [];
  const use = (id: number): void => { if (!planes.includes(id)) planes.push(id); };
  const ends: EndKind[] = [];
  for (const [s, into] of [[band.lo, 1], [band.hi, -1]] as const) {
    const e = endWall(comp, wall, s, into);
    if (e && !e.dead && e.form !== 'cut') { use(e.plane); ends.push('corner'); continue; }
    const buried = !exposed.some(([p, q]) => p - 1e-9 <= s && s <= q + 1e-9);
    ends.push(buried ? 'buried' : 'reflex');
    const deg = buried && rules.buriedEnd === 'adjacentPitch' ? adjacentPitch(rings, band, s) ?? band.deg : band.deg;
    const t = tanDeg(deg);
    use(into === 1 ? book.plane(wall.comp, x ? t : 0, x ? 0 : t, -t * s, `rake from ${s} on ${wallLabel(wall)}`)
      : book.plane(wall.comp, x ? -t : 0, x ? 0 : -t, t * s, `rake from ${s} on ${wallLabel(wall)}`));
  }
  const rise: GableRise = band.maxHeight === undefined ? {lo: band.lo, hi: band.hi, deg: band.deg, limit: band.limit} : {lo: band.lo, hi: band.hi, deg: band.deg, maxHeight: band.maxHeight, limit: band.limit};
  const longest = [...exposed].sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  const walkRise = buriedMiddle && rules.walkStart === 'exposedMiddle' ? {...rise, lo: longest[0], hi: longest[1]} : rise;
  const limitPlane = RISE_LIMIT_POLICIES[rise.limit]({plan, wall, comp, rise: walkRise});
  // The limit's wall is gabled where algorithm B keeps it a gable (Rule A) or a band being built stands on it.
  const rakes = [...planes];
  // INTERPRETATION: "the far wall is gabled" where a gable on the limit's wall faces this band's whole span: a band
  // that holds [band.lo, band.hi], or a wall algorithm B keeps as a gable that does.
  const farBand = allBands.find(bd => bd !== band && bd.lo <= band.lo + 1e-9 && bd.hi >= band.hi - 1e-9 && wallsOn(b, bd.line).some(w => w.plane === limitPlane));
  const farGabled = !!farBand || b.walls.some(w => w.plane === limitPlane && w.form === 'gable' && spanOf(w)[0] <= band.lo + 1e-9 && spanOf(w)[1] >= band.hi - 1e-9);
  if (!farGabled || rules.gabledFar === 'skeletonPlane' || (rules.gabledFar === 'farRakes' && !farBand)) use(limitPlane);
  const far = farWall(comp, wall, band.lo, band.hi);
  let farDist = far ? dot(sub(far.a, wall.a), wall.n) : Infinity;
  if (rules.reach === 'bbox') farDist = Infinity;
  if (rules.reach === 'limitZero' && planes.includes(limitPlane)) {
    // Where the limit plane comes down to the plate, measured square to the wall from the band's middle.
    const lp = b.planes[limitPlane], m = atAlong(wall, mid, 0), fall = lp.gx * wall.n.x + lp.gy * wall.n.y;
    if (fall < -1e-9) farDist = Math.max(farDist === Infinity ? 0 : farDist, -(lp.gx * m.x + lp.gy * m.y + lp.c) / fall);
  }
  const reachD = Math.min(farDist, bboxReach(b, wall));
  const reach = [atAlong(wall, band.lo, 0), atAlong(wall, band.hi, 0), atAlong(wall, band.hi, reachD), atAlong(wall, band.lo, reachD)];
  let won: {cap: RiseCapName; capCm: number} | undefined;
  const ext = extentOf(b, comp, wall);
  const isPiece = Math.abs(ext[0] - band.lo) < 1e-9 && Math.abs(ext[1] - band.hi) < 1e-9;
  for (const name of RISE_CAP_NAMES) {
    if (rules.pieceCaps === 'uncapped' && isPiece && name !== 'maxHeight') continue;
    const c = RISE_CAPS[name]({f, plan, rise, reach});
    if (c !== undefined && (!won || c < won.capCm)) won = {cap: name, capCm: c};
  }
  if (won && won.capCm <= SHELL_TOLERANCE_CM) return undefined;
  if (won) use(book.plane(wall.comp, 0, 0, won.capCm, `cap ${won.capCm} on ${wallLabel(wall)}`));
  const piece: Piece = {wall, bandLo: band.lo, bandHi: band.hi, farDist, planes, label: `band [${band.lo},${band.hi}] of ${wallLabel(wall)} at ${band.deg}`};
  return {rise, piece, limitPlane, ...(won ?? {}), band, ends: [ends[0], ends[1]], buriedMiddle, exposed, farGabled, farBand, rakes};
}

// ---- Plans under a rule ------------------------------------------------------------------------------------------------

/** What a rule did to one union wall that is not a plain hip: kept by algorithm B, or turned into rises. */
export interface WallFate { storey: number; wall: UnionWall; f76: string; fate: 'keptB' | 'toRise' | 'mixedToday'; bands: Band[] }

/** One storey under a rule: its plan, the bands built as rises, and each gabled wall's fate. */
export interface RulePlan { plan: StoreyPlan; pieces: BandPiece[]; fates: WallFate[]; todayRises: GableRise[]; bands: Band[]; unchanged: boolean }

const overlaps = (a: {lo: number; hi: number}, b: {lo: number; hi: number}): boolean => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 1e-9;

/**
 * One storey planned under a rule. `today` is production's planStorey, read for its walls and its extents. Rule A keeps
 * algorithm B's gable where its piece is the band and builds every other band as a rise; Rule B builds every band.
 */
export function planUnder(f: ShellFixture, n: number, rule: RuleName, sub: SubRules): RulePlan {
  const rings = storeyRings(f, n);
  const loops = storeyLoops(rings.map(r => r.ring.rect));
  const today = unionWallForms(rings, loops);
  const b0 = storeyBuildingWith(rings, loops, today);
  const bands = claimedBands(rings, today);
  const todayRises = today.flatMap(w => w.rises ?? []);
  const fates: WallFate[] = [];
  const build: Band[] = [];
  const addBand = (bd: Band): void => { if (!build.some(x => onLine(x.line, bd.line) && x.lo === bd.lo && x.hi === bd.hi)) build.push(bd); };
  const walls: UnionWall[] = today.map(w => {
    const mine = bands.filter(bd => onLine(bd.line, w) && overlaps(bd, w));
    if (w.form === 'gable') {
      const ext = wallExtent(b0, w);
      const st = [...new Set([w.lo, w.hi, ...breaksOn(rings, w).filter(c => c > w.lo && c < w.hi)])].sort((p, q) => p - q);
      const winners = new Set(st.slice(1).map((c, k) => claimAt(rings, w, (st[k] + c) / 2)?.ring ?? -1));
      const f76 = f76Class(rings, loops, w, ext, winners);
      // `twoPitch: 'keepPiece'`: bands of two pitches that together are algorithm B's piece stay one gable, as today.
      const together = mine.length > 0 && Math.min(...mine.map(m => m.lo)) === ext[0] && Math.max(...mine.map(m => m.hi)) === ext[1]
        && Math.abs(mine.reduce((s, m) => s + m.hi - m.lo, 0) - (ext[1] - ext[0])) < 1e-9;
      const keep = rule === 'T' || (rule === 'A' && together && (mine.length === 1 || sub.twoPitch === 'keepPiece'));
      fates.push({storey: n, wall: w, f76, fate: keep ? 'keptB' : 'toRise', bands: mine});
      if (keep) return {...w, rises: undefined};
      mine.forEach(addBand);
      return {axis: w.axis, at: w.at, n: w.n, lo: w.lo, hi: w.hi, form: 'hip', deg: w.deg};
    }
    if (w.rises?.length) {
      fates.push({storey: n, wall: w, f76: 'mixed', fate: 'mixedToday', bands: mine});
      // INTERPRETATION: under both rules a mixed wall's rises are its claimed bands too ("otherwise ... one rise over
      // the claimed band"), so Rule A and Rule B differ only on the walls algorithm B keeps.
      if (rule !== 'T') mine.forEach(addBand);
    }
    return {axis: w.axis, at: w.at, n: w.n, lo: w.lo, hi: w.hi, form: w.form, deg: w.deg};
  });
  // Today: a mixed wall's rises as production builds them, over the wall's own extents.
  if (rule === 'T') {
    for (const w of today) for (const r of w.rises ?? []) {
      if (build.some(bd => onLine(bd.line, w) && bd.lo <= r.lo && r.hi <= bd.hi)) continue;
      // Read just inside the rise's low end: its middle can fall on a side end where two Rings' runs merge.
      const c = claimAt(rings, w, r.lo + 1e-3);
      if (!c) throw new Error(`${f.name} storey ${n}: no claim at the rise [${r.lo},${r.hi}] on ${lineText(w)}`);
      build.push({...r, line: {...w}, ring: c.ring, side: c.side, claims: [c]});
    }
  }
  const plan = planChecked(f.name, n, n * f.storeyHeight, (n + 1) * f.storeyHeight, storeyBuildingWith(rings, loops, walls));
  const book = planeBook(plan.building);
  const pieces = build.map(bd => bandPiece(f, rings, plan, bd, build, book, sub)).filter((p): p is BandPiece => !!p);
  if (sub.gabledFar === 'farRakes') for (const p of pieces) {
    const far = p.farBand && pieces.find(q => q.band === p.farBand);
    if (!p.farBand) continue;
    const add = far ? far.rakes : [p.limitPlane];
    for (const id of add) if (!p.piece.planes.includes(id)) p.piece.planes.push(id);
  }
  if (pieces.length) plan.rises = pieces;
  const sameAsToday = fates.every(x => x.fate !== 'toRise') && (rule === 'T' || build.every(bd => todayRises.some(r => r.lo === bd.lo && r.hi === bd.hi && today.some(w => onLine(w, bd.line) && overlaps(w, r)))));
  return {plan, pieces, fates, todayRises, bands, unchanged: sameAsToday};
}

/** Whether a rule leaves every storey of `f` as today plans it (no build needed). */
export function ruleChanges(f: ShellFixture, rule: RuleName, sub: SubRules = SUB_DEFAULT): {changed: boolean; plans: RulePlan[]} {
  const plans = storeysOf(f).map(n => planUnder(f, n, rule, sub));
  return {changed: plans.some(p => !p.unchanged), plans};
}

/** Builds `f` under a rule: the rule's plans through the unchanged union and step 4. */
export async function buildUnder(f: ShellFixture, plans: RulePlan[]): Promise<ShellBuild> {
  const wasm = await getManifold();
  return buildShellFromUnion(wasm, f, unionPlans(wasm, f.name, plans.map(p => p.plan)));
}

/** Today's build, through production. */
export const buildToday = (f: ShellFixture): Promise<ShellBuild> => buildShellDetailed(f);

/** Production's own plan of a storey, for comparing pieces. */
export const todayPlan = (f: ShellFixture, n: number): StoreyPlan => planStorey(f, n);

// ---- Clean in the full sense -------------------------------------------------------------------------------------------

/**
 * `riseBreakthrough` over every gable piece, algorithm B's included (5 cm grid). The suite's measure reads rises only,
 * so a whole-wall gable that stands above the storey over it today is unmeasured until a rule makes it a rise. This
 * is the like-for-like figure: a rule's breakthrough is new only where it exceeds today's on this measure.
 */
export function pieceBreakthrough(u: ShellBuild['union']): number {
  let worst = 0;
  for (const plan of u.plans) {
    const uppers = u.plans.filter(q => q.storey > plan.storey);
    if (!uppers.length) continue;
    for (const piece of storeyPieces(plan)) {
      const w = piece.wall;
      if (w.form === 'cut') continue;
      const reach = Math.min(piece.farDist, bboxReach(plan.building, w));
      for (let s = piece.bandLo + 0.13; s < piece.bandHi; s += 5) for (let d = 0.17; d < reach; d += 5) {
        const p = atAlong(w, s, d);
        if (!uppers.some(q => q.building.inside(p))) continue;
        const e = oracleHeight(plan, p);
        if (e === null) continue;
        for (const q of uppers) if (q.building.inside(p)) worst = Math.max(worst, plan.plate + e - (q.plate + (oracleHeight(q, p) ?? 0)));
      }
    }
  }
  return worst;
}

/** WP-G1's "clean": the suite's invariants with zero Cheeks, zero conflicts, the height oracle and no breakthrough. */
export interface Verdict { clean: boolean; violations: string[]; conflicts: number; oracle: number; breakthrough: number; pieceBreakthrough: number; text: string }

/**
 * A rule's verdict against today's: `worse` where it adds a kind of violation, a conflict, an oracle miss or more
 * breakthrough on the like-for-like measure; `better` where it is not worse and removes one; else `same`.
 */
export function compareVerdicts(today: Verdict, rule: Verdict): 'worse' | 'better' | 'same' {
  const kinds = (v: Verdict): Set<string> => new Set(v.violations.map(x => x.split(/[ :]/)[0]));
  const kt = kinds(today), kr = kinds(rule);
  const worse = [...kr].some(k => !kt.has(k)) || rule.violations.length > today.violations.length || rule.conflicts > today.conflicts
    || (rule.oracle > RISE_ORACLE_TOL_CM && today.oracle <= RISE_ORACLE_TOL_CM) || rule.pieceBreakthrough > today.pieceBreakthrough + RISE_ORACLE_TOL_CM;
  if (worse) return 'worse';
  const better = [...kt].some(k => !kr.has(k)) || rule.violations.length < today.violations.length || rule.conflicts < today.conflicts
    || rule.pieceBreakthrough < today.pieceBreakthrough - RISE_ORACLE_TOL_CM;
  return better ? 'better' : 'same';
}

export function verdictOf(b: ShellBuild, genus: number | readonly number[]): Verdict {
  const violations = invariantViolations(b, {genus, cheeks: 0});
  const conflicts = b.shell.report.conflicts.length;
  const measured = riseOracle(b.union);
  const oracle = measured.worst;
  const breakthrough = riseBreakthrough(b.union);
  const pb = pieceBreakthrough(b.union);
  const clean = !violations.length && !conflicts && oracle <= RISE_ORACLE_TOL_CM && breakthrough <= RISE_ORACLE_TOL_CM;
  const text = clean ? 'clean' : [
    ...violations.map(v => v.slice(0, 160)), ...(conflicts ? [`conflicts ${conflicts}`] : []),
    ...(oracle > RISE_ORACLE_TOL_CM ? [`oracle ${oracle.toFixed(3)} at ${measured.at}`] : []), ...(breakthrough > RISE_ORACLE_TOL_CM ? [`breakthrough ${breakthrough.toFixed(2)}`] : []),
  ].join('; ');
  return {clean, violations, conflicts, oracle, breakthrough, pieceBreakthrough: pb, text};
}

// ---- Shape -------------------------------------------------------------------------------------------------------------

/**
 * A geometric signature of a shell: the area on each plane (normal to 1e-4, offset to 0.01 cm) and on each face kind,
 * so a face split differently but standing where it stood compares equal. Two shells have the same shape when every
 * plane's and every kind's area agrees within `tol` cm².
 */
export function sameShape(a: ShellBuild, b: ShellBuild, tol = 1, storey?: number): {same: boolean; why: string} {
  const sig = (s: ShellBuild): Map<string, number> => {
    const m = new Map<string, number>();
    for (const f of s.shell.faces) {
      if (storey !== undefined && f.tag.storey !== storey) continue;
      const k = `${f.normal.map(v => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4)).join(',')}|${f.offset.toFixed(2)}`;
      m.set(k, (m.get(k) ?? 0) + f.area);
      m.set(`kind ${f.tag.kind}`, (m.get(`kind ${f.tag.kind}`) ?? 0) + f.area);
    }
    return m;
  };
  const p = sig(a), q = sig(b);
  let worst = 0, at = '';
  for (const k of new Set([...p.keys(), ...q.keys()])) {
    const d = Math.abs((p.get(k) ?? 0) - (q.get(k) ?? 0));
    if (d > worst) { worst = d; at = k; }
  }
  return {same: worst <= tol, why: worst <= tol ? '' : `${at} differs by ${worst.toFixed(1)} cm²`};
}

/** Each Gable face: its line, span and apex (along-coordinate, height above its storey's floor), for describing roofs. */
export function gableApexes(b: ShellBuild, storeyHeight: number): string[] {
  return b.shell.faces.filter(f => f.tag.kind === 'Gable').map(f => {
    const pts = f.loops[0];
    const ax = Math.abs(f.normal[0]) > 0.5 ? 1 : 0;
    const top = pts.reduce((m, p) => (p[2] > m[2] ? p : m));
    const plate = (f.tag.storey + 1) * storeyHeight;
    const line = ax === 1 ? `x=${pts[0][0].toFixed(0)}` : `y=${pts[0][1].toFixed(0)}`;
    return `Gable s${f.tag.storey} on ${line} [${Math.min(...pts.map(p => p[ax])).toFixed(0)},${Math.max(...pts.map(p => p[ax])).toFixed(0)}] apex at ${top[ax].toFixed(1)}, ${(top[2] - plate).toFixed(1)} above the plate`;
  });
}
