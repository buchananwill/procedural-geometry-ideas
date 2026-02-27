import type {
    AlgorithmStepInput,
    CollisionEvent,
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
} from '../types';
import {makeStraightSkeletonSolverContext} from '../solver-context';
import {initInteriorEdges, tryToAcceptExteriorEdge} from '../algorithm-helpers';
import {stepAlgorithm} from '../algorithm-termination-cases';
import {collideEdges} from '../collision-helpers';

// ---------------------------------------------------------------------------
// Graph query helpers
// ---------------------------------------------------------------------------

export const interiorNodes = (g: StraightSkeletonGraph) =>
    g.nodes.slice(g.numExteriorNodes);

export function boundingBox(verts: Vector2[]) {
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    return {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
    };
}

// ---------------------------------------------------------------------------
// Context initialisation (V5 pipeline)
// ---------------------------------------------------------------------------

export function initContext(vertices: Vector2[]): StraightSkeletonSolverContext {
    const context = makeStraightSkeletonSolverContext(vertices);
    initInteriorEdges(context);
    return context;
}

// ---------------------------------------------------------------------------
// Step-by-step capture
// ---------------------------------------------------------------------------

export interface StepSnapshot {
    step: number;
    inputCount: number;
    inputs: { edges: number[] }[];
    acceptedEdges: boolean[];
    nodeCount: number;
    edgeCount: number;
    interiorEdgeCount: number;
}

/**
 * Run the V5 algorithm step-by-step, capturing a snapshot after each
 * iteration.  If the algorithm throws, we catch the error and return
 * what we have so far.
 */
export function stepWithCapture(vertices: Vector2[]): {
    snapshots: StepSnapshot[];
    error: string | null;
    context: StraightSkeletonSolverContext;
    lastInputs: AlgorithmStepInput[];
} {
    const context = initContext(vertices);
    const exteriorEdges = context.graph.edges.slice(0, context.graph.numExteriorNodes);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
    const snapshots: StepSnapshot[] = [];
    let step = 0;
    let error: string | null = null;
    let lastInputs = inputs;

    while (inputs.length > 0) {
        try {
            lastInputs = inputs;
            inputs = stepAlgorithm(context, inputs).childSteps;
            exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));

            snapshots.push({
                step: step++,
                inputCount: inputs.length,
                inputs: inputs.map(i => ({edges: [...i.interiorEdges]})),
                acceptedEdges: [...context.acceptedEdges],
                nodeCount: context.graph.nodes.length,
                edgeCount: context.graph.edges.length,
                interiorEdgeCount: context.graph.interiorEdges.length,
            });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            break;
        }
    }

    return {snapshots, error, context, lastInputs};
}

// ---------------------------------------------------------------------------
// Collision event collection
// ---------------------------------------------------------------------------

export interface LabelledCollisionEvent {
    label: string;
    event: CollisionEvent;
}

/**
 * Enumerate all non-diverging collision events for the current set of
 * active interior edges in `context`, including interior-vs-exterior
 * pairs for reflex edges.  Returns them sorted by ascending
 * offsetDistance.
 */
export function collectCollisionEvents(context: StraightSkeletonSolverContext): LabelledCollisionEvent[] {
    const edges = context.graph.interiorEdges
        .filter(ie => !context.isAcceptedInterior(ie))
        .map(ie => ie.id);

    const allEvents: LabelledCollisionEvent[] = [];

    for (let i = 0; i < edges.length; i++) {
        const e1 = edges[i];
        const checkExterior = !context.isPrimaryNonReflex(e1);

        // Interior-interior pairs
        for (let j = i + 1; j < edges.length; j++) {
            const events = collideEdges(e1, edges[j], context);
            for (const event of events) {
                if (event.intersectionData[2] !== 'diverging') {
                    allEvents.push({label: `${e1} x ${edges[j]}`, event});
                }
            }
        }

        // Interior-exterior pairs (reflex edges only)
        if (checkExterior) {
            for (let ext = 0; ext < context.graph.numExteriorNodes; ext++) {
                if (context.acceptedEdges[ext]) continue;
                const events = collideEdges(e1, ext, context);
                for (const event of events) {
                    if (event.intersectionData[2] !== 'diverging') {
                        allEvents.push({label: `${e1} x ext${ext}`, event});
                    }
                }
            }
        }
    }

    allEvents.sort((a, b) => a.event.offsetDistance - b.event.offsetDistance);
    return allEvents;
}
