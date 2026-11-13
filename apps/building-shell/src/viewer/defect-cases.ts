// Journal decision 169: the viewer's "Defect cases" group. The cases are the golden manifest's `clean: false` entries,
// each replayed from its `golden/<name>.input.json`. WP-V3: a case the golden set ships no input for (it is not
// C++-replayable) is built in memory instead, from the pinned case or listed fixture its golden is drawn as
// (`defect-sources.ts`); only a case with neither cannot be loaded. Pure data: no scene, no DOM, no fetch, and no Node
// globals (the page reads the manifest and the inputs, and hands them here).
import type {ShellFixture} from '../fixture.ts';
import type {Vec3} from '../tags.ts';
import type {PinnedCase} from './pinned-cases.ts';

/** A case replayed from its committed `golden/<input>`. */
export interface FileDefectSource { kind: 'file'; input: string }

/** A case built in memory from the pinned case its golden fixture is drawn as, under the case's own name. */
export interface PinnedDefectSource { kind: 'pinned'; pinned: PinnedCase }

/** A case built in memory from the listed fixture its golden fixture is. */
export interface FixtureDefectSource { kind: 'fixture'; fixture: ShellFixture }

/** A case with no input file and no in-memory source: it cannot be loaded, for the manifest's `reasons`. */
export interface NoDefectSource { kind: 'none' }

/** Where a case is built from when it is not read from a file. */
export type InMemoryDefectSource = PinnedDefectSource | FixtureDefectSource;

/** Where the viewer loads a defect case from. */
export type DefectSource = FileDefectSource | InMemoryDefectSource | NoDefectSource;

/** The in-memory sources of the golden set's defect cases, by golden name (`inMemorySources`). */
export type InMemorySources = ReadonlyMap<string, InMemoryDefectSource>;

/** One `clean: false` manifest entry, reduced to what the viewer shows. */
export interface DefectCase {
  name: string;
  /** The manifest's `residueClass`: what kind of residue the fixture is pinned to. */
  residueClass: string;
  /** The manifest's pinned violations, one string each. Empty where the entry pins an `error` instead. */
  violations: string[];
  /** The manifest's pinned build error, for a case whose build throws. */
  error?: string;
  /** The manifest's input: the file under `golden/` the golden set ships for it; absent for a non-replayable case. */
  input?: string;
  /** Why the golden set ships no input for the case (the manifest's `reasons`). */
  reasons: string[];
  /** Where the viewer loads it from: its input file when it has one, else its in-memory source, else nowhere. */
  source: DefectSource;
}

/** A manifest entry's field, as a string, or undefined when it is missing, empty or not a string. Shared with `catalogue.ts`. */
export const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The record behind a JSON value, or undefined when it is not an object. Shared with `catalogue.ts`. */
export const record = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : undefined;

/** The manifest's `fixtures` list, or undefined when the manifest has none: the one reading of the manifest's shape. */
export const manifestEntries = (manifest: unknown): unknown[] | undefined => {
  const fixtures = record(manifest)?.fixtures;
  return Array.isArray(fixtures) ? fixtures : undefined;
};

/** A case's source: its input file when the manifest names one, else its in-memory source, else none. */
const sourceOf = (name: string, input: string | undefined, inMemory: InMemorySources): DefectSource =>
  (input !== undefined ? {kind: 'file', input} : inMemory.get(name) ?? {kind: 'none'});

/**
 * The defect cases of a golden manifest, in manifest order: every entry with `clean: false`, each with its source, an
 * input-less case's from `inMemory`. An entry that is not an object, has no name, or is not marked `clean: false` is left
 * out; a manifest with no `fixtures` list has no cases.
 */
export function parseDefectCases(manifest: unknown, inMemory: InMemorySources = new Map()): DefectCase[] {
  const fixtures = manifestEntries(manifest);
  if (!fixtures) return [];
  return fixtures.flatMap((raw): DefectCase[] => {
    const e = record(raw);
    const name = text(e?.fixture);
    if (!e || name === undefined || e.clean !== false) return [];
    const input = text(e.input);
    return [{
      name,
      residueClass: text(e.residueClass) ?? 'unclassified residue',
      violations: strings(e.violations),
      error: text(e.error),
      input,
      reasons: strings(e.reasons),
      source: sourceOf(name, input, inMemory),
    }];
  });
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:e[+-]?\d+)?`;
const POINT = new RegExp(String.raw`\((${NUMBER}), (${NUMBER}), (${NUMBER})\)`, 'gi');

/** A violation whose "at (0, 0, 0)" is a placeholder for a whole-shell property, not a place. */
const PLACELESS = /^genus per component/;

/** Every position the pinned violations name, as `(x, y, z)` triples, in the order they are written. */
export function violationPoints(violations: readonly string[]): Vec3[] {
  const out: Vec3[] = [];
  for (const v of violations) {
    if (PLACELESS.test(v)) continue;
    for (const m of v.matchAll(POINT)) out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

/** Where the camera looks to see a defect: the centre of its positions, and how far apart they lie. */
export interface DefectFocus { centre: Vec3; extent: number }

/** The smallest extent a focus frames, so one point still gets a view with its surroundings in it, in cm. */
export const MIN_FOCUS_EXTENT_CM = 100;

/** The focus of a set of positions: their bounding box's centre and diagonal, or undefined when there are none. */
export function focusOf(points: readonly Readonly<Vec3>[]): DefectFocus | undefined {
  if (!points.length) return undefined;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p[a]);
      max[a] = Math.max(max[a], p[a]);
    }
  }
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return {centre, extent: Math.max(MIN_FOCUS_EXTENT_CM, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]))};
}

/** The focus of a case's pinned violations. */
export const focusOfCase = (c: Pick<DefectCase, 'violations'>): DefectFocus | undefined => focusOf(violationPoints(c.violations));
