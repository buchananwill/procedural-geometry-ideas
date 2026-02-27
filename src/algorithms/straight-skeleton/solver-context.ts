import {
    CollisionCache,
    EdgeRank,
    InteriorEdge,
    PolygonEdge, PolygonNode,
    RayProjection,
    SkeletonDirection,
    StraightSkeletonSolverContext,
    Vector2
} from "@/algorithms/straight-skeleton/types";
import {initBoundingPolygon} from "@/algorithms/straight-skeleton/graph-helpers";
import {
    addVectors,
    dotProduct,
    negateVector,
    projectFromPerpendicular,
    scaleVector,
    vectorsAreEqual
} from "@/algorithms/straight-skeleton/core-functions";

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

    function isReflexEdge(edge: InteriorEdge): boolean {
        const cwParent = clockwiseParent(edge);
        const edgeData = getEdgeWithId(edge.id);
        return dotProduct(cwParent.basisVector, edgeData.basisVector) < 0
    }

    function isPrimaryNonReflex(id: number): boolean {


        if (edgeRank(id) !== 'primary') {
            return false;
        }

        const interiorData = getInteriorWithId(id);
        return !isReflexEdge(interiorData);

    }

    function spanExcludingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number {
        if (edgeRank(firstEdge.id) !== 'exterior' || edgeRank(secondEdge.id) !== 'exterior') {
            throw new Error('Direct span of interior edges not yet implemented.')
        }

        if (acceptedEdges[firstEdge.id] || acceptedEdges[secondEdge.id]) {
            throw new Error('Cannot compute span with accepted edges.')
        }

        let totalSpan = 0;
        for (let i = 0; i < graph.numExteriorNodes; i++) {
            const nextEdge = (i + firstEdge.id) % graph.numExteriorNodes;
            if ((nextEdge) === secondEdge.id) {
                return totalSpan;
            }

            if (!acceptedEdges[nextEdge]) {
                totalSpan++;
            }
        }

        return totalSpan;
    }

    function vertexAtOffset(bisector: PolygonEdge, edgeBasis: Vector2, offset: number): Vector2 {
        const t = projectFromPerpendicular(bisector.basisVector, edgeBasis, offset);
        return addVectors(graph.nodes[bisector.source].position, scaleVector(bisector.basisVector, t));
    }

    function findOrAddNode(position: Vector2): PolygonNode {
        const node = graph.nodes.find(n => {
            return vectorsAreEqual(n.position, position);
        })
        if (node !== undefined) {
            return node;
        }
        const index = graph.nodes.push({id: graph.nodes.length, position, inEdges: [], outEdges: []});
        return graph.nodes[index - 1];
    }

    function widdershinsBisector(edgeId: number): PolygonEdge {
        const targetNode = graph.nodes[getEdgeWithId(edgeId).target!];
        const bisectorId = targetNode.outEdges.find(e => edgeRank(e) === 'primary');
        if (bisectorId === undefined) {
            throw new Error(`No primary bisector found at target of edge ${edgeId}`);
        }
        return getEdgeWithId(bisectorId);
    }

    function clockwiseBisector(edgeId: number): PolygonEdge {
        const sourceNode = graph.nodes[getEdgeWithId(edgeId).source];
        const bisectorId = sourceNode.outEdges.find(e => edgeRank(e) === 'primary');
        if (bisectorId === undefined) {
            throw new Error(`No primary bisector found at source of edge ${edgeId}`);
        }
        return getEdgeWithId(bisectorId);
    }

    return {
        graph,
        acceptedEdges: acceptedEdges,
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
                basisVector: negateVector(edge.basisVector)
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
        findOrAddNode,
        findSource(edgeId: number): PolygonNode {
            return graph.nodes[graph.edges[edgeId].source]
        },
        sourcePosition(edgeId: number): Vector2 {
            return graph.nodes[graph.edges[edgeId].source].position;
        },
        edgeRank,
        isPrimaryNonReflex,
        isReflexEdge,
        updateMaxOffset(edgeId: number, offset: number) {
            if (offset < 0) {
                return
            }
            const edgeData = getInteriorWithId(edgeId);
            if (edgeData.maxOffset === undefined) {
                edgeData.maxOffset = offset;
            }

            edgeData.maxOffset = Math.min(edgeData.maxOffset, offset);
        },
        clockwiseSpanExcludingAccepted: spanExcludingAccepted,
        widdershinsBisector,
        clockwiseBisector,
        clockwiseVertexAtOffset(edgeId: number, offset: number): Vector2 {
            return vertexAtOffset(clockwiseBisector(edgeId), getEdgeWithId(edgeId).basisVector, offset);
        },
        widdershinsVertexAtOffset(edgeId: number, offset: number): Vector2 {
            return vertexAtOffset(widdershinsBisector(edgeId), getEdgeWithId(edgeId).basisVector, offset);
        },
        terminateEdgesAtPoint(edgeIds: number[], position: Vector2): PolygonNode {
            const node = findOrAddNode(position);
            node.inEdges.push(...edgeIds);
            edgeIds.forEach(id => { getEdgeWithId(id).target = node.id; });
            return node;
        },
        crossWireEdges(id1: number, id2: number): void {
            const edge1 = getEdgeWithId(id1);
            const edge2 = getEdgeWithId(id2);
            edge1.target = edge2.source;
            edge2.target = edge1.source;
            graph.nodes[edge1.source].inEdges.push(id2);
            graph.nodes[edge2.source].inEdges.push(id1);
        },
        parentEdges(interiorEdgeId: number): { clockwise: PolygonEdge; widdershins: PolygonEdge } {
            const interior = getInteriorWithId(interiorEdgeId);
            return {
                clockwise: clockwiseParent(interior),
                widdershins: widdershinsParent(interior),
            };
        },
        parentEdge(interiorEdgeId: number, direction: SkeletonDirection): PolygonEdge {
            const interior = getInteriorWithId(interiorEdgeId);
            return direction === SkeletonDirection.Clockwise
                ? clockwiseParent(interior)
                : widdershinsParent(interior);
        },
        exteriorParentsOfSubPolygon(interiorEdgeIds: number[]): number[] {
            const parents = interiorEdgeIds.map(id => getInteriorWithId(id).clockwiseExteriorEdgeIndex);
            parents.push(widdershinsParent(getInteriorWithId(interiorEdgeIds[0])).id);
            return parents;
        },
    };
}
