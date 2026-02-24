import {
    EdgeRank, HeapInteriorEdge,
    InteriorEdge,
    PolygonEdge, PolygonNode,
    RayProjection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import Heap from "heap-js";
import {vectorsAreEqual} from "@/algorithms/straight-skeleton/core-functions";

function makeHeapInteriorEdgeComparator() {
    return (e1: HeapInteriorEdge, e2: HeapInteriorEdge) => {
        return e1.eventDistance - e2.eventDistance;
    }
}


export function makeStraightSkeletonSolverContext(nodes: Vector2[]): StraightSkeletonSolverContext {
    const graph = initBoundingPolygon(nodes);
    const acceptedEdges = nodes.map(() => false);

    function edgeRank(edgeId: number): EdgeRank {
        if (edgeId < graph.numExteriorNodes) {
            return 'exterior';
        }
        const edge = graph.edges[edgeId];
        if (edge.source < graph.numExteriorNodes) {
            return 'primary';
        }

        return 'secondary'
    };

    return {
        graph,
        acceptedEdges: acceptedEdges,
        heap: new Heap<HeapInteriorEdge>(makeHeapInteriorEdgeComparator()),
        getEdgeWithId(id: number): PolygonEdge {
            return graph.edges[id];
        },
        getEdgeWithInterior(interiorEdge: InteriorEdge): PolygonEdge {
            return graph.edges[interiorEdge.id]
        },
        getInteriorWithId(id: number): InteriorEdge {
            return graph.interiorEdges[id - graph.numExteriorNodes];
        },
        projectRay(edge: PolygonEdge): RayProjection {
            return {
                sourceVector: graph.nodes[edge.source].position,
                basisVector: edge.basisVector
            };
        },
        projectRayInterior(edge: InteriorEdge): RayProjection {
            const polygonEdge = graph.edges[edge.id];
            return {
                sourceVector: graph.nodes[polygonEdge.source].position,
                basisVector: polygonEdge.basisVector
            }
        },
        clockwiseParent(edge: InteriorEdge): PolygonEdge {
            return graph.edges[edge.clockwiseExteriorEdgeIndex]
        },
        widdershinsParent(edge: InteriorEdge): PolygonEdge {
            return graph.edges[edge.widdershinsExteriorEdgeIndex];
        },
        isAccepted(edge: InteriorEdge): boolean {
            return acceptedEdges[edge.id];
        },
        findOrAddNode(position: Vector2): PolygonNode {
            const node = graph.nodes.find(n => {
                return vectorsAreEqual(n.position, position);
            })
            if (node !== undefined) {
                return node;
            }
            const index = graph.nodes.push({id: graph.nodes.length, position, inEdges: [], outEdges: []});
            return graph.nodes[index - 1];
        },
        findSource(edgeId: number): PolygonNode {
            return graph.nodes[graph.edges[edgeId].source]
        },
        edgeRank
    };
}
