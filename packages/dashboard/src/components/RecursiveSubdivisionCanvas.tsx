import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flattenRecursiveTree, solveSkeleton } from '@proc-geo/core';
import type { RecursiveNode, StraightSkeletonGraph, Strip, Vector2 } from '@proc-geo/core';
import { SceneCanvas } from '../scene/SceneCanvas';
import type { ScenePrimitive, SceneGroup } from '../scene/types';

/**
 * The picture: every level of a recursive subdivision on one canvas.
 *
 * Levels are told apart by two channels at once — a grey ramp from white at the root down to a mid
 * grey at the deepest level, and a stroke weight that thins with each level. Either channel alone
 * would be enough on a colour screen; both together are what survives a greyscale screenshot, which
 * is how this picture is most often looked at.
 */

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
 */
export const RECURSIVE_LEVEL_STYLES: RecursiveLevelStyle[] = [
    { segmentColour: '#ffffff', segmentWidth: 2.6, skeletonColour: '#ffd43b', skeletonWidth: 3.4 },
    { segmentColour: '#adb5bd', segmentWidth: 1.6, skeletonColour: '#e8880c', skeletonWidth: 2.0 },
    { segmentColour: '#6c757d', segmentWidth: 1.0, skeletonColour: '#a04a06', skeletonWidth: 1.2 },
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

/** Fraction of the viewport the fitted polygon fills, leaving a margin for the heaviest strokes. */
const FIT_MARGIN_FRACTION = 0.9;

/** Axis-aligned extent of a point set, in polygon units. */
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Viewport extent, in pixels. */
export interface CanvasSize {
    width: number;
    height: number;
}

/** Stage transform: what {@link fitView} hands back to the canvas. */
export interface CanvasView {
    scale: number;
    position: { x: number; y: number };
}

export interface RecursiveSubdivisionCanvasProps {
    tree: RecursiveNode;
    /** Which levels are drawn, indexed by level. A missing entry counts as visible. */
    levelVisibility: boolean[];
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

function boundsOf(points: Vector2[]): Bounds {
    return points.reduce<Bounds>(
        (box, p) => ({
            minX: Math.min(box.minX, p.x),
            minY: Math.min(box.minY, p.y),
            maxX: Math.max(box.maxX, p.x),
            maxY: Math.max(box.maxY, p.y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
}

function centroidOf(points: Vector2[]): Vector2 {
    if (points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

/** Scale and offset that put `bounds` in the middle of a viewport of `size`. */
export function fitView(bounds: Bounds, size: CanvasSize): CanvasView {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!(width > 0) || !(height > 0) || size.width <= 0 || size.height <= 0) {
        return { scale: 1, position: { x: 0, y: 0 } };
    }
    const scale = FIT_MARGIN_FRACTION * Math.min(size.width / width, size.height / height);
    return {
        scale,
        position: {
            x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
            y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
        },
    };
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
 * Draws the tree level by level, root first, so the thinner strokes of a deeper level land on top of
 * the heavier ones they subdivide. The input polygon goes last for the same reason.
 */
export function recursiveTreeToScene(tree: RecursiveNode, levelVisibility: boolean[]): ScenePrimitive[] {
    const nodes = flattenRecursiveTree(tree);
    const deepest = nodes.reduce((deepestSoFar, node) => Math.max(deepestSoFar, node.level), 0);
    const groups: SceneGroup[] = [];

    for (let level = 0; level <= deepest; level++) {
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

export default function RecursiveSubdivisionCanvas({ tree, levelVisibility }: RecursiveSubdivisionCanvasProps) {
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
    const [view, setView] = useState<CanvasView>({ scale: 1, position: { x: 0, y: 0 } });
    const fittedTo = useRef('');

    const handleResize = useCallback((next: CanvasSize) => setSize(next), []);

    const scene = useMemo(() => recursiveTreeToScene(tree, levelVisibility), [tree, levelVisibility]);
    const bounds = useMemo(() => boundsOf(tree.boundary), [tree]);

    // Fits the polygon to the viewport, which is what makes the page draw something on first paint:
    // the fixtures sit at a few hundred units from the origin, so the identity transform would open
    // on empty canvas and require the very interaction decision 9 forbids.
    //
    // Keyed on the numbers rather than on object identity, so re-solving at a new level count — same
    // polygon, new tree — leaves a pan or zoom the user has since made exactly where it was.
    useEffect(() => {
        const signature = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY},${size.width},${size.height}`;
        if (fittedTo.current === signature || size.width === 0 || size.height === 0) return;
        fittedTo.current = signature;
        setView(fitView(bounds, size));
    }, [bounds, size]);

    return (
        <SceneCanvas
            scene={scene}
            stageScale={view.scale}
            stagePosition={view.position}
            onScaleChange={(scale) => setView((current) => ({ ...current, scale }))}
            onPositionChange={(position) => setView((current) => ({ ...current, position }))}
            onResize={handleResize}
        />
    );
}
