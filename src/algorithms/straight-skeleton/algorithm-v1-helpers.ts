import {

    StepResult,

    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";

// Function to make heap interior edges
export function initStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    throw new Error("deprecated")
}


/**
 * Performs a single step of the straight skeleton algorithm.
 * Pops the next valid event from the heap, processes it, and returns
 * diagnostic info about what happened.
 *
 * Returns `poppedEdgeId: -1` when the graph completes during stale-event
 * handling without producing a fresh collision event.
 *
 * Throws if the heap is exhausted before the graph is complete.
 */
export function performOneStep(context: StraightSkeletonSolverContext): StepResult {
    throw new Error("Deprecated")
}
