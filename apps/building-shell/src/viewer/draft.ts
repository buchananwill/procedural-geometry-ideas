// Viewer editing decisions 6 to 9, 16 to 21 and 15: the pure draft state. A draft is a `ShellFixture`, its undo history, the
// fixture it started from, and its validity. No DOM, no scene, no storage: `main.ts` does the I/O and this module decides.
//
// Decision 6 (journal decision 193): a draft is valid when `readInput(writeInput(draft))` accepts it. `validate` is that
// sentence and nothing more, so the editor holds none of the wire's rules.
import {z} from 'zod';
import {errorMessage} from '../errors.ts';
import {RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, ShellFixture} from '../fixture.ts';
import type {ShellBuild} from '../shell.ts';
import {readInput, writeInput} from '../wire/input-adapter.ts';
import type {AdaptedInput} from '../wire/input-adapter.ts';
import type {Rect} from '../roof/model.ts';
import * as edit from './edit.ts';
import {cloneFixture} from './edit.ts';
import type {Hit} from './readout.ts';
import type {ToggleState} from './toggles.ts';

// ---- Validity (decisions 6, 7 and 9) --------------------------------------------------------------------------------------

/** Whether the wire accepts a draft, and if not, its every refusal, one line each. */
export type Validation = {ok: true} | {ok: false; errors: string[]};

/**
 * Decision 6: the wire round trip is the validity law. Anything the round trip throws counts as a refusal, with the
 * thrown message, so a draft the wire cannot even write is never built either.
 */
export function validate(f: ShellFixture): Validation {
  try {
    const read = readInput(writeInput(f), f.name);
    return read.ok ? {ok: true} : {ok: false, errors: read.errors};
  } catch (e) {
    return {ok: false, errors: [errorMessage(e)]};
  }
}

/** Where a refusal points in the panel. `ring` is a fixture index, or null when the refusal is the whole draft's. */
export type FieldName = 'rect' | 'baseStorey' | 'storeys' | 'defaultDeg' | 'sidePitch' | 'ring' | 'rings' | 'storeyHeight' | 'cellSize';
export interface Refusal { text: string; ring: number | null; field: FieldName; side?: RingSide }

const RECT_WORDS = /corner|axis-aligned|signed area|consecutive sides|rectangle/;

/**
 * Decision 7: which field each of the wire's refusals is about, so the panel can mark it. It reads the refusal text, which
 * names its Ring (`Ring i (model index i)` or a `rings.i.field` path) and, for a pitch, its side. A refusal it cannot
 * place points at its Ring, or at the whole draft. Interpretation: the wire gives no machine-readable field.
 */
export function explainRefusals(errors: readonly string[], f: ShellFixture): Refusal[] {
  return errors.map((text): Refusal => {
    const path = /^rings\.(\d+)\.(\w+)/.exec(text);
    if (path) {
      const ring = Number(path[1]);
      const field = path[2] === 'baseStorey' ? 'baseStorey' : path[2] === 'storeys' ? 'storeys' : path[2] === 'corners' ? 'rect' : 'ring';
      return {text, ring, field};
    }
    if (text.startsWith('rings:')) return {text, ring: null, field: 'rings'};
    if (text.startsWith('storeyHeightCm')) return {text, ring: null, field: 'storeyHeight'};
    if (text.startsWith('cellSizeCm')) return {text, ring: null, field: 'cellSize'};
    const named = /^Ring (\d+) \(model index/.exec(text);
    if (!named) return {text, ring: null, field: 'rings'};
    const ring = Number(named[1]);
    if (RECT_WORDS.test(text)) return {text, ring, field: 'rect'};
    const sideAt = /\bside (\d)\b/.exec(text);
    const side = sideAt ? RING_SIDES[Number(sideAt[1])] : undefined;
    if (side && /solved (Pitched|GableEnd) at/.test(text)) {
      // A side without a pitch of its own reads the Ring's default.
      const own = f.rings[ring]?.sides?.[side]?.deg !== undefined;
      return own ? {text, ring, field: 'sidePitch', side} : {text, ring, field: 'defaultDeg', side};
    }
    return {text, ring, field: 'ring'};
  });
}

// ---- Canonical form ------------------------------------------------------------------------------------------------------

/** One side as the pipeline reads it: its form, and its pitch in degrees. */
export interface ResolvedSide { form: RingForm; deg: number }

/** Every side of a Ring as the pipeline reads it: a side not listed is a hip at the Ring's `defaultDeg`. */
export function resolveSides(r: FixtureRing): Record<RingSide, ResolvedSide> {
  const side = (s: RingSide): ResolvedSide => ({form: r.sides?.[s]?.form ?? 'hip', deg: r.sides?.[s]?.deg ?? r.defaultDeg});
  return {S: side('S'), E: side('E'), N: side('N'), W: side('W')};
}

/**
 * The one way a Ring is written when only what the file carries matters. A file carries, per side, its resolved form and
 * pitch and whether the side was listed (its `request` is not `Auto`); it does not carry `defaultDeg`, which `readInput`
 * re-derives from the first hip, nor which listed sides spelled their pitch out. So the spelling is a function of those
 * alone: a side stays listed or unlisted as it was, a listed side spells its pitch only where it is not the default,
 * and `defaultDeg` is what the unlisted sides read, which is also what the file holds for them; a Ring with no unlisted
 * side has no use for one, and takes its sides' most common pitch (the first in S, E, N, W order on a tie). It is
 * idempotent, and a Ring and its round trip have the same one.
 */
export function canonicalRing(r: FixtureRing): FixtureRing {
  const resolved = resolveSides(r);
  const listed = RING_SIDES.filter(s => r.sides?.[s] !== undefined);
  let defaultDeg = r.defaultDeg;
  if (listed.length === RING_SIDES.length) {
    const counts = new Map<number, number>();
    for (const s of RING_SIDES) counts.set(resolved[s].deg, (counts.get(resolved[s].deg) ?? 0) + 1);
    defaultDeg = resolved.S.deg;
    for (const [deg, n] of counts) if (n > (counts.get(defaultDeg) ?? 0)) defaultDeg = deg;
  }
  const sides: FixtureRing['sides'] = {};
  for (const s of listed) {
    const {form, deg} = resolved[s];
    sides[s] = deg === defaultDeg ? {form} : {form, deg};
  }
  return {rect: [...r.rect], baseStorey: r.baseStorey, storeys: r.storeys, defaultDeg, sides};
}

export const canonicalFixture = (f: ShellFixture): ShellFixture =>
  ({name: f.name, cellSize: f.cellSize, storeyHeight: f.storeyHeight, rings: f.rings.map(canonicalRing)});

const sameFixture = (a: ShellFixture, b: ShellFixture): boolean => JSON.stringify(cloneFixture(a)) === JSON.stringify(cloneFixture(b));

// ---- Files and links (decisions 19 and 20) ----------------------------------------------------------------------------------

/** A draft as an `input@1` file's text (decision 19): its provenance subject is the draft's name. */
export const draftJson = (f: ShellFixture): string => `${JSON.stringify(writeInput(f), null, 2)}\n`;

export type ParsedDraft = {ok: true; fixture: ShellFixture} | {ok: false; errors: string[]};

/**
 * The fixture a read file stands for, with the listing `readInput` drops put back. `readInput` lists every side at its
 * solved pitch and derives `defaultDeg` from the first hip; the file's `request` says which sides the author listed
 * (`writeInput` writes `Auto` for an unlisted one). A side the file left to `Auto` and that is a hip at the pitch of the
 * first such side reads as unlisted, with that pitch as the Ring's `defaultDeg`. Any other side stays listed, so what the
 * pipeline reads is exactly what the file solved, also for a file the C++ wrote (whose `Auto` sides may disagree).
 */
function fixtureOfRead(read: AdaptedInput): ShellFixture {
  const rings = read.fixture.rings.map((r, position): FixtureRing => {
    const wire = read.input.rings.find(w => w.modelIndex === read.modelIndices[position]);
    const slots = read.sideSlots[position];
    const auto = RING_SIDES.filter(s => (wire?.sides[slots[s]]?.request ?? 'Auto') === 'Auto' && r.sides?.[s]?.form === 'hip');
    const defaultDeg = auto.length ? (r.sides?.[auto[0]]?.deg ?? r.defaultDeg) : r.defaultDeg;
    const sides: FixtureRing['sides'] = {};
    for (const s of RING_SIDES) {
      const own = r.sides?.[s];
      if (!own) continue;
      if (auto.includes(s) && own.deg === defaultDeg) continue;
      sides[s] = {...own};
    }
    return {...r, defaultDeg, sides};
  });
  return {...read.fixture, rings};
}

/**
 * Decisions 19 and 20: an `input@1` text read as a draft, through `readInput`. The draft's name is the file's provenance
 * subject, which a download writes as the name, and `fallbackName` stands in only for the `name` argument `readInput`
 * takes. The Rings come back in their canonical spelling.
 */
export function parseDraftJson(text: string, fallbackName: string): ParsedDraft {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {ok: false, errors: [`not JSON: ${errorMessage(e)}`]};
  }
  try {
    const read = readInput(json, fallbackName);
    if (!read.ok) return {ok: false, errors: read.errors};
    return {ok: true, fixture: canonicalFixture({...fixtureOfRead(read), name: read.input.provenance.subject})};
  } catch (e) {
    return {ok: false, errors: [errorMessage(e)]};
  }
}

// ---- The draft ------------------------------------------------------------------------------------------------------------

/** Decision 21: the undo history holds at most this many fixtures. */
export const HISTORY_CAP = 200;

export interface Draft {
  fixture: ShellFixture;
  /** What "reset" returns to (decision 16): the fixture the draft was started from. */
  source: ShellFixture;
  /** Decision 21: earlier fixtures, oldest first. Never persisted. */
  past: readonly ShellFixture[];
  future: readonly ShellFixture[];
  validation: Validation;
  /** The Ring the panel shows and the viewport highlights (decision 15): an index into `fixture.rings`, null when it has none. */
  selected: number | null;
}

/** The index a selection falls to when the fixture has `count` Rings. */
const clampSelected = (selected: number | null, count: number): number | null =>
  count === 0 ? null : selected === null ? 0 : Math.min(Math.max(selected, 0), count - 1);

function made(fixture: ShellFixture, source: ShellFixture, selected: number | null, past: readonly ShellFixture[] = [], future: readonly ShellFixture[] = []): Draft {
  return {fixture, source, past, future, validation: validate(fixture), selected: clampSelected(selected, fixture.rings.length)};
}

/** A draft that starts as `fixture` exactly (a link, a saved draft). Its source is `fixture` unless `source` is given. */
export const makeDraft = (fixture: ShellFixture, source: ShellFixture = fixture): Draft => made(cloneFixture(fixture), cloneFixture(source), 0);

/** Decision 17: the draft's name is the source's name with the suffix `-draft`. */
export const draftName = (name: string): string => (name.endsWith('-draft') ? name : `${name}-draft`);

/** Decision 17: a roster fixture or defect case's fixture, as a draft named `<name>-draft`. */
export function editDraftOf(source: ShellFixture): Draft {
  const renamed = {...cloneFixture(source), name: draftName(source.name)};
  return made(renamed, cloneFixture(renamed), 0);
}

/** Decision 17: a blank draft. It has no Ring, so the wire refuses it until one is added. */
export const blankDraft = (): Draft => {
  const blank: ShellFixture = {name: 'blank-draft', cellSize: 50, storeyHeight: 250, rings: []};
  return made(blank, cloneFixture(blank), null);
};

/** Decision 7: the fixture to build, or undefined when the wire refuses the draft. This is the only gate on building a draft. */
export const fixtureToBuild = (d: Draft): ShellFixture | undefined => (d.validation.ok ? d.fixture : undefined);

/** Decision 21: `next` becomes the draft's fixture and the old one goes onto the history. An unchanged fixture adds nothing. */
function commit(d: Draft, next: ShellFixture, selected: number | null): Draft {
  if (sameFixture(next, d.fixture)) return {...d, selected: clampSelected(selected, d.fixture.rings.length)};
  return made(next, d.source, selected, [...d.past, d.fixture].slice(-HISTORY_CAP), []);
}

/** Whether the draft holds work its source does not: replacing it would lose something. */
export const isDirty = (d: Draft): boolean => !sameFixture(d.fixture, d.source);

export const canUndo =(d: Draft): boolean => d.past.length > 0;
export const canRedo = (d: Draft): boolean => d.future.length > 0;

/** Every way the panel changes a draft (decisions 2, 3, 9, 15 and 16), as plain values. */
export type DraftAction =
  | {kind: 'select'; ring: number}
  | {kind: 'addRing'}
  | {kind: 'removeRing'; ring: number}
  | {kind: 'duplicateRing'; ring: number}
  | {kind: 'moveRing'; ring: number; direction: -1 | 1}
  | {kind: 'setRectCoord'; ring: number; coord: 0 | 1 | 2 | 3; value: number}
  | {kind: 'setBaseStorey'; ring: number; value: number}
  | {kind: 'setStoreys'; ring: number; value: number}
  | {kind: 'setDefaultDeg'; ring: number; value: number}
  | {kind: 'setSideForm'; ring: number; side: RingSide; form: RingForm}
  | {kind: 'setSidePitch'; ring: number; side: RingSide; value: number}
  | {kind: 'clearSide'; ring: number; side: RingSide}
  | {kind: 'setStoreyHeight'; value: number}
  | {kind: 'undo'}
  | {kind: 'redo'}
  | {kind: 'reset'}
  | {kind: 'load'; fixture: ShellFixture};

/**
 * One action applied to a draft. Decision 9: an edit is never blocked, so a value the wire will refuse (a pitch of 3)
 * is applied and the draft is simply invalid. Only what is not a number at all (NaN, or an infinity: not an edit a field
 * can make), and a Ring that does not exist (a stale click), are ignored.
 */
export function dispatch(d: Draft, a: DraftAction): Draft {
  const f = d.fixture;
  const count = f.rings.length;
  const live = (ring: number): boolean => Number.isInteger(ring) && ring >= 0 && ring < count;
  const number = (v: number): boolean => Number.isFinite(v);
  const sel = d.selected;
  switch (a.kind) {
    case 'select': return live(a.ring) ? {...d, selected: a.ring} : d;
    case 'addRing': {
      const next = edit.addRing(f, sel ?? undefined);
      return commit(d, next, next.rings.length - 1);
    }
    case 'removeRing': {
      if (!live(a.ring)) return d;
      const after = sel === null ? null : sel > a.ring ? sel - 1 : sel;
      return commit(d, edit.removeRing(f, a.ring), after);
    }
    case 'duplicateRing': return live(a.ring) ? commit(d, edit.duplicateRing(f, a.ring), a.ring + 1) : d;
    case 'moveRing': {
      if (!live(a.ring)) return d;
      const to = a.ring + a.direction;
      const moved = to >= 0 && to < count;
      const after = !moved || sel === null ? sel : sel === a.ring ? to : sel === to ? a.ring : sel;
      return commit(d, edit.moveRing(f, a.ring, a.direction), after);
    }
    case 'setRectCoord': {
      if (!live(a.ring) || !number(a.value)) return d;
      const rect: Rect = [...f.rings[a.ring].rect];
      rect[a.coord] = a.value;
      return commit(d, edit.setRect(f, a.ring, rect), sel);
    }
    case 'setBaseStorey': return live(a.ring) && number(a.value) ? commit(d, edit.setBaseStorey(f, a.ring, a.value), sel) : d;
    case 'setStoreys': return live(a.ring) && number(a.value) ? commit(d, edit.setStoreys(f, a.ring, a.value), sel) : d;
    case 'setDefaultDeg': return live(a.ring) && number(a.value) ? commit(d, edit.setDefaultDeg(f, a.ring, a.value), sel) : d;
    case 'setSideForm': return live(a.ring) ? commit(d, edit.setSideForm(f, a.ring, a.side, a.form), sel) : d;
    case 'setSidePitch': return live(a.ring) && number(a.value) ? commit(d, edit.setSidePitch(f, a.ring, a.side, a.value), sel) : d;
    case 'clearSide': return live(a.ring) ? commit(d, edit.clearSide(f, a.ring, a.side), sel) : d;
    case 'setStoreyHeight': return number(a.value) ? commit(d, edit.setStoreyHeight(f, a.value), sel) : d;
    case 'undo': {
      const previous = d.past.at(-1);
      return previous ? made(previous, d.source, sel, d.past.slice(0, -1), [f, ...d.future]) : d;
    }
    case 'redo': {
      const [next, ...rest] = d.future;
      return next ? made(next, d.source, sel, [...d.past, f].slice(-HISTORY_CAP), rest) : d;
    }
    case 'reset': return commit(d, cloneFixture(d.source), sel);
    case 'load': return commit(d, cloneFixture(a.fixture), 0);
  }
}

// ---- Persistence (decision 18) ---------------------------------------------------------------------------------------------

const RingFormSchema = z.enum(['hip', 'gable']);
const SideFormSchema = z.object({form: RingFormSchema, deg: z.number().optional()});
const FixtureSchema = z.object({
  name: z.string(),
  cellSize: z.number(),
  storeyHeight: z.number(),
  rings: z.array(z.object({
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    baseStorey: z.number(),
    storeys: z.number(),
    defaultDeg: z.number(),
    sides: z.object({S: SideFormSchema.optional(), E: SideFormSchema.optional(), N: SideFormSchema.optional(), W: SideFormSchema.optional()}).optional(),
  })),
});
const SavedSchema = z.object({v: z.literal(1), fixture: FixtureSchema, source: FixtureSchema});

/**
 * A draft as the text kept in `localStorage`: its fixture and its source, as plain JSON. It is the fixture itself, not
 * `input@1`, because a draft the wire refuses (a pitch of 3) must survive a reload too. History is not kept (decision 21).
 */
export const serializeDraft = (d: Draft): string => JSON.stringify({v: 1, fixture: cloneFixture(d.fixture), source: cloneFixture(d.source)});

/** The draft a saved text holds, or undefined when it is not one (stale, corrupt or from another version). */
export function restoreDraft(text: string | null): Draft | undefined {
  if (text === null) return undefined;
  try {
    const saved = SavedSchema.safeParse(JSON.parse(text));
    if (!saved.success) return undefined;
    const fix = (f: z.output<typeof FixtureSchema>): ShellFixture => cloneFixture({...f, rings: f.rings.map(r => ({...r, sides: r.sides ?? {}}))});
    return makeDraft(fix(saved.data.fixture), fix(saved.data.source));
  } catch {
    return undefined;
  }
}

// ---- The viewport (decisions 11 and 15) -----------------------------------------------------------------------------------

/**
 * Decision 11: the toggles over a rebuilt fixture's storeys. A storey the old toggles held keeps its choice, a new storey
 * is shown, and a storey the fixture no longer has is dropped. Layers, raw mode and the outline options are untouched.
 */
export function keepStoreys(state: ToggleState, storeys: readonly number[]): ToggleState {
  return {...state, storeys: Object.fromEntries(storeys.map(s => [s, state.storeys[s] ?? true]))};
}

/**
 * Decision 15: the Ring a hit's provenance names, or null when it names none. Only Wall and Gable Cells carry one
 * (`CellSource`, journal decision 156), so a click on a roof, floor or underside face, an Edge or a vertex selects no Ring.
 * A face hit with no Cell under it falls to the face's lowest-index source. For a draft the model index is the Ring's
 * index in `fixture.rings`, since the build is made from the fixture itself.
 */
export function ringOfHit(build: ShellBuild, hit: Hit): number | null {
  if (hit.kind !== 'surface') return null;
  const cell = hit.cell === null ? undefined : build.shell.cells[hit.cell];
  if (cell?.source) return cell.source.ringModelIndex;
  return build.shell.faces[hit.face].sources[0]?.ringModelIndex ?? null;
}
