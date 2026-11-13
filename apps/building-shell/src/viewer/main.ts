// The viewer page (spec decisions 26 to 30): loads manifold-3d's WASM in the browser, runs the pipeline live on the
// selected fixture and wires the side panel to the scene. `buildShellDetailed` is `buildShell` with its intermediate
// records kept, which the viewer needs for the raw parts and the face-to-triangle map; `buildShell` itself is
// `(await buildShellDetailed(f)).shell`.
import {errorMessage} from '../errors.ts';
import {PORT_FIXTURES, RING_CONFLICT_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES, ShellFixture, storeysOf} from '../fixture.ts';
import {ShellBuild, buildShellDetailed} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {readInput} from '../wire/input-adapter.ts';
import {GOLDEN_DIR_URL, InputFile, LoadedInput, catalogueGroups, choosableCount, filterCatalogue, goldenInputFiles, playtestFiles} from './catalogue.ts';
import {DefectCase, focusOfCase, parseDefectCases} from './defect-cases.ts';
import {
  Draft, DraftAction, RestoredDraft, TALL_STOREY_SUM, blankDraft, buildGate, dispatch, draftFixtureOfJson, draftJson, editDraftOf, explainRefusals,
  fixtureToBuild, heldMessage, isDirty, keepStoreys, makeDraft, parseDraftJson, restoreDraft, ringOfHit, saveMark, serializeDraft, storeySum,
} from './draft.ts';
import {EditPanel, Notice, mountEditPanel} from './edit-panel.ts';
import {ringBox} from './edit.ts';
import {DRAFT_HASH, Selection, SelectionSources, draftLinkHash, selectionFromHash, selectionName} from './hash.ts';
import {LegendEntry, LegendGroup, legendEntries} from './legend.ts';
import {cssColour} from './palette.ts';
import {Hit, readoutSections} from './readout.ts';
import {RESEARCH_ENTRIES, RESEARCH_FIXTURES, researchNote} from './research-cases.ts';
import {CATALOGUE_FACTS} from './catalogue-facts.ts';
import {PINNED_CASES, pinnedDraftSource, pinnedFixture, pinnedFocus, pinnedNote} from './pinned-cases.ts';
import {ScreenPoint, ShellScene} from './scene.ts';
import {
  LAYER_KEYS, LayerKey, ToggleState, makeToggles, setHighlightPartial, setLayer, setNetKindOutlines, setRaw, setStorey, withStoreys,
} from './toggles.ts';

/** The page's test hook: lets a browser test project a known world point to the page and read the current state. */
export interface ViewerHook {
  readonly build: ShellBuild | undefined;
  /** The draft held by the editor, shown or not (viewer editing decision 18). */
  readonly draft: Draft | null;
  readonly toggles: ToggleState;
  project(p: Readonly<Vec3>): ScreenPoint;
  setView(position: Readonly<Vec3>, target: Readonly<Vec3>): void;
}

declare global {
  interface Window { __viewer?: ViewerHook }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no #${id}`);
  return el as T;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

const LAYER_LABEL: Record<LayerKey, string> = {faces: 'Faces', edges: 'Edges', vertices: 'Vertices', cellOutlines: 'Cell outlines'};

let build: ShellBuild | undefined;
/** The draft fixture `build` was made from, so a click maps to a Ring only while the draft has not moved on (decision 15). */
let builtFixture: ShellFixture | undefined;
let toggles: ToggleState = makeToggles([]);
let pinned: Hit | null = null;
let hovered: Hit | null = null;
let token = 0;

const scene = new ShellScene($('view'), {
  onHover: hit => { hovered = hit; renderReadouts(); },
  onClick: hit => {
    pinned = hit;
    renderReadouts();
    selectRingOf(hit);
  },
});

// ---- Readouts -----------------------------------------------------------------------------------------------------

function fillReadout(box: HTMLElement, hit: Hit | null, emptyText: string): void {
  box.replaceChildren();
  const sections = build && hit ? readoutSections(build, hit) : [];
  if (!sections.length) { box.append(el('span', emptyText, 'empty')); return; }
  for (const lines of sections) {
    const p = el('p');
    lines.forEach((l, i) => p.append(el('span', l, i === 0 ? 'line title' : 'line')));
    box.append(p);
  }
}

function renderReadouts(): void {
  const box = $('pinned');
  box.hidden = !pinned;
  if (pinned) {
    fillReadout(box, pinned, '');
    box.prepend(el('div', 'Pinned', 'empty'));
  }
  fillReadout($('hover'), hovered, 'Hover a face, Cell, Edge or vertex.');
}

// ---- Panel --------------------------------------------------------------------------------------------------------

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void, id: string): HTMLLabelElement {
  const l = el('label', undefined, 'toggle');
  const c = el('input');
  c.type = 'checkbox';
  c.checked = checked;
  c.id = id;
  c.addEventListener('change', () => onChange(c.checked));
  l.append(c, document.createTextNode(label));
  return l;
}

function apply(next: ToggleState): void {
  toggles = next;
  scene.setToggles(toggles);
  renderLegend();
}

function renderToggles(): void {
  const layers = $('layers');
  layers.replaceChildren();
  for (const key of LAYER_KEYS) layers.append(checkbox(LAYER_LABEL[key], toggles.layers[key], on => apply(setLayer(toggles, key, on)), `layer-${key}`));
  layers.append(el('br'));
  layers.append(checkbox('Highlight partial Cells (tint)', toggles.highlightPartial, on => apply(setHighlightPartial(toggles, on)), 'highlight-partial'));
  layers.append(el('br'));
  layers.append(checkbox('Raw mode (ghost every raw part, before the union)', toggles.raw, on => apply(setRaw(toggles, on)), 'raw'));
  layers.append(el('br'));
  layers.append(checkbox('Colour Cell outlines by NetEdge kind', toggles.netKindOutlines, on => apply(setNetKindOutlines(toggles, on)), 'net-kind'));
  const storeys = $('storeys');
  storeys.replaceChildren(el('span', 'Storeys: ', 'hint'));
  for (const s of Object.keys(toggles.storeys).map(Number)) {
    storeys.append(checkbox(`Storey ${s}`, toggles.storeys[s], on => apply(setStorey(toggles, s, on)), `storey-${s}`));
  }
}

function countText(e: LegendEntry): string {
  if (e.count === null) return '';
  if (e.netCount !== undefined) return `${e.count} Edges, ${e.netCount} net sides`;
  return e.note === undefined || e.note === 'translucent' ? `${e.count}` : `${e.count} ${e.note}`;
}

function renderLegend(): void {
  const box = $('legend');
  box.replaceChildren();
  if (!build) return;
  const table = el('table');
  let group: LegendGroup | undefined;
  for (const e of legendEntries(build, toggles)) {
    if (e.group !== group) {
      group = e.group;
      const tr = el('tr');
      const th = el('th', group);
      th.colSpan = 2;
      tr.append(th);
      table.append(tr);
    }
    const tr = el('tr');
    if (e.group === 'Defects' && e.count === 0 && !e.netCount) tr.className = 'zero';
    const name = el('td');
    const sw = el('span', undefined, 'swatch');
    sw.style.background = cssColour(e.colour);
    if (e.casing !== undefined) sw.style.border = `3px solid ${cssColour(e.casing)}`;
    if (e.note === 'translucent') sw.style.opacity = '0.5';
    name.append(sw, document.createTextNode(e.label));
    tr.append(name, el('td', countText(e), 'count'));
    table.append(tr);
  }
  box.append(table);
}

function renderReport(b: ShellBuild): void {
  const r = b.shell.report;
  const box = $('report');
  box.replaceChildren();
  const dl = el('dl');
  const item = (name: string, value: string | string[], bad = false): void => {
    dl.append(el('dt', name));
    const dd = el('dd');
    if (Array.isArray(value)) {
      if (!value.length) dd.textContent = 'none';
      else {
        const ul = el('ul');
        for (const v of value) ul.append(el('li', v));
        dd.append(ul);
      }
    } else dd.textContent = value;
    if (bad) dd.className = 'bad';
    dl.append(dd);
  };
  item('Manifold status', `${b.union.status}; ${b.union.closed ? 'closed' : 'NOT closed'}; genus ${b.union.genus}`, b.union.status !== 'NoError' || !b.union.closed);
  item(`conflicts (${r.conflicts.length})`, r.conflicts);
  item('survivingInternal', String(r.survivingInternal), r.survivingInternal > 0);
  item('unclassifiedEdges', String(r.unclassifiedEdges), r.unclassifiedEdges > 0);
  item('cheeks', String(r.cheeks));
  item('partialCells', String(r.partialCells));
  item('newEdgeKinds', r.newEdgeKinds);
  item('newConventions', r.newConventions);
  box.append(dl);
  const details = el('details');
  details.append(el('summary', 'ShellReport as JSON'));
  const pre = el('pre', JSON.stringify(r, null, 1));
  pre.id = 'report-json';
  details.append(pre);
  box.append(details);
}

// ---- Defect cases (journal decision 169) --------------------------------------------------------------------------------

/** The defect cases, read from `golden/manifest.json` at start-up. Empty when the manifest could not be read. */
let cases: DefectCase[] = [];

/** How a loaded case ended, for the case box: a line of text, and whether it is bad news. */
interface CaseOutcome { text: string; bad: boolean }

/** The case box: the entry's residue class, its pinned violations, and how the load ended. */
function renderCaseBox(c: DefectCase | undefined, outcome?: CaseOutcome): void {
  const box = $('case');
  box.replaceChildren();
  box.hidden = !c;
  if (!c) return;
  box.append(el('div', c.name, 'title'));
  box.append(el('div', `residue class: ${c.residueClass}`, 'line'));
  if (c.violations.length) {
    box.append(el('div', 'Pinned violations:', 'line dim'));
    const ul = el('ul');
    for (const v of c.violations) ul.append(el('li', v));
    box.append(ul);
  } else box.append(el('div', c.error === undefined ? 'No violations pinned.' : 'No violations pinned: the entry pins a build error instead.', 'line dim'));
  if (c.error !== undefined) box.append(el('div', `Pinned build error: ${c.error}`, 'line bad'));
  if (outcome) box.append(el('div', outcome.text, outcome.bad ? 'line bad' : 'line dim'));
}

/** A case with no input file: not a failed build, so its message is shown as it stands. */
class CaseUnloadable extends Error {}

/** The input file a case or a file selection reads: a defect case's `golden/<name>.input.json`, or the file itself. */
function inputFileOf(sel: FileBackedSelection): InputFile {
  if (sel.kind === 'file') return sel.file;
  const c = sel.defect;
  if (c.input === undefined) {
    const why = c.reasons.length ? c.reasons.join('; ') : 'the manifest gives no reason';
    throw new CaseUnloadable(`${c.name} cannot be loaded: it has no golden/*.input.json, because it is not C++-replayable (${why})`);
  }
  return {name: c.name, path: `${GOLDEN_DIR_URL}${c.input}`};
}

/** A file-backed selection's `input@1` file, as parsed. Throws, with the reason, when it cannot be had. */
async function inputOf(sel: FileBackedSelection): Promise<LoadedInput> {
  const file = inputFileOf(sel);
  const res = await fetch(new URL(file.path, document.baseURI));
  if (!res.ok) throw new Error(`${file.path}: ${res.status} ${res.statusText}`);
  return {file, json: await res.json()};
}

/** A file-backed selection's fixture, read from its input file. Throws, with the reason, when it cannot be. */
async function fixtureOfFile(sel: FileBackedSelection): Promise<ShellFixture> {
  const {file, json} = await inputOf(sel);
  const read = readInput(json, file.name);
  if (!read.ok) throw new Error(`readInput refuses ${file.path}: ${read.errors.join('; ')}`);
  return read.fixture;
}

/** Journal decision 198, N2: a case's fixture as a draft starts from it, by the reconstruction a loaded file goes through. */
async function draftFixtureOfFile(sel: FileBackedSelection): Promise<ShellFixture> {
  const {file, json} = await inputOf(sel);
  const read = draftFixtureOfJson(json, file.name);
  if (!read.ok) throw new Error(`readInput refuses ${file.path}: ${read.errors.join('; ')}`);
  return read.fixture;
}

/** WP-V1: the clean goldens with a committed input that no listed fixture names, read from the manifest at start-up. */
let goldens: InputFile[] = [];
/** WP-V1: the playtest seeds. */
const seeds: readonly InputFile[] = playtestFiles();
/** Every fixture read from a committed input file, which a `#hash` may name. */
let files: readonly InputFile[] = seeds;

async function loadManifest(): Promise<void> {
  try {
    const res = await fetch(new URL(`${GOLDEN_DIR_URL}manifest.json`, document.baseURI));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const manifest: unknown = await res.json();
    cases = parseDefectCases(manifest);
    goldens = goldenInputFiles(manifest, new Set(LISTED_FIXTURES.map(f => f.name)));
    files = [...goldens, ...seeds];
  } catch (e) {
    cases = [];
    console.error('golden/manifest.json could not be read', e);
    $('manifest-note').textContent = `Defect cases and goldens unavailable: golden/manifest.json could not be read (${errorMessage(e)}).`;
  }
}

// ---- Loading ------------------------------------------------------------------------------------------------------

/** Shows a load or build that failed: only its error, with no stale shell behind it. `message` names the fixture. */
function showFailure(message: string, defect?: DefectCase): void {
  console.error(message);
  // Journal decision 98, F8: a failed build leaves no stale shell behind, only its error.
  build = undefined;
  builtFixture = undefined;
  pinned = null;
  hovered = null;
  scene.clearBuild();
  // A draft's refused build leaves the canvas dimmed (viewer editing decision 8); a failure shows nothing, so nothing is dimmed.
  scene.setDimmed(false);
  const status = $('status');
  status.textContent = message;
  status.style.color = 'var(--bad)';
  $('report').replaceChildren(el('div', message, 'bad'));
  $('legend').replaceChildren();
  $('buildline').textContent = '';
  renderCaseBox(defect, {text: `Nothing is drawn: ${message}`, bad: true});
  renderReadouts();
}

/** A selection that is loaded and built whole: a roster fixture, a defect case or an input file. A draft is built by `buildDraft`. */
type LoadSelection = Exclude<Selection, {kind: 'draft'}>;

/** A selection read from an `input@1` file: a defect case or an input file. */
type FileBackedSelection = Extract<Selection, {kind: 'case' | 'file'}>;

async function load(sel: LoadSelection): Promise<void> {
  const mine = ++token;
  const name = selectionName(sel);
  const defect = sel.kind === 'case' ? sel.defect : undefined;
  const status = $('status');
  status.style.color = '';
  status.textContent = `Building ${name}...`;
  $('buildline').textContent = '';
  renderCaseBox(defect);
  renderFixtureNote(sel);
  let stage = 'build failed';
  try {
    let fixture: ShellFixture;
    if (sel.kind === 'fixture') fixture = sel.fixture;
    else if (sel.kind === 'pinned') {
      // WP-V2: drawn from the generator its pin table's sweep uses, as the suite draws it.
      stage = 'generation failed';
      fixture = pinnedFixture(sel.pinned);
      stage = 'build failed';
    } else {
      stage = 'load failed';
      fixture = await fixtureOfFile(sel);
      stage = 'build failed';
      // Another selection came while the file was fetched: this one is not built at all (WP-V1.1, N4).
      if (mine !== token) return;
    }
    const t0 = performance.now();
    const built = await buildShellDetailed(fixture);
    if (mine !== token) return;
    const ms = Math.round(performance.now() - t0);
    build = built;
    builtFixture = undefined;
    pinned = null;
    hovered = null;
    toggles = withStoreys(toggles, storeysOf(fixture));
    scene.setBuild(built, toggles, defect ? focusOfCase(defect) : sel.kind === 'pinned' ? pinnedFocus(sel.pinned) : undefined);
    renderToggles();
    renderLegend();
    renderReport(built);
    renderReadouts();
    const s = built.shell;
    $('buildline').textContent = `${s.faces.length} faces, ${s.edges.length} Edges, ${s.cells.length} Cells, ${s.vertices.length} vertices; built in ${ms} ms`;
    status.textContent = name;
    renderCaseBox(defect, defect?.error === undefined ? undefined : {text: 'The build succeeded, though the manifest pins an error: the pin has moved.', bad: true});
  } catch (e) {
    if (mine !== token) return;
    showFailure(e instanceof CaseUnloadable ? e.message : `${name}: ${stage}: ${errorMessage(e)}`, defect);
  }
}

// ---- Selector -----------------------------------------------------------------------------------------------------

const select = $<HTMLSelectElement>('fixture');

const filter = $<HTMLInputElement>('fixture-filter');

/** WP-V1: the selector's groups (`catalogue.ts`), narrowed by the filter box, the entry on show always kept. */
function fillSelector(): void {
  const groups = catalogueGroups({
    shell: SHELL_FIXTURES, rises: RISE_FIXTURES, conflicts: RING_CONFLICT_FIXTURES, port: PORT_FIXTURES,
    research: RESEARCH_ENTRIES, defects: cases, goldens, playtest: seeds, pinned: PINNED_CASES, facts: CATALOGUE_FACTS,
    draft: draft ? {value: DRAFT_OPTION, label: draft.fixture.name} : undefined,
  });
  const shown = current ? (current.kind === 'draft' ? DRAFT_OPTION : selectionName(current)) : undefined;
  const kept = filterCatalogue(groups, filter.value, shown);
  select.replaceChildren();
  for (const g of kept) {
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const e of g.entries) {
      const o = new Option(e.label, e.value);
      o.disabled = e.disabled === true;
      og.append(o);
    }
    select.append(og);
  }
  if (shown !== undefined) select.value = shown;
  const total = choosableCount(groups), listed = choosableCount(kept);
  $('filter-count').textContent = filter.value.trim() ? `${listed} of ${total} shown` : `${total} listed`;
}

/** WP-V1: the line under the selector naming a research case and how it was converted; WP-V2: a pinned case's pins. */
function renderFixtureNote(sel: Selection): void {
  if (sel.kind === 'pinned') {
    $('fixture-note').textContent = pinnedNote(sel.pinned);
    return;
  }
  const entry = sel.kind === 'fixture' ? RESEARCH_ENTRIES.find(e => e.name === sel.fixture.name) : undefined;
  $('fixture-note').textContent = entry ? researchNote(entry) : '';
}

/** Every fixture the selector lists by name: the roster, the gable rises, the Ring conflicts, the port's, the research cases. */
const LISTED_FIXTURES: readonly ShellFixture[] = [...SHELL_FIXTURES, ...RISE_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES, ...RESEARCH_FIXTURES];

/** The selector's value for the draft: no roster fixture or case has this name. */
const DRAFT_OPTION = 'draft';

/** What a `#hash` may name now: the listed fixtures, the defect cases, the saved draft and the input files. */
const hashSources = (): SelectionSources => ({fixtures: LISTED_FIXTURES, cases, saved: draft?.fixture, files, pinned: PINNED_CASES});

/** The selection a listed name stands for. */
function selectionNamed(name: string): Selection {
  return selectionFromHash(name === DRAFT_OPTION ? DRAFT_HASH : `#${encodeURIComponent(name)}`, hashSources());
}

/** The hash that names a selection in the address bar. A link is never written back: the draft is kept in storage. */
const hashOf = (sel: Selection): string => (sel.kind === 'draft' ? DRAFT_HASH : `#${encodeURIComponent(selectionName(sel))}`);

function show(sel: Selection): void {
  current = sel;
  // Anything still being fetched for the selection before this one is no longer wanted (journal decision 198, N1).
  selectionToken++;
  if (sel.kind !== 'draft') {
    showingDraft = false;
    pipelineMessage = null;
    link = null;
    notice = sel.kind === 'fixture' && sel.refusal ? {text: `The link was refused, and the first fixture is shown instead:\n${sel.refusal.join('\n')}`, bad: true} : null;
    scene.setRingBox(null);
    // The filter keeps what is on show (WP-V1), so the selector is refilled rather than only pointed at it.
    fillSelector();
    renderPanel();
    void load(sel);
    return;
  }
  if (sel.origin === 'link') {
    // Decision 20: a link is read through `readInput` by `selectionFromHash`. It replaces the saved draft, so work in it is asked about.
    if (draft && isDirty(draft) && !window.confirm('Replace your draft with the one this link carries?')) {
      history.replaceState(null, '', DRAFT_HASH);
      show({kind: 'draft', fixture: draft.fixture, origin: 'saved'});
      return;
    }
    startDraft(makeDraft(sel.fixture));
    history.replaceState(null, '', DRAFT_HASH);
    fillSelector();
  }
  showingDraft = true;
  // Journal decision 198, Low 1: a draft is no defect case, so the case box goes.
  renderCaseBox(undefined);
  // Decision 11: only choosing a different fixture re-frames the view. Turning the fixture on show into a draft keeps it.
  keepView = keepNext;
  keepNext = false;
  notice = null;
  link = null;
  $('fixture-note').textContent = '';
  fillSelector();
  syncRingBox();
  void buildDraft();
}

// ---- The draft (viewer editing proposal) -----------------------------------------------------------------------------------

/** Decision 18: where the draft is kept. The page renders without storage, so every access is guarded. */
const STORAGE_KEY = 'building-shell/draft@1';

/** Saves the draft, with the mark of a build that did not finish or is in progress whenever `saveMark` says so (journal decisions 198, M2, and 201). */
function saveDraft(): void {
  if (!draft) return;
  try {
    localStorage.setItem(STORAGE_KEY, serializeDraft(draft, saveMark({unfinished, buildsInFlight}, lastGood)));
  } catch (e) {
    console.warn('the draft could not be saved', e);
  }
}

function savedDraft(): RestoredDraft | undefined {
  try {
    return restoreDraft(localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/** The draft the editor holds, shown or not. */
let draft: Draft | null = null;
/** The draft that last built, which a build in progress is saved with so a reload can offer Undo to it. */
let lastGood: ShellFixture | undefined;
/** Journal decision 198, M2: a reload found the mark of a build that did not finish, and the draft has not changed since. */
let unfinished = false;
/** Journal decision 198, M2: the user has agreed to build this draft though its storeys sum above the limit. */
let confirmedTall = false;
/** Why the draft on show is held back from building, and the Build button that overrides it; null when nothing is. */
let held: string | null = null;
/** The draft builds started and not yet ended, so the mark is cleared only when none is left. */
let buildsInFlight = 0;
/** Bumped by every `show`, so an `await` that outlives its selection can tell (journal decision 198, N1). */
let selectionToken = 0;
/** Whether the draft is what the page shows. */
let showingDraft = false;
/** Whether the next build of the draft keeps the camera (decision 11); `keepNext` asks `show` to keep it for the draft it is about to show. */
let keepView = false;
let keepNext = false;
/** What is on show, which "Edit" turns into a draft. */
let current: Selection | undefined;
/** Decision 8: why the pipeline refused the draft that is on show, or null. */
let pipelineMessage: string | null = null;
let notice: Notice | null = null;
let link: string | null = null;

const panel: EditPanel = mountEditPanel($('edit'), {
  onAction: a => act(a),
  onEdit: () => void editCurrent(),
  onBlank: () => adopt(blankDraft()),
  onDownload: () => download(),
  onLoadFile: (text, filename) => loadFile(text, filename),
  onLoadFailed: (filename, message) => {
    notice = {text: `${filename} could not be read: ${message}`, bad: true};
    renderPanel();
  },
  onCopyLink: () => void copyLink(),
  onBuild: () => {
    unfinished = false;
    confirmedTall = true;
    void buildDraft();
  },
});

/** The name of the roster fixture or case on show, when it can become a draft. */
function editableName(): string | null {
  if (showingDraft || !current) return null;
  if (current.kind === 'fixture') return current.fixture.name;
  if (current.kind === 'file') return current.file.name;
  if (current.kind === 'pinned') return current.pinned.value;
  return current.kind === 'case' && current.defect.input !== undefined ? current.defect.name : null;
}

function renderPanel(): void {
  const d = showingDraft ? draft : null;
  panel.render({
    editable: editableName(),
    draft: d,
    refusals: d && !d.validation.ok ? explainRefusals(d.validation.errors, d.fixture) : [],
    pipelineMessage: showingDraft ? pipelineMessage : null,
    held: showingDraft ? held : null,
    notice,
    link,
  });
}

/** Decision 15: the selected Ring's box in the viewport. */
function syncRingBox(): void {
  scene.setRingBox(showingDraft && draft && draft.selected !== null ? ringBox(draft.fixture, draft.selected) : null);
}

/**
 * A new draft is held: nothing of the draft before it carries over (journal decision 198, Low 3), neither its build, nor
 * its history of good builds, nor what was agreed or marked about it.
 */
function startDraft(next: Draft): void {
  draft = next;
  builtFixture = undefined;
  lastGood = undefined;
  unfinished = false;
  confirmedTall = false;
  held = null;
  saveDraft();
}

/** Makes `next` the draft on show. Work in the draft it replaces is asked about first. */
function adopt(next: Draft): void {
  if (draft && isDirty(draft) && !window.confirm('Replace your draft?')) return;
  startDraft(next);
  fillSelector();
  history.replaceState(null, '', DRAFT_HASH);
  show({kind: 'draft', fixture: next.fixture, origin: 'saved'});
}

/** Decision 17: the roster fixture or defect case on show becomes a draft with one click. */
async function editCurrent(): Promise<void> {
  const sel = current;
  if (!sel || sel.kind === 'draft') return;
  const mine = selectionToken;
  try {
    const source = sel.kind === 'fixture' ? sel.fixture : sel.kind === 'pinned' ? pinnedDraftSource(sel.pinned) : await draftFixtureOfFile(sel);
    // The selection moved on while the case's file was fetched: this draft is not what is on show any more.
    if (mine !== selectionToken) return;
    const next = editDraftOf(source);
    keepNext = true;
    adopt(next);
    keepNext = false;
  } catch (e) {
    if (mine !== selectionToken) return;
    notice = {text: `${selectionName(sel)} cannot become a draft: ${errorMessage(e)}`, bad: true};
    renderPanel();
  }
}

/** Applies one panel action to the draft; a change to the fixture is saved and rebuilt, one to the selection only moves the Ring's box. */
function act(a: DraftAction): void {
  if (!draft) return;
  const was = draft;
  draft = dispatch(was, a);
  if (draft === was) return;
  notice = null;
  const changed = draft.fixture !== was.fixture;
  // A changed fixture is not the one whose build did not finish, nor the one the user agreed to build whole. This comes
  // before the save, which carries the mark only while `unfinished` holds.
  if (changed) unfinished = false;
  saveDraft();
  syncRingBox();
  if (!changed) {
    renderPanel();
    return;
  }
  if (a.kind === 'load') {
    fillSelector();
    // A loaded file is another building: no build of the old one stands behind it (journal decision 198, Low 3).
    builtFixture = undefined;
    lastGood = undefined;
    confirmedTall = false;
  }
  // Decision 11: an edit keeps the view. A loaded file is a different building, which is choosing a different fixture, so it frames.
  keepView = a.kind !== 'load';
  select.value = DRAFT_OPTION;
  renderPanel();
  void buildDraft();
}

/** Decision 15: a click on a Wall or Gable face selects the Ring its provenance names, when the build is the draft's current one. */
function selectRingOf(hit: Hit | null): void {
  if (!showingDraft || !draft || !build || !hit || builtFixture !== draft.fixture) return;
  const ring = ringOfHit(build, hit);
  if (ring !== null) act({kind: 'select', ring});
}

/**
 * Empties the viewport when the draft on show has no good build of its own, so a build of something else (the roster fixture it
 * came from, a draft left earlier) is never left standing behind it as if it were the draft's.
 */
function clearViewport(): void {
  build = undefined;
  pinned = null;
  hovered = null;
  scene.clearBuild();
  $('report').replaceChildren();
  $('legend').replaceChildren();
  $('buildline').textContent = '';
  renderReadouts();
}

/**
 * Decisions 7, 8, 10 and 11: builds the draft on show, on the main thread. A draft the wire refuses is not built and the
 * last good build stays; one the pipeline refuses keeps it too, dimmed; one that builds replaces it with the camera, the
 * toggles and the storey visibility kept.
 */
async function buildDraft(): Promise<void> {
  const d = draft;
  if (!d) return;
  const mine = ++token;
  const status = $('status');
  pipelineMessage = null;
  held = null;
  let gate = buildGate(d, {unfinished, confirmedTall});
  if (storeySum(d.fixture) <= TALL_STOREY_SUM) confirmedTall = false;
  // Journal decision 198, M2: a very tall draft asks first. Declining leaves it held, with Build to say yes later.
  if (gate === 'ask' && window.confirm(heldMessage(gate, d) ?? '')) {
    confirmedTall = true;
    gate = buildGate(d, {unfinished, confirmedTall});
  }
  const fixture = gate === 'build' ? fixtureToBuild(d) : undefined;
  if (!fixture) {
    held = heldMessage(gate, d);
    if (builtFixture === undefined) clearViewport();
    scene.setDimmed(false);
    status.style.color = 'var(--bad)';
    status.textContent = `${d.fixture.name}: ${gate === 'invalid' ? 'not built, the wire refuses it' : 'not built, held back'}`;
    renderPanel();
    return;
  }
  // Journal decision 198, M2: the mark goes to storage before the build starts, since a build that never returns cannot write it.
  buildsInFlight++;
  saveDraft();
  try {
    const t0 = performance.now();
    const built = await buildShellDetailed(fixture);
    if (mine !== token) return;
    const ms = Math.round(performance.now() - t0);
    build = built;
    builtFixture = d.fixture;
    lastGood = d.fixture;
    pinned = null;
    hovered = null;
    toggles = keepStoreys(toggles, storeysOf(fixture));
    scene.setBuild(built, toggles, undefined, {keepView});
    keepView = true;
    renderToggles();
    renderLegend();
    renderReport(built);
    renderReadouts();
    const s = built.shell;
    $('buildline').textContent = `${s.faces.length} faces, ${s.edges.length} Edges, ${s.cells.length} Cells, ${s.vertices.length} vertices; built in ${ms} ms`;
    status.style.color = '';
    status.textContent = d.fixture.name;
  } catch (e) {
    if (mine !== token) return;
    pipelineMessage = errorMessage(e);
    console.error(`${d.fixture.name}: build failed: ${pipelineMessage}`);
    if (builtFixture === undefined) clearViewport();
    else scene.setDimmed(true);
    status.style.color = 'var(--bad)';
    status.textContent = `${d.fixture.name}: build failed, the last good build is dimmed`;
  } finally {
    // Every start ends here, a superseded one too: the mark stays only while some build has not ended.
    buildsInFlight--;
    saveDraft();
  }
  renderPanel();
}

/** Decision 19: the draft as an `input@1` file. Only a draft the wire accepts is a file the port can ingest. */
function download(): void {
  const d = draft;
  if (!d || !d.validation.ok) return;
  const url = URL.createObjectURL(new Blob([draftJson(d.fixture)], {type: 'application/json'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.fixture.name}.input.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Decision 19: an `input@1` file read as a draft. A refused file is reported and changes nothing. */
function loadFile(text: string, filename: string): void {
  const read = parseDraftJson(text, filename.replace(/(\.input)?\.json$/i, ''));
  if (!read.ok) {
    notice = {text: `${filename} is refused:\n${read.errors.join('\n')}`, bad: true};
    renderPanel();
    return;
  }
  if (draft && showingDraft) {
    act({kind: 'load', fixture: read.fixture});
    notice = {text: `Loaded ${filename}; undo returns to the draft as it was.`, bad: false};
    renderPanel();
  } else adopt(makeDraft(read.fixture));
}

/** Decision 20: a link that carries the draft's `input@1` JSON in its hash. */
async function copyLink(): Promise<void> {
  const d = draft;
  if (!d || !d.validation.ok) return;
  link = `${location.href.split('#')[0]}${draftLinkHash(d.fixture)}`;
  try {
    await navigator.clipboard.writeText(link);
    notice = {text: `Link copied (${link.length} characters).`, bad: false};
  } catch {
    notice = {text: `The clipboard is not available here; copy the link below (${link.length} characters).`, bad: false};
  }
  renderPanel();
}

select.addEventListener('change', () => {
  const sel = selectionNamed(select.value);
  history.replaceState(null, '', hashOf(sel));
  show(sel);
});
// Journal decision 98, F8, and decision 169: a hash change loads that fixture or case.
window.addEventListener('hashchange', () => show(selectionFromHash(location.hash, hashSources())));
// WP-V1: the filter narrows the list as it is typed; what is on show stays listed.
filter.addEventListener('input', () => fillSelector());
$('reset').addEventListener('click', () => scene.resetView());
$('frame-all').addEventListener('click', () => scene.resetView(true));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { pinned = null; scene.unpin(); renderReadouts(); }
  // Undo and redo outside a text field, where the field's own undo belongs to it.
  const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (showingDraft && !inField && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    act({kind: e.shiftKey ? 'redo' : 'undo'});
  }
});

window.__viewer = {
  get build() { return build; },
  get draft() { return draft; },
  get toggles() { return toggles; },
  project: p => scene.project(p),
  setView: (position, target) => scene.setView(position, target),
};

renderToggles();
renderReadouts();
const restored = savedDraft();
draft = restored?.draft ?? null;
// Journal decision 198, M2: a mark left by a build that never ended means the draft is not built again on its own.
unfinished = restored?.unfinished ?? false;
// The cases come from the manifest, so the first selection waits for it: a hash naming a case needs the list.
void loadManifest().then(() => {
  fillSelector();
  show(selectionFromHash(location.hash, hashSources()));
});
