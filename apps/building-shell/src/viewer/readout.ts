// Spec decision 27: what a hover or a pin says, as plain text lines, naming things as the spec does.
import {wallLabel} from '../roof/model.ts';
import type {ShellBuild} from '../shell.ts';
import type {FaceTag, Vec3} from '../tags.ts';

/** What the cursor is over (journal decision 97, N1): a vertex, an Edge, or a surface, which carries its face and, when a Cell lies there, the Cell. */
export type Hit =
  | {kind: 'vertex'; id: number}
  | {kind: 'edge'; id: number}
  | {kind: 'surface'; face: number; cell: number | null};

const fmt = (v: number): string => (Math.round(v * 100) / 100).toString();
export const fmtPoint = (p: Readonly<Vec3>): string => `(${p.map(fmt).join(', ')})`;

export function distance(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The source of a face, as the spec names it: a source wall label for Wall, Gable and Cheek, a plane for Roof. */
export function sourceLabel(build: ShellBuild, tag: FaceTag): string {
  const plan = build.union.plans.find(p => p.storey === tag.storey);
  if (tag.kind === 'Roof') {
    const plane = plan?.building.planes.find(p => p.id === tag.plane);
    return plane ? `plane ${tag.plane} (${plane.label})` : `plane ${tag.plane}`;
  }
  if (tag.wall < 0) return 'no source wall';
  const wall = plan?.building.walls.find(w => w.id === tag.wall);
  return wall ? `wall ${tag.wall} (${wallLabel(wall)})` : `wall ${tag.wall}`;
}

/** A tag on one line: kind, storey and source. */
export const tagText = (build: ShellBuild, tag: FaceTag): string => `${tag.kind}, storey ${tag.storey}, ${sourceLabel(build, tag)}`;

export function faceLines(build: ShellBuild, id: number): string[] {
  const f = build.shell.faces[id];
  return [
    `Face ${id}: ${f.tag.kind}`,
    `storey ${f.tag.storey}`,
    `source ${sourceLabel(build, f.tag)}`,
    `area ${fmt(f.area)} cm²`,
    `normal ${fmtPoint(f.normal)}`,
  ];
}

export function cellLines(build: ShellBuild, id: number): string[] {
  const c = build.shell.cells[id];
  const f = build.shell.faces[c.face];
  return [
    `Cell ${id}: lattice (${c.lattice[0]}, ${c.lattice[1]}), ${c.whole ? 'whole' : 'partial'}`,
    `on face ${c.face}: ${f.tag.kind}, storey ${f.tag.storey}`,
    `sides ${c.sides.map(s => build.shell.netEdges[s].kind).join(', ')}`,
  ];
}

export function edgeLines(build: ShellBuild, id: number): string[] {
  const e = build.shell.edges[id];
  const [fa, fb] = e.faces;
  return [
    `Edge ${id}: ${e.kind}`,
    `length ${fmt(distance(e.a, e.b))} cm`,
    `from ${fmtPoint(e.a)} to ${fmtPoint(e.b)}`,
    `face ${fa}: ${tagText(build, build.shell.faces[fa].tag)}`,
    `face ${fb}: ${tagText(build, build.shell.faces[fb].tag)}`,
  ];
}

export function vertexLines(build: ShellBuild, id: number): string[] {
  const v = build.shell.vertices[id];
  const kinds = v.edges.map(n => build.shell.netEdges[n].kind);
  return [
    `Vertex ${id}`,
    `position ${fmtPoint(v.p)} cm`,
    `incident Edges (${kinds.length}): ${kinds.join(', ') || 'none'}`,
    `${v.faces.length} faces, ${v.cells.length} Cells`,
  ];
}

/** The readout for a hit: each section is a list of lines whose first line is its title. */
export function readoutSections(build: ShellBuild, h: Hit): string[][] {
  switch (h.kind) {
    case 'vertex': return [vertexLines(build, h.id)];
    case 'edge': return [edgeLines(build, h.id)];
    case 'surface': return h.cell === null ? [faceLines(build, h.face)] : [faceLines(build, h.face), cellLines(build, h.cell)];
  }
}
