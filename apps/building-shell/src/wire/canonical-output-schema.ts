// STAND-IN, HAND-WRITTEN: the `<subject>.output.json` half of a playtest dump (journal decision 140, F6), until the
// port's output structs exist (decisions 126 and 127). It carries one engine's shell already in the canonical form of
// `canonical.ts`, so a dump can be diffed today. Kinds are validated into `ShellKind` and `EdgeKind` at this boundary
// (decision 138, B6). An output whose edges all carry ends gets the full diff; one whose edges carry none, as the
// legacy C++ net's do, gets the baseline (decision 140, F9). A file mixing the two is refused. Browser-safe.
import {z} from 'zod';
import {EDGE_KINDS, EdgeKind} from '../edges.ts';
import type {BuildingShell} from '../shell.ts';
import {CanonicalFace, CanonicalShell, SHELL_KINDS, canonicalEdge, canonicalOfShell, canonicalShell} from './canonical.ts';
import {RefusedInput, issueLine} from './input-types.ts';

const PointV1Schema = z.strictObject({x: z.number(), y: z.number(), z: z.number()});

export const CanonicalOutputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  /** The producing engine (decision 124). */
  engine: z.string().min(1),
  /** `perimeter` may be omitted (the legacy Surfaces carry none): the other engine's perimeter then sets the tolerance. */
  faces: z.array(z.strictObject({kind: z.enum(SHELL_KINDS), area: z.number().nonnegative(), perimeter: z.number().nonnegative().prefault(0)})),
  edges: z.array(z.strictObject({kind: z.enum(EDGE_KINDS), a: PointV1Schema.optional(), b: PointV1Schema.optional()})),
});

export type CanonicalOutputV1 = z.output<typeof CanonicalOutputV1Schema>;

/** An output file read: a full canonical shell, or the baseline's faces and edge kinds. */
export type ReadOutputResult =
  | {ok: true; mode: 'full'; engine: string; shell: CanonicalShell}
  | {ok: true; mode: 'baseline'; engine: string; faces: CanonicalFace[]; edgeKinds: EdgeKind[]}
  | RefusedInput;

export function readOutput(json: unknown): ReadOutputResult {
  const r = CanonicalOutputV1Schema.safeParse(json);
  if (!r.success) return {ok: false, errors: r.error.issues.map(issueLine)};
  const {engine, faces, edges} = r.data;
  const ended = edges.filter(e => e.a && e.b).length;
  if (ended === edges.length) {
    return {ok: true, mode: 'full', engine, shell: canonicalShell(faces, edges.map(e => canonicalEdge(e.kind, [e.a!.x, e.a!.y, e.a!.z], [e.b!.x, e.b!.y, e.b!.z])))};
  }
  if (edges.every(e => !e.a && !e.b)) return {ok: true, mode: 'baseline', engine, faces, edgeKinds: edges.map(e => e.kind)};
  return {ok: false, errors: [`${edges.length - ended} of ${edges.length} edges carry no ends: an output's edges carry ends all or none (journal decision 140)`]};
}

/** One engine's shell as an output file, every edge with its ends. */
export function writeOutput(engine: string, s: BuildingShell): CanonicalOutputV1 {
  const c = canonicalOfShell(s);
  return {
    schemaVersion: 1,
    engine,
    faces: c.faces,
    edges: c.edges.map(e => ({kind: e.kind, a: {x: e.a[0], y: e.a[1], z: e.a[2]}, b: {x: e.b[0], y: e.b[1], z: e.b[2]}})),
  };
}
