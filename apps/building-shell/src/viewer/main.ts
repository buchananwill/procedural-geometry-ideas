// The viewer page (spec decisions 26 to 30): loads manifold-3d's WASM in the browser, runs the pipeline live on the
// selected fixture and wires the side panel to the scene. `buildShellDetailed` is `buildShell` with its intermediate
// records kept, which the viewer needs for the raw parts and the face-to-triangle map; `buildShell` itself is
// `(await buildShellDetailed(f)).shell`.
import {errorMessage} from '../errors.ts';
import {SHELL_FIXTURES, ShellFixture, storeysOf} from '../fixture.ts';
import {ShellBuild, buildShellDetailed} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {readInput} from '../wire/input-adapter.ts';
import {DefectCase, focusOfCase, parseDefectCases} from './defect-cases.ts';
import {Selection, selectionFromHash, selectionName} from './hash.ts';
import {LegendEntry, LegendGroup, legendEntries} from './legend.ts';
import {cssColour} from './palette.ts';
import {Hit, readoutSections} from './readout.ts';
import {ScreenPoint, ShellScene} from './scene.ts';
import {
  LAYER_KEYS, LayerKey, ToggleState, makeToggles, setHighlightPartial, setLayer, setNetKindOutlines, setRaw, setStorey, withStoreys,
} from './toggles.ts';

/** The page's test hook: lets a browser test project a known world point to the page and read the current state. */
export interface ViewerHook {
  readonly build: ShellBuild | undefined;
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
let toggles: ToggleState = makeToggles([]);
let pinned: Hit | null = null;
let hovered: Hit | null = null;
let token = 0;

const scene = new ShellScene($('view'), {
  onHover: hit => { hovered = hit; renderReadouts(); },
  onClick: hit => { pinned = hit; renderReadouts(); },
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

/** A case's fixture, read from its `golden/<name>.input.json`. Throws, with the reason, when it cannot be. */
async function fixtureOfCase(c: DefectCase): Promise<ShellFixture> {
  if (c.input === undefined) {
    const why = c.reasons.length ? c.reasons.join('; ') : 'the manifest gives no reason';
    throw new Error(`${c.name} cannot be loaded: it has no golden/*.input.json, because it is not C++-replayable (${why})`);
  }
  const res = await fetch(new URL(`golden/${c.input}`, document.baseURI));
  if (!res.ok) throw new Error(`golden/${c.input}: ${res.status} ${res.statusText}`);
  const read = readInput(await res.json(), c.name);
  if (!read.ok) throw new Error(`readInput refuses golden/${c.input}: ${read.errors.join('; ')}`);
  return read.fixture;
}

async function loadManifest(): Promise<void> {
  try {
    const res = await fetch(new URL('golden/manifest.json', document.baseURI));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    cases = parseDefectCases(await res.json());
  } catch (e) {
    cases = [];
    console.error('golden/manifest.json could not be read', e);
    $('manifest-note').textContent = `Defect cases unavailable: golden/manifest.json could not be read (${errorMessage(e)}).`;
  }
}

// ---- Loading ------------------------------------------------------------------------------------------------------

function showFailure(name: string, message: string, defect?: DefectCase): void {
  console.error(`${name}: ${message}`);
  // Journal decision 98, F8: a failed build leaves no stale shell behind, only its error.
  build = undefined;
  pinned = null;
  hovered = null;
  scene.clearBuild();
  const status = $('status');
  status.textContent = `${name}: ${message}`;
  status.style.color = 'var(--bad)';
  $('report').replaceChildren(el('div', `${name}: ${message}`, 'bad'));
  $('legend').replaceChildren();
  $('buildline').textContent = '';
  renderCaseBox(defect, {text: `Nothing is drawn: ${message}`, bad: true});
  renderReadouts();
}

async function load(sel: Selection): Promise<void> {
  const mine = ++token;
  const name = selectionName(sel);
  const defect = sel.kind === 'case' ? sel.defect : undefined;
  const status = $('status');
  status.style.color = '';
  status.textContent = `Building ${name}...`;
  $('buildline').textContent = '';
  renderCaseBox(defect);
  let stage = 'build failed';
  try {
    let fixture: ShellFixture;
    if (sel.kind === 'fixture') fixture = sel.fixture;
    else {
      stage = 'load failed';
      fixture = await fixtureOfCase(sel.defect);
      stage = 'build failed';
    }
    const t0 = performance.now();
    const built = await buildShellDetailed(fixture);
    if (mine !== token) return;
    const ms = Math.round(performance.now() - t0);
    build = built;
    pinned = null;
    hovered = null;
    toggles = withStoreys(toggles, storeysOf(fixture));
    scene.setBuild(built, toggles, defect ? focusOfCase(defect) : undefined);
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
    // A case that cannot be loaded is not a failed build: its message already says why.
    const message = defect && stage === 'load failed' ? errorMessage(e) : `${stage}: ${errorMessage(e)}`;
    showFailure(name, message, defect);
  }
}

// ---- Selector -----------------------------------------------------------------------------------------------------

const select = $<HTMLSelectElement>('fixture');

function fillSelector(): void {
  select.replaceChildren();
  const fixtures = document.createElement('optgroup');
  fixtures.label = 'Fixtures';
  for (const f of SHELL_FIXTURES) fixtures.append(new Option(f.name, f.name));
  select.append(fixtures);
  if (!cases.length) return;
  const defects = document.createElement('optgroup');
  defects.label = 'Defect cases';
  for (const c of cases) {
    const note = c.input === undefined ? ' (cannot be loaded)' : c.error !== undefined ? ' (build throws)' : '';
    defects.append(new Option(`${c.name}: ${c.residueClass}${note}`, c.name));
  }
  select.append(defects);
}

/** The selection a listed name stands for. */
function selectionNamed(name: string): Selection {
  return selectionFromHash(`#${encodeURIComponent(name)}`, SHELL_FIXTURES, cases);
}

function show(sel: Selection): void {
  select.value = selectionName(sel);
  void load(sel);
}

select.addEventListener('change', () => {
  const sel = selectionNamed(select.value);
  history.replaceState(null, '', `#${encodeURIComponent(selectionName(sel))}`);
  show(sel);
});
// Journal decision 98, F8, and decision 169: a hash change loads that fixture or case.
window.addEventListener('hashchange', () => show(selectionFromHash(location.hash, SHELL_FIXTURES, cases)));
$('reset').addEventListener('click', () => scene.resetView());
$('frame-all').addEventListener('click', () => scene.resetView(true));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { pinned = null; scene.unpin(); renderReadouts(); }
});

window.__viewer = {
  get build() { return build; },
  get toggles() { return toggles; },
  project: p => scene.project(p),
  setView: (position, target) => scene.setView(position, target),
};

renderToggles();
renderReadouts();
// The cases come from the manifest, so the first selection waits for it: a hash naming a case needs the list.
void loadManifest().then(() => {
  fillSelector();
  show(selectionFromHash(location.hash, SHELL_FIXTURES, cases));
});
