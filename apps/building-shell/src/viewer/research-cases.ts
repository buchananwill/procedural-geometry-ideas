// WP-V1: the roof-gable research cases (`src/roof/cases.ts`, `CASES`) as single-storey shell fixtures, for the viewer's
// selector. Pure data: no scene, no DOM, no fetch. `src/roof/` is a pinned copy, so it is imported, never edited.
//
// A research case is a roof `Building`: the union of its rects, its walls broken at every rect corner, each wall given a
// form and pitch by the case's `Sel`s. A `Sel` picks whole walls (its line, an overlap of `from`/`to` with the wall's span,
// its inward normal), so the case's own resolved walls carry exactly what its `Sel`s mean. The conversion reads those
// walls, not the `Sel`s: each wall's form and pitch is written onto the stretch of every Ring side that lies on it.
// - A Ring side whose exposed stretches all agree takes that form and pitch whole, its buried stretches included (as
//   `SingleStoreyT` takes case 2a's gable).
// - Any other side is a hip at its hip stretches' pitch, with a run over each stretch that differs: a gable run is a
//   rise (gable rise decisions 1 to 6).
// - A side that lies on no union wall is not authored.
// A case that Rings and runs cannot express is left out with its reason (`ResearchConversion`), never approximated.
import type {Case} from '../roof/cases.ts';
import {CASES} from '../roof/cases.ts';
import type {Building, Rect, Wall} from '../roof/model.ts';
import {errorMessage} from '../errors.ts';
import {RING_SIDES, STOREY_HEIGHT_CM, ring, storeyRings} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, RingSides, ShellFixture, SideForm, SideRun} from '../fixture.ts';
import {edgeLine, ringSideLines, storeyLoops, tanDeg, unionWallForms} from '../ring-forms.ts';
import type {UnionWall, WallLine} from '../ring-forms.ts';

/** The research model's default wall pitch: `buildFromRects` and `buildCourtyard` default every wall to tan 1. */
export const RESEARCH_DEFAULT_DEG = 45;

/** A case built by `buildFromRects`: its rects, in the order the case lists them, become its Rings in that order. */
export interface RectsFootprint { kind: 'rects'; rects: readonly Readonly<Rect>[] }

/**
 * A case built by `buildCourtyard`: the outer and inner rectangles. A Ring cannot author a cut (spec decision 2), so the
 * annulus becomes four Rings, the S and N bands across the full width and the W and E wings between them (the order of
 * `COURTYARD_RECTS`), and the pipeline's courtyard rule places the cut.
 */
export interface CourtyardFootprint { kind: 'courtyard'; outer: Readonly<Rect>; inner: Readonly<Rect> }

/** A case left out before conversion, with the reason. */
export interface NoFootprint { kind: 'none'; reason: string }

/** What a research case is built from, restated literally: `cases.ts` does not export its rects. A test pins each. */
export type ResearchFootprint = RectsFootprint | CourtyardFootprint | NoFootprint;

/** A shared rect table: read-only, since several cases list one. A fixture is given copies (`copyRect`). */
type RectTable = readonly Readonly<Rect>[];

const rect = (w: number, h: number): RectTable => [[0, 0, w, h]];
const T_RECTS: RectTable = [[0, 0, 1000, 500], [1000, 150, 1400, 350]];
const L_RECTS: RectTable = [[0, 0, 800, 500], [800, 0, 1000, 300]];
const TWO_WINGS: RectTable = [[0, 0, 1000, 500], [1000, 50, 1300, 150], [1000, 350, 1300, 450]];
const CROSS: RectTable = [[0, 300, 1000, 700], [300, 0, 700, 1000]];
const TERRACE: RectTable = [[0, 0, 400, 300], [400, 0, 800, 300]];
const PAIR: RectTable = [[0, 0, 400, 400], [400, 0, 800, 400]];
const WING_BELOW: RectTable = [[0, 0, 1000, 500], [600, -300, 800, 0]];
const rects = (r: RectTable): RectsFootprint => ({kind: 'rects', rects: r});

/** A rect of its own, so no two fixtures share one: `ring()` stores the rect it is given. */
export const copyRect = (r: Readonly<Rect>): Rect => [r[0], r[1], r[2], r[3]];

/** Every research case id of `cases.ts`, in its order. A test holds this tuple to `CASES` both ways. */
export const RESEARCH_CASE_IDS = [
  '1a', '1b', '1c', '1d', '1e', '1f', '1g', '2a', '2b', '2c', '2d', '3a', '3b', '3c',
  '4a', '4b', '4c', '4d', '4e', '4f', '4g', '4h', '4i', '4j', '4k', '4l', '5a', '5b', '5c', '5d', '5e', '6a', '6b',
  '7a', '7b', '7c', '7d', '7e', '7f', '7g', '7h', '7i', '8a', '8b', '8c', '8d', '8e', '8f', '8g', '9a', '9b', '9c', '9d',
] as const;

/** One of `RESEARCH_CASE_IDS`. */
export type ResearchCaseId = typeof RESEARCH_CASE_IDS[number];

/** Whether `id` is a research case id this module knows. */
export const isResearchCaseId = (id: string): id is ResearchCaseId => (RESEARCH_CASE_IDS as readonly string[]).includes(id);

/** Every research case's footprint, by case id: a missing id is a compile error. */
export const RESEARCH_FOOTPRINTS: Readonly<Record<ResearchCaseId, ResearchFootprint>> = {
  '1a': rects(rect(400, 300)), '1b': rects(rect(800, 400)), '1c': rects(rect(400, 1000)), '1d': rects(rect(400, 300)),
  '1e': rects(rect(400, 300)), '1f': rects(rect(400, 300)), '1g': rects(rect(400, 300)),
  '2a': rects(T_RECTS), '2b': rects(T_RECTS), '2c': rects(T_RECTS), '2d': rects(T_RECTS),
  '3a': rects(L_RECTS), '3b': rects(L_RECTS), '3c': rects(L_RECTS),
  '4a': rects(TWO_WINGS), '4b': rects(TWO_WINGS), '4c': rects(CROSS), '4d': rects(CROSS),
  '4e': rects([[0, 0, 1000, 500], [850, -200, 950, 0]]), '4f': rects(WING_BELOW), '4g': rects(WING_BELOW),
  '4h': rects([[0, 0, 1000, 500], [1000, 50, 1400, 250]]), '4i': rects([[0, 0, 1000, 500], [-400, 150, 0, 350]]),
  '4j': rects([[0, 0, 1000, 400], [0, 400, 800, 500], [900, 400, 1000, 500]]),
  '4k': rects([[0, 0, 800, 500], [800, 0, 1000, 150], [800, 350, 1000, 500]]),
  '4l': rects([[0, 0, 1000, 300], [0, 300, 300, 700], [700, 300, 1000, 700]]),
  '5a': rects(rect(400, 300)), '5b': rects(rect(400, 300)), '5c': rects(rect(400, 300)), '5d': rects(rect(400, 300)),
  '5e': rects(rect(400, 300)),
  '6a': rects(rect(600, 600)), '6b': rects(rect(800, 400)),
  '7a': rects(rect(400, 300)), '7b': rects(rect(400, 300)), '7c': rects(rect(400, 300)), '7d': rects(rect(400, 300)),
  '7e': rects(rect(400, 300)), '7f': rects(rect(400, 300)), '7g': rects(T_RECTS), '7h': rects(L_RECTS), '7i': rects(T_RECTS),
  '8a': rects(L_RECTS), '8b': rects(L_RECTS), '8c': rects(TERRACE), '8d': rects(TERRACE),
  '8e': rects([[0, 0, 400, 300], [600, 0, 1000, 300]]), '8f': rects(PAIR), '8g': rects(PAIR),
  '9a': {kind: 'courtyard', outer: [0, 0, 1000, 1000], inner: [200, 200, 800, 800]},
  '9b': {
    kind: 'none',
    reason: 'its subject is the cut it forces at a corner (y=200, x[800,1000]); a Ring cannot author a cut (spec decision 2), and as Rings it is 9a',
  },
  '9c': {kind: 'courtyard', outer: [0, 0, 600, 600], inner: [250, 250, 350, 350]},
  '9d': {kind: 'courtyard', outer: [0, 0, 250, 250], inner: [100, 100, 150, 150]},
};

/** The courtyard's four Rings: S band, N band, W wing, E wing, each a new rect. */
export function courtyardRects(f: Pick<CourtyardFootprint, 'outer' | 'inner'>): Rect[] {
  const [ox0, oy0, ox1, oy1] = f.outer, [ix0, iy0, ix1, iy1] = f.inner;
  return [[ox0, oy0, ox1, iy0], [ox0, iy1, ox1, oy1], [ox0, iy0, ix0, iy1], [ix1, iy0, ox1, iy1]];
}

/** The footprint of research case `id`, or undefined for an id `RESEARCH_CASE_IDS` does not know. */
export const footprintOf = (id: string): ResearchFootprint | undefined => (isResearchCaseId(id) ? RESEARCH_FOOTPRINTS[id] : undefined);

/** A research case converted: its fixture, and `courtyard` when the pipeline places its cut. */
export interface ResearchConverted { ok: true; fixture: ShellFixture; courtyard: boolean }

/** A research case left out, and why. */
export interface ResearchLeftOut { ok: false; reason: string }

/** A research case as a fixture, or why it is left out. */
export type ResearchConversion = ResearchConverted | ResearchLeftOut;

/** One research case, as the selector lists it. */
export interface ResearchEntry {
  id: string;
  title: string;
  group: string;
  /**
   * `researchName(id)`: for a converted case, its fixture's name and the selector's value and `#hash` for it. A left-out
   * case has no fixture and no hash; its disabled option is valued `leftOutValue(id)` (`catalogue.ts`).
   */
  name: string;
  conversion: ResearchConversion;
}

/** The fixture name of research case `id`. */
export const researchName = (id: string): string => `research-${id}`;

/**
 * The degrees whose tangent is `tan`: snapped to a whole millionth when that keeps the tangent (a case's `deg: 30` comes
 * back as 30), else the exact arctangent (a case's `tan: 0.5`).
 */
export function degOfTan(tan: number): number {
  const deg = (Math.atan(tan) * 180) / Math.PI;
  const snapped = Math.round(deg * 1e6) / 1e6;
  return Math.abs(tanDeg(snapped) - tan) <= 1e-12 * Math.max(1, Math.abs(tan)) ? snapped : deg;
}

/** One stretch of a Ring side that a research wall lies on, in cm from the side's start, with the wall's form and pitch. */
export type SideStretch = Pick<SideRun, 'from' | 'to' | 'form'> & {deg: number};

/** Where world coordinate `s` of a side's line lies along the side, from its start (S from x0, E from y0, N from x1, W from y1). */
function sideOffset(r: Rect, side: RingSide, s: number): number {
  const [x0, y0, x1, y1] = r;
  return side === 'S' ? s - x0 : side === 'E' ? s - y0 : side === 'N' ? x1 - s : y1 - s;
}

const sameLine = (p: WallLine, q: WallLine): boolean => p.axis === q.axis && p.at === q.at && p.n === q.n;

/** The stretch of `side` that `wall` lies on, or undefined when it lies on none of it. */
function stretchOn(r: Rect, side: RingSide, wall: WallLine, form: RingForm, deg: number): SideStretch | undefined {
  const l = ringSideLines(r)[side];
  if (!sameLine(l, wall)) return undefined;
  const lo = Math.max(l.lo, wall.lo), hi = Math.min(l.hi, wall.hi);
  if (!(lo < hi)) return undefined;
  const a = sideOffset(r, side, lo), b = sideOffset(r, side, hi);
  return {from: Math.min(a, b), to: Math.max(a, b), form, deg};
}

/** A refusal raised while a side is resolved, carried out as a left-out reason. */
class Inexpressible extends Error {}

/** One side's form from its exposed stretches (see the module comment), or undefined for a hip at the Ring's default. */
function sideFormOf(index: number, side: RingSide, stretches: SideStretch[]): SideForm | undefined {
  if (!stretches.length) return undefined;
  const sorted = [...stretches].sort((a, b) => a.from - b.from);
  const hips = sorted.filter(s => s.form === 'hip');
  const hipDeg = hips[0]?.deg;
  const other = hips.find(s => s.deg !== hipDeg);
  if (other) {
    throw new Inexpressible(`Ring ${index} side ${side}'s union walls are hips at ${hipDeg} and ${other.deg} degrees; one Ring side's hip stretches agree in pitch (gable rise decision 15)`);
  }
  const base = hips[0] ?? sorted[0];
  const runs: SideRun[] = [];
  for (const s of sorted) {
    if (s.form === base.form && s.deg === base.deg) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === s.from && last.form === s.form && last.deg === s.deg) last.to = s.to;
    else runs.push({from: s.from, to: s.to, form: s.form, deg: s.deg});
  }
  if (!runs.length && base.form === 'hip' && base.deg === RESEARCH_DEFAULT_DEG) return undefined;
  const form: SideForm = base.deg === RESEARCH_DEFAULT_DEG ? {form: base.form} : {form: base.form, deg: base.deg};
  return runs.length ? {...form, runs} : form;
}

/** A research wall's form as a Ring form, or why it has none. */
function ringFormOf(w: Wall): RingForm {
  if (w.form === 'hip' || w.form === 'gable') return w.form;
  if (w.form === 'mono') throw new Inexpressible(`wall ${w.id} is a monopitch; a Ring side is hip or gable, and mono is not authored (journal decision 116)`);
  throw new Inexpressible(`wall ${w.id} is a ${w.form}; only the courtyard rule places a cut (spec decision 2)`);
}

const fixtureOf = (name: string, rings: FixtureRing[]): ShellFixture => ({name, cellSize: 50, storeyHeight: STOREY_HEIGHT_CM, rings});

/** A rects case's Rings, each side authored from the walls lying on it. Each Ring holds a copy of its rect. */
function ringsOfRects(b: Building, table: RectTable): FixtureRing[] {
  const rs = table.map(copyRect);
  const stretches: Record<RingSide, SideStretch[]>[] = rs.map(() => ({S: [], E: [], N: [], W: []}));
  for (const w of b.walls) {
    const form = ringFormOf(w);
    const line = edgeLine(w.a, w.b), deg = degOfTan(w.tan);
    rs.forEach((r, i) => {
      for (const side of RING_SIDES) {
        const s = stretchOn(r, side, line, form, deg);
        if (s) stretches[i][side].push(s);
      }
    });
  }
  return rs.map((r, i) => {
    const sides: RingSides = {};
    for (const side of RING_SIDES) {
      const s = sideFormOf(i, side, stretches[i][side]);
      if (s) sides[side] = s;
    }
    return ring(r, 0, 1, RESEARCH_DEFAULT_DEG, sides);
  });
}

/** A courtyard case's four Rings, every side a hip at the default: a wall of any other form or pitch is inexpressible. */
function ringsOfCourtyard(b: Building, f: CourtyardFootprint): FixtureRing[] {
  for (const w of b.walls) {
    if (w.form === 'cut') continue;
    if (w.form !== 'hip' || degOfTan(w.tan) !== RESEARCH_DEFAULT_DEG) {
      throw new Inexpressible(`wall ${w.id} is ${w.form} at ${degOfTan(w.tan)} degrees; the courtyard conversion authors hips at ${RESEARCH_DEFAULT_DEG} only`);
    }
  }
  return courtyardRects(f).map(r => ring(r, 0, 1, RESEARCH_DEFAULT_DEG));
}

/** Research case `c` as a single-storey fixture, from `footprint`, or why it is left out. */
export function convertResearchCase(c: Pick<Case, 'id' | 'build'>, footprint: ResearchFootprint | undefined): ResearchConversion {
  // Only an id `RESEARCH_CASE_IDS` does not know has no footprint: the table is total over the tuple.
  if (!footprint) return {ok: false, reason: 'no footprint is restated for it'};
  if (footprint.kind === 'none') return {ok: false, reason: footprint.reason};
  let b: Building;
  try {
    b = c.build();
  } catch (e) {
    return {ok: false, reason: `the research model does not build it: ${errorMessage(e)}`};
  }
  try {
    const name = researchName(c.id);
    if (footprint.kind === 'courtyard') return {ok: true, fixture: fixtureOf(name, ringsOfCourtyard(b, footprint)), courtyard: true};
    return {ok: true, fixture: fixtureOf(name, ringsOfRects(b, footprint.rects)), courtyard: false};
  } catch (e) {
    if (e instanceof Inexpressible) return {ok: false, reason: e.message};
    throw e;
  }
}

/** Every research case, in `CASES` order, converted or left out. */
export const RESEARCH_ENTRIES: readonly ResearchEntry[] = CASES.map(c => ({
  id: c.id,
  title: c.title,
  group: c.group,
  name: researchName(c.id),
  conversion: convertResearchCase(c, footprintOf(c.id)),
}));

/** The research cases that convert, as fixtures, in `CASES` order. */
export const RESEARCH_FIXTURES: readonly ShellFixture[] = RESEARCH_ENTRIES.flatMap(e => (e.conversion.ok ? [e.conversion.fixture] : []));

/** The form and pitch at one point of a wall. */
export type FormAt = Pick<SideStretch, 'form' | 'deg'>;

/** The form and pitch the pipeline gives point `s` of union wall `w`: a rise's where one holds it, else the wall's. */
function pipelineFormAt(w: UnionWall, s: number): FormAt {
  const rise = w.rises?.find(r => r.lo <= s && s <= r.hi);
  return rise ? {form: 'gable', deg: rise.deg} : {form: w.form, deg: w.deg};
}

/**
 * Where storey 0 of `f` differs from the research `Building` in form or pitch along a wall, one line per stretch; empty
 * when the conversion is exact. Every research wall but a cut is compared: on the pipeline's union wall holding it, at
 * the middle of every stretch between the wall's ends and its rises' ends, by form and by the pitch's tangent. Uses the
 * pipeline's own per-extent rule (`unionWallForms`, gable rise decisions 3 to 6).
 */
export function researchMismatches(b: Building, f: ShellFixture): string[] {
  const rings = storeyRings(f, 0);
  const walls = unionWallForms(rings, storeyLoops(rings.map(r => r.ring.rect)));
  const out: string[] = [];
  for (const w of b.walls) {
    if (w.form === 'cut') continue;
    const line = edgeLine(w.a, w.b);
    const label = `${line.axis}=${line.at} [${line.lo}, ${line.hi}]`;
    const holder = walls.find(u => sameLine(u, line) && u.lo <= line.lo && line.hi <= u.hi);
    if (!holder) { out.push(`${label}: no union wall of the shell holds it`); continue; }
    const cuts = [line.lo, line.hi, ...(holder.rises ?? []).flatMap(r => [r.lo, r.hi])].filter(s => s >= line.lo && s <= line.hi);
    const at = [...new Set(cuts)].sort((p, q) => p - q);
    for (let k = 0; k + 1 < at.length; k++) {
      const got = pipelineFormAt(holder, (at[k] + at[k + 1]) / 2);
      const pitchOk = Math.abs(tanDeg(got.deg) - w.tan) <= 1e-9 * Math.max(1, w.tan);
      if (got.form !== w.form || !pitchOk) out.push(`${label} over [${at[k]}, ${at[k + 1]}]: research ${w.form} at ${degOfTan(w.tan)}, shell ${got.form} at ${got.deg}`);
    }
  }
  return out;
}

/** The line the selector's note shows for a research case: its id, title and how it was converted. */
export function researchNote(e: ResearchEntry): string {
  const head = `Roof-gable research case ${e.id} (${e.group}): ${e.title}.`;
  if (!e.conversion.ok) return `${head} Left out: ${e.conversion.reason}.`;
  const how = e.conversion.courtyard
    ? 'Converted to four Rings about the hole; the pipeline places the cut by its own courtyard rule, not where the case puts it.'
    : 'Converted exactly: each wall keeps its form and pitch. The roof solver\'s verdicts for this case are not asserted on the shell.';
  return `${head} ${how}`;
}
