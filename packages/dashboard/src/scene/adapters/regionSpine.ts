import { buildSkeletonTree, extractSpine, flattenRecursiveTree, solveSkeleton } from '@proc-geo/core';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../perceptual-floor';
import type {
    RecursiveNode,
    SkeletonSolveResult,
    SkeletonTree,
    Spine,
    SpineStrategy,
    Vector2,
} from '@proc-geo/core';

/**
 * The spine of a region of a recursive subdivision, and what a level's spines came to.
 *
 * A pure derivation over the driver's tree, in the tree's own terms — node ids, positions, lengths
 * and counts — with no colours, no scene primitives and no store state. It sits beside
 * {@link leafTerritories} for the same reason that does: both answer a question ABOUT the tree that
 * more than one consumer needs, and neither is entitled to know whether the answer ends up as a
 * stroke on the canvas or as a line of text in a panel.
 *
 * It lives here rather than in the Zustand store because it touches none of the store's state. The
 * canvas adapter and the controls panel both read it, and an adapter that had to import a runtime
 * value out of a store to draw a line would have inverted this package's dependency direction: every
 * other scene adapter imports only TYPES from a store, never a function.
 */

/**
 * The result of solving a region's boundary again, or `undefined` where that answer is unusable.
 *
 * A `RecursiveNode` carries the segments its solve produced but not the solve itself, so anything
 * that needs the skeleton asks `solveSkeleton` the same question over again — the same deterministic
 * call on the same boundary, never a second differently-parameterised solve.
 *
 * `undefined` covers a throw and an incomplete solve alike. THE THROW CANNOT NORMALLY FIRE: the
 * driver already put this exact boundary through this exact call to produce the node in the first
 * place. If it ever does, one region missing a layer is a better outcome than a blank page, and the
 * region's own failure is recorded on the node where the readout can count it.
 *
 * A caller that needs more than the graph — the solver context, for instance — checks for that
 * itself; this promises only that the call returned and the solve completed.
 *
 * ON {@link EXPLORER_PERCEPTUAL_FLOOR}, WHICH IS WHAT MAKES "never a second differently-parameterised
 * solve" TRUE. Journal decision 106 made the perceptual floor the client's and the demo's two solver
 * pages hand the driver this package's derived 1e-5; for the window between that and decision 108(b)
 * this call sat on the library's 1e-6 and the sentence above was false — the driver's tree and this
 * re-solve of one of its regions were parameterised differently, so a spine could be extracted from a
 * skeleton the tree never had. 108(b) unified every dashboard solve path onto the one derived floor
 * and the guarantee is a guarantee again.
 */
export function trySolveSkeleton(boundary: Vector2[]): SkeletonSolveResult | undefined {
    if (boundary.length < 3) return undefined;

    let result: SkeletonSolveResult;
    try {
        result = solveSkeleton(boundary, {perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR});
    } catch {
        return undefined;
    }

    return result.complete ? result : undefined;
}

/**
 * One region's spine, with what a caller needs to draw and to measure it.
 *
 * The tree comes back beside the spine because the number decision 12 asks for — how much of the
 * skeleton a strategy kept — is a RATIO, and a ratio whose denominator was measured somewhere else
 * is a ratio of two different regions. The positions come back for the same reason: a caller drawing
 * the spine would otherwise solve the same boundary a third time to find out where its nodes are.
 */
export interface RegionSpine {
    tree: SkeletonTree;
    spine: Spine;
    /** Total length of every arc in the tree — the denominator of decision 12's fraction. */
    treeLength: number;
    /** Node id to position, for the nodes the tree carries. */
    positions: Map<number, Vector2>;
}

/**
 * The spine of one region of a subdivision tree, or `undefined` where there is none to extract.
 *
 * `undefined` means NO SPINE WAS EXTRACTABLE, and it covers exactly three cases: the region did not
 * subdivide, its solve did not complete, or its skeleton is not a tree and the strategy needs the
 * longest path through one. It does NOT cover a spine that came back empty or in pieces — both of
 * those are answers, and burying them here would hide the very thing the page exists to show.
 */
export function regionSpine(node: RecursiveNode, strategy: SpineStrategy): RegionSpine | undefined {
    if (node.failure !== undefined) return undefined;

    const result = trySolveSkeleton(node.boundary);
    if (result === undefined || result.context === null) return undefined;

    const tree = buildSkeletonTree(result);
    // `diameter` and `whisker-prune` both need the weighted longest path, which does not exist on a
    // graph carrying a cycle. Asked for anyway they throw, and a throw here would be a page crash
    // rather than a report; a strategy that severed a tree it CAN read still throws, which is where
    // that defect is meant to surface.
    if (!tree.isTree && strategy.kind !== 'wavefront-time') return undefined;

    const positions = new Map<number, Vector2>();
    for (const nodeId of tree.nodeIds) {
        const graphNode = result.graph.nodes[nodeId];
        if (graphNode !== undefined) positions.set(nodeId, graphNode.position);
    }

    return {
        tree,
        spine: extractSpine(tree, strategy),
        treeLength: tree.edges.reduce((total, edge) => total + edge.length, 0),
        positions,
    };
}

/** What one level's spines came to: how much of the skeleton they kept, and whether they hold together. */
export interface SpineLevelSummary {
    level: number;
    /** The definition this level's spines were extracted under. */
    strategy: SpineStrategy;
    /** Regions at this level a spine was extracted from. */
    regions: number;
    /** Regions at this level with no extractable spine at all — see {@link regionSpine}. */
    unavailable: number;
    /** Spines that retained no arc: the threshold stood above everything in the region. */
    empty: number;
    /**
     * Spines that came back in more than one piece.
     *
     * REPORTED RATHER THAN REPAIRED, and reported per region rather than as a yes or no, because one
     * lobed cell among twenty connected ones is exactly the evidence that judges a strategy.
     */
    disconnected: number;
    /** The most pieces any one spine at this level came back in; 1 where every spine is whole. */
    maxComponentCount: number;
    /** Summed length of the retained arcs. */
    spineLength: number;
    /** Summed length of every arc in this level's skeletons — the denominator below. */
    treeLength: number;
    /** How much of the skeleton this level's spines kept, in `[0, 1]`. Zero where there is no tree. */
    lengthFraction: number;
}

/**
 * One row per strategy handed in: what that level's spines kept and whether they hold together.
 *
 * THE STRATEGIES ARE A PARAMETER for the same reason the level specs are: a tree does not carry the
 * setting it was read under, and a row has to name the definition its numbers came from or the
 * comparison the page exists for cannot be made.
 */
export function summariseSpines(root: RecursiveNode, strategies: SpineStrategy[]): SpineLevelSummary[] {
    const nodes = flattenRecursiveTree(root);

    return strategies.map((strategy, level) => {
        const extracted = nodes
            .filter((node) => node.level === level)
            .map((node) => regionSpine(node, strategy));
        const spines = extracted.filter((region): region is RegionSpine => region !== undefined);

        const spineLength = spines.reduce((total, { spine }) => total + spine.length, 0);
        const treeLength = spines.reduce((total, region) => total + region.treeLength, 0);

        return {
            level,
            strategy,
            regions: spines.length,
            unavailable: extracted.length - spines.length,
            empty: spines.filter(({ spine }) => spine.edges.length === 0).length,
            disconnected: spines.filter(({ spine }) => spine.componentCount > 1).length,
            maxComponentCount: spines.reduce((most, { spine }) => Math.max(most, spine.componentCount), 0),
            spineLength,
            treeLength,
            lengthFraction: treeLength > 0 ? spineLength / treeLength : 0,
        };
    });
}
