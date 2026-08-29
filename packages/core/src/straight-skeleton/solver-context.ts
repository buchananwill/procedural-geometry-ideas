import {
    CollisionCache,
    EdgeRank,
    InteriorEdge, IntersectionType,
    PolygonEdge, PolygonNode,
    RayProjection,
    SkeletonDirection,
    StraightSkeletonSolverContext,
    Vector2
} from "./types";
import {addInEdges, initBoundingPolygon} from "./graph-helpers";
import {
    addVectors,
    areEqual,
    dotProduct,
    makeRay,
    negateVector,
    projectFromPerpendicular,
    scaleVector,
    vectorsAreEqual
} from "./core-functions";
import {intersectRays} from "./intersection-edges";
import {sourceOffsetDistance} from "./collision-helpers";
import {complexLog, splitLog} from "./logger";

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

    function span(firstEdge: PolygonEdge, secondEdge: PolygonEdge, includeAccepted = true): number {
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

            if (includeAccepted || !acceptedEdges[nextEdge]) {
                totalSpan++;
            }
        }

        return totalSpan;
    }

    function spanExlcudingAccepted(firstEdge: PolygonEdge, secondEdge: PolygonEdge): number {
        return span(firstEdge, secondEdge, false);
    }

    function vertexAtOffset(bisector: PolygonEdge, edgeBasis: Vector2, offset: number): Vector2 {
        const t = projectFromPerpendicular(bisector.basisVector, edgeBasis, offset);
        return addVectors(graph.nodes[bisector.source].position, scaleVector(bisector.basisVector, t));
    }

    /**
     * The node at `position`, created if no existing node is within tolerance of it.
     *
     * THE EPSILON HERE IS FROZEN, AND THE COMPONENT-WISE BOX WITH IT (journal decisions 104/105,
     * audit constraint C1). It is the one positional comparison in the solver deliberately left out
     * of the tolerance unification, and the reason is a falsified experiment rather than an
     * oversight: widening it to the render floor — merge by absorption, first-established wins —
     * delivered every promised cure and broke four independent axes at once, taking Circle 16/32
     * from clean to unsolvable at 1e10/1e11, Circle 48's scatter from 3 to 28 cells, the recursion
     * census from 26 to 42, and the tiling identity from exact to ~1e-7. Reverting the one file
     * restored the suite exactly (journal F27).
     *
     * ITS ROLE IS ARITHMETIC EQUALITY, NOT GEOMETRIC MERGING. It exists to recognise a position two
     * code paths computed by different arithmetic, and nothing more. If a position arriving here
     * needs a GEOMETRIC merge, the defect is that its path bypassed event resolution — which is a
     * question about the event layer, not about this number.
     *
     * PRECONDITION: `position` is finite. A NaN coordinate never compares equal to itself under an
     * absolute tolerance — the difference is NaN and every comparison against it is false — so the
     * lookup below misses and appends **a fresh node on every call**. An infinite one is no better.
     * A non-finite position is a defect upstream of this function, and failing loudly at the first
     * one beats accumulating duplicate nodes that no later pass can reconcile.
     */
    function findOrAddNode(position: Vector2): PolygonNode {
        if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
            throw new Error(`Cannot place a node at the non-finite position (${position.x}, ${position.y}).`);
        }
        const node = graph.nodes.find(n => {
            return vectorsAreEqual(n.position, position);
        })
        if (node !== undefined) {
            return node;
        }
        const index = graph.nodes.push({id: graph.nodes.length, position, inEdges: [], outEdges: []});
        return graph.nodes[index - 1];
    }

    function primaryWiddershinsBisector(edgeId: number): PolygonEdge {
        const targetNode = graph.nodes[getEdgeWithId(edgeId).target!];
        const bisectorId = targetNode.outEdges.find(e => edgeRank(e) === 'primary');
        if (bisectorId === undefined) {
            throw new Error(`No primary bisector found at target of edge ${edgeId}`);
        }
        return getEdgeWithId(bisectorId);
    }

    function primaryClockwiseBisector(edgeId: number): PolygonEdge {
        const sourceNode = graph.nodes[getEdgeWithId(edgeId).source];
        const bisectorId = sourceNode.outEdges.find(e => edgeRank(e) === 'primary');
        if (bisectorId === undefined) {
            throw new Error(`No primary bisector found at source of edge ${edgeId}`);
        }
        return getEdgeWithId(bisectorId);
    }

    interface EdgeSection {
        widdershinsBisector: InteriorEdge,
        clockwiseBisector: InteriorEdge
    }

    function activeExteriorEdgeSegments(edgeId: number): EdgeSection[] {
        if (edgeRank(edgeId) !== 'exterior') {
            throw new Error("Can only find active sections for exterior edges.")
        }

        const rotateId = (id: number): number => {
            return (id - edgeId + graph.numExteriorNodes) % graph.numExteriorNodes;
        }

        const makeClockwiseSweepIndex = (interiorEdge: InteriorEdge): number => {
            const wsParent = widdershinsParent(interiorEdge)
            const cwParent = clockwiseParent(interiorEdge);

            return graph.numExteriorNodes - rotateId(wsParent.id) - rotateId(cwParent.id) - 1; // subtract 1 to keep return strictly less than the number of exterior edges.
        }

        const children = graph.interiorEdges.filter(e => {
            return !acceptedEdges[e.id] && (e.widdershinsExteriorEdgeIndex === edgeId || e.clockwiseExteriorEdgeIndex === edgeId)
        })
            .toSorted((e1, e2) => makeClockwiseSweepIndex(e1) - makeClockwiseSweepIndex(e2))

        const sections: EdgeSection[] = []

        if (children.length < 2) {
            return sections
        }

        for (let i = 0; i < children.length; i += 2) {
            sections.push({widdershinsBisector: children[i], clockwiseBisector: children[i + 1]})
        }

        return sections;
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
        clockwiseSpanExcludingAccepted: spanExlcudingAccepted,
        clockwiseSpanIncludingAccepted: span,
        widdershinsBisector: primaryWiddershinsBisector,
        clockwiseBisector: primaryClockwiseBisector,
        clockwiseVertexAtOffset(edgeId: number, offset: number): Vector2 {
            return vertexAtOffset(primaryClockwiseBisector(edgeId), getEdgeWithId(edgeId).basisVector, offset);
        },
        widdershinsVertexAtOffset(edgeId: number, offset: number): Vector2 {
            return vertexAtOffset(primaryWiddershinsBisector(edgeId), getEdgeWithId(edgeId).basisVector, offset);
        },
        terminateEdgesAtPoint(edgeIds: number[], position: Vector2): PolygonNode {
            const node = findOrAddNode(position);
            addInEdges(node, edgeIds);
            edgeIds.forEach(id => {
                getEdgeWithId(id).target = node.id;
            });
            return node;
        },
        crossWireEdges(id1: number, id2: number): void {
            const edge1 = getEdgeWithId(id1);
            const edge2 = getEdgeWithId(id2);
            edge1.target = edge2.source;
            edge2.target = edge1.source;
            addInEdges(graph.nodes[edge1.source], [id2]);
            addInEdges(graph.nodes[edge2.source], [id1]);
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
        validateSplitReachesEdge(bisectorId: number, edgeToSplitId: number, offset: number): boolean {
            const splitIntersectionOptions: IntersectionType[] = ['converging']
            const bisectorRay = this.projectRayInterior(getInteriorWithId(bisectorId));
            const edgeBasis = getEdgeWithId(edgeToSplitId).basisVector;

            const segments = activeExteriorEdgeSegments(edgeToSplitId);

            // We're now testing all active segments, because if the edge has split or engaged in a collapse anywhere, the shrinkage/expansion rate will have changed.
            return segments.some(segment => {
                const {widdershinsBisector, clockwiseBisector} = segment;
                const widdershinsEdge = getEdgeWithId(widdershinsBisector.id);
                const clockwiseEdge = getEdgeWithId(clockwiseBisector.id);

                // IMPORTANT; NEVER REMOVE THIS COMMENT.
                // (DEPRECATED COMMENT: The basis vectors look the wrong way round, but this is the way that works.)
                // Update: this is correct now that the edge shrinkage/collapse is computed dynamically, using the active edge segments.
                const widdershinsSourceOffset = sourceOffsetDistance(widdershinsBisector, this)
                const clockwiseSourceOffset = sourceOffsetDistance(clockwiseBisector, this)
                const clockwiseLocalOffset = offset - clockwiseSourceOffset;
                const widdershinsLocalOffset = offset - widdershinsSourceOffset;

                // A bounding bisector only exists from its own source offset onwards. Extrapolating
                // one backwards past its origin walks the endpoint the wrong way along the bisector,
                // which inflates the segment instead of shrinking it and lets a bisector appear to
                // strike an edge that is still occluded at this offset. Such a segment describes
                // geometry that does not exist yet, so it cannot validate a split.
                const notYetBorn = (localOffset: number) => localOffset < 0 && !areEqual(localOffset, 0);
                if (notYetBorn(clockwiseLocalOffset) || notYetBorn(widdershinsLocalOffset)) {
                    splitLog.debug(
                        `Rejecting split of e${edgeToSplitId} by e${bisectorId} at offset ${offset}: bounding bisector not yet born.`,
                    );
                    return false;
                }

                const cwVertex = vertexAtOffset(clockwiseEdge, edgeBasis, clockwiseLocalOffset);
                const wsVertex = vertexAtOffset(widdershinsEdge, edgeBasis, widdershinsLocalOffset);
                const cwRay = makeRay(cwVertex, negateVector(edgeBasis));
                const wsRay = makeRay(wsVertex, edgeBasis);
                const cwTest = intersectRays(bisectorRay, cwRay);
                const wsTest = intersectRays(bisectorRay, wsRay);
                const valid =  splitIntersectionOptions.includes(cwTest[2])
                    && splitIntersectionOptions.includes(wsTest[2]);

                if (!valid) {
                    splitLog.debug("Rejecting edge split.", cwVertex, cwTest,clockwiseEdge, wsVertex, wsTest, widdershinsEdge)
                }
                return valid;

            })

        },
    };
}
