import {
    CollisionCache,
    EdgeRank, HeapInteriorEdge,
    InteriorEdge,
    PolygonEdge, PolygonNode,
    RayProjection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import Heap from "heap-js";
import {crossProduct, dotProduct, scaleVector, vectorsAreEqual} from "@/algorithms/straight-skeleton/core-functions";

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

    function isReflexEdge(edge: InteriorEdge): boolean{
        const cwParent = clockwiseParent(edge);
        const wsParent = widdershinsParent(edge);
        const edgeData = getEdgeWithId(edge.id);
        return dotProduct(cwParent.basisVector, edgeData.basisVector) < 0

        // return crossProduct(cwParent.basisVector, wsParent.basisVector) < 0;
    }

    function isPrimaryNonReflex(id: number): boolean {


        if (edgeRank(id) !== 'primary'){
            return false;
        }

        const interiorData = getInteriorWithId(id);
        return !isReflexEdge(interiorData);

    }

    function updateMinLength(edgeId:number, length: number): void {
        if (edgeRank(edgeId) === 'exterior'){
            return;
        }

        const edgeData = getInteriorWithId(edgeId);
        if (length > 0) {
            console.log(`Updating edge: ${edgeId} to length ${length}`)
            edgeData.length = Math.min(length, edgeData.length);
        }

    }

    function spanExcludingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number{
        if (edgeRank(firstEdge.id) !== 'exterior' || edgeRank(secondEdge.id) !== 'exterior'){
            throw new Error('Direct span of interior edges not yet implemented.')
        }

        if (acceptedEdges[firstEdge.id] || acceptedEdges[secondEdge.id]){
            throw new Error('Cannot compute span with accepted edges.')
        }

        let totalSpan = 0;
        for (let i = 0; i < graph.numExteriorNodes; i++) {
            const nextEdge = (i + firstEdge.id) % graph.numExteriorNodes;
            if ((nextEdge)  === secondEdge.id){
                return totalSpan;
            }

            if (!acceptedEdges[nextEdge]){
                totalSpan++;
            }
        }

        return totalSpan;
    }

    return {
        graph,
        acceptedEdges: acceptedEdges,
        heap: new Heap<HeapInteriorEdge>(makeHeapInteriorEdgeComparator()),
        collisionCache: new Map() as CollisionCache,
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
        projectRayReversed(edge: PolygonEdge): RayProjection {
            return {
                sourceVector: graph.nodes[edge.source].position,
                basisVector: scaleVector(edge.basisVector, -1)
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
        isPrimaryNonReflex,
        isReflexEdge,
        updateMinLength,
        resetMinLength(edgeId: number) {
            const rank = edgeRank(edgeId);
            if (rank === 'exterior'){
                return
            }
            getInteriorWithId(edgeId).length = Number.POSITIVE_INFINITY;
        },
        clockwiseSpanExcludingAccepted: spanExcludingAccepted,
        widdershinsBisector(edgeId: number): PolygonEdge {
            // todo: error handling!
            return getEdgeWithId(graph.nodes[getEdgeWithId(edgeId).target!].outEdges.find(e => edgeRank(e) === 'primary')!)
        },
        clockwiseBisector(edgeId: number): PolygonEdge {
            // todo: error handling!
            return getEdgeWithId(graph.nodes[getEdgeWithId(edgeId).source].outEdges.find(e => edgeRank(e) === 'primary')!)
        },
    };
}
