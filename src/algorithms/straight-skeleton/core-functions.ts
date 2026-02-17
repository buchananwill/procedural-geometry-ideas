import {InteriorEdge, PolygonEdge, StraightSkeletonGraph, Vector2} from "@/algorithms/straight-skeleton/types";

export function addVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x + b.x), y: (a.y + b.y)};
}

/**
 * Subtract b from a
 * */
export function subtractVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x - b.x), y: (a.y - b.y)};
}

export function scaleVector(v: Vector2, scalar: number): Vector2 {
    return {x: v.x * scalar, y: v.y * scalar};
}

/**
 * If argument v has size 0, returns [1,0]
 * */
export function normalize(v: Vector2): Vector2 {
    const size = Math.sqrt(v.x * v.x + v.y * v.y);
    if (size === 0) {
        return {x: 1, y: 0};
    }
    return {x: v.x / size, y: v.y / size};
}

export function makeBasis(from: Vector2, to: Vector2): Vector2 {
    const relativeVector = subtractVectors(to, from);
    return normalize(relativeVector);
}

export function makeBisectedBasis(a: Vector2, b: Vector2): Vector2 {
    const added = addVectors(a, b);
    return normalize(added);
}

/**
 * return value will be negative for exterior edges.
 * */
export function InteriorEdgeIndex(e: PolygonEdge, g: StraightSkeletonGraph): number {
    return e.id - g.numExteriorNodes;
}

export function InitStraightSkeletonGraph(nodes: Vector2[]): StraightSkeletonGraph {

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

    // Add directly bisecting interior edges
    for (let sourceIndex = 0; sourceIndex < nodes.length; sourceIndex++) {
        const source = graph.nodes[sourceIndex];
        const inEdge = source.inEdges[0];
        const outEdge = source.outEdges[0];
        graph.edges.push({
            id: sourceIndex + nodes.length,
            source: sourceIndex,
            basisVector: makeBisectedBasis(
                scaleVector(graph.edges[inEdge].basisVector, -1),
                graph.edges[outEdge].basisVector
                )
        })
    }

    return graph;
}