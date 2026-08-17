import { flattenRecursiveTree, solveSkeleton } from '@proc-geo/core';
import type { RecursiveNode, StraightSkeletonGraph, Strip, Vector2 } from '@proc-geo/core';
import type { FillStyle, SceneGroup, ScenePrimitive } from '../types';

/**
 * The picture: every level of a recursive subdivision, as scene primitives.
 *
 * Levels are told apart by two channels at once — a grey ramp from white at the root down to a mid
 * grey at the deepest level, and a stroke weight that thins with each level. Either channel alone
 * would be enough on a colour screen; both together are what survives a greyscale screenshot, which
 * is how this picture is most often looked at.
 *
 * Strokes alone add line density rather than structure, so the leaf cells are also filled — tinted
 * by the level-0 segment they descend from ({@link ancestorTint}), which is what turns a tangle of
 * strokes into a few large territories each visibly divided into many cells.
 *
 * Pure: no React, no canvas lifecycle. The tree→scene mapping changes when the driver's output shape
 * changes, whereas fitting and panning change when the interaction model does, so the two live apart.
 */

/** What the page's switches select: which levels are drawn, and whether leaf cells are filled. */
export interface RecursiveSceneOptions {
    /** Which levels are drawn, indexed by level. A missing entry counts as visible. */
    levelVisibility: boolean[];
    /** Leaf cells carry their territory tint. Off restores stroke-only rendering exactly. */
    showLeafFills: boolean;
}

/** How one level of the tree is drawn. Root first. */
export interface RecursiveLevelStyle {
    /** Segment boundaries — the cells the level was divided into. */
    segmentColour: string;
    segmentWidth: number;
    /** The level's skeleton arcs, drawn under its segment boundaries. */
    skeletonColour: string;
    skeletonWidth: number;
}

/**
 * One style per level, heaviest and lightest at the root.
 *
 * The segment ramp is pure grey so it cannot depend on hue at all, and the skeleton ramp is a warm
 * hue whose lightness falls in step with it — so in greyscale the two ramps still read as two ramps,
 * and a level's skeleton is always dimmer than its own cell borders.
 *
 * The widths span a factor of four rather than the two-and-a-half they used to: a deeper level's
 * boundary runs along its parent's wherever the two coincide, so a modest thinning left the root no
 * more prominent than the leaves. The other half of that fix is the draw order in
 * {@link recursiveTreeToScene} — deepest level first, so the root's heavy stroke lands on top.
 */
export const RECURSIVE_LEVEL_STYLES: RecursiveLevelStyle[] = [
    { segmentColour: '#ffffff', segmentWidth: 3.2, skeletonColour: '#ffd43b', skeletonWidth: 4.0 },
    { segmentColour: '#adb5bd', segmentWidth: 1.6, skeletonColour: '#e8880c', skeletonWidth: 2.0 },
    { segmentColour: '#6c757d', segmentWidth: 0.8, skeletonColour: '#a04a06', skeletonWidth: 1.0 },
];

/**
 * Reserved for cells that did not subdivide, and used for nothing else on this page.
 *
 * A failed cell is filled as well as outlined: an outline alone reads as one more cell border in a
 * picture already full of them, whereas a filled patch reads as a hole in the subdivision, which is
 * what it is.
 */
const FAILURE_COLOUR = '#e64980';

/** The input polygon, drawn over everything so a lost corner of the region cannot hide. */
const INPUT_POLYGON_COLOUR = '#4dabf7';

/**
 * Hue of {@link FAILURE_COLOUR}, and the arc either side of it that no territory may be given.
 *
 * A failed cell is the one thing on this page that must never be mistaken for an ordinary cell, and
 * once leaves are tinted, "pink" alone no longer says so — with enough territories one of them would
 * eventually land on pink. Reserving the arc makes the collision impossible rather than unlikely.
 */
const FAILURE_HUE_DEGREES = 340;
const RESERVED_HUE_HALF_ARC_DEGREES = 30;

/**
 * Territory tint: strong enough in hue to group, weak enough in alpha to be drawn through.
 *
 * The lightness cycle is decision 4 — cells of one territory must stay individually countable rather
 * than merging into a single blob — and it varies lightness only, because hue is what encodes
 * ancestry and a cell whose hue drifted would read as a different territory. The cycle is not
 * monotonic so that two cells adjacent in traversal order are never merely one step apart.
 */
const LEAF_FILL_SATURATION = 0.65;
const LEAF_FILL_LIGHTNESSES = [0.5, 0.64, 0.57, 0.71];
const LEAF_FILL_OPACITY = 0.2;

/**
 * Colours are emitted as hex, not `hsl(...)`, because `SceneCanvas` applies a fill's opacity by
 * rewriting the colour string and only understands hex and `rgb()`. An `hsl()` fill would silently
 * render fully opaque and bury the skeleton under it.
 */
function hslHex(hueDegrees: number, saturation: number, lightness: number): string {
    const h = ((hueDegrees % 360) + 360) % 360;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - chroma / 2;

    let rgb: [number, number, number];
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];

    const channel = (value: number) =>
        Math.round(Math.min(255, Math.max(0, (value + m) * 255)))
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/**
 * The fill a leaf cell is given: hue from its level-0 ancestor, lightness from its place in that
 * ancestor's brood. The companion to {@link styleForLevel} — level says how a cell is drawn, this
 * says which territory it belongs to.
 *
 * Hues are cut evenly from the wheel by root index, so neighbouring territories land far apart in
 * hue rather than next to each other, and the cut starts clear of the arc reserved for failures.
 *
 * @param rootIndex   index of the level-0 segment the cell descends from
 * @param rootCount   how many level-0 segments there are — the wheel is cut into this many
 * @param ordinal     the cell's place among the leaves of its own territory
 */
export function ancestorTint(rootIndex: number, rootCount: number, ordinal: number): FillStyle {
    const count = Math.max(1, Math.floor(rootCount));
    const index = ((Math.floor(rootIndex) % count) + count) % count;
    const available = 360 - 2 * RESERVED_HUE_HALF_ARC_DEGREES;
    const hue = FAILURE_HUE_DEGREES + RESERVED_HUE_HALF_ARC_DEGREES + (index / count) * available;

    const steps = LEAF_FILL_LIGHTNESSES.length;
    const lightness = LEAF_FILL_LIGHTNESSES[((Math.floor(ordinal) % steps) + steps) % steps];

    return { color: hslHex(hue, LEAF_FILL_SATURATION, lightness), opacity: LEAF_FILL_OPACITY };
}

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

/**
 * A leaf cell's fill, with no stroke of its own — the cell's borders are drawn by its level's
 * segment strokes, on top, and a second outline here would only thicken them.
 *
 * A cell's holes are left unfilled-around rather than cut out: the scene DSL draws one ring per
 * primitive, so the honest options are to tint the outer ring or to leave a hole-bearing cell
 * untinted, and an untinted cell would read as belonging to no territory at all.
 */
function leafFillPrimitives(cell: LeafTerritoryCell, rootCount: number): ScenePrimitive[] {
    if (cell.segment.boundary.length < 3) return [];
    const tint = ancestorTint(cell.rootIndex, rootCount, cell.ordinal);
    return [
        {
            type: 'line',
            points: flatten(cell.segment.boundary),
            closed: true,
            stroke: { color: tint.color, width: 0 },
            fill: tint,
        },
    ];
}

function flatten(points: Vector2[]): number[] {
    return points.flatMap((p) => [p.x, p.y]);
}

/**
 * The style a level is drawn in — the deepest style repeating once the tree runs past the ramp.
 *
 * The one place that clamp is written down, so a swatch in a panel and the stroke on the canvas
 * cannot disagree about what level 3 looks like.
 */
export function styleForLevel(level: number): RecursiveLevelStyle {
    return RECURSIVE_LEVEL_STYLES[Math.min(level, RECURSIVE_LEVEL_STYLES.length - 1)];
}

/** Where a failed cell's label goes. Lives here because only {@link failedCell} needs it. */
function centroidOf(points: Vector2[]): Vector2 {
    if (points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * The skeleton arcs of one region, for drawing only.
 *
 * `RecursiveNode` carries the segments the solve produced but not the solve itself, so the arcs are
 * recovered by asking `solveSkeleton` the same question again. That is cheap next to the merit of
 * keeping the driver's return type exactly as specified, and it is the same deterministic call on
 * the same boundary — never a second, differently-parameterised solve.
 */
function skeletonEdges(node: RecursiveNode): ScenePrimitive[] {
    if (node.failure !== undefined || node.boundary.length < 3) return [];

    let graph: StraightSkeletonGraph;
    try {
        const result = solveSkeleton(node.boundary);
        if (!result.complete) return [];
        graph = result.graph;
    } catch {
        // The same boundary already solved once inside the driver, so this cannot normally fire —
        // and if it ever does, a missing skeleton layer is the right outcome, not a blank page.
        return [];
    }

    const style = styleForLevel(node.level);
    const edges: ScenePrimitive[] = [];
    for (const { id } of graph.interiorEdges) {
        const edge = graph.edges[id];
        if (edge === undefined || edge.target === undefined) continue;
        const source = graph.nodes[edge.source];
        const target = graph.nodes[edge.target];
        edges.push({
            type: 'line',
            points: [source.position.x, source.position.y, target.position.x, target.position.y],
            stroke: { color: style.skeletonColour, width: style.skeletonWidth },
        });
    }
    return edges;
}

function failedCell(node: RecursiveNode): ScenePrimitive[] {
    if (node.boundary.length < 3) return [];
    const centre = centroidOf(node.boundary);
    return [
        {
            type: 'line',
            points: flatten(node.boundary),
            closed: true,
            stroke: { color: FAILURE_COLOUR, width: 2, dash: [6, 4] },
            fill: { color: FAILURE_COLOUR, opacity: 0.28 },
        },
        {
            type: 'label',
            x: centre.x,
            y: centre.y,
            text: 'unsolved',
            style: { fontSize: 11, color: FAILURE_COLOUR, bold: true },
        },
    ];
}

/**
 * One segment: its outline, plus a dashed ring per hole.
 *
 * Holes are dashed rather than solid because a segment that wraps an island has two rings of equal
 * standing on the canvas, and only the dash says which of them is the outside of the cell.
 */
function segmentPrimitives(segment: Strip, style: RecursiveLevelStyle): ScenePrimitive[] {
    if (segment.boundary.length < 3) return [];
    return [
        {
            type: 'line',
            points: flatten(segment.boundary),
            closed: true,
            stroke: { color: style.segmentColour, width: style.segmentWidth },
        },
        ...segment.holes
            .filter((hole) => hole.length >= 3)
            .map<ScenePrimitive>((hole) => ({
                type: 'line',
                points: flatten(hole),
                closed: true,
                stroke: { color: style.segmentColour, width: style.segmentWidth, dash: [4, 4] },
            })),
    ];
}

/** Everything drawn for one region: its failure patch, or its skeleton arcs under its segments. */
function nodePrimitives(node: RecursiveNode, style: RecursiveLevelStyle): ScenePrimitive[] {
    if (node.failure !== undefined) return failedCell(node);
    return [
        ...skeletonEdges(node),
        ...node.segments.flatMap((segment) => segmentPrimitives(segment, style)),
    ];
}

/**
 * Draws the leaf fills first, then the tree level by level from the deepest up to the root, then the
 * input polygon.
 *
 * Every fill goes under every stroke, because the fill is the grouping cue and the skeleton is the
 * subject. The levels then run deepest-first so the root's heavy white boundary is the last stroke
 * laid down: a child's boundary coincides with its parent's wherever the parent was cut, so drawing
 * the children last would let a thin grey stroke erase the heaviest one in the picture.
 *
 * A fill is hidden with the level of the cell that owns it, so turning a level off removes its
 * territory colour along with its strokes rather than leaving a tint behind with nothing to explain
 * it. With `showLeafFills` off no fill primitive is emitted at all — the honest comparison against
 * stroke-only rendering.
 */
export function recursiveTreeToScene(tree: RecursiveNode, options: RecursiveSceneOptions): ScenePrimitive[] {
    const { levelVisibility, showLeafFills } = options;
    const nodes = flattenRecursiveTree(tree);
    const deepest = nodes.reduce((deepestSoFar, node) => Math.max(deepestSoFar, node.level), 0);
    const groups: SceneGroup[] = [];

    if (showLeafFills) {
        const { rootCount, cells } = leafTerritories(tree);
        for (let level = 0; level <= deepest; level++) {
            const children = cells
                .filter((cell) => cell.level === level)
                .flatMap((cell) => leafFillPrimitives(cell, rootCount));
            if (children.length === 0) continue;
            groups.push({
                type: 'group',
                id: `group:recursive-leaf-fill-${level}`,
                children,
                visible: levelVisibility[level] ?? true,
            });
        }
    }

    for (let level = deepest; level >= 0; level--) {
        const style = styleForLevel(level);
        groups.push({
            type: 'group',
            id: `group:recursive-level-${level}`,
            children: nodes
                .filter((candidate) => candidate.level === level)
                .flatMap((node) => nodePrimitives(node, style)),
            visible: levelVisibility[level] ?? true,
        });
    }

    groups.push({
        type: 'group',
        id: 'group:recursive-input',
        children: [
            {
                type: 'line',
                points: flatten(tree.boundary),
                closed: true,
                stroke: { color: INPUT_POLYGON_COLOUR, width: 1.5 },
            },
        ],
    });

    return groups;
}
