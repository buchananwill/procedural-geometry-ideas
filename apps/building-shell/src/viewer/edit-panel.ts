// Viewer editing decisions 10, 13, 14 and 16: the panel's DOM. It is the only new file that touches the document, and it
// decides nothing: a control turns into a `DraftAction` (`draft.ts` applies it) and the panel shows what `draft.ts` says.
//
// The DOM is built once and patched, never rebuilt, because a control that is replaced between a mouse-down and the
// mouse-up loses its click: a field commits on its `change`, which a click elsewhere fires on the way in (decision 10).
// Only the Ring list grows and shrinks, at its tail, so each row's buttons keep their element and their index.
import {errorMessage} from '../errors.ts';
import {RING_FORMS, RING_SIDES, RISE_FACINGS} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide, RiseFacing} from '../fixture.ts';
import {DEFAULT_RISE_FACING} from '../ring-forms.ts';
import type {Draft, DraftAction, FieldName, Refusal} from './draft.ts';
import {canRedo, canUndo, resolveSides} from './draft.ts';
import {CAP_TOO_LOW_NOTE, PITCH_STEP_DEG, canHalveStretch, canSplitStretch, capTooLowToBuild, sideLengthCm} from './edit.ts';

/** A line shown under the panel, and whether it is bad news. */
export interface Notice { text: string; bad: boolean }

/** Everything the panel shows. `main.ts` builds it from the draft and from how the last build ended. */
export interface PanelView {
  /** The roster fixture or case on show, which "Edit" turns into a draft; null when a draft is on show or nothing can be edited. */
  editable: string | null;
  /** The draft on show, or null. */
  draft: Draft | null;
  /** Decision 7: the wire's refusals of the draft, placed on its fields. */
  refusals: readonly Refusal[];
  /** Decision 8: the message of a valid draft the pipeline refused. */
  pipelineMessage: string | null;
  /** Journal decision 198, M2: why a valid draft is not being built (a build that did not finish, a very tall draft), offered with Build; null when it is. */
  held: string | null;
  notice: Notice | null;
  /** The link "Copy link" made, shown so it can be copied by hand when the clipboard is unavailable. */
  link: string | null;
}

export interface PanelHandlers {
  onAction(action: DraftAction): void;
  /** The "Edit" button: the roster fixture or case on show becomes a draft (decision 17). */
  onEdit(): void;
  onBlank(): void;
  onDownload(): void;
  /** A file the user chose to load (decision 19): its text and its name. */
  onLoadFile(text: string, filename: string): void;
  /** A file the user chose could not be read at all. */
  onLoadFailed(filename: string, message: string): void;
  onCopyLink(): void;
  /** The "Build" button of a held draft: build it now. */
  onBuild(): void;
}

export interface EditPanel { render(view: PanelView): void }

type Field = HTMLInputElement | HTMLSelectElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function button(label: string, title: string, onClick: () => void, id?: string): HTMLButtonElement {
  const b = el('button', label);
  b.type = 'button';
  b.title = title;
  if (id) b.id = id;
  b.addEventListener('click', onClick);
  return b;
}

/** A number field that commits on `change` only (decision 10). An entry that is not a number is dropped and the field shows the draft's value again. */
function numberField(id: string, step: number, commit: (value: number) => void, resync: () => void): HTMLInputElement {
  const i = el('input', undefined, 'num');
  i.type = 'number';
  i.id = id;
  i.step = String(step);
  i.addEventListener('change', () => {
    const v = i.valueAsNumber;
    if (Number.isFinite(v)) commit(v);
    else resync();
  });
  return i;
}

/**
 * Per-stretch gable settings decision 16: a number field that may be left empty, committing null for empty. An entry that is
 * not a number at all (the browser's bad input) is dropped and the field shows the draft's value again.
 */
function optionalNumberField(id: string, step: number, commit: (value: number | null) => void, resync: () => void): HTMLInputElement {
  const i = el('input', undefined, 'num');
  i.type = 'number';
  i.id = id;
  i.step = String(step);
  i.placeholder = 'none';
  i.addEventListener('change', () => {
    if (i.validity.badInput) resync();
    else if (i.value.trim() === '') commit(null);
    else if (Number.isFinite(i.valueAsNumber)) commit(i.valueAsNumber);
    else resync();
  });
  return i;
}

const num = (v: number): string => String(Math.round(v * 1e6) / 1e6);

/** The rect's four fields, with the coordinate of `Rect` each one sets. */
const RECT_FIELDS = [{label: 'x0', coord: 0}, {label: 'y0', coord: 1}, {label: 'x1', coord: 2}, {label: 'y1', coord: 3}] as const;

/** A control with its caption in front of it. */
const labelled = (text: string, f: HTMLInputElement | HTMLSelectElement): HTMLLabelElement => {
  const l = el('label', `${text} `, 'inline');
  l.append(f);
  return l;
};

/** The form a select's value names, or null for a value that names none. */
const formOf = (value: string): RingForm | null => RING_FORMS.find(f => f === value) ?? null;

/** The facing strategy a select's value names, or null for a value that names none. */
const facingOf = (value: string): RiseFacing | null => RISE_FACINGS.find(f => f === value) ?? null;

/** What the Halve button does, in its tooltip (per-stretch gable settings decision 18). */
const HALVE_TITLE = 'Halve this gable stretch: two gables, each standing apart, each keeping its settings';

/** Where a side's runs are measured from and which way they run (gable rise decision 1: every side runs counter-clockwise). */
const RUN_START: Record<RingSide, string> = {
  S: 'west end (x0), running east',
  E: 'south end (y0), running north',
  N: 'east end (x1), running west',
  W: 'north end (y1), running south',
};

/** A gable stretch's three controls (per-stretch gable settings decision 16), on a line of their own, hidden on a hip stretch. */
interface GableControls { line: HTMLElement; maxHeight: HTMLInputElement; tooLow: HTMLElement; facing: HTMLSelectElement; apart: HTMLInputElement }

/** One run's controls. */
interface RunRow {
  row: HTMLElement; from: HTMLInputElement; to: HTMLElement; form: HTMLSelectElement; pitch: HTMLInputElement; split: HTMLButtonElement; halve: HTMLButtonElement;
  gable: GableControls; note: HTMLElement;
}

/** One side's controls, and its run list (journal decision 210). */
interface SideRow {
  form: HTMLSelectElement; pitch: HTMLInputElement; clear: HTMLButtonElement;
  runs: HTMLDetailsElement; summary: HTMLElement; where: HTMLElement; runRows: RunRow[]; runList: HTMLElement; splitPlain: HTMLButtonElement;
  halvePlain: HTMLButtonElement; tooShort: HTMLElement;
}

/** One row of the Ring list. */
interface RingRow { row: HTMLElement; pick: HTMLButtonElement; up: HTMLButtonElement; down: HTMLButtonElement }

/** Mounts the panel in `host` and returns the function that shows a view. */
export function mountEditPanel(host: HTMLElement, handlers: PanelHandlers): EditPanel {
  let view: PanelView | undefined;
  const draft = (): Draft | null => view?.draft ?? null;
  const ring = (): number | null => draft()?.selected ?? null;
  const act = (a: DraftAction): void => handlers.onAction(a);
  const withRing = (make: (r: number) => DraftAction): void => { const r = ring(); if (r !== null) act(make(r)); };
  /** Shows the draft's values again in every field: after an entry that was not a number. */
  const resync = (): void => { if (view) patchFields(view); };

  // ---- Start: no draft on show -------------------------------------------------------------------------------------
  const start = el('div', undefined, 'edit-start');
  const editButton = button('Edit as a draft', 'Turn what is on show into a draft, named <name>-draft', () => handlers.onEdit(), 'edit-start-edit');
  const blankButton = button('Blank draft', 'Start from no Ring', () => handlers.onBlank(), 'edit-blank');
  const startLoad = el('input');
  startLoad.type = 'file';
  startLoad.accept = '.json,application/json';
  startLoad.hidden = true;
  startLoad.id = 'edit-start-file';
  const startLoadButton = button('Load JSON...', 'Start a draft from an input@1 file', () => startLoad.click(), 'edit-start-load');
  start.append(editButton, ' ', blankButton, ' ', startLoadButton, startLoad);

  // ---- Draft ----------------------------------------------------------------------------------------------------------
  const body = el('div', undefined, 'edit-draft');
  const title = el('div', undefined, 'edit-title');
  title.id = 'edit-title';

  const list = el('div', undefined, 'ring-list');
  list.id = 'ring-list';
  const listActions = el('div');
  const addButton = button('Add Ring', 'A 500 x 500 hip Ring beside the selected one (decision 4)', () => act({kind: 'addRing'}), 'edit-add');
  const heightField = numberField('edit-storey-height', 10, v => act({kind: 'setStoreyHeight', value: v}), resync);
  const heightLabel = el('label', 'Storey height (cm) ', 'inline');
  heightLabel.append(heightField);
  listActions.append(addButton, ' ', heightLabel);

  const fields = el('div', undefined, 'ring-fields');
  fields.id = 'ring-fields';
  const fieldsTitle = el('div', undefined, 'fields-title');
  fieldsTitle.id = 'ring-fields-title';
  const rectFields = RECT_FIELDS.map(({label, coord}) =>
    numberField(`ring-${label}`, 50, v => withRing(r => ({kind: 'setRectCoord', ring: r, coord, value: v})), resync));
  const baseField = numberField('ring-base-storey', 1, v => withRing(r => ({kind: 'setBaseStorey', ring: r, value: v})), resync);
  const storeysField = numberField('ring-storeys', 1, v => withRing(r => ({kind: 'setStoreys', ring: r, value: v})), resync);
  const defaultField = numberField('ring-default-deg', PITCH_STEP_DEG, v => withRing(r => ({kind: 'setDefaultDeg', ring: r, value: v})), resync);
  const rectRow = el('div', undefined, 'row');
  rectFields.forEach((f, i) => rectRow.append(labelled(RECT_FIELDS[i].label, f)));
  const storeyRow = el('div', undefined, 'row');
  storeyRow.append(labelled('base storey', baseField), labelled('storeys', storeysField), labelled('default pitch', defaultField));

  const sideRows = new Map<RingSide, SideRow>();
  const sides = el('div', undefined, 'sides');
  for (const side of RING_SIDES) {
    const row = el('div', undefined, 'row side');
    const form = el('select');
    form.id = `ring-side-${side}-form`;
    for (const f of RING_FORMS) form.append(new Option(f, f));
    form.addEventListener('change', () => {
      const chosen = formOf(form.value);
      if (chosen) withRing(r => ({kind: 'setSideForm', ring: r, side, form: chosen}));
    });
    const pitch = numberField(`ring-side-${side}-deg`, PITCH_STEP_DEG, v => withRing(r => ({kind: 'setSidePitch', ring: r, side, value: v})), resync);
    const clear = button('Default', 'Back to a plain side, unlisted: a hip at the Ring\'s default pitch', () => withRing(r => ({kind: 'clearSide', ring: r, side})), `ring-side-${side}-clear`);
    row.append(el('span', side, 'side-name'), form, pitch, clear);

    // The stretches of the side (journal decision 214): a plain side is one; a split side's cover its whole length.
    const runs = el('details', undefined, 'runs');
    runs.id = `ring-side-${side}-runs`;
    const summary = el('summary', 'Stretches');
    const where = el('div', undefined, 'hint');
    const runList = el('div', undefined, 'run-list');
    const splitPlain = button('Split', 'Split this side: a gable stretch in the middle third, the side\'s form on both flanks', () => withRing(r => ({kind: 'splitStretch', ring: r, side, run: 0})), `ring-side-${side}-split`);
    const halvePlain = button('Halve', HALVE_TITLE, () => withRing(r => ({kind: 'halveStretch', ring: r, side, run: 0})), `ring-side-${side}-halve`);
    const tooShort = el('span', 'too short to split: a stretch needs two whole cells', 'hint');
    runs.append(summary, where, runList, splitPlain, ' ', halvePlain, ' ', tooShort);
    sides.append(row, runs);
    sideRows.set(side, {form, pitch, clear, runs, summary, where, runRows: [], runList, splitPlain, halvePlain, tooShort});
  }
  fields.append(fieldsTitle, rectRow, storeyRow, sides);

  const actions = el('div', undefined, 'actions');
  const undoButton = button('Undo', 'Undo the last change', () => act({kind: 'undo'}), 'edit-undo');
  const redoButton = button('Redo', 'Redo', () => act({kind: 'redo'}), 'edit-redo');
  const resetButton = button('Reset', 'Back to the fixture this draft started from', () => act({kind: 'reset'}), 'edit-reset');
  const downloadButton = button('Download JSON', 'Save the draft as an input@1 file', () => handlers.onDownload(), 'edit-download');
  const loadInput = el('input');
  loadInput.type = 'file';
  loadInput.accept = '.json,application/json';
  loadInput.hidden = true;
  loadInput.id = 'edit-file';
  const loadButton = button('Load JSON...', 'Replace the draft with an input@1 file (undoable)', () => loadInput.click(), 'edit-load');
  const linkButton = button('Copy link', 'Copy a link that carries the draft', () => handlers.onCopyLink(), 'edit-link');
  actions.append(undoButton, ' ', redoButton, ' ', resetButton, ' ', downloadButton, ' ', loadButton, loadInput, ' ', linkButton);

  const held = el('div', undefined, 'refusals');
  held.id = 'edit-held';
  const heldText = el('span');
  const buildButton = button('Build', 'Build this draft now', () => handlers.onBuild(), 'edit-build');
  held.append(heldText, ' ', buildButton);
  const refusals = el('div', undefined, 'refusals');
  refusals.id = 'edit-refusals';
  const pipeline = el('div', undefined, 'refusals');
  pipeline.id = 'edit-pipeline';
  const notice = el('div', undefined, 'notice');
  notice.id = 'edit-notice';
  const link = el('input', undefined, 'link');
  link.id = 'edit-link-text';
  link.readOnly = true;
  link.addEventListener('focus', () => link.select());
  body.append(title, list, listActions, fields, actions, held, refusals, pipeline);

  for (const input of [loadInput, startLoad]) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      let text: string;
      try {
        text = await file.text();
      } catch (e) {
        // Journal decision 198, N6: a file that cannot be read is told about, not left as an unhandled rejection.
        handlers.onLoadFailed(file.name, errorMessage(e));
        return;
      }
      handlers.onLoadFile(text, file.name);
    });
  }

  // The notice and the link outlive a draft: a refused link or file is told about before any draft is on show.
  host.replaceChildren(start, body, notice, link);

  // ---- Patching -----------------------------------------------------------------------------------------------------------

  const setField = (f: Field, value: string): void => { if (f.value !== value) f.value = value; };
  const mark = (f: Element, refusal: Refusal | undefined): void => {
    f.classList.toggle('invalid', refusal !== undefined);
    if (refusal) f.setAttribute('title', refusal.text);
    else f.removeAttribute('title');
  };

  /** The first refusal that points at field `name` of Ring `r` (and, when `side` is given, at that side). */
  const refusalAt = (v: PanelView, r: number | null, name: FieldName, side?: RingSide): Refusal | undefined =>
    v.refusals.find(x => x.ring === r && x.field === name && (side === undefined || x.side === side));

  const ringRows: RingRow[] = [];

  function patchList(v: PanelView, d: Draft): void {
    const rings = d.fixture.rings;
    while (ringRows.length > rings.length) ringRows.pop()?.row.remove();
    while (ringRows.length < rings.length) {
      const i = ringRows.length;
      const row = el('div', undefined, 'ring-row');
      const pick = el('button', undefined, 'ring-pick');
      pick.type = 'button';
      pick.addEventListener('click', () => act({kind: 'select', ring: i}));
      const up = button('▲', 'Earlier in the order: the lowest index wins a contested wall', () => act({kind: 'moveRing', ring: i, direction: -1}));
      const down = button('▼', 'Later in the order', () => act({kind: 'moveRing', ring: i, direction: 1}));
      const dup = button('Dup', 'Duplicate this Ring', () => act({kind: 'duplicateRing', ring: i}));
      const rm = button('×', 'Remove this Ring', () => act({kind: 'removeRing', ring: i}));
      row.append(pick, up, down, dup, rm);
      list.append(row);
      ringRows.push({row, pick, up, down});
    }
    rings.forEach((r, i) => {
      const {row, pick, up, down} = ringRows[i];
      const top = r.baseStorey + r.storeys - 1;
      pick.textContent = `${i}: [${r.rect.map(num).join(', ')}] storey ${r.baseStorey}${top > r.baseStorey ? `-${top}` : ''}`;
      row.classList.toggle('sel', d.selected === i);
      mark(row, v.refusals.find(x => x.ring === i));
      up.disabled = i === 0;
      down.disabled = i === rings.length - 1;
    });
  }

  function patchFields(v: PanelView): void {
    const d = v.draft;
    if (!d) return;
    const r = d.selected;
    const ringData = r === null ? undefined : d.fixture.rings[r];
    fields.hidden = !ringData;
    setField(heightField, num(d.fixture.storeyHeight));
    mark(heightField, refusalAt(v, null, 'storeyHeight'));
    if (!ringData || r === null) return;
    fieldsTitle.textContent = `Ring ${r}`;
    rectFields.forEach((f, i) => setField(f, num(ringData.rect[i])));
    for (const f of rectFields) { f.step = String(d.fixture.cellSize); mark(f, refusalAt(v, r, 'rect')); }
    setField(baseField, num(ringData.baseStorey));
    mark(baseField, refusalAt(v, r, 'baseStorey'));
    setField(storeysField, num(ringData.storeys));
    mark(storeysField, refusalAt(v, r, 'storeys'));
    setField(defaultField, num(ringData.defaultDeg));
    mark(defaultField, refusalAt(v, r, 'defaultDeg'));
    const resolved = resolveSides(ringData);
    for (const side of RING_SIDES) {
      const own = ringData.sides?.[side];
      const row = sideRows.get(side);
      if (!row) continue;
      setField(row.form, resolved[side].form);
      setField(row.pitch, num(resolved[side].deg));
      // Decision 14 as amended: a side that is not listed shows the Ring's default, greyed; a listed side has its own pitch.
      row.pitch.classList.toggle('default', own === undefined);
      row.form.classList.toggle('default', own === undefined);
      row.clear.disabled = own === undefined;
      mark(row.pitch, own ? refusalAt(v, r, 'sidePitch', side) : refusalAt(v, r, 'defaultDeg', side));
      patchRuns(v, r, d, side, row);
    }
  }

  /** One new stretch row of side `side`, wired to stretch `k` (rows are reused by index, so the index never goes stale). */
  function makeRunRow(side: RingSide, k: number): RunRow {
    const row = el('div', undefined, 'row run');
    const id = `ring-side-${side}-run-${k}`;
    // The boundary a stretch starts at is shared with the one before it: moving it moves both (journal decision 214).
    const from = numberField(`${id}-from`, 50, v => withRing(r => ({kind: 'moveBoundary', ring: r, side, run: k, value: v})), resync);
    const to = el('span', undefined, 'to');
    to.id = `${id}-to`;
    const form = el('select');
    form.id = `${id}-form`;
    for (const f of RING_FORMS) form.append(new Option(f, f));
    form.addEventListener('change', () => {
      const chosen = formOf(form.value);
      if (chosen) withRing(r => ({kind: 'setStretchForm', ring: r, side, run: k, form: chosen}));
    });
    const pitch = numberField(`${id}-deg`, PITCH_STEP_DEG, v => withRing(r => ({kind: 'setStretchPitch', ring: r, side, run: k, value: v})), resync);
    const split = button('Split', 'Split this stretch: the other form in its middle third', () => withRing(r => ({kind: 'splitStretch', ring: r, side, run: k})), `${id}-split`);
    const halve = button('Halve', HALVE_TITLE, () => withRing(r => ({kind: 'halveStretch', ring: r, side, run: k})), `${id}-halve`);
    const note = el('span', undefined, 'hint');
    const gable = makeGableControls(side, k, id);
    row.append(labelled(k === 0 ? 'from' : 'starts at', from), ' to ', to, form, pitch, split, halve, note, gable.line);
    return {row, from, to, form, pitch, split, halve, gable, note};
  }

  /**
   * Per-stretch gable settings decision 16: a gable stretch's maximum height (cm above its plate, empty for none), its facing
   * strategy, one option per entry of `RISE_FACINGS`, and its "stands apart" tick, on a line under the stretch's own.
   */
  function makeGableControls(side: RingSide, k: number, id: string): GableControls {
    const line = el('div', undefined, 'gable-settings');
    const maxHeight = optionalNumberField(`${id}-max-height`, 10, v => withRing(r => ({kind: 'setStretchMaxHeight', ring: r, side, run: k, value: v})), resync);
    maxHeight.title = 'The most this gable may stand above its plate, in cm; empty for no limit but its own rakes';
    const facing = el('select');
    facing.id = `${id}-facing`;
    facing.title = 'How this gable decides whether it runs through to a gable opposite or is stopped by the slope there';
    for (const f of RISE_FACINGS) facing.append(new Option(f, f));
    facing.addEventListener('change', () => {
      const chosen = facingOf(facing.value);
      if (chosen) withRing(r => ({kind: 'setStretchFacing', ring: r, side, run: k, facing: chosen}));
    });
    const apart = el('input');
    apart.type = 'checkbox';
    apart.id = `${id}-apart`;
    apart.addEventListener('change', () => withRing(r => ({kind: 'setStretchApart', ring: r, side, run: k, apart: apart.checked})));
    const apartLabel = el('label', undefined, 'inline');
    apartLabel.title = 'Its own gable: never merged with an equal gable stretch beside it';
    apartLabel.append(apart, ' stands apart');
    // Journal decision 257: a maximum height too low for a gable to be built is said beside its field; the draft still builds.
    const tooLow = el('span', CAP_TOO_LOW_NOTE, 'hint warn');
    tooLow.id = `${id}-max-height-note`;
    line.append(labelled('max height (cm)', maxHeight), tooLow, labelled('facing', facing), apartLabel);
    return {line, maxHeight, tooLow, facing, apart};
  }

  /** Shows one side's stretches: where it starts and how long it is, a row for each stretch of a split side, and which the wire refuses. */
  function patchRuns(v: PanelView, r: number, d: Draft, side: RingSide, row: SideRow): void {
    const ringData = d.fixture.rings[r];
    const runs = ringData.sides?.[side]?.runs ?? [];
    const split = runs.length > 0;
    while (row.runRows.length > runs.length) row.runRows.pop()?.row.remove();
    while (row.runRows.length < runs.length) {
      const made = makeRunRow(side, row.runRows.length);
      row.runList.append(made.row);
      row.runRows.push(made);
    }
    const length = sideLengthCm(ringData.rect, side);
    row.summary.textContent = split ? `Stretches (${runs.length})` : 'Stretches';
    row.where.textContent = `In cm from the side's ${RUN_START[side]}; its length is ${num(length)} cm.${split ? ' The side\'s own form and pitch follow its stretches.' : ''}`;
    if (split) row.runs.open = true;
    // On a split side the stretches are the truth: the side's own controls do not act (journal decision 214).
    row.form.disabled = split;
    row.pitch.disabled = split;
    const plainShort = !split && !canSplitStretch(d.fixture, r, side, 0);
    row.splitPlain.hidden = split;
    row.splitPlain.disabled = plainShort;
    // Per-stretch gable settings decision 18: a plain gable side is one gable stretch, and halves into two that stand apart.
    row.halvePlain.hidden = split || resolveSides(ringData)[side].form !== 'gable';
    row.halvePlain.disabled = plainShort || !canHalveStretch(d.fixture, r, side, 0);
    row.tooShort.hidden = !plainShort;
    mark(row.summary, v.refusals.find(x => x.ring === r && x.side === side && x.field === 'side'));
    runs.forEach((run, k) => {
      const rr = row.runRows[k];
      setField(rr.from, num(run.from));
      rr.from.disabled = k === 0;
      rr.to.textContent = num(run.to);
      setField(rr.form, run.form);
      setField(rr.pitch, num(run.deg ?? ringData.sides?.[side]?.deg ?? ringData.defaultDeg));
      mark(rr.row, v.refusals.find(x => x.ring === r && x.field === 'run' && x.side === side && x.run === k));
      const short = !canSplitStretch(d.fixture, r, side, k);
      rr.split.disabled = short;
      rr.note.hidden = !short;
      rr.note.textContent = short ? 'too short to split' : '';
      // Per-stretch gable settings decision 16: a gable stretch shows its three settings and Halve; a hip stretch shows none.
      const gable = run.form === 'gable';
      rr.halve.hidden = !gable;
      rr.halve.disabled = !canHalveStretch(d.fixture, r, side, k);
      rr.gable.line.hidden = !gable;
      // A field holding text that is no number reads as '' already, so it is cleared outright.
      if (rr.gable.maxHeight.validity.badInput) rr.gable.maxHeight.value = '';
      setField(rr.gable.maxHeight, run.maxHeight === undefined ? '' : num(run.maxHeight));
      rr.gable.tooLow.hidden = !capTooLowToBuild(run);
      setField(rr.gable.facing, run.facing ?? DEFAULT_RISE_FACING);
      rr.gable.apart.checked = run.apart === true;
    });
  }

  function patchMessages(v: PanelView): void {
    refusals.replaceChildren();
    if (v.draft && v.refusals.length) {
      refusals.append(el('div', 'The wire refuses this draft, so it is not built:', 'bad'));
      const ul = el('ul', undefined, 'bad');
      for (const x of v.refusals) ul.append(el('li', x.text));
      refusals.append(ul);
    }
    held.hidden = v.held === null || v.draft === null;
    heldText.textContent = v.held ?? '';
    pipeline.replaceChildren();
    if (v.pipelineMessage !== null) pipeline.append(el('div', `The pipeline refuses this draft; the last good build is shown dimmed: ${v.pipelineMessage}`, 'bad'));
    notice.textContent = v.notice?.text ?? '';
    notice.className = v.notice?.bad ? 'notice bad' : 'notice';
    link.hidden = v.link === null;
    link.value = v.link ?? '';
  }

  let lastDraft: Draft | null | undefined;
  return {
    render(next: PanelView): void {
      view = next;
      const d = next.draft;
      start.hidden = d !== null;
      body.hidden = d === null;
      editButton.hidden = next.editable === null;
      if (next.editable !== null) editButton.textContent = `Edit ${next.editable} as a draft`;
      if (!d) { lastDraft = d; patchMessages(next); return; }
      // The fields are patched only when the draft is a new one (its refusals come from it), never on a message alone: a
      // build that ends while the user types in a field must not take the typed text away.
      if (d !== lastDraft) {
        title.textContent = `${d.fixture.name}${d.validation.ok ? '' : ' (invalid)'}`;
        title.classList.toggle('bad', !d.validation.ok);
        patchList(next, d);
        patchFields(next);
        undoButton.disabled = !canUndo(d);
        redoButton.disabled = !canRedo(d);
        downloadButton.disabled = !d.validation.ok;
        linkButton.disabled = !d.validation.ok;
        downloadButton.title = d.validation.ok ? 'Save the draft as an input@1 file' : 'The wire refuses this draft, so it cannot be saved as input@1';
      }
      lastDraft = d;
      patchMessages(next);
    },
  };
}
