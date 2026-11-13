// Viewer editing decisions 10, 13, 14 and 16: the panel's DOM. It is the only new file that touches the document, and it
// decides nothing: a control turns into a `DraftAction` (`draft.ts` applies it) and the panel shows what `draft.ts` says.
//
// The DOM is built once and patched, never rebuilt, because a control that is replaced between a mouse-down and the
// mouse-up loses its click: a field commits on its `change`, which a click elsewhere fires on the way in (decision 10).
// Only the Ring list grows and shrinks, at its tail, so each row's buttons keep their element and their index.
import {errorMessage} from '../errors.ts';
import {RING_FORMS, RING_SIDES} from '../fixture.ts';
import type {FixtureRing, RingForm, RingSide} from '../fixture.ts';
import type {Draft, DraftAction, FieldName, Refusal} from './draft.ts';
import {canRedo, canUndo, resolveSides} from './draft.ts';
import {PITCH_STEP_DEG, canSplitStretch, sideLengthCm} from './edit.ts';

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

/** Where a side's runs are measured from and which way they run (gable rise decision 1: every side runs counter-clockwise). */
const RUN_START: Record<RingSide, string> = {
  S: 'west end (x0), running east',
  E: 'south end (y0), running north',
  N: 'east end (x1), running west',
  W: 'north end (y1), running south',
};

/** One run's controls. */
interface RunRow { row: HTMLElement; from: HTMLInputElement; to: HTMLElement; form: HTMLSelectElement; pitch: HTMLInputElement; split: HTMLButtonElement; note: HTMLElement }

/** One side's controls, and its run list (journal decision 210). */
interface SideRow {
  form: HTMLSelectElement; pitch: HTMLInputElement; clear: HTMLButtonElement;
  runs: HTMLDetailsElement; summary: HTMLElement; where: HTMLElement; runRows: RunRow[]; runList: HTMLElement; splitPlain: HTMLButtonElement; tooShort: HTMLElement;
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
    const tooShort = el('span', 'too short to split: a stretch needs two whole cells', 'hint');
    runs.append(summary, where, runList, splitPlain, ' ', tooShort);
    sides.append(row, runs);
    sideRows.set(side, {form, pitch, clear, runs, summary, where, runRows: [], runList, splitPlain, tooShort});
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
    const note = el('span', undefined, 'hint');
    row.append(labelled(k === 0 ? 'from' : 'starts at', from), ' to ', to, form, pitch, split, note);
    return {row, from, to, form, pitch, split, note};
  }

  /** What the panel says of a stretch that holds a rise's limits, which `input@1` cannot carry. */
  const LIMITS_NOTE = 'keeps a rise limit (maxHeight or limit) that Download and Copy link both drop';

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
      // `maxHeight` and `limit` have no field in input@1: they stay in memory, and the panel says so where they are held.
      const limits = run.maxHeight !== undefined || run.limit !== undefined;
      rr.note.hidden = !limits && !short;
      rr.note.textContent = [short ? 'too short to split' : '', limits ? LIMITS_NOTE : ''].filter(Boolean).join('; ');
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
