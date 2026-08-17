import type { RecursiveNode, Strip } from '@proc-geo/core';

/**
 * Which level-0 segment each leaf cell of a recursive subdivision descends from.
 *
 * A walk over the driver's tree that answers one question — ancestry — and answers it in the tree's
 * own terms: indices and levels, no colours and no scene primitives. Whether that ancestry is then
 * shown as hue, as a label or not at all is somebody else's decision, which is why this changes only
 * when the driver's tree shape changes.
 */

/** One leaf cell, and the level-0 territory it belongs to. */
export interface LeafTerritoryCell {
    /** The cell itself — a segment of a node with no children. */
    segment: Strip;
    /** Level of the node the cell belongs to, so it can be hidden with that level. */
    level: number;
    /** Index of the level-0 segment this cell descends from. Its hue. */
    rootIndex: number;
    /** The cell's place among the leaves of its own territory. Its lightness. */
    ordinal: number;
}

/** The leaf cells of a tree, grouped implicitly by the level-0 segment each descends from. */
export interface LeafTerritories {
    /** How many level-0 segments the region was divided into — how many ways the wheel is cut. */
    rootCount: number;
    /** Every leaf cell, in traversal order. */
    cells: LeafTerritoryCell[];
}

/** A cell before its place among its siblings has been counted. */
type UncountedLeafCell = Omit<LeafTerritoryCell, 'ordinal'>;

/**
 * Leaf cells of one subtree, all of them credited to the level-0 segment `rootIndex` at its head.
 *
 * A node that failed contributes nothing: it has no segments to fill, and it is drawn as a failure
 * patch instead — which is the point of decision 7.
 */
function collectLeafCells(node: RecursiveNode, rootIndex: number): UncountedLeafCell[] {
    if (node.children.length > 0) {
        return node.children.flatMap((child) => collectLeafCells(child, rootIndex));
    }
    if (node.failure !== undefined) return [];
    return node.segments.map((segment) => ({ segment, level: node.level, rootIndex }));
}

/**
 * Every leaf cell of the tree, tagged with the level-0 segment it descends from.
 *
 * Ancestry is the tree's own child order: the driver emits one child per merged group in segment
 * order, so child `i` of the root *is* level-0 segment `i` re-solved, and everything under it is
 * that segment subdivided. At one level the root has no children and its own segments are the
 * leaves, each its own territory.
 */
export function leafTerritories(tree: RecursiveNode): LeafTerritories {
    const rootCount = Math.max(1, tree.children.length, tree.segments.length);

    const uncounted: UncountedLeafCell[] = tree.children.length > 0
        ? tree.children.flatMap((child, index) => collectLeafCells(child, index))
        : collectLeafCells(tree, 0).map((cell, index) => ({ ...cell, rootIndex: index }));

    const countPerTerritory = new Map<number, number>();
    const cells = uncounted.map((cell) => {
        const ordinal = countPerTerritory.get(cell.rootIndex) ?? 0;
        countPerTerritory.set(cell.rootIndex, ordinal + 1);
        return { ...cell, ordinal };
    });

    return { rootCount, cells };
}
