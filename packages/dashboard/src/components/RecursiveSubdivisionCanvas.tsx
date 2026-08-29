import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boundsOfPoints } from '@proc-geo/core';
import type { Bounds2, RecursiveNode } from '@proc-geo/core';
import { SceneCanvas } from '../scene/SceneCanvas';
import { recursiveTreeToScene } from '../scene/adapters/recursiveSubdivisionToScene';
import { SCENE_ZOOM_CAP } from '../scene/perceptual-floor';
import { useRecursiveSubdivisionStore } from '../stores/useRecursiveSubdivisionStore';

/**
 * The canvas the recursive subdivision is drawn on: fit, pan and zoom, and nothing else.
 *
 * What the tree looks like is `recursiveTreeToScene`'s business, in `scene/adapters/` with the
 * other scene builders; this file owns only the viewport lifecycle, which changes for entirely
 * different reasons.
 */

/** Fraction of the viewport the fitted polygon fills, leaving a margin for the heaviest strokes. */
const FIT_MARGIN_FRACTION = 0.9;

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

/**
 * Scale and offset that put `bounds` in the middle of a viewport of `size`.
 *
 * DELIBERATELY UNCLAMPED, even though a tiny shape fits above {@link SCENE_ZOOM_CAP} — the Square
 * spans 2 world units and fits an 800px viewport at 270x, and a deep region in the inspector is
 * routinely smaller than that. Fitting is the affordance (journal decision 97: a region drawn alone
 * and filling the frame is what makes a malformed boundary the first thing a reader sees), and
 * clamping the fit would open those pictures at a fifth of the frame.
 *
 * A fit above the cap does NOT break the perceptual-floor derivation, which is worth writing down
 * because it looks as though it should. The floor is RELATIVE — 1e-5 of the shape's own extent — while
 * the cap is absolute in world→px, so the condition the derivation actually needs is
 * `1e-5 * extent <= 2 / scale`, i.e. `scale <= 200000 / extent`. At the reference extent of 2000 that
 * is exactly 100, which is where the cap comes from: the cap is the WORST CASE, taken at the largest
 * shape the demo draws. A 2-unit shape may be magnified 100000x before its own floor becomes visible,
 * so the 270x fit has three orders of headroom.
 *
 * What the cap-above-fit combination did break was the wheel, and that is fixed where it lives — see
 * {@link zoomIn} in `scene/zoom.ts`.
 */
export function fitView(bounds: Bounds2, size: CanvasSize): CanvasView {
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

    // Read from the store rather than taken as a prop, so the fills switch reaches the canvas
    // without every host page having to learn about it. `levelVisibility` predates the switch and
    // stays a prop; a host that drives visibility itself keeps doing so.
    const showLeafFills = useRecursiveSubdivisionStore((s) => s.showLeafFills);
    // The per-level spine definitions, read the same way and for the same reason: the panel writes
    // them, the picture is where the three definitions are actually compared, and a page that had to
    // thread them through as a prop would leave the readout describing a spine nothing had drawn.
    const spineStrategies = useRecursiveSubdivisionStore((s) => s.spineStrategies);

    const handleResize = useCallback((next: CanvasSize) => setSize(next), []);

    const scene = useMemo(
        () => recursiveTreeToScene(tree, { levelVisibility, showLeafFills, spineStrategies }),
        [tree, levelVisibility, showLeafFills, spineStrategies],
    );
    const bounds = useMemo(() => boundsOfPoints(tree.boundary), [tree]);

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
