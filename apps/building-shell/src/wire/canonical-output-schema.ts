// STAND-IN, HAND-WRITTEN: the `<subject>.output.json` half of a playtest dump (journal decision 140, F6), until the
// port's output structs exist (decisions 126 and 127). It carries one engine's shell already in the canonical form of
// `canonical.ts`, so a dump can be diffed today. Kinds are validated into `ShellKind` and `EdgeKind` at this boundary
// (decision 138, B6). An output whose edges all carry ends gets the full diff; one whose edges carry none, as the
// legacy C++ net's do, gets the baseline (decision 140, F9). A file mixing the two is refused. Browser-safe.
import {z} from 'zod';
import {EDGE_KINDS, EdgeKind} from '../edges.ts';
import type {BuildingShell} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {CanonicalFace, CanonicalShell, SHELL_KINDS, canonicalEdge, canonicalOfShell, canonicalShell} from './canonical.ts';
import {RefusedInput, issueLine} from './input-types.ts';

const PointV1Schema = z.strictObject({x: z.number(), y: z.number(), z: z.number()});

/**
 * One canonical face (decision 142, B4). `perimeter` is an explicit optional (N3): the legacy Surfaces carry none, and
 * the other engine's perimeter then sets the tolerance. tests/wire-types.test.ts checks it against `CanonicalFace`.
 */
export const CanonicalFaceSchema = z.strictObject({
  kind: z.enum(SHELL_KINDS),
  area: z.number().nonnegative(),
  perimeter: z.number().nonnegative().optional(),
});

export const CanonicalEdgeOutputSchema = z.strictObject({kind: z.enum(EDGE_KINDS), a: PointV1Schema.optional(), b: PointV1Schema.optional()});

export const CanonicalOutputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  /** The producing engine (decision 124). */
  engine: z.string().min(1),
  faces: z.array(CanonicalFaceSchema),
  edges: z.array(CanonicalEdgeOutputSchema),
});

export type CanonicalOutputV1 = z.output<typeof CanonicalOutputV1Schema>;
type OutputEdge = z.output<typeof CanonicalEdgeOutputSchema>;
type OutputPoint = z.output<typeof PointV1Schema>;

/** An output whose edges all carry ends: the full diff applies. */
export interface FullOutput { ok: true; mode: 'full'; engine: string; shell: CanonicalShell }

/** An output whose edges carry no ends, as the legacy net's: the baseline applies. */
export interface BaselineOutput { ok: true; mode: 'baseline'; engine: string; faces: CanonicalFace[]; edgeKinds: EdgeKind[] }

export type ReadOutputResult = FullOutput | BaselineOutput | RefusedInput;

/** An output edge with both ends, typed so (decision 142, B3). */
interface EndedEdge { kind: EdgeKind; a: OutputPoint; b: OutputPoint }

const endedEdge = (e: OutputEdge): EndedEdge[] => (e.a && e.b ? [{kind: e.kind, a: e.a, b: e.b}] : []);
const vec = (p: OutputPoint): Vec3 => [p.x, p.y, p.z];

export function readOutput(json: unknown): ReadOutputResult {
  const r = CanonicalOutputV1Schema.safeParse(json);
  if (!r.success) return {ok: false, errors: r.error.issues.map(issueLine)};
  const {engine, faces, edges} = r.data;
  const ended = edges.flatMap(endedEdge);
  if (ended.length === edges.length) {
    return {ok: true, mode: 'full', engine, shell: canonicalShell(faces, ended.map(e => canonicalEdge(e.kind, vec(e.a), vec(e.b))))};
  }
  if (edges.every(e => !e.a && !e.b)) return {ok: true, mode: 'baseline', engine, faces, edgeKinds: edges.map(e => e.kind)};
  return {ok: false, errors: [`${edges.length - ended.length} of ${edges.length} edges carry no ends: an output's edges carry ends all or none (journal decision 140)`]};
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
