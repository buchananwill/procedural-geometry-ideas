import {PolygonEdge, StraightSkeletonGraph, Vector2} from "@/algorithms/straight-skeleton/types";
import {makeBasis} from "@/algorithms/straight-skeleton/core-functions";

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
        graph.nodes[targetIndex].inEdges.push(sourceIndex);
    }

    return graph;
}