import { flattenRecursiveTree, solveSkeleton } from '@proc-geo/core';
import type { RecursiveNode, SpineStrategy, StraightSkeletonGraph, Strip, Vector2 } from '@proc-geo/core';
import type { FillStyle, SceneGroup, ScenePrimitive } from '../types';
import { leafTerritories } from './leafTerritories';
import type { LeafTerritoryCell } from './leafTerritories';
import { ancestorTint, FAILURE_COLOUR } from './recursiveTerritoryTint';
import { regionSpine } from '../../stores/useRecursiveSubdivisionStore';

/**
 * The picture: every level of a recursive subdivision, as scene primitives.
 *
 * Levels are told apart by two channels at once — a grey ramp from white at the root down to a mid
 * grey at the deepest level, and a stroke weight that thins with each level. Either channel alone
 * would be enough on a colour screen; both together are what survives a greyscale screenshot, which
 * is how this picture is most often looked at.
 *
 * Strokes alone add line density rather than structure, so the leaf cells are also filled — tinted
 * by the level-0 segment they descend from, which is what turns a tangle of strokes into a few large
 * territories each visibly divided into many cells. Which cell belongs to which territory is
 * {@link leafTerritories}'s question and what colour that makes it is {@link ancestorTint}'s; this
 * file only decides what is drawn, and in what order.
 *
 * A level can declare its segments FINAL while its courtyard goes on subdividing, so the picture also
 * has to say whether a cell was subdivided or is the last word: see {@link RECURSED_SEGMENT_OPACITY}.
 * A leaf cell and a cell that merely came out childless are different things, and drawing them
 * identically would make the droste reading — a final ring around a subdivided courtyard — look like a
 * recursion that had failed.
 *
 * Below full depth a node also carries a RESIDUE: the interior contour its wavefront never reached.
 * It is drawn in a family of its own — see {@link residueRingStyle} — because it is not a cell of the
 * subdivision but the part that has not been subdivided yet, and a reader who cannot tell the two
 * apart is reading the wrong picture. Where a residue has pinched into several rings, the rings are
 * told apart from each other as well as from the segments.
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
    /**
     * Which spine definition to draw at each level, indexed by level.
     *
     * OPTIONAL, and a level with no entry gets no spine layer at all. A spine is a SELECTION from
     * arcs already on the canvas, so a host that has not adopted the control is not missing geometry
     * — it is looking at the same picture without the emphasis, which is exactly what it drew
     * before.
     */
    spineStrategies?: SpineStrategy[];
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

/** The input polygon, drawn over everything so a lost corner of the region cannot hide. */
const INPUT_POLYGON_COLOUR = '#4dabf7';

/**
 * The residue's own colour family: cool green, shared by no other layer on this page.
 *
 * The point of the picture below full depth is that the interior the wavefront never reached is a
 * DIFFERENT KIND OF THING from the ring of segments around it, so it is told apart on three channels
 * at once rather than one — hue (green against the segments' pure grey and the skeleton's warm
 * orange), dash (segments are solid), and a fill of its own.
 *
 * The list is indexed by the ring's place among its node's rings, which is what makes a residue that
 * has PINCHED into several loops read as several loops: at a pinch the rings are adjacent on the
 * canvas and identical in kind, and only a per-ring channel distinguishes them. Lightness varies
 * within one hue family, so the rings stay recognisably one layer while remaining individually
 * countable.
 */
export const RESIDUE_RING_COLOURS = ['#63e6be', '#12b886', '#a9e34b', '#0b7285'];

/**
 * Dash patterns per ring, the greyscale half of the same distinction.
 *
 * Hue alone dies in a greyscale screenshot, which is how this page is most often looked at, and two
 * rings of one node then become indistinguishable exactly when it matters most.
 */
export const RESIDUE_RING_DASHES = [[8, 4], [3, 3], [12, 4, 3, 4], [2, 5]];

/** Faint enough that the skeleton and the segment borders read straight through a courtyard. */
const RESIDUE_FILL_OPACITY = 0.18;

/**
 * Opacity of a segment boundary whose cell was SUBDIVIDED, against the full strength of a final one.
 *
 * A LEAF SEGMENT AND A SEGMENT THAT MERELY HAS NO CHILDREN ARE DIFFERENT THINGS, and now that a level
 * can declare its segments final while its courtyard goes on subdividing, the picture has to say which
 * it is looking at. A cell that was subdivided is a container rather than a cell — the real cells are
 * the strokes inside it — so it is drawn as a hint and the cells that are final are drawn at full
 * strength.
 *
 * OPACITY RATHER THAN HUE OR DASH, because both of those channels are already spoken for: hue is the
 * layer (grey segments, warm skeleton, green residue) and dash is "this ring is not the outside of a
 * cell" (holes, residue rings). Opacity is a lightness channel, so unlike hue it survives the greyscale
 * screenshot this page is most often read in.
 */
export const RECURSED_SEGMENT_OPACITY = 0.5;

/**
 * The spine's own colour: violet, shared by no other layer on this page.
 *
 * A spine is a SELECTION from arcs already drawn, not new geometry, so it has to read as emphasis on
 * the skeleton rather than as another layer over it. Two channels say so at once: this hue, which
 * belongs to nothing else here, and {@link SPINE_WIDTH_MULTIPLIER}'s weight — and the weight is the
 * half that survives the greyscale screenshot this page is most often read in, where a hue alone
 * would leave the spine indistinguishable from the skeleton it was chosen out of.
 *
 * Violet rather than a brighter warm tone, because the skeleton ramp is already warm and an emphasis
 * one step along the same ramp would read as "the next level down" instead of "these arcs, not those".
 */
export const SPINE_COLOUR = '#845ef7';

/**
 * How much heavier a spine arc is drawn than the skeleton arc it lies on top of.
 *
 * Taken from the LEVEL'S OWN skeleton width rather than given a ramp of its own, so a spine thins
 * with depth in step with everything else at that level and the level ramp stays one decision in one
 * place — the same rule {@link residueRingStyle} follows.
 */
export const SPINE_WIDTH_MULTIPLIER = 2.2;

/** How one residue ring is drawn: its level sets the weight, its ordinal the hue and the dash. */
export interface ResidueRingStyle {
    colour: string;
    width: number;
    dash: number[];
    fill: FillStyle;
}

/**
 * The style of the `ringIndex`-th residue ring of a node at `level`.
 *
 * The WIDTH is taken from {@link styleForLevel} rather than given a ramp of its own, so a residue
 * thins with depth in step with everything else drawn at that level and the level ramp stays one
 * decision in one place.
 */
export function residueRingStyle(level: number, ringIndex: number): ResidueRingStyle {
    const index = ((Math.floor(ringIndex) % RESIDUE_RING_COLOURS.length) + RESIDUE_RING_COLOURS.length)
        % RESIDUE_RING_COLOURS.length;
    const colour = RESIDUE_RING_COLOURS[index];
    return {
        colour,
        width: styleForLevel(level).segmentWidth,
        dash: RESIDUE_RING_DASHES[index % RESIDUE_RING_DASHES.length],
        fill: { color: colour, opacity: RESIDUE_FILL_OPACITY },
    };
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

/**
 * One region's spine: the arcs `strategy` retained, and nothing joining them.
 *
 * A DISCONNECTED SPINE IS DRAWN DISCONNECTED. One primitive per retained arc and none between them,
 * so where a threshold has severed a region's spine the gap is visible on the canvas as well as
 * counted in the readout — the single most important thing this picture has to communicate, being
 * the difference between a definition that is usable on a region and one that is not.
 *
 * A region with no extractable spine draws nothing, which is the same silence the skeleton layer
 * keeps for a region that did not solve.
 */
function spineEdges(node: RecursiveNode, strategy: SpineStrategy): ScenePrimitive[] {
    const region = regionSpine(node, strategy);
    if (region === undefined) return [];

    const style = styleForLevel(node.level);
    return region.spine.edges.flatMap<ScenePrimitive>((edge) => {
        const from = region.positions.get(edge.a);
        const to = region.positions.get(edge.b);
        if (from === undefined || to === undefined) return [];
        return [
            {
                type: 'line',
                points: [from.x, from.y, to.x, to.y],
                stroke: { color: SPINE_COLOUR, width: style.skeletonWidth * SPINE_WIDTH_MULTIPLIER },
            },
        ];
    });
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
 *
 * `recursed` carries decision 10's distinction into the stroke — see
 * {@link RECURSED_SEGMENT_OPACITY} — and it applies to a segment's holes as well as its outline,
 * because a hole is part of the same cell and would otherwise contradict it.
 */
function segmentPrimitives(segment: Strip, style: RecursiveLevelStyle, recursed: boolean): ScenePrimitive[] {
    if (segment.boundary.length < 3) return [];
    const stroke = {
        color: style.segmentColour,
        width: style.segmentWidth,
        ...(recursed ? { opacity: RECURSED_SEGMENT_OPACITY } : {}),
    };
    return [
        {
            type: 'line',
            points: flatten(segment.boundary),
            closed: true,
            stroke,
        },
        ...segment.holes
            .filter((hole) => hole.length >= 3)
            .map<ScenePrimitive>((hole) => ({
                type: 'line',
                points: flatten(hole),
                closed: true,
                stroke: { ...stroke, dash: [4, 4] },
            })),
    ];
}

/**
 * Everything drawn for one region: its failure patch, or its skeleton arcs under its segments.
 *
 * A node's segments either all recursed or none did — the driver emits one child per merged group —
 * so whether this level's cells are final is a fact about the NODE, read once here rather than
 * guessed at per segment.
 */
function nodePrimitives(node: RecursiveNode, style: RecursiveLevelStyle): ScenePrimitive[] {
    if (node.failure !== undefined) return failedCell(node);
    const recursed = node.children.length > 0;
    return [
        ...skeletonEdges(node),
        ...node.segments.flatMap((segment) => segmentPrimitives(segment, style, recursed)),
    ];
}

/**
 * One node's residue rings: the interior its wavefront never reached.
 *
 * Filled only when the page's fills are on, so switching them off is still the honest stroke-only
 * comparison it has always been — the ring is then a dashed green outline and nothing else.
 */
function residuePrimitives(node: RecursiveNode, showFills: boolean): ScenePrimitive[] {
    if (node.failure !== undefined) return [];
    return node.residueRings.flatMap<ScenePrimitive>((ring, ringIndex) => {
        if (ring.length < 3) return [];
        const style = residueRingStyle(node.level, ringIndex);
        return [
            {
                type: 'line',
                points: flatten(ring),
                closed: true,
                stroke: { color: style.colour, width: style.width, dash: style.dash },
                ...(showFills ? { fill: style.fill } : {}),
            },
        ];
    });
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
    const { levelVisibility, showLeafFills, spineStrategies = [] } = options;
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

    // The residue goes on top of every segment stroke, and is hidden with the level whose region it
    // is the interior of. A ring runs along its own level's cut, so drawn underneath it would be the
    // one layer the picture exists to show and the one layer buried by the layer above it.
    for (let level = 0; level <= deepest; level++) {
        const children = nodes
            .filter((candidate) => candidate.level === level)
            .flatMap((node) => residuePrimitives(node, showLeafFills));
        if (children.length === 0) continue;
        groups.push({
            type: 'group',
            id: `group:recursive-residue-${level}`,
            children,
            visible: levelVisibility[level] ?? true,
        });
    }

    // The spine goes over everything the level drew, because it is an EMPHASIS on arcs already in
    // the picture: drawn underneath its own level's skeleton, the layer it selects from would cover
    // the selection. Hidden with the level whose region it is the spine of, like every other layer.
    for (let level = 0; level <= deepest; level++) {
        const strategy = spineStrategies[level];
        if (strategy === undefined) continue;
        const children = nodes
            .filter((candidate) => candidate.level === level)
            .flatMap((node) => spineEdges(node, strategy));
        if (children.length === 0) continue;
        groups.push({
            type: 'group',
            id: `group:recursive-spine-${level}`,
            children,
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
