import {
    Arrival,
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
    dotProduct,
    makeRay,
    negateVector,
    projectFromPerpendicular,
    scaleVector,
    vectorsAreEqual
} from "./core-functions";
import {intersectRays} from "./intersection-edges";
import {birthArrivalOf, compareArrivals, timeOf} from "./collision-helpers";
import {complexLog, splitLog} from "./logger";
import {SKELETON_NOISE_FLOOR} from "./canonicalisation";
import {
    angularResolution,
    ARITHMETIC_SAME_POINT_BOX,
    coaxialityFloor,
    HELD_SIMULTANEITY_WINDOW,
    simultaneityWindow,
} from "./constants";

/**
 * `perceptualFloor` is the client's floor for this solve, in the unit space `nodes` are given in. It
 * defaults to the library floor so the many test call sites that build a context directly get the
 * standing behaviour; every production entry point passes the resolved option explicitly.
 *
 * `weights` is the per-exterior-edge wavefront speed, parallel to `nodes` (W-spec W1). Omitted means
 * all ones, which is bit-identical to the unweighted solver by construction — every weighted site
 * multiplies or divides by exactly `1.0` (W-spec W36).
 */
export function makeStraightSkeletonSolverContext(
    nodes: Vector2[],
    perceptualFloor: number = SKELETON_NOISE_FLOOR,
    weights?: readonly number[],
): StraightSkeletonSolverContext {
    const graph = initBoundingPolygon(nodes, weights);
    const acceptedEdges = nodes.map(() => false);
    // DERIVED ONCE, HERE (spec A9/A10). Every coaxiality site in the solve spends this one number,
    // so two sites cannot answer "are these two sources on one line?" differently.
    const coaxialLane = coaxialityFloor(perceptualFloor);
    // DERIVED ONCE, HERE, AND FOR THE SAME REASON (spec A8): the one angular bar of the solve. Every
    // angular predicate reads this field; none recomputes the square root.
    const angularBar = angularResolution(perceptualFloor);
    // DERIVED ONCE, HERE (C8 spec T5, T12 as amended): the CAP of the simultaneity window, carried on
    // the context for the "are these two arrivals one moment?" sites (S22–S28). They do not spend it
    // yet: both the flat δ window (dispatch 1) and the per-pair window capped at it (dispatch 2) hit
    // T37's STOPs, and the sites hold `HELD_SIMULTANEITY_WINDOW` (see constants.ts).
    const window = simultaneityWindow(perceptualFloor);

    /**
     * The wavefront speed of an exterior edge (W-spec W1).
     *
     * REFUSES AN INTERIOR EDGE ID rather than reading past the end of the array and returning
     * `undefined`, which would silently make every product `NaN`. A bisector has no speed of its own;
     * it is priced against its parents'.
     */
    function weightOf(exteriorEdgeId: number): number {
        const weight = graph.exteriorWeights[exteriorEdgeId];
        if (weight === undefined) {
            throw new Error(
                `Edge ${exteriorEdgeId} is not an exterior edge of this polygon `
                + `(${graph.numExteriorNodes} exterior edges); only exterior edges carry a weight.`);
        }
        return weight;
    }

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

    /**
     * The wavefront vertex on `bisector` at a given PERPENDICULAR DISTANCE from the exterior edge
     * whose basis is `edgeBasis`.
     *
     * THE ARGUMENT IS A DISTANCE, NOT A TIME (W-spec W40): callers hold a local time and multiply it
     * by the weight of the exterior edge they are measuring against before calling. Keeping the
     * conversion at the call site is what lets one function serve callers measuring against
     * different edges.
     */
    function vertexAtOffset(bisector: PolygonEdge, edgeBasis: Vector2, perpendicular: number): Vector2 {
        const t = projectFromPerpendicular(bisector.basisVector, edgeBasis, perpendicular);
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
            return vectorsAreEqual(n.position, position, ARITHMETIC_SAME_POINT_BOX);
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
        perceptualFloor,
        coaxialityFloor: coaxialLane,
        angularResolution: angularBar,
        simultaneityWindow: window,
        diagnostics: [],
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
        weightOf,
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
        /** `offset` is a TIME (W-spec W16); the `Math.min` is unchanged. */
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
        // W-spec W40: the argument is a local TIME, carried to a perpendicular distance by the
        // exterior edge's own weight. At unit weights `localTime * 1.0` is exact.
        clockwiseVertexAtOffset(edgeId: number, localTime: number): Vector2 {
            return vertexAtOffset(primaryClockwiseBisector(edgeId), getEdgeWithId(edgeId).basisVector,
                localTime * weightOf(edgeId));
        },
        widdershinsVertexAtOffset(edgeId: number, localTime: number): Vector2 {
            return vertexAtOffset(primaryWiddershinsBisector(edgeId), getEdgeWithId(edgeId).basisVector,
                localTime * weightOf(edgeId));
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
        validateSplitReachesEdge(bisectorId: number, edgeToSplitId: number, arrival: Arrival): boolean {
            const splitIntersectionOptions: IntersectionType[] = ['converging']
            const bisectorRay = this.projectRayInterior(getInteriorWithId(bisectorId));
            const edgeBasis = getEdgeWithId(edgeToSplitId).basisVector;
            // The split edge's own weight: the bounding bisectors' travel along this edge is a
            // perpendicular DISTANCE from THIS edge's line, so it is the local time times THIS
            // edge's speed (W-spec W40).
            const splitWeight = weightOf(edgeToSplitId);
            const splitTime = timeOf(arrival);

            const segments = activeExteriorEdgeSegments(edgeToSplitId);

            // We're now testing all active segments, because if the edge has split or engaged in a collapse anywhere, the shrinkage/expansion rate will have changed.
            return segments.some(segment => {
                const {widdershinsBisector, clockwiseBisector} = segment;
                const widdershinsEdge = getEdgeWithId(widdershinsBisector.id);
                const clockwiseEdge = getEdgeWithId(clockwiseBisector.id);

                // IMPORTANT; NEVER REMOVE THIS COMMENT.
                // (DEPRECATED COMMENT: The basis vectors look the wrong way round, but this is the way that works.)
                // Update: this is correct now that the edge shrinkage/collapse is computed dynamically, using the active edge segments.
                // W-spec W30: each bounding bisector's BIRTH is its own arrival pair, and the
                // not-yet-born test is the division-free comparison against it. The local travel is
                // then a difference of TIMES. At unit weights both times are `d / 1.0` and this is
                // today's `offset - sourceOffset`.
                const widdershinsBirth = birthArrivalOf(widdershinsBisector, this);
                const clockwiseBirth = birthArrivalOf(clockwiseBisector, this);
                const clockwiseLocalTime = splitTime - timeOf(clockwiseBirth);
                const widdershinsLocalTime = splitTime - timeOf(widdershinsBirth);

                // A bounding bisector only exists from its own source offset onwards. Extrapolating
                // one backwards past its origin walks the endpoint the wrong way along the bisector,
                // which inflates the segment instead of shrinking it and lets a bisector appear to
                // strike an edge that is still occluded at this offset. Such a segment describes
                // geometry that does not exist yet, so it cannot validate a split.
                // S28 (C8 spec T14): "before the birth" is a same-moment question; its window is held
                // with the other six at `HELD_SIMULTANEITY_WINDOW` (T37 STOP; see the constant), per pair.
                const notYetBorn = (birth: Arrival) => compareArrivals(arrival, birth, HELD_SIMULTANEITY_WINDOW) < 0;
                if (notYetBorn(clockwiseBirth) || notYetBorn(widdershinsBirth)) {
                    splitLog.debug(
                        `Rejecting split of e${edgeToSplitId} by e${bisectorId} at time ${splitTime}: bounding bisector not yet born.`,
                    );
                    return false;
                }

                const cwVertex = vertexAtOffset(clockwiseEdge, edgeBasis, clockwiseLocalTime * splitWeight);
                const wsVertex = vertexAtOffset(widdershinsEdge, edgeBasis, widdershinsLocalTime * splitWeight);
                const cwRay = makeRay(cwVertex, negateVector(edgeBasis));
                const wsRay = makeRay(wsVertex, edgeBasis);
                const cwTest = intersectRays(bisectorRay, cwRay, coaxialLane, angularBar);
                const wsTest = intersectRays(bisectorRay, wsRay, coaxialLane, angularBar);
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
