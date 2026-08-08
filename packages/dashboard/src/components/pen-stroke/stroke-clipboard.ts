import type { StrokePipelineResult, Vector2 } from '@proc-geo/core';
import { DEFAULT_VERTEX_BUDGET, makeVertexRun, serialiseGeometryPayload, strokeToBudgetedPolygon } from '@proc-geo/core';

/**
 * Turning a pipeline result into clipboard text, and saying what that cost.
 *
 * Kept out of the component so the payload the button writes can be asserted
 * without rendering anything: the dashboard's jest environment is `node`, and
 * this is the part worth testing anyway.
 *
 * The stroke's own `closed` flag is carried through untouched. An open stroke is
 * copyable — the payload says `closed: false` and the consumer refuses it with a
 * reason — because silently promoting a path to a region would hand the skeleton
 * solver a closing edge the user never drew.
 */

/**
 * Smallest budget the control may offer. `reduceToVertexBudget` throws below
 * three rather than clamping, so this is a hard floor and not a taste call.
 */
export const MIN_VERTEX_BUDGET = 3;

/**
 * Largest budget the control may offer, and the shipped default.
 *
 * Deliberately the same number as `DEFAULT_VERTEX_BUDGET` rather than something
 * roomier: the budget exists because straight-skeleton solve cost grows at
 * roughly the cube of the vertex count, and core's own timings put 64 at ~0.7 s
 * against ~3 s at 106. Offering 128 on the slider would spend half the track on
 * budgets nobody drawing interactively wants, and stretch out precisely the low
 * end — 8 to 16 — that the control is for.
 */
export const MAX_VERTEX_BUDGET = DEFAULT_VERTEX_BUDGET;

/** Round and clamp an arbitrary control reading into a budget `reduceToVertexBudget` accepts. */
export function clampVertexBudget(budget: number): number {
    if (!Number.isFinite(budget)) return DEFAULT_VERTEX_BUDGET;
    return Math.min(MAX_VERTEX_BUDGET, Math.max(MIN_VERTEX_BUDGET, Math.round(budget)));
}

export interface StrokeClipboardSummary {
    /** The serialised payload, ready for `navigator.clipboard.writeText`. */
    text: string;
    /**
     * The budgeted vertices, exactly as serialised into {@link text} — the same
     * objects, not a second reduction from the same inputs. Anything that wants
     * to *draw* what the copy will carry reads this, so the drawing and the
     * clipboard cannot drift apart.
     */
    vertices: Vector2[];
    /** Vertices in the copied payload, after budgeting. */
    vertexCount: number;
    /** True when budgeting removed vertices; false when the stroke was already within budget. */
    reduced: boolean;
    /** Worst deviation from the unreduced polyline, in canvas units. Zero when nothing was removed. */
    maxError: number;
    /** The stroke's own closure, as written to the payload. */
    closed: boolean;
    /** One line for the panel, describing what is on the clipboard. */
    description: string;
}

/** Build the clipboard payload for a stroke, plus the line of feedback that goes with it. */
export function summariseStrokeCopy(
    result: StrokePipelineResult,
    budget: number = DEFAULT_VERTEX_BUDGET,
): StrokeClipboardSummary {
    const budgeted = strokeToBudgetedPolygon(result, budget);
    const text = serialiseGeometryPayload(makeVertexRun(budgeted.vertices, result.closed), { indent: 2 });

    const count = `${String(budgeted.achieved)} vert${budgeted.achieved === 1 ? 'ex' : 'ices'}`;
    const budgetNote = budgeted.reduced
        ? `reduced to the ${String(budget)}-vertex budget (max deviation ${budgeted.maxError.toFixed(2)} px)`
        : `within the ${String(budget)}-vertex budget`;
    const closureNote = result.closed
        ? 'Closed loop.'
        : 'Open path — the straight skeleton page will refuse it; close the stroke to solve it.';

    return {
        text,
        vertices: budgeted.vertices,
        vertexCount: budgeted.achieved,
        reduced: budgeted.reduced,
        maxError: budgeted.maxError,
        closed: result.closed,
        description: `${count}, ${budgetNote}. ${closureNote}`,
    };
}
