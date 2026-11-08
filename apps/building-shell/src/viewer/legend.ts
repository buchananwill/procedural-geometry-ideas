// Spec decision 28: a legend that lists every colour in use. Built from the shell's own records and the same
// visibility rules the draw buffers use (journal decision 98, F7), so a colour drawn is a colour listed and a count is
// the count of what is shown.
import {EDGE_KINDS, EdgeKind} from '../edges.ts';
import type {ShellBuild} from '../shell.ts';
import type {ShellKind} from '../tags.ts';
import {
  AXIS_COLOURS, DEFECT_CASING_COLOUR, EDGE_KIND_COLOUR, GHOST_LINE_COLOUR, HOVER_COLOUR, OUTLINE_COLOUR, PIN_COLOUR, RAW_INTERNAL_GREY, SHELL_KIND_COLOUR, SHELL_KINDS, VERTEX_COLOUR, partialColour,
} from './palette.ts';
import {ToggleState, visibleStoreys} from './toggles.ts';
import {cellShown, edgeShown, faceShown, netEdgeShown, vertexShown} from './visibility.ts';

export type LegendGroup = 'Faces' | 'Edges' | 'Cells' | 'Partial Cells' | 'Vertices' | 'Raw ghosts' | 'Interaction' | 'Orientation' | 'Defects';

/** What a count counts, where it is not the group's default. */
export type LegendNote = 'translucent' | 'triangles' | 'parts';

export interface LegendEntry {
  group: LegendGroup;
  label: string;
  colour: number;
  /** A casing colour round the swatch, for the heavy mark of the Unclassified Edges (journal decision 169). */
  casing?: number;
  /** How many of the thing are drawn; null for a colour with nothing to count. */
  count: number | null;
  /** Edge entries and the Unclassified defect: how many NetEdges of this kind are shown. */
  netCount?: number;
  note?: LegendNote;
}

export type LegendOptions = Pick<ToggleState, 'layers' | 'raw' | 'netKindOutlines' | 'highlightPartial' | 'storeys'>;

function tally<K>(keys: Iterable<K>): Map<K, number> {
  const out = new Map<K, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

function faceEntries(build: ShellBuild, storeys: ReadonlySet<number>): LegendEntry[] {
  const count = tally(build.shell.faces.filter(f => faceShown(build, storeys, f.id)).map(f => f.tag.kind));
  return SHELL_KINDS.flatMap((k): LegendEntry[] => {
    const n = count.get(k);
    return n === undefined || k === 'Internal' ? [] : [{group: 'Faces', label: k, colour: SHELL_KIND_COLOUR[k], count: n, note: k === 'Ground' ? 'translucent' : undefined}];
  });
}

function edgeEntries(build: ShellBuild, storeys: ReadonlySet<number>, o: LegendOptions): LegendEntry[] {
  const shell = o.layers.edges ? tally(build.shell.edges.filter(e => edgeShown(build, storeys, e.id)).map(e => e.kind)) : new Map<EdgeKind, number>();
  const byKind = o.layers.cellOutlines && o.netKindOutlines;
  const net = byKind ? tally(build.shell.netEdges.filter(n => netEdgeShown(build, storeys, n.id)).map(n => n.kind)) : new Map<EdgeKind, number>();
  return EDGE_KINDS.flatMap((k): LegendEntry[] => {
    if (k === 'Unclassified' || !(shell.has(k) || net.has(k))) return [];
    return [{group: 'Edges', label: k, colour: EDGE_KIND_COLOUR[k], count: shell.get(k) ?? 0, netCount: byKind ? net.get(k) ?? 0 : undefined}];
  });
}

function partialEntries(build: ShellBuild, storeys: ReadonlySet<number>): LegendEntry[] {
  const count = tally(build.shell.cells.filter(c => !c.whole && cellShown(build, storeys, c.id)).map(c => build.shell.faces[c.face].tag.kind));
  return SHELL_KINDS.flatMap((k): LegendEntry[] => {
    const n = count.get(k);
    return n === undefined ? [] : [{group: 'Partial Cells', label: `${k} partial Cell`, colour: partialColour(k), count: n}];
  });
}

/** The grey of the thin outlines drawn round every raw ghost part (journal decision 105, L5). */
const GHOST_OUTLINE_ENTRY: LegendEntry = {group: 'Raw ghosts', label: 'raw part outline', colour: GHOST_LINE_COLOUR, count: null};

function rawEntries(build: ShellBuild, storeys: ReadonlySet<number>): LegendEntry[] {
  const kinds = new Map<ShellKind, number>();
  for (const part of build.union.parts) {
    if (!storeys.has(part.storey)) continue;
    const seen = new Set<ShellKind>(part.soup.faceIDs.map(f => build.union.tags.table[f].kind));
    for (const k of seen) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const ghosts = SHELL_KINDS.flatMap((k): LegendEntry[] => {
    const n = kinds.get(k);
    if (n === undefined) return [];
    return [{
      group: 'Raw ghosts', label: k === 'Internal' ? 'raw Internal face' : `${k} (raw)`,
      colour: k === 'Internal' ? RAW_INTERNAL_GREY : SHELL_KIND_COLOUR[k], count: n, note: 'parts',
    }];
  });
  return ghosts.length ? [...ghosts, GHOST_OUTLINE_ENTRY] : [];
}

function defectEntries(build: ShellBuild, storeys: ReadonlySet<number>): LegendEntry[] {
  const unclassifiedEdges = build.shell.edges.filter(e => e.kind === 'Unclassified' && edgeShown(build, storeys, e.id)).length;
  const unclassifiedNet = build.shell.netEdges.filter(n => n.kind === 'Unclassified' && netEdgeShown(build, storeys, n.id)).length;
  const internal = build.union.triTags.filter(t => t.kind === 'Internal' && storeys.has(t.storey)).length;
  return [
    {group: 'Defects', label: 'Unclassified Edge (drawn heavy, white-cased)', colour: EDGE_KIND_COLOUR.Unclassified, casing: DEFECT_CASING_COLOUR, count: unclassifiedEdges, netCount: unclassifiedNet},
    {group: 'Defects', label: 'Surviving Internal face', colour: SHELL_KIND_COLOUR.Internal, count: internal, note: 'triangles'},
  ];
}

/**
 * Every colour in use for the current toggles, counted over the shown storeys. The two magenta defects are listed
 * always, with a zero count when absent, so the reader sees what magenta would mean. The hover and pin colours and the
 * orientation gizmo are listed always.
 */
export function legendEntries(build: ShellBuild, options: LegendOptions): LegendEntry[] {
  const storeys = visibleStoreys(options);
  const {layers} = options;
  const outlines: LegendEntry[] = layers.cellOutlines && !options.netKindOutlines
    ? [{group: 'Cells', label: 'Cell outline', colour: OUTLINE_COLOUR, count: build.shell.netEdges.filter(n => netEdgeShown(build, storeys, n.id)).length}]
    : [];
  const vertices: LegendEntry[] = layers.vertices
    ? [{group: 'Vertices', label: 'Vertex', colour: VERTEX_COLOUR, count: build.shell.vertices.filter(v => vertexShown(build, storeys, v.id)).length}]
    : [];
  return [
    ...(layers.faces ? faceEntries(build, storeys) : []),
    ...edgeEntries(build, storeys, options),
    ...outlines,
    ...(layers.faces && options.highlightPartial ? partialEntries(build, storeys) : []),
    ...vertices,
    ...(options.raw ? rawEntries(build, storeys) : []),
    {group: 'Interaction', label: 'Hovered (outline)', colour: HOVER_COLOUR, count: null},
    {group: 'Interaction', label: 'Pinned (outline)', colour: PIN_COLOUR, count: null},
    {group: 'Orientation', label: 'X axis (corner gizmo)', colour: AXIS_COLOURS.x, count: null},
    {group: 'Orientation', label: 'Y axis (corner gizmo)', colour: AXIS_COLOURS.y, count: null},
    {group: 'Orientation', label: 'Z axis, up (corner gizmo)', colour: AXIS_COLOURS.z, count: null},
    ...defectEntries(build, storeys),
  ];
}
