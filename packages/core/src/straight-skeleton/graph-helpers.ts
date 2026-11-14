import {PolygonEdge, PolygonNode, SkeletonDirection, SkeletonLoop, StraightSkeletonGraph, Vector2} from "./types";
import {makeBasis} from "./core-functions";

/**
 * Record edges arriving at `node`, leaving `inEdges` in ascending edge-id order.
 *
 * THE ORDER IS PART OF THE VALUE, so it may not be the order events happened to be processed in.
 * Push order moves under any arithmetic perturbation — 21 of 37 fixtures reordered a node's
 * `inEdges` under a change of scale while the sets stayed identical — and `offset-projection.ts`
 * dates a node from the FIRST bisector incident to it, so an unstable order is an unstable answer.
 *
 * Ascending edge id is a total order on the set itself and needs no tie-break: an edge arrives at a
 * node once. Every site that adds to `inEdges` goes through here so no path can bypass the order.
 */
export function addInEdges(node: PolygonNode, edgeIds: number[]): void {
    node.inEdges.push(...edgeIds);
    node.inEdges.sort((a, b) => a - b);
}

export function addNode(position: Vector2, g: StraightSkeletonGraph){
    const nodeIndex = g.nodes.length;

    g.nodes.push({id: nodeIndex, outEdges: [], inEdges: [], position});

    return nodeIndex;
}

/**
 * return value will be negative for exterior edges.
 * */
export function interiorEdgeIndex(e: PolygonEdge, g: StraightSkeletonGraph): number {
    return e.id - g.numExteriorNodes;
}

/**
 * The loop holding an exterior edge, as an index into `graph.loops` (skeleton loops-input spec, decision 8).
 *
 * THROWS on an id that is not an exterior edge, and on a graph with no loop table — a merged graph, whose
 * exterior ids no table can describe (decision 11) — rather than answering for a loop that does not exist.
 */
export function loopOfExteriorEdge(graph: StraightSkeletonGraph, exteriorEdgeId: number): number {
    if (graph.loops.length === 0) {
        throw new Error(
            `Exterior edge ${exteriorEdgeId} cannot be placed in a loop: this graph has no loop table (a merged `
            + `graph's exterior ids are not one id run per loop).`);
    }
    if (!Number.isInteger(exteriorEdgeId) || exteriorEdgeId < 0 || exteriorEdgeId >= graph.numExteriorNodes) {
        throw new Error(
            `Edge ${exteriorEdgeId} is not an exterior edge of this graph (${graph.numExteriorNodes} exterior edges).`);
    }
    const loop = graph.loops.findIndex(({start, count}) => exteriorEdgeId >= start && exteriorEdgeId < start + count);
    if (loop === -1) {
        throw new Error(`Exterior edge ${exteriorEdgeId} lies in no loop of this graph's loop table.`);
    }
    return loop;
}

/**
 * THE ONE ACCESSOR FOR THE NEXT OR PREVIOUS EXTERIOR EDGE (skeleton loops-input spec, decisions 8 and 9).
 *
 * `Clockwise` returns the edge leaving the given edge's target node, `start + (i - start + 1) mod count`, and
 * `Widdershins` the edge arriving at its source node. The names are ring-relative, as the bisector parents use
 * them. Both wrap WITHIN THE EDGE'S OWN LOOP: a hole's last edge is followed by its own first edge, never by the
 * next loop's. With one loop this is `(i + 1) % n` and `(i - 1 + n) % n`, exactly.
 *
 * Throws, by {@link loopOfExteriorEdge}, on an id that is not an exterior edge and on a graph with no loop table.
 */
export function adjacentExteriorEdge(
    graph: StraightSkeletonGraph,
    exteriorEdgeId: number,
    direction: SkeletonDirection,
): number {
    const {start, count} = graph.loops[loopOfExteriorEdge(graph, exteriorEdgeId)];
    const step = direction === SkeletonDirection.Clockwise ? 1 : count - 1;
    return start + (exteriorEdgeId - start + step) % count;
}

/** The smallest loop a table may hold: below three vertices a ring is not a polygon. */
const MINIMUM_LOOP_SIZE = 3;

/**
 * A loop table passed by a caller, checked against the nodes it describes (decision 10): contiguous from 0,
 * every count at least 3, the counts summing to the node count. Thrown, by name, otherwise.
 */
function validatedLoops(loops: readonly SkeletonLoop[], nodeCount: number): SkeletonLoop[] {
    let next = 0;
    loops.forEach(({start, count}, index) => {
        if (!Number.isInteger(count) || count < MINIMUM_LOOP_SIZE) {
            throw new Error(`Loop ${index} has ${count} vertices; every loop must have at least 3.`);
        }
        if (start !== next) {
            throw new Error(
                `Loop ${index} starts at ${start}, not ${next}: the loop table must tile the ${nodeCount} nodes, `
                + `contiguous from 0.`);
        }
        next += count;
    });
    if (next !== nodeCount) {
        throw new Error(
            `The loop table covers ${next} nodes but there are ${nodeCount}: it must tile the nodes, contiguous from 0.`);
    }
    return loops.map(({start, count}) => ({start, count}));
}

/**
 * Nodes given in clockwise order.
 *
 * `weights` is the per-exterior-edge wavefront speed, parallel to `nodes`: `weights[i]` is the speed
 * of the edge from node `i` to node `i + 1` (W-spec W1). Omitted, or of length zero, means all ones.
 * A mismatched length is rejected loudly rather than padded — a weight array that does not describe
 * this ring is a caller error, not a default.
 *
 * `loops` is the loop table (skeleton loops-input spec, decisions 6 and 10): the outline first, clockwise, then
 * each hole, counter-clockwise, each a contiguous run of the nodes. OMITTED MEANS ONE LOOP OF ALL THE NODES, so
 * every direct caller builds today's graph; a table that does not tile the nodes, or holds a count below 3, is
 * thrown. The default table is not checked, so a direct caller's ring of any size behaves as it did.
 * */
export function initBoundingPolygon(
    nodes: Vector2[],
    weights?: readonly number[],
    loops?: readonly SkeletonLoop[],
): StraightSkeletonGraph {
    if (weights !== undefined && weights.length > 0 && weights.length !== nodes.length) {
        throw new Error(
            `Weight array has ${weights.length} entries but the polygon has ${nodes.length} vertices; `
            + `there must be exactly one weight per vertex (the edge leaving it).`);
    }

    // init object with nodes
    const graph: StraightSkeletonGraph = {
        nodes: nodes.map((v, i) => ({id: i, inEdges: [], outEdges: [], position: v})),
        edges: [],
        numExteriorNodes: nodes.length,
        interiorEdges: [],
        exteriorWeights: weights !== undefined && weights.length > 0
            ? [...weights]
            : nodes.map(() => 1),
        loops: loops === undefined ? [{start: 0, count: nodes.length}] : validatedLoops(loops, nodes.length),
    };

    // Add exterior edges. Each edge's target is the source of the next edge OF ITS OWN LOOP, read through the
    // accessor (skeleton loops-input spec, decision 9): an exterior node's id equals its exterior edge's id.
    for (let sourceIndex = 0; sourceIndex < nodes.length; sourceIndex++) {
        const targetIndex = adjacentExteriorEdge(graph, sourceIndex, SkeletonDirection.Clockwise);
        graph.edges.push({
            id: sourceIndex,
            source: sourceIndex,
            target: targetIndex,
            basisVector: makeBasis(graph.nodes[sourceIndex].position, graph.nodes[targetIndex].position)
        });

        graph.nodes[sourceIndex].outEdges.push(sourceIndex);
        addInEdges(graph.nodes[targetIndex], [sourceIndex]);
    }

    return graph;
}