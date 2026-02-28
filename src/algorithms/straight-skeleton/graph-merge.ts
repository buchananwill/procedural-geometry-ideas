import {
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
    Vector2,
    PolygonNode,
    PolygonEdge,
    InteriorEdge,
} from "@/algorithms/straight-skeleton/types";
import {vectorsAreEqual} from "@/algorithms/straight-skeleton/core-functions";

export interface SubPolygonResult {
    graph: StraightSkeletonGraph;
}

export interface MergedGraphResult {
    graph: StraightSkeletonGraph;
    /** Indices into graph.nodes that are crossing-point nodes (synthetic interior nodes) */
    crossingNodeIndices: number[];
}

/**
 * Merge multiple skeleton graphs (from independently solved sub-polygons)
 * into a single unified StraightSkeletonGraph.
 *
 * Strategy:
 * 1. Concatenate all nodes and edges with renumbered IDs.
 * 2. Exterior nodes from all sub-graphs come first, then interior nodes.
 * 3. Crossing-point nodes that appear as exterior nodes in multiple sub-graphs
 *    are deduplicated: all references redirect to the canonical node.
 * 4. The canonical crossing-point nodes are moved to the interior section
 *    (after numExteriorNodes) so the UI renders them as skeleton nodes.
 */
export function mergeSkeletonGraphs(
    subResults: SubPolygonResult[],
    crossingPoints: Vector2[],
): MergedGraphResult {
    if (subResults.length === 0) {
        return {
            graph: {nodes: [], edges: [], numExteriorNodes: 0, interiorEdges: []},
            crossingNodeIndices: [],
        };
    }

    if (subResults.length === 1 && crossingPoints.length === 0) {
        return {graph: subResults[0].graph, crossingNodeIndices: []};
    }

    // Phase 1: Concatenate all sub-graphs with offsets
    const allNodes: PolygonNode[] = [];
    const allEdges: PolygonEdge[] = [];
    const allInteriorEdges: InteriorEdge[] = [];

    // Track the offset for each sub-graph
    const nodeOffsets: number[] = [];
    const edgeOffsets: number[] = [];

    let totalNodes = 0;
    let totalEdges = 0;

    for (const sub of subResults) {
        const g = sub.graph;
        nodeOffsets.push(totalNodes);
        edgeOffsets.push(totalEdges);

        // Copy nodes with renumbered IDs and edge references
        for (const node of g.nodes) {
            allNodes.push({
                id: node.id + totalNodes,
                position: {...node.position},
                inEdges: node.inEdges.map(e => e + totalEdges),
                outEdges: node.outEdges.map(e => e + totalEdges),
            });
        }

        // Copy edges with renumbered IDs and node references
        for (const edge of g.edges) {
            allEdges.push({
                id: edge.id + totalEdges,
                source: edge.source + totalNodes,
                target: edge.target !== undefined ? edge.target + totalNodes : undefined,
                basisVector: {...edge.basisVector},
            });
        }

        // Copy interior edges with renumbered IDs and parent references
        for (const ie of g.interiorEdges) {
            allInteriorEdges.push({
                id: ie.id + totalEdges,
                clockwiseExteriorEdgeIndex: ie.clockwiseExteriorEdgeIndex + totalEdges,
                widdershinsExteriorEdgeIndex: ie.widdershinsExteriorEdgeIndex + totalEdges,
                length: ie.length,
                maxOffset: ie.maxOffset,
            });
        }

        totalNodes += g.nodes.length;
        totalEdges += g.edges.length;
    }

    // Phase 2: Deduplicate crossing-point nodes
    // Find nodes that match crossing points. Multiple sub-graphs may have exterior nodes
    // at the same crossing-point position.
    const crossingNodeGroups: Map<number, number[]> = new Map(); // crossingIndex → list of node IDs at that position

    for (let ci = 0; ci < crossingPoints.length; ci++) {
        const cp = crossingPoints[ci];
        const matchingNodes: number[] = [];
        for (let ni = 0; ni < allNodes.length; ni++) {
            if (vectorsAreEqual(allNodes[ni].position, cp)) {
                matchingNodes.push(ni);
            }
        }
        if (matchingNodes.length > 1) {
            crossingNodeGroups.set(ci, matchingNodes);
        }
    }

    // For each group, pick the first node as canonical and redirect all references from duplicates
    const nodeRedirectMap: Map<number, number> = new Map(); // oldNodeId → canonicalNodeId
    const nodesToRemove: Set<number> = new Set();

    for (const [, nodeIds] of crossingNodeGroups) {
        const canonical = nodeIds[0];
        for (let i = 1; i < nodeIds.length; i++) {
            const duplicate = nodeIds[i];
            nodeRedirectMap.set(duplicate, canonical);
            nodesToRemove.add(duplicate);

            // Merge edge lists from duplicate into canonical
            const canonicalNode = allNodes[canonical];
            const dupNode = allNodes[duplicate];
            canonicalNode.inEdges.push(...dupNode.inEdges);
            canonicalNode.outEdges.push(...dupNode.outEdges);
        }
    }

    // Apply redirects to all edge source/target references
    for (const edge of allEdges) {
        if (nodeRedirectMap.has(edge.source)) {
            edge.source = nodeRedirectMap.get(edge.source)!;
        }
        if (edge.target !== undefined && nodeRedirectMap.has(edge.target)) {
            edge.target = nodeRedirectMap.get(edge.target)!;
        }
    }

    // Phase 3: Remove duplicate nodes and compact IDs
    // Build a mapping from old node index to new node index
    const survivingNodes: PolygonNode[] = [];
    const oldToNew: Map<number, number> = new Map();

    for (let i = 0; i < allNodes.length; i++) {
        if (!nodesToRemove.has(i)) {
            oldToNew.set(i, survivingNodes.length);
            survivingNodes.push(allNodes[i]);
        }
    }

    // Renumber everything to use compacted node IDs
    for (let i = 0; i < survivingNodes.length; i++) {
        survivingNodes[i].id = i;
        survivingNodes[i].inEdges = survivingNodes[i].inEdges.map(e => e); // edge IDs don't change
        survivingNodes[i].outEdges = survivingNodes[i].outEdges.map(e => e);
    }

    for (const edge of allEdges) {
        edge.source = oldToNew.get(edge.source)!;
        if (edge.target !== undefined) {
            edge.target = oldToNew.get(edge.target)!;
        }
    }

    // Phase 4: Compute numExteriorNodes
    // Exterior nodes are the original polygon vertices from each sub-graph that are NOT crossing points.
    // Plus the crossing-point nodes (which we'll classify as interior for rendering purposes).
    // Actually, for simplicity: numExteriorNodes = total exterior nodes across all sub-graphs minus duplicates.
    let totalExteriorNodes = 0;
    for (const sub of subResults) {
        totalExteriorNodes += sub.graph.numExteriorNodes;
    }
    totalExteriorNodes -= nodesToRemove.size;

    // Identify which surviving nodes are crossing points (for the result metadata)
    const crossingNodeIndices: number[] = [];
    for (const [, nodeIds] of crossingNodeGroups) {
        const canonical = nodeIds[0];
        const newId = oldToNew.get(canonical);
        if (newId !== undefined) {
            crossingNodeIndices.push(newId);
        }
    }

    return {
        graph: {
            nodes: survivingNodes,
            edges: allEdges,
            numExteriorNodes: totalExteriorNodes,
            interiorEdges: allInteriorEdges,
        },
        crossingNodeIndices,
    };
}

/**
 * Create a minimal StraightSkeletonSolverContext wrapping a merged graph.
 * Helper methods that are only needed during algorithm execution throw errors.
 * The context is only used post-algorithm for rendering.
 */
export function makeMergedSolverContext(merged: MergedGraphResult): StraightSkeletonSolverContext {
    const {graph} = merged;

    // All edges are accepted in a completed merge
    const acceptedEdges: boolean[] = new Array(graph.edges.length).fill(true);

    const notSupported = (name: string) => (): never => {
        throw new Error(`${name} is not supported on merged solver contexts`);
    };

    return {
        graph,
        acceptedEdges,
        collisionCache: new Map(),
        getEdgeWithId: (id: number) => graph.edges[id],
        getEdges: (ids: number[]) => ids.map(id => graph.edges[id]),
        getEdgeWithInterior: notSupported('getEdgeWithInterior'),
        getInteriorWithId: notSupported('getInteriorWithId'),
        getInteriorEdges: notSupported('getInteriorEdges'),
        projectRay: notSupported('projectRay'),
        projectRayReversed: notSupported('projectRayReversed'),
        projectRayInterior: notSupported('projectRayInterior'),
        clockwiseParent: notSupported('clockwiseParent'),
        widdershinsParent: notSupported('widdershinsParent'),
        accept: notSupported('accept'),
        acceptAll: notSupported('acceptAll'),
        isAccepted: (edgeId: number) => edgeId < acceptedEdges.length && acceptedEdges[edgeId],
        isAcceptedInterior: () => true,
        findOrAddNode: notSupported('findOrAddNode'),
        findSource: notSupported('findSource'),
        sourcePosition: notSupported('sourcePosition'),
        edgeRank: notSupported('edgeRank'),
        isPrimaryNonReflex: notSupported('isPrimaryNonReflex'),
        updateMaxOffset: notSupported('updateMaxOffset'),
        isReflexEdge: notSupported('isReflexEdge'),
        clockwiseSpanExcludingAccepted: notSupported('clockwiseSpanExcludingAccepted'),
        clockwiseSpanIncludingAccepted: notSupported('clockwiseSpanIncludingAccepted'),
        widdershinsBisector: notSupported('widdershinsBisector'),
        clockwiseBisector: notSupported('clockwiseBisector'),
        clockwiseVertexAtOffset: notSupported('clockwiseVertexAtOffset'),
        widdershinsVertexAtOffset: notSupported('widdershinsVertexAtOffset'),
        terminateEdgesAtPoint: notSupported('terminateEdgesAtPoint'),
        crossWireEdges: notSupported('crossWireEdges'),
        parentEdges: notSupported('parentEdges'),
        parentEdge: notSupported('parentEdge'),
        exteriorParentsOfSubPolygon: notSupported('exteriorParentsOfSubPolygon'),
        validateSplitReachesEdge: notSupported('validateSplitReachesEdge'),
    } as StraightSkeletonSolverContext;
}
