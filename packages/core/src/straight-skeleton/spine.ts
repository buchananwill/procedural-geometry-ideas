import type {SkeletonTree, SkeletonTreeEdge} from './skeleton-tree';
import {skeletonTreeDiameter} from './skeleton-tree';

/**
 * A region's skeleton is a tree; its SPINE is the part of that tree that would carry a road.
 *
 * Which part that is has three candidate definitions and no settled answer, so all three are here
 * and none of them is privileged. This module extracts and reports; it does not choose, does not
 * repair what it extracts, and is not wired into the access model — a spine is drawn and measured so
 * that the three definitions can be compared on real regions, which is a judgement the geometry
 * cannot make for itself.
 *
 * ## A filter over the substrate, never a traversal of its own
 *
 * {@link SkeletonTree} already carries adjacency, degree, leaves, edge lengths and per-node offsets,
 * and {@link skeletonTreeDiameter} already carries the weighted longest path. Every strategy here is
 * a predicate over `tree.edges` plus the bookkeeping every strategy shares. Any strategy that grew a
 * walk of its own would be a second, subtly different reading of a structure that already has one.
 *
 * ## Nothing is repaired, and nothing throws for being empty
 *
 * A threshold above everything in the tree retains nothing. That is an answer — the strategy at that
 * setting keeps none of the skeleton — and it is reported as an empty {@link Spine} rather than
 * thrown or quietly widened until something survives. A `wavefront-time` spine may equally come back
 * in several pieces; see {@link Spine.componentCount}.
 *
 * ## Fractions are read as given
 *
 * Both parameterised strategies take a dimensionless fraction, meant as `[0, 1]`, so one slider
 * means the same thing on a courtyard and on a whole region. A fraction outside that range is NOT
 * clamped: it simply lands above or below everything in the tree and yields the full spine or the
 * empty one, which is the honest report of what was asked for. A silent clamp would be a correction
 * this return type has no channel to declare.
 */

/**
 * Which definition of "the part that would carry a road" to apply.
 *
 * A discriminated union rather than a name plus an optional number, because `diameter` takes no
 * parameter at all and a `fraction` sitting unused beside it would invite a caller — or a panel — to
 * set one and believe it did something.
 */
export type SpineStrategy =
    | {kind: 'diameter'}
    | {kind: 'wavefront-time'; fraction: number}
    | {kind: 'whisker-prune'; fraction: number};

/** The retained part of one skeleton tree, with the two numbers a comparison is made on. */
export interface Spine {
    /**
     * Node ids retained, ascending — exactly the endpoints of {@link Spine.edges}.
     *
     * A node no retained edge touches is not in a spine: a spine is a set of arcs, and an isolated
     * node carries no road.
     */
    nodeIds: number[];
    /** The tree edges retained, sorted by `(a, b)` — the same ordering {@link SkeletonTree} uses. */
    edges: SkeletonTreeEdge[];
    /**
     * Connected component count over the retained edges. 1 is a usable spine; 0 is an empty one.
     *
     * COMPUTED AND REPORTED, NEVER REPAIRED. A `wavefront-time` spine may legitimately exceed one —
     * in a lobed region the lobe centres survive a threshold that the thin neck between them does
     * not — and that is precisely the evidence needed to judge the strategy. Taking the largest
     * component, bridging the gap or failing the call would each hide the strategy's main weakness.
     */
    componentCount: number;
    /** Total length of the retained edges, in caller space. */
    length: number;
}

/**
 * The spine of `tree` under `strategy`.
 *
 * Deterministic: the same tree and strategy give the same spine, node for node, whatever order the
 * tree's edges happen to be listed in. Symmetric regions are the normal case here — a square's four
 * bisectors are all equally long — so ties are routine rather than exotic, and every one of them is
 * settled by node id.
 *
 * `diameter` and `whisker-prune` are connected by construction on a connected tree, and that is
 * ASSERTED rather than assumed: if either ever reports more than one component the bug is in the
 * strategy, and this is where it surfaces.
 *
 * @throws if `tree.isTree` is false and the strategy needs the diameter (`diameter`,
 * `whisker-prune`), because the longest-path argument does not hold on a cyclic or disconnected
 * graph. `wavefront-time` reads only offsets and lengths, and works on any graph.
 */
export function extractSpine(tree: SkeletonTree, strategy: SpineStrategy): Spine {
    switch (strategy.kind) {
        case 'diameter':
            return connectedSpine(diameterEdges(tree), tree, strategy.kind);
        case 'wavefront-time':
            return spineOf(wavefrontTimeEdges(tree, strategy.fraction));
        case 'whisker-prune':
            return connectedSpine(whiskerPrunedEdges(tree, strategy.fraction), tree, strategy.kind);
    }
}

/**
 * The weighted longest leaf-to-leaf path, and nothing else.
 *
 * No parameter, and so no setting at which it degenerates: it always ends at two extremities of the
 * region and is therefore always a through-route rather than a cul-de-sac. The path itself is
 * {@link skeletonTreeDiameter}'s answer, taken as given — this reads the node sequence back into the
 * edges that join consecutive pairs of it.
 */
function diameterEdges(tree: SkeletonTree): SkeletonTreeEdge[] {
    const path = skeletonTreeDiameter(tree);

    const onPath = new Set<string>();
    for (let index = 0; index + 1 < path.length; index++) {
        onPath.add(nodePairKey(path[index], path[index + 1]));
    }

    return tree.edges.filter(edge => onPath.has(nodePairKey(edge.a, edge.b)));
}

/**
 * Every edge both of whose endpoints stand at or above `fraction` of the tree's maximum offset.
 *
 * Keeps the deep interior and discards everything near the boundary. The polygon's own vertices have
 * offset zero and so are always discarded, which is intended: they are where the wavefront started,
 * not where a road would run.
 *
 * A node the projection recorded no offset for is discarded too. The offsets map is
 * `computeNodeOffsets`' answer copied entry for entry, and a zero invented for a missing node would
 * be indistinguishable from a polygon vertex's genuine zero.
 *
 * The scale is the tree's own maximum offset, so the fraction is dimensionless and one slider
 * setting means the same thing on a courtyard as on a whole region.
 */
function wavefrontTimeEdges(tree: SkeletonTree, fraction: number): SkeletonTreeEdge[] {
    const threshold = fraction * maxOffsetOf(tree);
    return tree.edges.filter(edge =>
        offsetAtLeast(tree, edge.a, threshold) && offsetAtLeast(tree, edge.b, threshold));
}

/**
 * Leaf edges shorter than `fraction` of THE DIAMETER'S LENGTH, removed and removed again until none
 * is left.
 *
 * The scale is the length of the tree's weighted longest path — the natural one, being the longest
 * road the region could carry, so a fraction of it reads as "a whisker next to the through-route".
 * That makes the fraction dimensionless, exactly as `wavefront-time`'s is.
 *
 * ONLY LEAF EDGES ARE EVER REMOVED, so what remains is connected: cutting a degree-one node off a
 * tree leaves a tree. Each sweep removes every currently-qualifying leaf edge at once and then
 * re-reads the degrees, which is what "to a fixed point" means here — an edge deep in the tree
 * becomes a leaf edge once its whiskers have gone, and is judged then.
 *
 * A large enough fraction eventually consumes the last edge and the spine is empty. That is a real
 * answer about that setting, not a failure.
 */
function whiskerPrunedEdges(tree: SkeletonTree, fraction: number): SkeletonTreeEdge[] {
    const threshold = fraction * diameterLength(tree);

    let retained = tree.edges;
    for (;;) {
        const degrees = degreesOf(retained);
        const survivors = retained.filter(edge => !isPrunableWhisker(edge, degrees, threshold));
        if (survivors.length === retained.length) {
            return retained;
        }
        retained = survivors;
    }
}

/** A leaf edge, short of the threshold — the one thing a whisker prune removes. */
function isPrunableWhisker(edge: SkeletonTreeEdge, degrees: Map<number, number>, threshold: number): boolean {
    const isLeafEdge = degrees.get(edge.a) === 1 || degrees.get(edge.b) === 1;
    return isLeafEdge && edge.length < threshold;
}

/** How many retained edges touch each node. A degenerate self-loop counts twice and is never a leaf. */
function degreesOf(edges: SkeletonTreeEdge[]): Map<number, number> {
    const degrees = new Map<number, number>();
    for (const edge of edges) {
        degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1);
        degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1);
    }

    return degrees;
}

/** The summed length of the diameter path, which is `whisker-prune`'s scale. */
function diameterLength(tree: SkeletonTree): number {
    return diameterEdges(tree).reduce((total, edge) => total + edge.length, 0);
}

/** The largest offset any node in the tree carries, or zero where the tree records none. */
function maxOffsetOf(tree: SkeletonTree): number {
    let maxOffset = 0;
    for (const offset of tree.offsets.values()) {
        maxOffset = Math.max(maxOffset, offset);
    }

    return maxOffset;
}

/** Whether a node's recorded offset reaches the threshold. A node with no recorded offset does not. */
function offsetAtLeast(tree: SkeletonTree, nodeId: number, threshold: number): boolean {
    const offset = tree.offsets.get(nodeId);
    return offset !== undefined && offset >= threshold;
}

/** `a` and `b` as one key, orientation-independent, so an undirected edge is looked up once. */
function nodePairKey(left: number, right: number): string {
    return `${Math.min(left, right)}:${Math.max(left, right)}`;
}

/**
 * The retained edges as a {@link Spine}: sorted, with their nodes, their component count and their
 * length.
 *
 * The sort is what makes the result a pure function of the tree rather than of the order a strategy
 * happened to visit edges in, which is decision 15 applied at the one place every strategy passes
 * through.
 */
function spineOf(edges: SkeletonTreeEdge[]): Spine {
    const retained = [...edges].sort((left, right) => (left.a - right.a) || (left.b - right.b));

    const nodeIds = new Set<number>();
    let length = 0;
    for (const edge of retained) {
        nodeIds.add(edge.a);
        nodeIds.add(edge.b);
        length += edge.length;
    }

    return {
        nodeIds: [...nodeIds].sort((left, right) => left - right),
        edges: retained,
        componentCount: componentCountOf(retained),
        length,
    };
}

/**
 * A spine from a strategy that is connected by construction, checked rather than trusted.
 *
 * An EMPTY spine has no components and passes: retaining nothing is decision 5's legitimate answer
 * to a threshold above everything, and it is not a disconnection — there is nothing to disconnect.
 * What cannot happen is a spine in two pieces, and that is what this refuses to return.
 *
 * A tree that is not one is left alone: `isTree === false` is a defect in the solve the substrate
 * already reports, and a strategy is not entitled to be connected over a graph that is not connected
 * to begin with.
 */
function connectedSpine(edges: SkeletonTreeEdge[], tree: SkeletonTree, kind: SpineStrategy['kind']): Spine {
    const spine = spineOf(edges);
    if (tree.isTree && spine.componentCount > 1) {
        throw new Error(
            `extractSpine(${kind}) produced ${spine.componentCount} components over a connected tree, ` +
            'but this strategy retains a connected subtree by construction. The defect is in the ' +
            'strategy, not in the caller.',
        );
    }

    return spine;
}

/** Connected components over the retained edges alone; zero when nothing was retained. */
function componentCountOf(edges: SkeletonTreeEdge[]): number {
    const neighbours = new Map<number, number[]>();
    for (const edge of edges) {
        neighbours.set(edge.a, [...(neighbours.get(edge.a) ?? []), edge.b]);
        neighbours.set(edge.b, [...(neighbours.get(edge.b) ?? []), edge.a]);
    }

    const seen = new Set<number>();
    let components = 0;
    for (const nodeId of neighbours.keys()) {
        if (seen.has(nodeId)) {
            continue;
        }
        components++;
        const queue = [nodeId];
        seen.add(nodeId);
        while (queue.length > 0) {
            const here = queue.shift() as number;
            for (const neighbour of neighbours.get(here) ?? []) {
                if (!seen.has(neighbour)) {
                    seen.add(neighbour);
                    queue.push(neighbour);
                }
            }
        }
    }

    return components;
}
