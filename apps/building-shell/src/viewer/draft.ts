// Viewer editing decisions 6 to 9, 16 to 21 and 15: the pure draft state. A draft is a `ShellFixture`, its undo history, the
// fixture it started from, and its validity. No DOM, no scene, no storage: `main.ts` does the I/O and this module decides.
//
// Decision 6 (journal decision 193): a draft is valid when `readInput(writeInput(draft))` accepts it. `validate` is that
// sentence and nothing more, so the editor holds none of the wire's rules.
import {z} from 'zod';
import {errorMessage} from '../errors.ts';
import {RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, RingSides, ShellFixture, SideForm} from '../fixture.ts';
import type {ShellBuild} from '../shell.ts';
import {readInput, writeInput} from '../wire/input-adapter.ts';
import type {AdaptedInput} from '../wire/input-adapter.ts';
import * as edit from './edit.ts';
import {cloneFixture, pinListedPitches} from './edit.ts';
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
      // A side that is not listed reads the Ring's default.
      const listed = f.rings[ring]?.sides?.[side] !== undefined;
      return listed ? {text, ring, field: 'sidePitch', side} : {text, ring, field: 'defaultDeg', side};
    }
    return {text, ring, field: 'ring'};
  });
}

// ---- Sides, equality and the file's spelling ----------------------------------------------------------------------------------

/** One side as the pipeline reads it: its form, and its pitch in degrees. */
export interface ResolvedSide { form: RingForm; deg: number }

/** Every side of a Ring as the pipeline reads it: a side not listed is a hip at the Ring's `defaultDeg`. */
export function resolveSides(r: FixtureRing): Record<RingSide, ResolvedSide> {
  const side = (s: RingSide): ResolvedSide => ({form: r.sides?.[s]?.form ?? 'hip', deg: r.sides?.[s]?.deg ?? r.defaultDeg});
  return {S: side('S'), E: side('E'), N: side('N'), W: side('W')};
}

/** JSON with every object's keys sorted, so two fixtures that differ only in key order are the same text. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_key, x: unknown) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** Whether two fixtures are the same, field for field. An absent `sides` is an empty one. */
export const sameFixture = (a: ShellFixture, b: ShellFixture): boolean => stable(cloneFixture(a)) === stable(cloneFixture(b));

// ---- Files and links (decisions 19 and 20) ----------------------------------------------------------------------------------

/** A draft as an `input@1` file's text (decision 19): its provenance subject is the draft's name. */
export const draftJson = (f: ShellFixture): string => `${JSON.stringify(writeInput(f), null, 2)}\n`;

export type ParsedDraft = {ok: true; fixture: ShellFixture} | {ok: false; errors: string[]};

/** What `readInput` accepted does not break its own promises; if one is broken, it is a bug here or there, and says so. */
function invariant(message: string): never {
  throw new Error(`invariant broken in reading an input@1 file as a draft: ${message}`);
}

/**
 * The fixture a read file stands for, with what `readInput` drops put back (journal decision 198, M1). `readInput` lists
 * every side at its solved pitch and derives `defaultDeg` from the first hip; the file's `request` says which sides the
 * author listed (`writeInput` writes `Auto` for an unlisted one). A side the file left to `Auto` that is a hip at the
 * pitch of the first such side reads as unlisted, with that pitch as the Ring's `defaultDeg`; every other side is listed
 * and carries its own pitch. So a file this editor wrote comes back as the draft it wrote, and what the pipeline reads is
 * exactly what the file solved, also for a file the C++ wrote, whose `Auto` sides may disagree. Two rings are left as
 * `readInput` has them. A Ring with a side `readInput` left unlisted (formless) keeps `readInput`'s `defaultDeg`, which is
 * the pitch that side resolves to there. A Ring with all four sides listed has no use for a `defaultDeg` and the wire no
 * field for one, so it takes `readInput`'s: the one named exception of journal decision 198.
 */
function fixtureOfRead(read: AdaptedInput): ShellFixture {
  const rings = read.fixture.rings.map((r, position): FixtureRing => {
    const modelIndex = read.modelIndices[position];
    const wire = read.input.rings.find(w => w.modelIndex === modelIndex);
    if (!wire) invariant(`the file has no Ring of model index ${modelIndex}`);
    const slots = read.sideSlots[position];
    const requested = (s: RingSide): boolean => {
      const side = wire.sides[slots[s]];
      if (!side) invariant(`Ring ${position} has no side in slot ${slots[s]}`);
      return side.request !== 'Auto';
    };
    const formless = RING_SIDES.some(s => r.sides?.[s] === undefined);
    const auto = RING_SIDES.filter(s => !requested(s) && r.sides?.[s]?.form === 'hip');
    const first = auto.at(0);
    const defaultDeg = formless || first === undefined ? r.defaultDeg : r.sides?.[first]?.deg ?? r.defaultDeg;
    const sides: RingSides = {};
    for (const s of RING_SIDES) {
      const own = r.sides?.[s];
      if (!own || (auto.includes(s) && own.deg === defaultDeg)) continue;
      sides[s] = {...own, deg: own.deg ?? defaultDeg};
    }
    return {...r, defaultDeg, sides};
  });
  return {...read.fixture, rings};
}

/** A file read as a draft, with the provenance subject it names. */
type ReadDraft = {ok: true; fixture: ShellFixture; subject: string} | {ok: false; errors: string[]};

function readDraft(json: unknown, name: string): ReadDraft {
  try {
    const read = readInput(json, name);
    if (!read.ok) return {ok: false, errors: read.errors};
    return {ok: true, fixture: fixtureOfRead(read), subject: read.input.provenance.subject};
  } catch (e) {
    return {ok: false, errors: [errorMessage(e)]};
  }
}

/**
 * Journal decision 198, N2: an `input@1` value read as a draft named `name`, by the same reconstruction a loaded file
 * goes through. A defect case's input is read this way when it becomes a draft.
 */
export function draftFixtureOfJson(json: unknown, name: string): ParsedDraft {
  const read = readDraft(json, name);
  return read.ok ? {ok: true, fixture: {...read.fixture, name}} : read;
}

/**
 * Decisions 19 and 20: an `input@1` text read as a draft, through `readInput`. The draft's name is the file's provenance
 * subject, which a download writes as the name, and `fallbackName` stands in only for the `name` argument `readInput`
 * takes. Download then load returns the draft itself, except for the `defaultDeg` of a Ring with all four sides listed.
 */
export function parseDraftJson(text: string, fallbackName: string): ParsedDraft {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {ok: false, errors: [`not JSON: ${errorMessage(e)}`]};
  }
  const read = readDraft(json, fallbackName);
  return read.ok ? {ok: true, fixture: {...read.fixture, name: read.subject}} : read;
}

// ---- The draft ------------------------------------------------------------------------------------------------------------

/** Decision 21: the undo history holds at most this many fixtures. */
export const HISTORY_CAP = 200;

export interface Draft {
  fixture: ShellFixture;
  /** What "reset" returns to (decision 16): the fixture the draft was started from. */
  source: ShellFixture;
  /** Decision 21: earlier fixtures, oldest first. Never persisted, but for the one a reload after an unfinished build offers. */
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

/** A draft that starts as `fixture` (a link, a saved draft), with every listed side's pitch its own. Its source is `fixture` unless given. */
export const makeDraft = (fixture: ShellFixture, source: ShellFixture = fixture): Draft => made(pinListedPitches(fixture), pinListedPitches(source), 0);

/** Decision 17: the draft's name is the source's name with the suffix `-draft`. */
export const draftName = (name: string): string => (name.endsWith('-draft') ? name : `${name}-draft`);

/**
 * Decision 17: a roster fixture or defect case's fixture, as a draft named `<name>-draft`. Every listed side is spelled
 * with its own pitch (decision 14 as amended), which changes no pitch the pipeline reads.
 */
export function editDraftOf(source: ShellFixture): Draft {
  const renamed = pinListedPitches({...source, name: draftName(source.name)});
  return made(renamed, cloneFixture(renamed), 0);
}

/** Decision 17: a blank draft. It has no Ring, so the wire refuses it until one is added. */
export const blankDraft = (): Draft => {
  const blank: ShellFixture = {name: 'blank-draft', cellSize: 50, storeyHeight: 250, rings: []};
  return made(blank, cloneFixture(blank), null);
};

/** Decision 7: the fixture to build, or undefined when the wire refuses the draft. */
export const fixtureToBuild = (d: Draft): ShellFixture | undefined => (d.validation.ok ? d.fixture : undefined);

/** Journal decision 198, M2: a draft whose Rings' storeys sum to more than this asks before it builds. */
export const TALL_STOREY_SUM = 100;

/** The storeys of every Ring, added. */
export const storeySum = (f: ShellFixture): number => f.rings.reduce((n, r) => n + r.storeys, 0);

/** What the page does with a draft that wants building: build it, or why not. */
export type BuildGate = 'build' | 'invalid' | 'unfinished' | 'ask';

/** What the page knows that the draft does not. */
export interface BuildState {
  /** A reload found the mark of a build that did not finish, and the draft has not changed since. */
  unfinished: boolean;
  /** The user has agreed to build a draft above `TALL_STOREY_SUM`. */
  confirmedTall: boolean;
}

/**
 * Decisions 7 and 12 and journal decision 198, M2: the one place that says whether a draft is built now. The wire's
 * refusal comes first (decision 7). A draft whose last build did not finish is not retried. A very tall draft asks first.
 * Neither of the last two is a validity rule: decision 193 stands.
 */
export function buildGate(d: Draft, state: BuildState): BuildGate {
  if (fixtureToBuild(d) === undefined) return 'invalid';
  if (state.unfinished) return 'unfinished';
  if (storeySum(d.fixture) > TALL_STOREY_SUM && !state.confirmedTall) return 'ask';
  return 'build';
}

/** The panel's line for a draft that is held back, with the Build button; null for a gate that holds nothing back. */
export function heldMessage(gate: BuildGate, d: Draft): string | null {
  if (gate === 'unfinished') return 'The last build of this draft did not finish, so it was not retried. Build it anyway, or Undo to the last draft that built.';
  if (gate === 'ask') return `This draft has ${storeySum(d.fixture)} storeys in all, above ${TALL_STOREY_SUM}, and may take long to build. Build it?`;
  return null;
}

/** Decision 21: `next` becomes the draft's fixture and the old one goes onto the history. An unchanged fixture adds nothing. */
function commit(d: Draft, next: ShellFixture, selected: number | null): Draft {
  if (sameFixture(next, d.fixture)) return {...d, selected: clampSelected(selected, d.fixture.rings.length)};
  return made(next, d.source, selected, [...d.past, d.fixture].slice(-HISTORY_CAP), []);
}

/** Whether the draft holds work its source does not: replacing it would lose something. */
export const isDirty = (d: Draft): boolean => !sameFixture(d.fixture, d.source);

export const canUndo = (d: Draft): boolean => d.past.length > 0;
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
    case 'setRectCoord': return live(a.ring) && number(a.value) ? commit(d, edit.setRectCoord(f, a.ring, a.coord, a.value), sel) : d;
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
    case 'load': return commit(d, pinListedPitches(a.fixture), 0);
  }
}

// ---- Persistence (decision 18) and the build mark (journal decision 198, M2) --------------------------------------------------------

const RingFormSchema = z.enum(['hip', 'gable']);
const SideFormSchema = z.object({form: RingFormSchema, deg: z.number().optional()});
const SidesSchema = z.object({S: SideFormSchema.optional(), E: SideFormSchema.optional(), N: SideFormSchema.optional(), W: SideFormSchema.optional()});
const RingSchema = z.object({
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  baseStorey: z.number(),
  storeys: z.number(),
  defaultDeg: z.number(),
  sides: SidesSchema.optional(),
});
const FixtureSchema = z.object({name: z.string(), cellSize: z.number(), storeyHeight: z.number(), rings: z.array(RingSchema)});

// Journal decision 198, B3: the schema and the types it stands for must say the same, in both directions, down to the keys.
// A field added to `ShellFixture`, `FixtureRing` or `SideForm` that the schema lacks, or the other way round, fails `typecheck`.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type SchemaFixture = z.output<typeof FixtureSchema>;
type SchemaRing = z.output<typeof RingSchema>;
type SchemaSides = z.output<typeof SidesSchema>;
type SchemaSide = z.output<typeof SideFormSchema>;
true satisfies Same<SchemaFixture, ShellFixture>;
true satisfies Same<keyof SchemaFixture, keyof ShellFixture>;
true satisfies Same<SchemaRing, FixtureRing>;
true satisfies Same<keyof SchemaRing, keyof FixtureRing>;
true satisfies Same<SchemaSides, RingSides>;
true satisfies Same<keyof SchemaSides, RingSide>;
true satisfies Same<SchemaSide, SideForm>;
true satisfies Same<keyof SchemaSide, keyof SideForm>;
true satisfies Same<z.output<typeof RingFormSchema>, RingForm>;

const SavedSchema = z.object({v: z.literal(1), fixture: FixtureSchema, source: FixtureSchema, building: z.boolean().optional(), lastGood: FixtureSchema.optional()});

/**
 * The mark of a build in progress, saved with the draft before the build starts and cleared when it ends. `lastGood` is
 * the draft that last built, which a reload that finds the mark offers as the Undo target.
 */
export interface BuildMark { lastGood: ShellFixture | undefined }

/**
 * Journal decision 201: the one rule for the mark, whatever caused the save. The saved draft carries it whenever the draft
 * is held as unfinished or a build is in flight, so a click on a Ring, which saves, cannot erase what a reload must see.
 */
export function saveMark(state: {unfinished: boolean; buildsInFlight: number}, lastGood: ShellFixture | undefined): BuildMark | undefined {
  return state.unfinished || state.buildsInFlight > 0 ? {lastGood} : undefined;
}

/**
 * A draft as the text kept in `localStorage`: its fixture and its source, as plain JSON. It is the fixture itself, not
 * `input@1`, because a draft the wire refuses (a pitch of 3) must survive a reload too. History is not kept (decision 21).
 * With `building`, the text carries the mark of a build in progress (journal decision 198, M2).
 */
export function serializeDraft(d: Draft, building?: BuildMark): string {
  const mark = building ? {building: true, lastGood: building.lastGood && cloneFixture(building.lastGood)} : {};
  return JSON.stringify({v: 1, fixture: cloneFixture(d.fixture), source: cloneFixture(d.source), ...mark});
}

/** A saved draft, and whether the build it was saved in the middle of ever ended. */
export interface RestoredDraft { draft: Draft; unfinished: boolean }

/**
 * The draft a saved text holds, or undefined when it is not one (stale, corrupt or from another version). A text that
 * carries the build mark restores `unfinished`, with the draft that last built as its one step of history, so Undo works.
 */
export function restoreDraft(text: string | null): RestoredDraft | undefined {
  if (text === null) return undefined;
  try {
    const saved = SavedSchema.safeParse(JSON.parse(text));
    if (!saved.success) return undefined;
    const fix = (f: z.output<typeof FixtureSchema>): ShellFixture => pinListedPitches({...f, rings: f.rings.map(r => ({...r, sides: r.sides ?? {}}))});
    const fixture = fix(saved.data.fixture);
    const unfinished = saved.data.building === true;
    const lastGood = unfinished && saved.data.lastGood ? fix(saved.data.lastGood) : undefined;
    const draft = made(fixture, fix(saved.data.source), 0, lastGood && !sameFixture(lastGood, fixture) ? [lastGood] : []);
    return {draft, unfinished};
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
 * Decision 15 as amended: the Ring a hit's provenance names, or null when it names none. Only Wall and Gable Cells carry
 * one (`CellSource`, journal decision 156), so a click on a roof, floor or underside face, an Edge or a vertex selects no
 * Ring. A face hit with no Cell under it falls to the face's lowest-index source. For a draft the model index is the
 * Ring's index in `fixture.rings`, since the build is made from the fixture itself.
 */
export function ringOfHit(build: ShellBuild, hit: Hit): number | null {
  if (hit.kind !== 'surface') return null;
  const cell = hit.cell === null ? undefined : build.shell.cells[hit.cell];
  if (cell?.source) return cell.source.ringModelIndex;
  return build.shell.faces[hit.face].sources[0]?.ringModelIndex ?? null;
}
