// A playtest dump (journal decision 140, F6, agreed with the port lead): `<subject>.input.json` plus an optional
// `<subject>.output.json`, sharing a basename, each its own schema document with its own `schemaVersion`. Browser-safe.
import type {BuildingShell} from '../shell.ts';
import {DiffReport, baselineReport, canonicalOfShell, diffReport} from './canonical.ts';
import {readOutput} from './canonical-output-schema.ts';
import type {AdaptedInput} from './input-adapter.ts';
import type {RefusedInput} from './input-types.ts';

export const INPUT_SUFFIX = '.input.json';
export const OUTPUT_SUFFIX = '.output.json';

/** The engine name the prototype's side of every diff carries. */
export const PROTOTYPE_ENGINE = 'prototype @proc-geo/building-shell';

/** One dump's files by name. */
export interface DumpFiles { subject: string; input: string; output?: string }

/**
 * A folder's file names as dumps, and every name that belongs to none: a JSON that is not an input, an output with no
 * input, or an input with an empty subject. Suffixes match exactly, case included.
 */
export interface DumpListing { dumps: DumpFiles[]; strays: string[] }

export function listDumps(names: readonly string[]): DumpListing {
  const json = names.filter(n => n.toLowerCase().endsWith('.json'));
  // An input with an empty subject, `.input.json` alone, is no dump (decision 143, F7): it stays a stray.
  const inputs = json.filter(n => n.endsWith(INPUT_SUFFIX) && n.length > INPUT_SUFFIX.length).sort();
  const dumps = inputs.map(input => {
    const subject = input.slice(0, -INPUT_SUFFIX.length);
    const output = `${subject}${OUTPUT_SUFFIX}`;
    return json.includes(output) ? {subject, input, output} : {subject, input};
  });
  const claimed = new Set(dumps.flatMap(d => (d.output ? [d.input, d.output] : [d.input])));
  return {dumps, strays: json.filter(n => !claimed.has(n)).sort()};
}

/** The diff of a dump's output against the prototype's build of its input: full, or the legacy baseline. */
export function dumpReport(subject: string, adapted: AdaptedInput, shell: BuildingShell, outputJson: unknown): DiffReport | RefusedInput {
  const out = readOutput(outputJson);
  if (!out.ok) return out;
  const engines = [PROTOTYPE_ENGINE, out.engine] as const;
  const mine = canonicalOfShell(shell);
  return out.mode === 'full'
    ? diffReport(subject, engines, adapted.report, mine, out.shell)
    : baselineReport(subject, engines, adapted.report, mine, out.faces, out.edgeKinds);
}
