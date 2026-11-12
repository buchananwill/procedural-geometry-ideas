// Viewer editing decisions 10, 13, 14 and 16: the panel's DOM. It is the only new file that touches the document, and it
// decides nothing: a control turns into a `DraftAction` (`draft.ts` applies it) and the panel shows what `draft.ts` says.
//
// The DOM is built once and patched, never rebuilt, because a control that is replaced between a mouse-down and the
// mouse-up loses its click: a field commits on its `change`, which a click elsewhere fires on the way in (decision 10).
// Only the Ring list grows and shrinks, at its tail, so each row's buttons keep their element and their index.
import {RING_SIDES} from '../fixture.ts';
import type {RingForm, RingSide} from '../fixture.ts';
import type {Draft, DraftAction, FieldName, Refusal} from './draft.ts';
import {canRedo, canUndo, resolveSides} from './draft.ts';
import {PITCH_STEP_DEG} from './edit.ts';

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
  onCopyLink(): void;
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

const RECT_LABELS = ['x0', 'y0', 'x1', 'y1'] as const;

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
  const rectFields = RECT_LABELS.map((name, coord) =>
    numberField(`ring-${name}`, 50, v => withRing(r => ({kind: 'setRectCoord', ring: r, coord: coord as 0 | 1 | 2 | 3, value: v})), resync));
  const baseField = numberField('ring-base-storey', 1, v => withRing(r => ({kind: 'setBaseStorey', ring: r, value: v})), resync);
  const storeysField = numberField('ring-storeys', 1, v => withRing(r => ({kind: 'setStoreys', ring: r, value: v})), resync);
  const defaultField = numberField('ring-default-deg', PITCH_STEP_DEG, v => withRing(r => ({kind: 'setDefaultDeg', ring: r, value: v})), resync);
  const labelled = (text: string, f: Field): HTMLLabelElement => { const l = el('label', `${text} `, 'inline'); l.append(f); return l; };
  const rectRow = el('div', undefined, 'row');
  rectFields.forEach((f, i) => rectRow.append(labelled(RECT_LABELS[i], f)));
  const storeyRow = el('div', undefined, 'row');
  storeyRow.append(labelled('base storey', baseField), labelled('storeys', storeysField), labelled('default pitch', defaultField));

  const sideRows = new Map<RingSide, {form: HTMLSelectElement; pitch: HTMLInputElement; clear: HTMLButtonElement}>();
  const sides = el('div', undefined, 'sides');
  for (const side of RING_SIDES) {
    const row = el('div', undefined, 'row side');
    const form = el('select');
    form.id = `ring-side-${side}-form`;
    for (const f of ['hip', 'gable'] as const) form.append(new Option(f, f));
    form.addEventListener('change', () => withRing(r => ({kind: 'setSideForm', ring: r, side, form: form.value as RingForm})));
    const pitch = numberField(`ring-side-${side}-deg`, PITCH_STEP_DEG, v => withRing(r => ({kind: 'setSidePitch', ring: r, side, value: v})), resync);
    const clear = button('Default', 'Clear this side back to a hip at the default pitch', () => withRing(r => ({kind: 'clearSide', ring: r, side})), `ring-side-${side}-clear`);
    row.append(el('span', side, 'side-name'), form, pitch, clear);
    sides.append(row);
    sideRows.set(side, {form, pitch, clear});
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
  body.append(title, list, listActions, fields, actions, refusals, pipeline);

  for (const input of [loadInput, startLoad]) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) handlers.onLoadFile(await file.text(), file.name);
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

  function patchList(v: PanelView, d: Draft): void {
    const rings = d.fixture.rings;
    while (list.children.length > rings.length) list.lastElementChild?.remove();
    while (list.children.length < rings.length) {
      const i = list.children.length;
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
    }
    rings.forEach((r, i) => {
      const row = list.children[i] as HTMLElement;
      const pick = row.querySelector('.ring-pick') as HTMLButtonElement;
      const top = r.baseStorey + r.storeys - 1;
      pick.textContent = `${i}: [${r.rect.map(num).join(', ')}] storey ${r.baseStorey}${top > r.baseStorey ? `-${top}` : ''}`;
      row.classList.toggle('sel', d.selected === i);
      const bad = v.refusals.find(x => x.ring === i);
      mark(row, bad);
      const [, up, down] = Array.from(row.querySelectorAll('button'));
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
      // Decision 14: the pitch shows the default, greyed, until the side has one of its own.
      row.pitch.classList.toggle('default', own?.deg === undefined);
      row.form.classList.toggle('default', own === undefined);
      row.clear.disabled = own === undefined;
      mark(row.pitch, refusalAt(v, r, 'sidePitch', side) ?? (own?.deg === undefined ? refusalAt(v, r, 'defaultDeg', side) : undefined));
    }
  }

  function patchMessages(v: PanelView): void {
    refusals.replaceChildren();
    if (v.draft && v.refusals.length) {
      refusals.append(el('div', 'The wire refuses this draft, so it is not built:', 'bad'));
      const ul = el('ul', undefined, 'bad');
      for (const x of v.refusals) ul.append(el('li', x.text));
      refusals.append(ul);
    }
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
