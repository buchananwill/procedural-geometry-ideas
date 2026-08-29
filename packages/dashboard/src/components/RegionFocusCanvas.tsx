import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boundsOfPoints } from '@proc-geo/core';
import type { Vector2 } from '@proc-geo/core';
import { SceneCanvas } from '../scene/SceneCanvas';
import { focusedRegionToScene } from '../scene/adapters/regionInspector';
import type { StandaloneSolve } from '../scene/adapters/regionInspector';
import { fitView } from './RecursiveSubdivisionCanvas';
import type { CanvasSize, CanvasView } from './RecursiveSubdivisionCanvas';

/**
 * One region's boundary and its own solve, fitted to a canvas of its own.
 *
 * A SECOND VIEWPORT, NOT A SECOND PICTURE OF THE FIRST. The whole-tree canvas is fitted to the ROOT
 * polygon, so a level-2 cell occupies a few dozen pixels of it and a defect inside that cell is
 * smaller than a stroke. Fitting the region's own bounds is the entire affordance: the same geometry,
 * at the scale at which it can be read.
 *
 * The viewport lifecycle is this file's only business — what is drawn is
 * {@link focusedRegionToScene}'s — which is the same division `RecursiveSubdivisionCanvas` keeps, and
 * the fit arithmetic is imported from it rather than restated so the two canvases frame their subject
 * identically.
 */

export interface RegionFocusCanvasProps {
    /** The region's boundary, exactly as the driver captured it. */
    boundary: Vector2[];
    /** What solving that boundary on its own came to — the skeleton layer, and the verdict. */
    solve: StandaloneSolve;
}

export default function RegionFocusCanvas({ boundary, solve }: RegionFocusCanvasProps) {
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
    const [view, setView] = useState<CanvasView>({ scale: 1, position: { x: 0, y: 0 } });
    const fittedTo = useRef('');

    const handleResize = useCallback((next: CanvasSize) => setSize(next), []);

    const scene = useMemo(() => focusedRegionToScene(boundary, solve), [boundary, solve]);
    const bounds = useMemo(() => boundsOfPoints(boundary), [boundary]);

    // Re-fits whenever the SUBJECT changes, unlike the tree canvas, which deliberately holds a pan
    // the reader has made. Selecting a different region is a new subject, and leaving the old
    // viewport would open the inspector on empty canvas at every selection.
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
