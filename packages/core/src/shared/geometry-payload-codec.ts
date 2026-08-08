import type { Vector2 } from './types';
import type { GeometryPayload, GeometryPayloadKind } from './geometry-payload';
import { GEOMETRY_PAYLOAD_FORMAT, GEOMETRY_PAYLOAD_VERSION } from './geometry-payload';

/**
 * Codec for the shared geometry interchange payload.
 *
 * `parseGeometryPayload` is **total**: its input is arbitrary text a user
 * pasted, so it never throws and never returns anything a caller has to
 * null-check. Every outcome is a member of {@link ParseGeometryPayloadResult}.
 *
 * `serialiseGeometryPayload` is the asymmetric half. It throws on a payload it
 * cannot represent — a non-finite coordinate — because `JSON.stringify` turns
 * `NaN` and `Infinity` into `null` silently, and emitting a payload that the
 * matching parser will reject is worse than refusing to emit it. Producers hold
 * their own geometry and can keep it finite; consumers cannot choose what lands
 * on the clipboard, which is why only one side of the codec is total.
 */

/**
 * Longest input accepted, in UTF-16 code units (~4 MiB, or roughly 130k
 * vertices at typical coordinate lengths). Checked before `JSON.parse`, so a
 * hostile multi-megabyte string is rejected in constant time rather than
 * parsed. A payload legitimately larger than this has no business travelling
 * through a clipboard.
 */
export const MAX_SERIALISED_LENGTH = 4 * 1024 * 1024;

/**
 * How a bare `Vector2[]` is interpreted, and why `true`.
 *
 * The legacy wire form has no closed flag, so parsing one means *choosing* a
 * value. Every legacy producer in this repo is the dashboard's polygon copy
 * button, whose store holds a closed region, and the matching legacy paste path
 * required at least three vertices — a polygon's minimum, not a path's.
 * Defaulting to `false` would therefore silently reclassify every payload that
 * already exists as a path, and the straight skeleton would start refusing work
 * it does today. Defaulting to `true` preserves the meaning those payloads
 * always had.
 *
 * The cost of the choice is the other direction: a legacy array that really was
 * a path arrives labelled as a region. That is why the value is reported as
 * assumed rather than read — see {@link ParseGeometryPayloadSuccess.assumed} —
 * so a consumer that cares can confirm rather than trust.
 */
export const LEGACY_BARE_ARRAY_CLOSED = true;

/**
 * The legacy paste path required at least three vertices, so a shorter bare
 * array was never a valid payload in that format and is not accepted as one
 * now. The versioned form places no such minimum; this applies only to the
 * unmarked legacy array, whose default `closed: true` means "polygon".
 */
export const LEGACY_BARE_ARRAY_MIN_VERTICES = 3;

/** Which wire form a successful parse read. */
export type PayloadEncoding = 'versioned' | 'legacy-bare-array';

/** A field whose value the wire form does not carry, and which parsing therefore supplied. */
export type AssumedField = 'closed';

export type ParseFailureReason =
    /** Input was not a string at all. */
    | 'not-a-string'
    /** Input exceeds {@link MAX_SERIALISED_LENGTH} and was rejected unparsed. */
    | 'input-too-large'
    /** `JSON.parse` rejected the text. */
    | 'not-json'
    /** Valid JSON, but neither a versioned envelope nor a bare vertex array. */
    | 'unrecognised-shape'
    /** A versioned envelope declaring a version this build does not read. */
    | 'unsupported-version'
    /** A versioned envelope of a supported version whose body kind is unknown. */
    | 'unsupported-kind'
    /** Recognised as one of ours, but a field is missing, mistyped or out of range. */
    | 'malformed-payload';

export interface ParseGeometryPayloadSuccess {
    ok: true;
    payload: GeometryPayload;
    /** The wire form the payload was read from. */
    encoding: PayloadEncoding;
    /**
     * Fields whose value was supplied by the parser because the wire form does
     * not carry them, rather than read from the input. Always empty for
     * `versioned`; `['closed']` for `legacy-bare-array`.
     */
    assumed: readonly AssumedField[];
}

export interface ParseGeometryPayloadFailure {
    ok: false;
    reason: ParseFailureReason;
    /** Human-readable specifics: which field, which index, what was found. */
    detail: string;
}

export type ParseGeometryPayloadResult = ParseGeometryPayloadSuccess | ParseGeometryPayloadFailure;

const KNOWN_KINDS: readonly GeometryPayloadKind[] = ['vertex-run'];

const NO_ASSUMPTIONS: readonly AssumedField[] = [];
const CLOSED_ASSUMED: readonly AssumedField[] = ['closed'];

function fail(reason: ParseFailureReason, detail: string): ParseGeometryPayloadFailure {
    return { ok: false, reason, detail };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a value is, in one word, for a failure detail. */
function describe(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `an array of ${String(value.length)}`;
    return typeof value;
}

type VertexReadResult = { ok: true; vertices: Vector2[] } | { ok: false; detail: string };

/**
 * Read an array of vertices. Only `x` and `y` are read; any other property on a
 * vertex is ignored rather than rejected, so a producer that decorates its
 * points does not break a reader that does not care about the decoration.
 */
function readVertices(value: unknown): VertexReadResult {
    if (!Array.isArray(value)) {
        return { ok: false, detail: `"vertices" must be an array; found ${describe(value)}.` };
    }
    const vertices: Vector2[] = [];
    for (let i = 0; i < value.length; i++) {
        const entry: unknown = value[i];
        if (!isPlainObject(entry)) {
            return { ok: false, detail: `Vertex ${String(i)} must be an object with x and y; found ${describe(entry)}.` };
        }
        const { x, y } = entry;
        if (typeof x !== 'number' || typeof y !== 'number') {
            return {
                ok: false,
                detail: `Vertex ${String(i)} must have numeric x and y; found x: ${describe(x)}, y: ${describe(y)}.`,
            };
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return {
                ok: false,
                detail: `Vertex ${String(i)} must be finite; found x: ${String(x)}, y: ${String(y)}.`,
            };
        }
        vertices.push({ x, y });
    }
    return { ok: true, vertices };
}

/** A versioned envelope: version is checked before any body field is touched. */
function parseEnvelope(source: Record<string, unknown>): ParseGeometryPayloadResult {
    const { version } = source;
    if (typeof version !== 'number' || !Number.isInteger(version)) {
        return fail(
            'unsupported-version',
            `"version" must be an integer; found ${describe(version)}. This build reads version ${String(GEOMETRY_PAYLOAD_VERSION)}.`,
        );
    }
    if (version !== GEOMETRY_PAYLOAD_VERSION) {
        return fail(
            'unsupported-version',
            `Payload declares version ${String(version)}; this build reads version ${String(GEOMETRY_PAYLOAD_VERSION)} only. No field was read.`,
        );
    }

    const { kind } = source;
    if (typeof kind !== 'string') {
        return fail('malformed-payload', `"kind" must be a string; found ${describe(kind)}.`);
    }
    if (!(KNOWN_KINDS as readonly string[]).includes(kind)) {
        return fail(
            'unsupported-kind',
            `Unknown payload kind "${kind}". This build understands: ${KNOWN_KINDS.join(', ')}.`,
        );
    }

    const { closed } = source;
    if (typeof closed !== 'boolean') {
        return fail('malformed-payload', `"closed" must be a boolean; found ${describe(closed)}.`);
    }

    const read = readVertices(source.vertices);
    if (!read.ok) return fail('malformed-payload', read.detail);

    return {
        ok: true,
        payload: {
            format: GEOMETRY_PAYLOAD_FORMAT,
            version: GEOMETRY_PAYLOAD_VERSION,
            kind: 'vertex-run',
            closed,
            vertices: read.vertices,
        },
        encoding: 'versioned',
        assumed: NO_ASSUMPTIONS,
    };
}

/** The pre-envelope wire form: a bare `Vector2[]` with no metadata whatsoever. */
function parseLegacyBareArray(source: unknown[]): ParseGeometryPayloadResult {
    if (source.length === 0) {
        return fail(
            'unrecognised-shape',
            'Empty array: it carries no marker and no element to identify, so it cannot be told from unrelated empty JSON.',
        );
    }

    const read = readVertices(source);
    if (!read.ok) return fail('malformed-payload', read.detail);

    if (read.vertices.length < LEGACY_BARE_ARRAY_MIN_VERTICES) {
        return fail(
            'malformed-payload',
            `Bare vertex array has ${String(read.vertices.length)} vertices; the legacy format is a closed polygon and requires at least ${String(LEGACY_BARE_ARRAY_MIN_VERTICES)}. Use the versioned envelope for shorter runs.`,
        );
    }

    return {
        ok: true,
        payload: {
            format: GEOMETRY_PAYLOAD_FORMAT,
            version: GEOMETRY_PAYLOAD_VERSION,
            kind: 'vertex-run',
            closed: LEGACY_BARE_ARRAY_CLOSED,
            vertices: read.vertices,
        },
        encoding: 'legacy-bare-array',
        assumed: CLOSED_ASSUMED,
    };
}

/**
 * Read a payload from clipboard text. Total: hostile, truncated, oversized and
 * simply unrelated input all return a failure result rather than throwing.
 *
 * Accepts both wire forms — the versioned envelope and the legacy bare
 * `Vector2[]` — and reports which one it read, plus any field it had to assume
 * rather than read.
 *
 * The parameter is `unknown` rather than `string` so that a caller handing over
 * an already-parsed value, or whatever a clipboard API returned, gets a failure
 * result instead of a type error at one call site and a crash at another.
 */
export function parseGeometryPayload(text: unknown): ParseGeometryPayloadResult {
    if (typeof text !== 'string') {
        return fail('not-a-string', `Expected serialised text; found ${describe(text)}.`);
    }
    if (text.length > MAX_SERIALISED_LENGTH) {
        return fail(
            'input-too-large',
            `Input is ${String(text.length)} characters; the limit is ${String(MAX_SERIALISED_LENGTH)}.`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail('not-json', `Input is not valid JSON: ${message}`);
    }

    if (Array.isArray(parsed)) return parseLegacyBareArray(parsed);

    if (!isPlainObject(parsed)) {
        return fail('unrecognised-shape', `Expected an object or an array of vertices; found ${describe(parsed)}.`);
    }

    if (parsed.format !== GEOMETRY_PAYLOAD_FORMAT) {
        return fail(
            'unrecognised-shape',
            `Not a ${GEOMETRY_PAYLOAD_FORMAT} payload: "format" is ${describe(parsed.format)}.`,
        );
    }

    return parseEnvelope(parsed);
}

export interface SerialiseOptions {
    /** Spaces per level of indentation. 0 (the default) emits compact JSON. */
    indent?: number;
}

/**
 * Write a payload as clipboard text.
 *
 * Throws `TypeError` if any coordinate is non-finite: `JSON.stringify` would
 * write `null` for it, producing text that {@link parseGeometryPayload} rejects
 * as malformed, and a producer discovering its own corrupt data at the point of
 * emission is far better placed to act than a consumer discovering it later.
 *
 * Only `x` and `y` are written from each vertex, so a payload built from
 * decorated points serialises to the canonical form and round-trips exactly.
 */
export function serialiseGeometryPayload(payload: GeometryPayload, options?: SerialiseOptions): string {
    const vertices = payload.vertices.map((v, i) => {
        if (typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
            throw new TypeError(
                `Cannot serialise vertex ${String(i)}: x and y must be finite numbers; found x: ${String(v.x)}, y: ${String(v.y)}.`,
            );
        }
        return { x: v.x, y: v.y };
    });

    const wire = {
        format: GEOMETRY_PAYLOAD_FORMAT,
        version: GEOMETRY_PAYLOAD_VERSION,
        kind: payload.kind,
        closed: payload.closed,
        vertices,
    };
    return JSON.stringify(wire, null, options?.indent ?? 0);
}
