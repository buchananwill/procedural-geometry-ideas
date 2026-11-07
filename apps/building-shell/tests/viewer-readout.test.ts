// Spec decisions 27 and 28 on a real build of NarrowUpperStorey: the readout text, whole line by whole line, and the
// legend over the toggles. Every readout assertion is on a complete line, so a wrong storey, wall or kind fails it.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {legendEntries} from '../src/viewer/legend.ts';
import {AXIS_COLOURS, EDGE_KIND_COLOUR, HOVER_COLOUR, OUTLINE_COLOUR, PIN_COLOUR, RAW_INTERNAL_GREY, SHELL_KIND_COLOUR} from '../src/viewer/palette.ts';
import {Hit, cellLines, edgeLines, faceLines, fmtPoint, readoutSections, sourceLabel, vertexLines} from '../src/viewer/readout.ts';
import {ToggleState, makeToggles, setHighlightPartial, setLayer, setNetKindOutlines, setRaw, setStorey} from '../src/viewer/toggles.ts';

let b: ShellBuild;
beforeAll(async () => { b = await buildShellDetailed(fixtureByName('NarrowUpperStorey')); }, 60_000);

const round2 = (v: number): number => Math.round(v * 100) / 100;

describe('readout text, whole lines', () => {
  it('a storey-0 Gable face', () => {
    const f = b.shell.faces.find(x => x.tag.kind === 'Gable')!;
    expect(faceLines(b, f.id)).toEqual([
      `Face ${f.id}: Gable`,
      'storey 0',
      'source wall 0 (y=0 x[0,600])',
      `area ${round2(f.area)} cm²`,
      'normal (0, -1, 0)',
    ]);
    expect(f.area).toBeCloseTo(95884.6, 0);
  });

  it('a storey-1 Wall face on the flush plane y = 0, so a wrong storey fails', () => {
    const f = b.shell.faces.find(x => x.tag.kind === 'Wall' && x.tag.storey === 1)!;
    expect(faceLines(b, f.id)).toEqual([
      `Face ${f.id}: Wall`,
      'storey 1',
      'source wall 0 (y=0 x[200,400])',
      `area ${round2(f.area)} cm²`,
      'normal (0, -1, 0)',
    ]);
    expect(f.area).toBeCloseTo(60000, 0);
  });

  it('a Roof face names its plane, a floor face says it has no source wall', () => {
    for (const roof of b.shell.faces.filter(x => x.tag.kind === 'Roof')) {
      expect(sourceLabel(b, roof.tag)).toMatch(/^plane \d+ \((x=(0|600) y\[0,600\]|y=600 x\[0,600\])\)$/);
    }
    const ground = b.shell.faces.find(x => x.tag.kind === 'Ground')!;
    expect(faceLines(b, ground.id)[2]).toBe('source no source wall');
    expect(faceLines(b, ground.id)[1]).toBe('storey 0');
  });

  it('a whole Cell on the Gable, at lattice (2, 8)', () => {
    const c = b.shell.cells.find(x => b.shell.faces[x.face].tag.kind === 'Gable' && x.lattice[0] === 2 && x.lattice[1] === 8)!;
    expect(c.whole).toBe(true);
    expect(cellLines(b, c.id)).toEqual([
      `Cell ${c.id}: lattice (2, 8), whole`,
      `on face ${c.face}: Gable, storey 0`,
      c.sides.map(s => b.shell.netEdges[s].kind).join(', ').replace(/^/, 'sides '),
    ]);
    expect(cellLines(b, c.id)[2]).toMatch(/^sides (GableHorizontal|GableVertical)(, (GableHorizontal|GableVertical))*$/);
  });

  it('a partial Cell reads partial', () => {
    const c = b.shell.cells.find(x => !x.whole)!;
    expect(cellLines(b, c.id)[0]).toBe(`Cell ${c.id}: lattice (${c.lattice[0]}, ${c.lattice[1]}), partial`);
  });

  it('the Ridge: kind, 300 cm, both ends and both Roof faces', () => {
    const ridge = b.shell.edges.find(e => e.kind === 'Ridge')!;
    const lines = edgeLines(b, ridge.id);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(`Edge ${ridge.id}: Ridge`);
    expect(lines[1]).toBe('length 300 cm');
    expect(lines[2]).toBe(`from ${fmtPoint(ridge.a)} to ${fmtPoint(ridge.b)}`);
    expect(lines[2]).toBe('from (300, 0, 819.62) to (300, 300, 819.62)');
    const [fa, fb] = ridge.faces;
    expect(lines[3]).toMatch(new RegExp(`^face ${fa}: Roof, storey 0, plane \\d+ \\(x=(0|600) y\\[0,600\\]\\)$`));
    expect(lines[4]).toMatch(new RegExp(`^face ${fb}: Roof, storey 0, plane \\d+ \\(x=(0|600) y\\[0,600\\]\\)$`));
  });

  it('an Edge between the storey-1 Wall and the storey-0 Gable names both storeys', () => {
    const e = b.shell.edges.find(x => x.faces.some(f => b.shell.faces[f].tag.storey === 1) && x.faces.some(f => b.shell.faces[f].tag.storey === 0))!;
    const faceTexts = edgeLines(b, e.id).filter(l => l.startsWith('face '));
    expect(faceTexts.some(l => l.includes('storey 1'))).toBe(true);
    expect(faceTexts.some(l => l.includes('storey 0'))).toBe(true);
  });

  it('the apex vertex: position and the kinds of its four incident Edges', () => {
    const v = b.shell.vertices.find(x => Math.abs(x.p[0] - 300) < 0.01 && Math.abs(x.p[1]) < 0.01 && x.p[2] > 819 && x.p[2] < 820)!;
    const lines = vertexLines(b, v.id);
    expect(lines[0]).toBe(`Vertex ${v.id}`);
    expect(lines[1]).toBe('position (300, 0, 819.62) cm');
    expect(lines[2]).toBe(`incident Edges (${v.edges.length}): ${v.edges.map(n => b.shell.netEdges[n].kind).join(', ')}`);
    expect(lines[2]).toContain('Ridge');
    expect(lines[3]).toBe(`${v.faces.length} faces, ${v.cells.length} Cells`);
  });

  it('a hit reads as a vertex, else an Edge, else the face with its Cell', () => {
    const f = b.shell.faces[0];
    const cell = b.shell.cells.find(c => c.face === f.id)!;
    const vertex: Hit = {kind: 'vertex', id: 0};
    const edge: Hit = {kind: 'edge', id: 0};
    expect(readoutSections(b, vertex)).toEqual([vertexLines(b, 0)]);
    expect(readoutSections(b, edge)).toEqual([edgeLines(b, 0)]);
    expect(readoutSections(b, {kind: 'surface', face: f.id, cell: cell.id})).toEqual([faceLines(b, f.id), cellLines(b, cell.id)]);
    expect(readoutSections(b, {kind: 'surface', face: f.id, cell: null})).toEqual([faceLines(b, f.id)]);
  });
});

describe('legend', () => {
  const base = (): ToggleState => makeToggles([0, 1]);
  const entries = (t: ToggleState) => legendEntries(b, t);

  it('lists every face kind and Edge kind the shell holds, in the fixed colour and with its count', () => {
    const e = entries(base());
    for (const kind of new Set(b.shell.faces.map(f => f.tag.kind))) {
      const entry = e.find(x => x.group === 'Faces' && x.label === kind);
      expect(entry?.colour, kind).toBe(SHELL_KIND_COLOUR[kind]);
      expect(entry?.count, kind).toBe(b.shell.faces.filter(f => f.tag.kind === kind).length);
    }
    for (const kind of new Set(b.shell.edges.map(x => x.kind))) {
      const entry = e.find(x => x.group === 'Edges' && x.label === kind);
      expect(entry?.colour, kind).toBe(EDGE_KIND_COLOUR[kind]);
      expect(entry?.count, kind).toBe(b.shell.edges.filter(x => x.kind === kind).length);
    }
  });

  it('counts follow the storey toggles', () => {
    const only0 = entries(setStorey(base(), 1, false));
    const wall = only0.find(x => x.group === 'Faces' && x.label === 'Wall');
    const wall0 = b.shell.faces.filter(f => f.tag.kind === 'Wall' && f.tag.storey === 0).length;
    expect(wall?.count).toBe(wall0);
    expect(wall0).toBeLessThan(b.shell.faces.filter(f => f.tag.kind === 'Wall').length);
    const hidden = entries(setStorey(setStorey(base(), 0, false), 1, false));
    expect(hidden.filter(x => x.group === 'Faces' || x.group === 'Edges')).toEqual([]);
  });

  it('lists the two magenta defects, ShellEdges and NetEdges counted separately, and Internal triangles', () => {
    const defects = entries(base()).filter(x => x.group === 'Defects');
    expect(defects.map(d => d.label)).toEqual(['Unclassified Edge', 'Surviving Internal face']);
    expect(defects[0].count).toBe(b.shell.report.unclassifiedEdges);
    expect(defects[0].netCount).toBe(b.shell.netEdges.filter(n => n.kind === 'Unclassified').length);
    expect(defects[1].count).toBe(b.shell.report.survivingInternal);
    expect(defects.every(d => d.colour === 0xff00ff)).toBe(true);
  });

  it('lists the hover and pin colours and the orientation gizmo', () => {
    const e = entries(base());
    expect(e.filter(x => x.group === 'Interaction').map(x => [x.label, x.colour])).toEqual([['Hovered', HOVER_COLOUR], ['Pinned', PIN_COLOUR]]);
    expect(e.filter(x => x.group === 'Orientation').map(x => x.colour)).toEqual([AXIS_COLOURS.x, AXIS_COLOURS.y, AXIS_COLOURS.z]);
  });

  it('lists the partial-Cell tint only when the highlight is on', () => {
    expect(entries(base()).some(x => x.group === 'Partial Cells')).toBe(false);
    const tint = entries(setHighlightPartial(base(), true)).filter(x => x.group === 'Partial Cells');
    expect(tint.reduce((s, x) => s + (x.count ?? 0), 0)).toBe(b.shell.report.partialCells);
  });

  it('lists the neutral outline colour when Cell outlines are on, and NetEdge kinds when they are coloured by kind', () => {
    expect(entries(base()).some(x => x.label === 'Cell outline')).toBe(false);
    const on = setLayer(base(), 'cellOutlines', true);
    expect(entries(on).find(x => x.label === 'Cell outline')?.colour).toBe(OUTLINE_COLOUR);
    const byKind = entries(setNetKindOutlines(on, true));
    expect(byKind.some(x => x.label === 'Cell outline')).toBe(false);
    const netOnly = new Set(b.shell.netEdges.map(n => n.kind));
    for (const e of b.shell.edges) netOnly.delete(e.kind);
    for (const k of netOnly) if (k !== 'Unclassified') expect(byKind.some(x => x.group === 'Edges' && x.label === k), k).toBe(true);
  });

  it('lists the raw ghosts only in raw mode, the Internal one as "raw Internal face" in grey, not magenta', () => {
    expect(entries(base()).some(x => x.group === 'Raw ghosts')).toBe(false);
    const raw = entries(setRaw(base(), true)).filter(x => x.group === 'Raw ghosts');
    expect(raw.length).toBeGreaterThan(0);
    const internal = raw.find(x => x.label === 'raw Internal face');
    expect(internal?.colour).toBe(RAW_INTERNAL_GREY);
  });

  it('lists nothing for a layer that is switched off', () => {
    const off = entries(setLayer(setLayer(base(), 'faces', false), 'edges', false));
    expect(off.some(x => x.group === 'Faces' || x.group === 'Edges')).toBe(false);
  });
});
