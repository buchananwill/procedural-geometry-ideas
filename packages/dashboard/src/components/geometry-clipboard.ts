import type { Vector2 } from '@proc-geo/core';
import { parseGeometryPayload } from '@proc-geo/core';

/**
 * Reading clipboard text into polygon vertices for `usePolygonStore`.
 *
 * The codec (`parseGeometryPayload`) owns the wire format and deliberately owns
 * no policy: it will happily hand back a two-vertex open path, because whether
 * that is acceptable belongs to the consumer. This module is that consumer's
 * policy, kept pure so it can be tested without a clipboard or a DOM.
 *
 * Two rules, and both are refusals rather than repairs:
 *
 * - **At least three vertices.** The polygon store's minimum, and the straight
 *   skeleton's.
 * - **`closed: false` is rejected outright.** The store has no representation
 *   for an open path, and joining the endpoints to invent one would fabricate an
 *   edge the user never drew.
 *
 * A legacy bare array has no closed flag, so the codec supplies one and reports
 * it in `assumed`. That is accepted — every legacy producer in this repo emitted
 * a region — but reported back as a note, so the user knows a call was made on
 * their behalf.
 */

/** Fewest vertices that make a polygon. Matches `usePolygonStore` and `solveSkeleton`. */
export const MIN_POLYGON_VERTICES = 3;

export interface GeometryPasteAccepted {
    ok: true;
    vertices: Vector2[];
    /** Set when a field was assumed rather than read; null when the payload said everything. */
    note: string | null;
}

export interface GeometryPasteRejected {
    ok: false;
    /** Short heading for a notification. */
    title: string;
    /** The codec's detail, or this module's own reason for refusing. */
    message: string;
}

export type GeometryPasteOutcome = GeometryPasteAccepted | GeometryPasteRejected;

/** Total, like the codec it wraps: arbitrary clipboard text in, a decision out. */
export function interpretGeometryPaste(text: unknown): GeometryPasteOutcome {
    const parsed = parseGeometryPayload(text);
    if (!parsed.ok) {
        return { ok: false, title: `Paste rejected (${parsed.reason})`, message: parsed.detail };
    }

    const { payload, assumed } = parsed;

    if (!payload.closed) {
        return {
            ok: false,
            title: 'Paste rejected (open path)',
            message:
                `This payload is an open path of ${String(payload.vertices.length)} vertices. ` +
                'The straight skeleton solves closed regions only, and this page has no way to hold a path. ' +
                'Close the stroke before copying it.',
        };
    }

    if (payload.vertices.length < MIN_POLYGON_VERTICES) {
        return {
            ok: false,
            title: 'Paste rejected (too few vertices)',
            message:
                `A polygon needs at least ${String(MIN_POLYGON_VERTICES)} vertices; ` +
                `this payload has ${String(payload.vertices.length)}.`,
        };
    }

    return {
        ok: true,
        vertices: payload.vertices,
        note: assumed.includes('closed')
            ? 'The clipboard held a bare vertex array with no closure flag, so it was read as a closed polygon.'
            : null,
    };
}
