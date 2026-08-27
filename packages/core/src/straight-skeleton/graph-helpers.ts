import {PolygonEdge, PolygonNode, StraightSkeletonGraph, Vector2} from "./types";
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
 * Nodes given in clockwise order
 * */
export function initBoundingPolygon(nodes: Vector2[]): StraightSkeletonGraph {

    // init object with nodes
    const graph: StraightSkeletonGraph = {
        nodes: nodes.map((v, i) => ({id: i, inEdges: [], outEdges: [], position: v})),
        edges: [],
        numExteriorNodes: nodes.length,
        interiorEdges: []
    };

    // Add exterior edges
    for (let sourceIndex = 0; sourceIndex < nodes.length; sourceIndex++) {
        const targetIndex = (sourceIndex + 1) % nodes.length;
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