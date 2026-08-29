import { flattenRecursiveTree, solveSkeleton } from '@proc-geo/core';
import type { RecursiveNode, SkeletonSolveResult, Vector2 } from '@proc-geo/core';
import type { ScenePrimitive } from '../types';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../perceptual-floor';
import { FAILURE_COLOUR } from './recursiveTerritoryTint';

/**
 * One region of a subdivision tree, on its OWN: its boundary drawn alone, and its own standalone
 * solve drawn under it.
 *
 * WHY A SEPARATE PICTURE AT ALL (journal decision 97, the user's design). On the whole-tree canvas a
 * region is drawn among its siblings, sharing every edge with a neighbour and every colour with its
 * level. A boundary that is malformed — a vertex missing, a vertex doubled, a needle of no width
 * folded back along the edge it came from — is then invisible: the wrong picture and the right one
 * differ by a stroke that lands on top of another stroke. Fitted to a canvas alone, with its vertices
 * numbered, the same defect is the first thing a reader sees.
 *
 * AND WHY THE STANDALONE SOLVE BESIDE IT. "This region failed" has two readings that look identical
 * from the outside — the cutter handed the solver a bad polygon, or the solver failed on a good one —
 * and the only way to tell them apart by eye is to look at the polygon and at what the solver makes
 * of it in the same frame. So the boundary is drawn whatever happens, and the skeleton is drawn only
 * when the solve completes: a fitted, sensible-looking ring with NO skeleton under it is the solver's
 * failure, and a ring with a visible kink is the cutter's.
 *
 * Pure: no React, no store, no canvas lifecycle — the same footing as every other adapter here.
 */

/** The boundary's own stroke: heavier than anything on the whole-tree canvas, since it is alone. */
const BOUNDARY_COLOUR = '#ffffff';

/** The standalone solve's arcs, in the same warm family the tree canvas gives a root's skeleton. */
const SKELETON_COLOUR = '#ffd43b';

/** Vertex dots, in the input polygon's blue: they are the boundary's own, not the skeleton's. */
const VERTEX_COLOUR = '#4dabf7';

/** Radius of a vertex dot, in WORLD units of the fitted view — see {@link focusedRegionToScene}. */
const VERTEX_RADIUS_FRACTION = 0.012;

/** How far a vertex's index label sits from its dot, as a fraction of the region's extent. */
const LABEL_OFFSET_FRACTION = 0.03;

/** What became of solving this region's boundary on its own, and the graph when there is one. */
export interface StandaloneSolve {
    /**
     * `solved` — the boundary is one the solver can finish on, so a failure recorded against this
     * region was about the polygon it was handed being different, or about nothing at all.
     * `incomplete` — the solver ran and gave up; `threw` — it refused the input outright;
     * `degenerate` — there is no polygon here to solve.
     */
    status: 'solved' | 'incomplete' | 'threw' | 'degenerate';
    /** The solver's own words: its diagnostics, or the thrown message. Empty when it solved. */
    detail: string;
    /** The completed solve, for drawing. `undefined` on every other status. */
    result?: SkeletonSolveResult;
}

/**
 * Solve one region's boundary as if it were a root polygon of its own.
 *
 * THE SAME CALL THE DRIVER MAKES, minus the noise floor: `subdivideRecursively` hands each region the
 * ROOT's floor said in that region's unit space, which is a number the tree does not carry, so a
 * standalone solve is a solve of the same polygon under the floor it would get as a root. Where the
 * two answers differ, that difference is itself the finding — and it is reported rather than hidden,
 * because the panel prints this verdict beside the driver's.
 *
 * ON THE EXPLORER'S DERIVED FLOOR, which since journal decision 108(b) is the ONLY floor any solve in
 * this package runs at. Decision 106 made the perceptual floor the client's; 108(b) ruled that the
 * client is the whole dashboard rather than the two demo pages that happened to pass it first, so this
 * re-solve, `trySolveSkeleton` and `useParcelPipeline` all take {@link EXPLORER_PERCEPTUAL_FLOOR}. A
 * re-solve at the library's 1e-6 would have answered about the boundary at a finer floor than the tree
 * it is inspecting was built at — two tolerance systems inside one client, which is the exact disease
 * decisions 101/105/106 exist to cure.
 *
 * WHAT THIS COSTS, MEASURED AND KEPT VISIBLE: at 1e-5 no region in the corpus fails a standalone solve
 * of its HANDED-IN boundary — see `regionInspector.test.ts` for the sweep and for the one specimen that
 * still shows a real solver failure. That is not this function going quiet; it is the difference above
 * getting larger, and the difference is the finding.
 */
export function standaloneSolve(boundary: Vector2[]): StandaloneSolve {
    if (boundary.length < 3) {
        return {status: 'degenerate', detail: `${boundary.length} boundary vertices, fewer than the three a polygon needs.`};
    }

    let result: SkeletonSolveResult;
    try {
        result = solveSkeleton(boundary, {perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR});
    } catch (error) {
        return {status: 'threw', detail: error instanceof Error ? error.message : String(error)};
    }

    if (!result.complete) {
        return {
            status: 'incomplete',
            detail: result.diagnostics.map((diagnostic) => `${diagnostic.kind}: ${diagnostic.detail}`).join('; '),
        };
    }
    return {status: 'solved', detail: '', result};
}

function flatten(points: Vector2[]): number[] {
    return points.flatMap((point) => [point.x, point.y]);
}

/** The larger side of the region's bounding box, or 1 for a region with no extent to scale against. */
function extentOf(boundary: Vector2[]): number {
    if (boundary.length === 0) return 1;
    const xs = boundary.map((point) => point.x);
    const ys = boundary.map((point) => point.y);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return extent > 0 ? extent : 1;
}

/**
 * The focused picture of one region: its own skeleton, its boundary, and a numbered dot per vertex.
 *
 * DOTS AND INDICES, NOT JUST A RING. The whole reason to look at a region alone is to count its
 * vertices and see where they are, so the vertex layer is the point of this picture rather than a
 * decoration on it: two dots on top of each other is a duplicated vertex, a dot in the middle of a
 * straight run is a collinear one, and a gap where a corner should be is a missing one. The indices
 * are what let a reader quote the defect back — "vertex 4 and vertex 5" — against the boundary the
 * driver actually captured.
 *
 * The skeleton goes UNDER the boundary, because the boundary is the subject here and the solve is the
 * evidence about it; on the whole-tree canvas the emphasis is the other way round.
 */
export function focusedRegionToScene(boundary: Vector2[], solve: StandaloneSolve): ScenePrimitive[] {
    if (boundary.length === 0) return [];

    const extent = extentOf(boundary);
    const groups: ScenePrimitive[] = [];

    const arcs: ScenePrimitive[] = [];
    if (solve.result !== undefined) {
        const graph = solve.result.graph;
        for (const { id } of graph.interiorEdges) {
            const edge = graph.edges[id];
            if (edge === undefined || edge.target === undefined || edge.target === edge.source) continue;
            arcs.push({
                type: 'line',
                points: [
                    graph.nodes[edge.source].position.x, graph.nodes[edge.source].position.y,
                    graph.nodes[edge.target].position.x, graph.nodes[edge.target].position.y,
                ],
                stroke: { color: SKELETON_COLOUR, width: 1.6 },
            });
        }
    }
    if (arcs.length > 0) {
        groups.push({ type: 'group', id: 'group:focus-skeleton', children: arcs });
    }

    groups.push({
        type: 'group',
        id: 'group:focus-boundary',
        children: [
            {
                type: 'line',
                points: flatten(boundary),
                closed: boundary.length >= 3,
                stroke: {
                    // A region that did not solve keeps the pink it carries on the tree canvas, so a
                    // reader arriving from the whole picture is looking at the same thing.
                    color: solve.status === 'solved' ? BOUNDARY_COLOUR : FAILURE_COLOUR,
                    width: 2.4,
                },
            },
        ],
    });

    groups.push({
        type: 'group',
        id: 'group:focus-vertices',
        children: boundary.flatMap<ScenePrimitive>((vertex, index) => [
            {
                type: 'point',
                x: vertex.x,
                y: vertex.y,
                radius: extent * VERTEX_RADIUS_FRACTION,
                fill: { color: VERTEX_COLOUR },
            },
            {
                type: 'label',
                x: vertex.x + extent * LABEL_OFFSET_FRACTION,
                y: vertex.y + extent * LABEL_OFFSET_FRACTION,
                text: `${index}`,
                style: { fontSize: 11, color: VERTEX_COLOUR },
            },
        ]),
    });

    return groups;
}

/** One row of the inspector's region list: what it says, and how far in it is drawn. */
export interface RegionListRow {
    node: RecursiveNode;
    /** Indentation depth. Equal to the node's level, named separately so the list owns its own layout. */
    indent: number;
    /** `segment 3`, `residue ring 0`, or `root` — where this region came from inside its parent. */
    origin: string;
}

/** Where a region came from inside its parent, in the words the list shows. */
export function describeProvenance(node: RecursiveNode): string {
    switch (node.provenance.kind) {
        case 'root':
            return 'root';
        case 'segment':
            return `segment ${node.provenance.index}`;
        case 'residue':
            return `residue ring ${node.provenance.ringIndex}`;
    }
}

/**
 * Every region of a tree as a flat, indented list — the traversal order the ids number.
 *
 * FLAT AND INDENTED RATHER THAN A COLLAPSIBLE TREE WIDGET. The list's job is to get a reader to one
 * region, most often a failing one, and a tree that opens closed hides exactly the deep regions the
 * failures live in. The traversal is `flattenRecursiveTree`'s, so the order on screen is the order
 * the ids run in and a reader scanning for `r0.10` finds it where the numbering says it is.
 */
export function regionListRows(root: RecursiveNode): RegionListRow[] {
    return flattenRecursiveTree(root).map((node) => ({
        node,
        indent: node.level,
        origin: describeProvenance(node),
    }));
}
