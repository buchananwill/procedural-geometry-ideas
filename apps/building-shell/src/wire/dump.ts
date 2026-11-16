// A playtest dump (journal decisions 140, F6, and 149, agreed with the port lead): an input document plus an optional
// output, each its own schema document with its own `schemaVersion`. The exporter names them per solve,
// `<dump basename>.<SolveIndex>.<Subject>.<Seed>.input.json` (decision 152, the subject sanitised) and the same stem
// with `.output.json`, in the solve dump's directory, the seed always present. Ingestion pairs them by the stem before `.input.json` or `.output.json`, whatever dots it
// holds; the subject is read from the input's provenance, never from the name. Browser-safe.
import {RING_SIDES} from '../fixture.ts';
import {CellSource, compareSources} from '../provenance.ts';
import type {BuildingShell} from '../shell.ts';
import {DiffReport, baselineReport, canonicalOfShell, diffReport} from './canonical.ts';
import {readOutput} from './canonical-output-schema.ts';
import type {AdaptedInput} from './input-adapter.ts';
import type {RefusedInput} from './input-types.ts';

export const INPUT_SUFFIX = '.input.json';
export const OUTPUT_SUFFIX = '.output.json';

/** The engine name the prototype's side of every diff carries. */
export const PROTOTYPE_ENGINE = 'prototype @proc-geo/building-shell';

/** One dump's files by name, and the stem they share: everything before `.input.json` (decision 149). */
export interface DumpFiles { stem: string; input: string; output?: string }

/**
 * A folder's file names as dumps, paired by stem, and every name that belongs to none: a JSON that is not an input, an
 * output with no input, or an input with an empty stem. Suffixes match exactly, case included.
 */
export interface DumpListing { dumps: DumpFiles[]; strays: string[] }

export function listDumps(names: readonly string[]): DumpListing {
  const json = names.filter(n => n.toLowerCase().endsWith('.json'));
  // An input with an empty stem, `.input.json` alone, is no dump (decision 143, F7): it stays a stray.
  const inputs = json.filter(n => n.endsWith(INPUT_SUFFIX) && n.length > INPUT_SUFFIX.length).sort();
  const dumps = inputs.map(input => {
    const stem = input.slice(0, -INPUT_SUFFIX.length);
    const output = `${stem}${OUTPUT_SUFFIX}`;
    return json.includes(output) ? {stem, input, output} : {stem, input};
  });
  const claimed = new Set(dumps.flatMap(d => (d.output ? [d.input, d.output] : [d.input])));
  return {dumps, strays: json.filter(n => !claimed.has(n)).sort()};
}

/**
 * Journal decisions 140's Q3 note and 156, F1: a shell built from a file's fixture, its provenance naming the file's own
 * Rings and sides, never the fixture's compressed positions or its compass order. Every Cell's and face's source is
 * mapped through `adapted.modelIndices` and `adapted.sideSlots`, and each face's sources are sorted again, by model
 * index then side. Journal decisions 261 and 262: the report's dropped Rings are mapped through `adapted.modelIndices`
 * too, and sorted again.
 */
export function withFileModelIndices(shell: BuildingShell, adapted: Pick<AdaptedInput, 'modelIndices' | 'sideSlots'>): BuildingShell {
  const modelIndex = (position: number): number => {
    const m = adapted.modelIndices[position];
    if (m === undefined) throw new Error(`the report drops Ring ${position}, which the file does not hold`);
    return m;
  };
  const map = (s: CellSource): CellSource => {
    const ringModelIndex = adapted.modelIndices[s.ringModelIndex];
    const compass = RING_SIDES[s.side];
    const side = compass && adapted.sideSlots[s.ringModelIndex]?.[compass];
    if (ringModelIndex === undefined || side === undefined) throw new Error(`a source names Ring ${s.ringModelIndex} side ${s.side}, which the file does not hold`);
    return {ringModelIndex, side};
  };
  return {
    ...shell,
    cells: shell.cells.map(c => ({...c, source: c.source && map(c.source)})),
    faces: shell.faces.map(f => ({...f, sources: f.sources.map(map).sort(compareSources)})),
    report: {...shell.report, droppedRings: shell.report.droppedRings.map(modelIndex).sort((a, b) => a - b)},
  };
}

/** The diff of a dump's output against the prototype's build of its input: full, or the legacy baseline. */
export function dumpReport(stem: string, adapted: AdaptedInput, shell: BuildingShell, outputJson: unknown): DiffReport | RefusedInput {
  const out = readOutput(outputJson);
  if (!out.ok) return out;
  const engines = [PROTOTYPE_ENGINE, out.engine] as const;
  const mine = canonicalOfShell(shell);
  return out.mode === 'full'
    ? diffReport(stem, engines, adapted.report, mine, out.shell)
    : baselineReport(stem, engines, adapted.report, mine, out.faces, out.edgeKinds);
}
