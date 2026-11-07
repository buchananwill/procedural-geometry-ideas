// Spec decision 28: a legend that lists every colour in use. Built from the shell's own records, so a kind drawn is a
// kind listed.
import {EDGE_KINDS, EdgeKind} from '../edges.ts';
import type {ShellBuild} from '../shell.ts';
import type {ShellKind} from '../tags.ts';
import {EDGE_KIND_COLOUR, RAW_INTERNAL_GREY, SHELL_KIND_COLOUR, SHELL_KINDS, partialColour} from './palette.ts';

export type LegendGroup = 'Faces' | 'Edges' | 'Partial Cells' | 'Raw ghosts' | 'Defects';

export interface LegendEntry {
  group: LegendGroup;
  label: string;
  colour: number;
  /** How many of the thing are drawn. */
  count: number;
  /** Edge entries, when Cell outlines are coloured by NetEdge kind: how many NetEdges of this kind. */
  netCount?: number;
  note?: string;
}

export interface LegendOptions { netKindOutlines: boolean; raw: boolean }

/** Faces of every kind present, by kind in the palette's order. */
function faceEntries(build: ShellBuild): LegendEntry[] {
  const count = new Map<ShellKind, number>();
  for (const f of build.shell.faces) count.set(f.tag.kind, (count.get(f.tag.kind) ?? 0) + 1);
  return SHELL_KINDS.filter(k => count.has(k) && k !== 'Internal')
    .map(k => ({group: 'Faces', label: k, colour: SHELL_KIND_COLOUR[k], count: count.get(k)!, note: k === 'Ground' ? 'translucent' : undefined}));
}

function edgeEntries(build: ShellBuild, netKindOutlines: boolean): LegendEntry[] {
  const shell = new Map<EdgeKind, number>();
  const net = new Map<EdgeKind, number>();
  for (const e of build.shell.edges) shell.set(e.kind, (shell.get(e.kind) ?? 0) + 1);
  if (netKindOutlines) for (const n of build.shell.netEdges) net.set(n.kind, (net.get(n.kind) ?? 0) + 1);
  return EDGE_KINDS.filter(k => k !== 'Unclassified' && (shell.has(k) || net.has(k))).map(k => ({
    group: 'Edges', label: k, colour: EDGE_KIND_COLOUR[k], count: shell.get(k) ?? 0,
    netCount: netKindOutlines ? net.get(k) ?? 0 : undefined,
  }));
}

function partialEntries(build: ShellBuild): LegendEntry[] {
  const count = new Map<ShellKind, number>();
  for (const c of build.shell.cells) {
    if (!c.whole) { const k = build.shell.faces[c.face].tag.kind; count.set(k, (count.get(k) ?? 0) + 1); }
  }
  return SHELL_KINDS.filter(k => count.has(k)).map(k => ({group: 'Partial Cells', label: `${k} partial Cell`, colour: partialColour(k), count: count.get(k)!}));
}

function defectEntries(build: ShellBuild, netKindOutlines: boolean): LegendEntry[] {
  const netUnclassified = netKindOutlines ? build.shell.netEdges.filter(n => n.kind === 'Unclassified').length : 0;
  return [
    {group: 'Defects', label: 'Unclassified Edge', colour: EDGE_KIND_COLOUR.Unclassified, count: build.shell.report.unclassifiedEdges + netUnclassified},
    {group: 'Defects', label: 'Surviving Internal face', colour: SHELL_KIND_COLOUR.Internal, count: build.shell.report.survivingInternal, note: 'triangles'},
  ];
}

function rawEntries(build: ShellBuild): LegendEntry[] {
  const kinds = new Map<ShellKind, number>();
  for (const part of build.union.parts) {
    const seen = new Set<ShellKind>();
    for (const f of part.soup.faceIDs) seen.add(build.union.tags.table[f].kind);
    for (const k of seen) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  return SHELL_KINDS.filter(k => kinds.has(k)).map(k => ({
    group: 'Raw ghosts', label: k === 'Internal' ? 'Internal (raw, removed by the union)' : `${k} (raw)`,
    colour: k === 'Internal' ? RAW_INTERNAL_GREY : SHELL_KIND_COLOUR[k], count: kinds.get(k)!, note: 'parts',
  }));
}

/**
 * Every colour in use for the current options. The two magenta defects are listed always, with a zero count when
 * absent, so the reader sees what magenta would mean.
 */
export function legendEntries(build: ShellBuild, opts: LegendOptions): LegendEntry[] {
  return [
    ...faceEntries(build),
    ...edgeEntries(build, opts.netKindOutlines),
    ...partialEntries(build),
    ...(opts.raw ? rawEntries(build) : []),
    ...defectEntries(build, opts.netKindOutlines),
  ];
}
