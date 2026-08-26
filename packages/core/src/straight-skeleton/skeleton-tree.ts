import type {SkeletonSolveResult} from './types';
import {computeNodeOffsets, requireProjectableResult} from './offset-projection';

/**
 * A solved straight skeleton seen as a weighted undirected graph, with the queries a pruning
 * algorithm needs: adjacency, degree, leaves, edge lengths and per-node wavefront offsets.
 *
 * ## This is a substrate and nothing else
 *
 * It builds no spine, prunes nothing and makes no policy choice. Three spine-extraction strategies
 * are to be written on top of it — the longest path through the tree, a wavefront-time threshold,
 * and degree-based whisker pruning — and each is a short function *given this*. Writing any of them
 * against the raw solver graph instead produces three bespoke traversals of the same structure,
 * which is the outcome this module exists to prevent.
 *
 * ## Plain data plus free functions
 *
 * {@link SkeletonTree} carries no methods. It is passed between the dashboard and workers, where
 * values are `structuredClone`d, and methods do not survive that — they become `undefined` silently.
 * `SkeletonNormalisation` diverged from an object-with-methods design for exactly this reason and is
 * the direct precedent. `Map` does survive `structuredClone` and is used freely.
 *
 * ## The polygon's own vertices are in the tree, and they are its leaves
 *
 * A primary bisector runs from an original polygon vertex to an interior skeleton node, so excluding
 * exterior nodes would sever every leaf and leave a tree whose diameter ran between the wrong
 * endpoints. All three strategies depend on their being present: the diameter is measured vertex to
 * vertex, whisker pruning removes exactly these leaf edges, and a wavefront-time threshold discards
 * them because their offset is zero.
 *
 * ## Offsets are read, never re-derived
 *
 * {@link SkeletonTree.offsets} is a copy of what {@link computeNodeOffsets} returned, entry for
 * entry. The projection module's header records what deriving one quantity by two routes costs: the
 * two disagree in the last bits, and downstream comparisons that assume they agree drop arcs.
 * Nothing here needs bit-equality today, but a second derivation of a quantity that already has a
 * canonical source is how that guarantee is lost later.
 *
 * ## Structure is checked, not assumed
 *
 * The straight skeleton of a simple polygon is a tree, and this module is entitled to expect one.
 * It reports rather than assumes: a cyclic or disconnected result is a solver defect worth
 * surfacing, and a strategy built on top of a silent assumption fails confusingly far from the
 * cause. See {@link SkeletonTree.isTree}. Such a result is still returned in full — the caller
 * decides, and a diagnostic tool looking at a broken skeleton is precisely the case where throwing
 * is least helpful.
 *
 * ## Preconditions
 *
 * `result.complete === true` and `result.context !== null`, the same pair every entry point in the
 * projection module requires, checked through the same {@link requireProjectableResult}. A
 * self-intersecting input yields a merged graph with no solver context and cannot be walked this
 * way. That is a caller error and throws, which is a different thing from the honest report about
 * the geometry that {@link SkeletonTree.isTree} carries.
 */

/**
 * One arc of the skeleton, as an undirected weighted edge.
 *
 * `a` and `b` are the node ids it joins, ordered `a < b`, so an undirected edge has exactly one
 * representation and two edges are the same edge exactly when both ids match. There is one edge per
 * node pair: the arc a collapse writes down from both of its ends appears here once, keyed by the
 * lower of the two interior edge ids. The only input that cannot be ordered `a < b` is a degenerate
 * arc whose two ends are the same node. When the solver marked it `culled` — its deliberate
 * representation of a surplus bisector retired at a degenerate closure — it contributes no geometry
 * and is excluded here. An UNMARKED self-loop is a solver defect, and is kept, with `a === b`,
 * because dropping it would hide it; it forces {@link SkeletonTree.isTree} false.
 */
export interface SkeletonTreeEdge {
    /** The two node ids this edge joins. Undirected; `a < b` by construction. */
    a: number;
    b: number;
    /** The interior edge in the solved graph this came from; the lower id where two record it. */
    interiorEdgeId: number;
    /** Euclidean distance between the two node positions, in caller space. */
    length: number;
}

/**
 * A read-only view of a solved skeleton as a weighted undirected graph.
 *
 * `length` on every edge is an ABSOLUTE length in the sense of the solve's parameter classes — a
 * caller-space distance, not a fraction of anything. A consumer expressing a whisker threshold as a
 * fraction therefore divides by a quantity taken from this same tree, the diameter or the maximum
 * offset, rather than comparing against a world constant.
 */
export interface SkeletonTree {
    nodeIds: number[];
    edges: SkeletonTreeEdge[];
    /**
     * Node id to the node ids adjacent to it. Every node in `nodeIds` has an entry, ascending and
     * without repeats, and the relation is symmetric: `b` appears in `adjacency.get(a)` exactly when
     * `a` appears in `adjacency.get(b)`.
     *
     * One entry per neighbour, matching `edges` one for one: `adjacency.get(n).length` is the degree
     * of `n`, and the degree-one nodes are exactly `leafIds`.
     */
    adjacency: Map<number, number[]>;
    /**
     * Node id to wavefront offset, taken from `computeNodeOffsets` and never re-derived.
     *
     * A node the projection left out of its table — one with no incident interior edge — is left out
     * here too rather than guessed at, so a caller reads this map with the same care it reads that
     * one.
     */
    offsets: Map<number, number>;
    /** Nodes of degree one — the polygon vertices, and any dangling skeleton node. Ascending. */
    leafIds: number[];
    /**
     * False when the graph carries a cycle or is disconnected.
     *
     * COMPUTED, NOT ASSERTED: the edge count equals the node count minus one *and* a traversal from
     * one node reaches every node. Either half alone admits a graph that is not a tree — the counts
     * balance for a component with a cycle beside an isolated node, and connectivity alone says
     * nothing about extra edges.
     */
    isTree: boolean;
}

/** A node reached by the weighted traversal, with the distance to it and the node it came from. */
interface ReachedNode {
    distance: number;
    parentId: number | null;
}

/** How far the furthest node from a source is, and which node that is. */
interface FurthestNode {
    nodeId: number;
    distance: number;
}

/**
 * Build the tree view of a solved skeleton.
 *
 * Every interior edge of the solved graph whose two ends are known becomes one
 * {@link SkeletonTreeEdge}. An interior edge with no target is one the solver never resolved; it
 * joins nothing and so contributes no edge, which leaves its source disconnected and is reported
 * through {@link SkeletonTree.isTree} rather than thrown or silently patched.
 *
 * The node set is every original polygon vertex — decided, not incidental; see the module header —
 * together with every node an edge reaches. Ordering throughout is ascending by node id, so the
 * whole structure is a pure function of the solve.
 *
 * @throws if the solve is incomplete or has no solver context.
 */
export function buildSkeletonTree(result: SkeletonSolveResult): SkeletonTree {
    requireProjectableResult(result, 'buildSkeletonTree');

    const edges = collectTreeEdges(result);
    const nodeIds = collectNodeIds(result.graph.numExteriorNodes, edges);
    const adjacency = buildAdjacency(nodeIds, edges);

    return {
        nodeIds,
        edges,
        adjacency,
        offsets: offsetsOfNodes(result, nodeIds),
        leafIds: nodeIds.filter(nodeId => neighboursOf(adjacency, nodeId).length === 1),
        isTree: edges.length === nodeIds.length - 1 && reachableCount(nodeIds, adjacency) === nodeIds.length,
    };
}

/**
 * The longest path between any two leaves, by summed edge length. Node ids, in order, running from
 * the lower-numbered of the two endpoints to the higher.
 *
 * The standard two-traversal argument: from any node find the furthest node, then from that node
 * find the furthest again; the path between those two is a diameter.
 *
 * WEIGHTED BY LENGTH, NOT BY HOP COUNT. A skeleton's arcs vary enormously in length, and a
 * hop-count diameter picks a path through many short whiskers over the long spine that is wanted.
 *
 * TIES BREAK TO THE LOWEST NODE ID, so the result is a pure function of the tree rather than of the
 * order anything was visited in. Symmetric input is the normal case here and not an edge case: a
 * regular n-gon has one diameter per pair of opposite vertices, and a diameter that moved with
 * traversal order would make every spine built on it non-deterministic.
 *
 * @throws if `tree.isTree` is false. On a cyclic graph the two-traversal argument does not hold and
 * the answer would be silently wrong rather than absent.
 */
export function skeletonTreeDiameter(tree: SkeletonTree): number[] {
    if (!tree.isTree) {
        throw new Error(
            'skeletonTreeDiameter requires a tree, but the skeleton tree reports isTree === false. ' +
            'The graph carries a cycle or is disconnected, so the two-traversal diameter argument ' +
            'does not hold; inspect the solve that produced it.',
        );
    }

    const incidence = buildIncidence(tree);
    const firstEnd = furthestOf(traverse(tree.nodeIds[0], incidence), tree.nodeIds).nodeId;
    const secondPass = traverse(firstEnd, incidence);
    const secondEnd = furthestOf(secondPass, tree.nodeIds).nodeId;

    const path = pathBack(secondEnd, secondPass);
    return path[0] <= path[path.length - 1] ? path : [...path].reverse();
}

/**
 * One tree edge per resolved interior edge of the solved graph, with arcs recorded from both ends
 * counted once.
 *
 * ## Why one node pair can carry two interior edges
 *
 * The last arc of a collapse is written down twice, once by each of the two bisectors that closed
 * it: a rectangle's central ridge comes back as `4 -> 5` and `5 -> 4`, and the pentagon house's
 * does the same. Those are one segment recorded from both ends, not two — two straight arcs sharing
 * both endpoints ARE the same arc, there being no second straight route between two points. So the
 * pair collapses to a single undirected edge, which is decision 5's "an undirected edge has one
 * representation" applied to the case that actually produces two.
 *
 * Keeping both would put a two-cycle in every skeleton that ends in a collapse and report `isTree`
 * false for the rectangle, whose skeleton is a tree — a false alarm on the shape the specification
 * names as the one with a genuine internal edge.
 *
 * The representative is the LOWEST interior edge id of the pair, so the field is a pure function of
 * the solve rather than of which end the solver happened to record first. Both records describe the
 * same two endpoints, so `length` is the same number whichever is kept.
 *
 * An interior edge with no target is one the solver never resolved. It joins nothing and so
 * contributes no edge; its source is left short of a neighbour, which surfaces as a broken structure
 * on {@link SkeletonTree.isTree} rather than as a guess here.
 *
 * A `culled` interior edge is the opposite of unresolved: the solver deliberately retired it as a
 * zero-length self-loop at a degenerate closure. It carries no geometry and is skipped, and its
 * closure node remains connected through the edges that genuinely arrive there.
 *
 * Sorted by `(a, b)`, so the list is a pure function of the solve and not of the order the solver
 * happened to create its arcs in.
 */
function collectTreeEdges(result: SkeletonSolveResult): SkeletonTreeEdge[] {
    const {graph} = result;

    const edgesByNodePair = new Map<string, SkeletonTreeEdge>();
    for (const interiorEdge of graph.interiorEdges) {
        const polygonEdge = graph.edges[interiorEdge.id];
        if (polygonEdge === undefined || polygonEdge.target === undefined || interiorEdge.culled) {
            continue;
        }

        const source = graph.nodes[polygonEdge.source];
        const target = graph.nodes[polygonEdge.target];
        if (source === undefined || target === undefined) {
            continue;
        }

        const a = Math.min(polygonEdge.source, polygonEdge.target);
        const b = Math.max(polygonEdge.source, polygonEdge.target);
        const existing = edgesByNodePair.get(`${a}:${b}`);
        if (existing !== undefined) {
            existing.interiorEdgeId = Math.min(existing.interiorEdgeId, interiorEdge.id);
            continue;
        }

        edgesByNodePair.set(`${a}:${b}`, {
            a,
            b,
            interiorEdgeId: interiorEdge.id,
            length: Math.hypot(target.position.x - source.position.x, target.position.y - source.position.y),
        });
    }

    return [...edgesByNodePair.values()].sort((left, right) => (left.a - right.a) || (left.b - right.b));
}

/**
 * Every original polygon vertex, plus every node an edge reaches, ascending.
 *
 * The exterior nodes are included unconditionally rather than because an edge happened to reach
 * them: they are the tree's leaves by decision, and a vertex whose bisector went missing must show
 * up as an isolated node — and therefore as `isTree === false` — instead of quietly vanishing from
 * the node set.
 */
function collectNodeIds(numExteriorNodes: number, edges: SkeletonTreeEdge[]): number[] {
    const nodeIds = new Set<number>();
    for (let nodeId = 0; nodeId < numExteriorNodes; nodeId++) {
        nodeIds.add(nodeId);
    }
    for (const edge of edges) {
        nodeIds.add(edge.a);
        nodeIds.add(edge.b);
    }

    return [...nodeIds].sort((left, right) => left - right);
}

/** The neighbour sets, symmetric by construction: each edge is entered from both of its ends. */
function buildAdjacency(nodeIds: number[], edges: SkeletonTreeEdge[]): Map<number, number[]> {
    const neighbourSets = new Map<number, Set<number>>();
    for (const nodeId of nodeIds) {
        neighbourSets.set(nodeId, new Set<number>());
    }
    for (const edge of edges) {
        neighbourSets.get(edge.a)?.add(edge.b);
        neighbourSets.get(edge.b)?.add(edge.a);
    }

    const adjacency = new Map<number, number[]>();
    for (const [nodeId, neighbours] of neighbourSets) {
        adjacency.set(nodeId, [...neighbours].sort((left, right) => left - right));
    }

    return adjacency;
}

/** The neighbours of a node, or none when the node is not in the tree. */
function neighboursOf(adjacency: Map<number, number[]>, nodeId: number): number[] {
    return adjacency.get(nodeId) ?? [];
}

/**
 * The offsets of exactly these nodes, copied from {@link computeNodeOffsets}.
 *
 * A node the projection has no entry for is skipped rather than defaulted: the projection module is
 * the single source of this quantity, and a zero invented here would be indistinguishable from a
 * polygon vertex's genuine zero.
 */
function offsetsOfNodes(result: SkeletonSolveResult, nodeIds: number[]): Map<number, number> {
    const nodeOffsets = computeNodeOffsets(result);

    const offsets = new Map<number, number>();
    for (const nodeId of nodeIds) {
        const offset = nodeOffsets.get(nodeId);
        if (offset !== undefined) {
            offsets.set(nodeId, offset);
        }
    }

    return offsets;
}

/** How many nodes a breadth-first walk from the first node reaches, itself included. */
function reachableCount(nodeIds: number[], adjacency: Map<number, number[]>): number {
    if (nodeIds.length === 0) {
        return 0;
    }

    const seen = new Set<number>([nodeIds[0]]);
    const queue = [nodeIds[0]];
    while (queue.length > 0) {
        const nodeId = queue.shift() as number;
        for (const neighbour of neighboursOf(adjacency, nodeId)) {
            if (!seen.has(neighbour)) {
                seen.add(neighbour);
                queue.push(neighbour);
            }
        }
    }

    return seen.size;
}

/** Each node to the edges incident to it, so a traversal has both the neighbour and its weight. */
function buildIncidence(tree: SkeletonTree): Map<number, SkeletonTreeEdge[]> {
    const incidence = new Map<number, SkeletonTreeEdge[]>();
    for (const nodeId of tree.nodeIds) {
        incidence.set(nodeId, []);
    }
    for (const edge of tree.edges) {
        incidence.get(edge.a)?.push(edge);
        incidence.get(edge.b)?.push(edge);
    }

    return incidence;
}

/**
 * Distance from `sourceId` to every node it reaches, with the node each was reached from.
 *
 * A breadth-first walk suffices because the caller has established there is exactly one path between
 * any two nodes; the summed length along that single path is the distance, and no shorter route
 * exists to be found.
 */
function traverse(sourceId: number, incidence: Map<number, SkeletonTreeEdge[]>): Map<number, ReachedNode> {
    const reached = new Map<number, ReachedNode>([[sourceId, {distance: 0, parentId: null}]]);
    const queue = [sourceId];
    while (queue.length > 0) {
        const nodeId = queue.shift() as number;
        const here = reached.get(nodeId) as ReachedNode;
        for (const edge of incidence.get(nodeId) ?? []) {
            const neighbour = edge.a === nodeId ? edge.b : edge.a;
            if (reached.has(neighbour)) {
                continue;
            }
            reached.set(neighbour, {distance: here.distance + edge.length, parentId: nodeId});
            queue.push(neighbour);
        }
    }

    return reached;
}

/**
 * The furthest reached node, ties to the lowest node id.
 *
 * `nodeIds` is ascending, so scanning it and keeping a strictly greater distance takes the lowest id
 * of any tied set without a second comparison.
 */
function furthestOf(reached: Map<number, ReachedNode>, nodeIds: number[]): FurthestNode {
    let furthest: FurthestNode = {nodeId: nodeIds[0], distance: 0};
    for (const nodeId of nodeIds) {
        const here = reached.get(nodeId);
        if (here !== undefined && here.distance > furthest.distance) {
            furthest = {nodeId, distance: here.distance};
        }
    }

    return furthest;
}

/** The path to `nodeId` from the node the traversal started at, in order. */
function pathBack(nodeId: number, reached: Map<number, ReachedNode>): number[] {
    const path: number[] = [];
    for (let cursor: number | null = nodeId; cursor !== null; cursor = reached.get(cursor)?.parentId ?? null) {
        path.push(cursor);
    }

    return path.reverse();
}
