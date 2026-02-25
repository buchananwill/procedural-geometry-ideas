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
import {crossProduct, vectorsAreEqual} from "@/algorithms/straight-skeleton/core-functions";

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
    }

    function accept(edgeId: number) {
        acceptedEdges[edgeId] = true;
    }

    function acceptAll(edges: number[]) {
        edges.forEach(accept)
    }

    function getEdgeWithId(id: number): PolygonEdge {
        return graph.edges[id];
    }

    function getInteriorWithId(id: number): InteriorEdge {
        return graph.interiorEdges[id - graph.numExteriorNodes];
    }

    function clockwiseParent(edge: InteriorEdge): PolygonEdge {
        return graph.edges[edge.clockwiseExteriorEdgeIndex]
    }

    function widdershinsParent(edge: InteriorEdge): PolygonEdge {
        return graph.edges[edge.widdershinsExteriorEdgeIndex];
    }

    function isPrimaryNonReflex(id: number): boolean {
        if (edgeRank(id) !== 'primary'){
            return false;
        }

        const interiorData = getInteriorWithId(id);
        const cwParent = clockwiseParent(interiorData);
        const wsParent = widdershinsParent(interiorData);

        return crossProduct(cwParent.basisVector, wsParent.basisVector) > 0;

    }

    return {
        graph,
        acceptedEdges: acceptedEdges,
        heap: new Heap<HeapInteriorEdge>(makeHeapInteriorEdgeComparator()),
        getEdgeWithId,
        getEdges(idList: number[]): PolygonEdge[] {
            return idList.map(getEdgeWithId)
        },
        getEdgeWithInterior(interiorEdge: InteriorEdge): PolygonEdge {
            return graph.edges[interiorEdge.id]
        },
        getInteriorWithId,
        getInteriorEdges(idList: number[]): InteriorEdge[] {
            return idList.map(getInteriorWithId);
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
        clockwiseParent,
        widdershinsParent,
        accept,
        acceptAll,
        isAccepted(edgeId: number): boolean {
            return edgeId < acceptedEdges.length && acceptedEdges[edgeId];
        },
        isAcceptedInterior(edge: InteriorEdge): boolean {
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
        edgeRank,
        isPrimaryNonReflex
    };
}
