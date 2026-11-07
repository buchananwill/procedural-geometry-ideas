// The viewer page (spec decisions 26 to 30): loads manifold-3d's WASM in the browser, runs the pipeline live on the
// selected fixture and wires the side panel to the scene. `buildShellDetailed` is `buildShell` with its intermediate
// records kept, which the viewer needs for the raw parts and the face-to-triangle map; `buildShell` itself is
// `(await buildShellDetailed(f)).shell`.
import {errorMessage} from '../errors.ts';
import {SHELL_FIXTURES, ShellFixture, storeysOf} from '../fixture.ts';
import {ShellBuild, buildShellDetailed} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {fixtureFromHash} from './hash.ts';
import {LegendEntry, legendEntries} from './legend.ts';
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
  let group = '';
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

// ---- Loading ------------------------------------------------------------------------------------------------------

async function load(fixture: ShellFixture): Promise<void> {
  const mine = ++token;
  const status = $('status');
  status.style.color = '';
  status.textContent = `Building ${fixture.name}...`;
  $('buildline').textContent = '';
  try {
    const t0 = performance.now();
    const built = await buildShellDetailed(fixture);
    if (mine !== token) return;
    const ms = Math.round(performance.now() - t0);
    build = built;
    pinned = null;
    hovered = null;
    toggles = withStoreys(toggles, storeysOf(fixture));
    scene.setBuild(built, toggles);
    renderToggles();
    renderLegend();
    renderReport(built);
    renderReadouts();
    const s = built.shell;
    $('buildline').textContent = `${s.faces.length} faces, ${s.edges.length} Edges, ${s.cells.length} Cells, ${s.vertices.length} vertices; built in ${ms} ms`;
    status.textContent = fixture.name;
  } catch (e) {
    if (mine !== token) return;
    console.error(`${fixture.name}: build failed`, e);
    // Journal decision 98, F8: a failed build leaves no stale shell behind, only its error.
    build = undefined;
    pinned = null;
    hovered = null;
    scene.clearBuild();
    const message = `${fixture.name}: build failed: ${errorMessage(e)}`;
    status.textContent = message;
    status.style.color = 'var(--bad)';
    $('report').replaceChildren(el('div', message, 'bad'));
    $('legend').replaceChildren();
    renderReadouts();
  }
}

const select = $<HTMLSelectElement>('fixture');
for (const f of SHELL_FIXTURES) select.append(new Option(f.name, f.name));
select.addEventListener('change', () => {
  const f = SHELL_FIXTURES.find(x => x.name === select.value);
  if (!f) return;
  history.replaceState(null, '', `#${encodeURIComponent(f.name)}`);
  void load(f);
});
// Journal decision 98, F8: a hash change loads that fixture.
window.addEventListener('hashchange', () => {
  const f = fixtureFromHash(location.hash, SHELL_FIXTURES);
  select.value = f.name;
  void load(f);
});
$('reset').addEventListener('click', () => scene.resetView());
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { pinned = null; scene.unpin(); renderReadouts(); }
});

const start = fixtureFromHash(location.hash, SHELL_FIXTURES);
select.value = start.name;
renderToggles();
renderReadouts();
void load(start);

window.__viewer = {
  get build() { return build; },
  get toggles() { return toggles; },
  project: p => scene.project(p),
  setView: (position, target) => scene.setView(position, target),
};
