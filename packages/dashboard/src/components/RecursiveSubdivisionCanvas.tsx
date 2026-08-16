import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecursiveNode, Vector2 } from '@proc-geo/core';
import { SceneCanvas } from '../scene/SceneCanvas';
import { recursiveTreeToScene } from '../scene/adapters/recursiveSubdivisionToScene';

/**
 * The canvas the recursive subdivision is drawn on: fit, pan and zoom, and nothing else.
 *
 * What the tree looks like is `recursiveTreeToScene`'s business, in `scene/adapters/` with the
 * other scene builders; this file owns only the viewport lifecycle, which changes for entirely
 * different reasons.
 */

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
