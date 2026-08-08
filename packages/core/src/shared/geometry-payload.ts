import type { Vector2 } from './types';

/**
 * The shared geometry interchange payload.
 *
 * Modules in this monorepo hand geometry to each other through the clipboard,
 * and until now the wire form was a bare `Vector2[]`. That carries no metadata,
 * and the omission became load-bearing the moment the stroke pipeline gained
 * closed-loop support: a bare array cannot say whether its run of vertices
 * bounds a *region* (which the straight skeleton can solve) or traces a *path*
 * (which it cannot). This envelope exists to carry that one bit honestly, plus
 * the minimum needed to let a reader refuse what it cannot understand instead
 * of misreading it.
 *
 * Four fields, and each earns its place:
 *
 * - `format` — a magic string. Arbitrary JSON objects on a clipboard are
 *   common; without a marker there is no way to tell a payload of ours from
 *   someone else's object that happens to have a `version`.
 * - `version` — an integer, checked *before* any body field is read, so a
 *   payload from a future build is rejected whole rather than partially
 *   understood.
 * - `kind` — the body discriminator, and the extension seam. A third module
 *   that needs a different body (control points rather than vertices, a set of
 *   rings rather than one run) adds a member to {@link GeometryPayloadBody};
 *   existing readers reject the new `kind` with a clear reason, which is a
 *   correct outcome rather than a breaking change.
 * - the body — for `vertex-run`, the vertices and the `closed` flag.
 *
 * What it deliberately does not carry: a producing-module tag, styling, units,
 * or a transform. None has a consumer today, and an interchange format earns
 * fields by being asked for them.
 */

/** Magic string identifying a JSON object as one of ours. */
export const GEOMETRY_PAYLOAD_FORMAT = 'proc-geo/geometry';

/** The only envelope version this build reads or writes. */
export const GEOMETRY_PAYLOAD_VERSION = 1;

/**
 * An ordered run of vertices.
 *
 * `closed: true` means the run bounds a region: the last vertex connects back
 * to the first, and **that closing edge is implied**. The first vertex is never
 * repeated at the end — a producer holding a seam duplicate must strip it
 * before building the payload, exactly as `strokeToBudgetedPolygon` does, since
 * a repeated point reads to a polygon solver as a zero-length edge.
 *
 * `closed: false` means the run is a path: the first and last vertices are
 * genuine endpoints and no edge joins them.
 *
 * The envelope places no minimum on `vertices`. Zero, one and two vertices are
 * all representable, because refusing them is the *consumer's* judgement and
 * different consumers draw the line differently — `solveSkeleton` needs three,
 * a path renderer needs two, and a codec that pre-empted either would be
 * deciding policy it does not own.
 */
export interface VertexRunBody {
    kind: 'vertex-run';
    closed: boolean;
    vertices: Vector2[];
}

/** The payload bodies this format can carry. Adding a member is the sanctioned extension. */
export type GeometryPayloadBody = VertexRunBody;

export type GeometryPayloadKind = GeometryPayloadBody['kind'];

/** Fields every payload carries, whatever its body. */
export interface GeometryPayloadEnvelope {
    format: typeof GEOMETRY_PAYLOAD_FORMAT;
    version: typeof GEOMETRY_PAYLOAD_VERSION;
}

export type GeometryPayload = GeometryPayloadEnvelope & GeometryPayloadBody;

/** Build a vertex-run payload. Vertices are copied, so the payload never aliases the caller's array. */
export function makeVertexRun(vertices: readonly Vector2[], closed: boolean): GeometryPayload {
    return {
        format: GEOMETRY_PAYLOAD_FORMAT,
        version: GEOMETRY_PAYLOAD_VERSION,
        kind: 'vertex-run',
        closed,
        vertices: vertices.map((v) => ({ x: v.x, y: v.y })),
    };
}
