// Spec decisions 27 and 28 on a real build of NarrowUpperStorey: the readout text, the legend and the drawn buffers.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {Vec3} from '../src/tags.ts';
import {
  cellOutlineSegments, cellTriangles, edgeSegments, faceTriangles, ghostSegments, ghostTriangles, triangulatePolygon, vertexPoints,
} from '../src/viewer/buffers.ts';
import {legendEntries} from '../src/viewer/legend.ts';
import {EDGE_KIND_COLOUR, SHELL_KIND_COLOUR, RAW_INTERNAL_GREY} from '../src/viewer/palette.ts';
import {Hit, cellLines, edgeLines, faceLines, fmtPoint, readoutSections, sourceLabel, vertexLines} from '../src/viewer/readout.ts';

let b: ShellBuild;
beforeAll(async () => { b = await buildShellDetailed(fixtureByName('NarrowUpperStorey')); }, 60_000);

describe('readout text', () => {
  it('a Gable face names its kind, storey, source wall label and area', () => {
    const f = b.shell.faces.find(x => x.tag.kind === 'Gable')!;
    const lines = faceLines(b, f.id);
    expect(lines[0]).toBe(`Face ${f.id}: Gable`);
    expect(lines).toContain('storey 0');
    expect(lines).toContain('source wall 0 (y=0 x[0,600])');
    expect(lines.find(l => l.startsWith('area '))).toMatch(/^area 9588\d\.\d+ cm²$/);
  });

  it('a Roof face names its plane, a floor face says it has no source wall', () => {
    const roof = b.shell.faces.find(x => x.tag.kind === 'Roof')!;
    expect(sourceLabel(b, roof.tag)).toMatch(/^plane \d+ \(/);
    const ground = b.shell.faces.find(x => x.tag.kind === 'Ground')!;
    expect(sourceLabel(b, ground.tag)).toBe('no source wall');
  });

  it('a Cell names its lattice coordinate and whole or partial', () => {
    const whole = b.shell.cells.find(c => c.whole)!;
    const partial = b.shell.cells.find(c => !c.whole)!;
    expect(cellLines(b, whole.id)[0]).toBe(`Cell ${whole.id}: lattice (${whole.lattice[0]}, ${whole.lattice[1]}), whole`);
    expect(cellLines(b, partial.id)[0]).toBe(`Cell ${partial.id}: lattice (${partial.lattice[0]}, ${partial.lattice[1]}), partial`);
  });

  it('an Edge names its kind, length and both faces\' tags (the spec\'s one Ridge, 300 cm)', () => {
    const ridge = b.shell.edges.find(e => e.kind === 'Ridge')!;
    const lines = edgeLines(b, ridge.id);
    expect(lines[0]).toBe(`Edge ${ridge.id}: Ridge`);
    expect(lines).toContain('length 300 cm');
    expect(lines.filter(l => l.startsWith('face ')).every(l => l.includes('Roof, storey 0'))).toBe(true);
    expect(lines.filter(l => l.startsWith('face '))).toHaveLength(2);
  });

  it('a vertex names its position and its incident Edges\' kinds', () => {
    const v = b.shell.vertices.find(x => x.edges.some(n => b.shell.netEdges[n].kind === 'Ridge'))!;
    const lines = vertexLines(b, v.id);
    expect(lines[1]).toBe(`position ${fmtPoint(v.p)} cm`);
    expect(lines[2]).toContain('Ridge');
    expect(lines[2]).toContain(`(${v.edges.length})`);
  });

  it('a hit reads as a vertex, else an Edge, else the face with its Cell', () => {
    const f = b.shell.faces[0];
    const cell = b.shell.cells.find(c => c.face === f.id)!;
    expect(readoutSections(b, {vertex: 0, edge: 0, face: f.id})).toEqual([vertexLines(b, 0)]);
    expect(readoutSections(b, {edge: 0, face: f.id})).toEqual([edgeLines(b, 0)]);
    expect(readoutSections(b, {face: f.id, cell: cell.id})).toEqual([faceLines(b, f.id), cellLines(b, cell.id)]);
    expect(readoutSections(b, {} as Hit)).toEqual([]);
  });
});

describe('legend', () => {
  it('lists every face kind and Edge kind the shell holds, in the fixed colour', () => {
    const entries = legendEntries(b, {netKindOutlines: false, raw: false});
    for (const kind of new Set(b.shell.faces.map(f => f.tag.kind))) {
      expect(entries.find(e => e.group === 'Faces' && e.label === kind)?.colour, kind).toBe(SHELL_KIND_COLOUR[kind]);
    }
    for (const kind of new Set(b.shell.edges.map(e => e.kind))) {
      expect(entries.find(e => e.group === 'Edges' && e.label === kind)?.colour, kind).toBe(EDGE_KIND_COLOUR[kind]);
    }
  });

  it('counts each Edge kind as the shell does', () => {
    const entries = legendEntries(b, {netKindOutlines: false, raw: false});
    for (const e of entries.filter(x => x.group === 'Edges')) expect(e.count).toBe(b.shell.edges.filter(x => x.kind === e.label).length);
  });

  it('lists the two magenta defects with their report counts', () => {
    const defects = legendEntries(b, {netKindOutlines: false, raw: false}).filter(e => e.group === 'Defects');
    expect(defects.map(d => d.label)).toEqual(['Unclassified Edge', 'Surviving Internal face']);
    expect(defects.map(d => d.count)).toEqual([b.shell.report.unclassifiedEdges, b.shell.report.survivingInternal]);
    expect(defects.every(d => d.colour === 0xff00ff)).toBe(true);
  });

  it('lists a lighter swatch for each kind that has partial Cells', () => {
    const entries = legendEntries(b, {netKindOutlines: false, raw: false}).filter(e => e.group === 'Partial Cells');
    expect(entries.reduce((s, e) => s + e.count, 0)).toBe(b.shell.report.partialCells);
  });

  it('adds the raw ghosts only in raw mode, Internal in grey, not magenta', () => {
    expect(legendEntries(b, {netKindOutlines: false, raw: false}).some(e => e.group === 'Raw ghosts')).toBe(false);
    const raw = legendEntries(b, {netKindOutlines: false, raw: true}).filter(e => e.group === 'Raw ghosts');
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.find(e => e.label.startsWith('Internal'))?.colour).toBe(RAW_INTERNAL_GREY);
  });

  it('with Cell outlines coloured by NetEdge kind, lists the kinds that only the net holds', () => {
    const netOnly = new Set(b.shell.netEdges.map(n => n.kind));
    for (const e of b.shell.edges) netOnly.delete(e.kind);
    const entries = legendEntries(b, {netKindOutlines: true, raw: false}).filter(e => e.group === 'Edges');
    for (const k of netOnly) if (k !== 'Unclassified') expect(entries.some(e => e.label === k), k).toBe(true);
  });
});

describe('drawn buffers', () => {
  const all = new Set([0, 1]);
  const triCount = (x: {owner: Int32Array}): number => x.owner.length;

  it('the solid and ground meshes together hold every output triangle', () => {
    expect(triCount(faceTriangles(b, all, false)) + triCount(faceTriangles(b, all, true))).toBe(b.union.mesh.tris.length / 3);
  });

  it('hiding storey 1 shrinks the faces, and hiding every storey empties every layer', () => {
    const only0 = new Set([0]);
    const shown = (t: {owner: Int32Array}): number => t.owner.length;
    expect(shown(faceTriangles(b, only0, false))).toBeLessThan(shown(faceTriangles(b, all, false)));
    expect(shown(faceTriangles(b, new Set(), false)) + shown(faceTriangles(b, new Set(), true))).toBe(0);
    expect(shown(edgeSegments(b, new Set()))).toBe(0);
    expect(shown(cellTriangles(b, new Set(), false))).toBe(0);
    expect(shown(vertexPoints(b, new Set()))).toBe(0);
    expect(shown(cellOutlineSegments(b, new Set(), false))).toBe(0);
    expect(shown(ghostTriangles(b, new Set()))).toBe(0);
    expect(shown(ghostSegments(b, new Set()))).toBe(0);
  });

  it('draws every Edge, vertex and NetEdge when every storey is shown', () => {
    expect(edgeSegments(b, all).owner.length).toBe(b.shell.edges.length);
    expect(vertexPoints(b, all).owner.length).toBe(b.shell.vertices.length);
    expect(cellOutlineSegments(b, all, false).owner.length).toBe(b.shell.netEdges.length);
  });

  it('partial Cells are exactly the report\'s count of Cells with triangles', () => {
    const partial = new Set(cellTriangles(b, all, true).owner);
    expect(partial.size).toBe(b.shell.report.partialCells);
    expect(new Set(cellTriangles(b, all, false).owner).size).toBe(b.shell.cells.length);
  });

  it('raw mode draws every raw part, and more triangles than the union keeps', () => {
    const ghosts = new Set(ghostTriangles(b, all).owner);
    expect(ghosts.size).toBe(b.union.parts.length);
    expect(ghostTriangles(b, all).owner.length).toBeGreaterThan(b.union.mesh.tris.length / 3);
  });

  it('triangulates a non-convex polygon wound about the face normal, covering its area', () => {
    const L: Vec3[] = [[0, 0, 5], [2, 0, 5], [2, 1, 5], [1, 1, 5], [1, 2, 5], [0, 2, 5]];
    const tris = triangulatePolygon(L, [0, 0, 1]);
    let area = 0;
    for (const [i, j, k] of tris) {
      const cz = (L[j][0] - L[i][0]) * (L[k][1] - L[i][1]) - (L[j][1] - L[i][1]) * (L[k][0] - L[i][0]);
      expect(cz).toBeGreaterThan(0);
      area += cz / 2;
    }
    expect(area).toBeCloseTo(3);
    const down = triangulatePolygon([...L].reverse(), [0, 0, -1]);
    expect(down.length).toBe(tris.length);
  });
});
