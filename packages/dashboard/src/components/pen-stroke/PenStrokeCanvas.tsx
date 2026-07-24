import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { lerpStroke } from '@proc-geo/core';
import type { StrokePoint } from '@proc-geo/core';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';

const STROKE_COLOR = '#4dd0e1';
const DRAWING_COLOR = '#7a8288';

/**
 * Single-stroke drawing canvas: LMB (or pen/touch) down begins a stroke and
 * wipes the previous one, dragging captures raw (x, y, t, pressure) samples,
 * release terminates the line. After release the canvas shows the lerped
 * morph between the raw capture and its spline correspondence.
 */
export default function PenStrokeCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

    const rawPoints = usePenStrokeStore((s) => s.rawPoints);
    const isDrawing = usePenStrokeStore((s) => s.isDrawing);
    const result = usePenStrokeStore((s) => s.result);
    const lerpAlpha = usePenStrokeStore((s) => s.lerpAlpha);
    const beginStroke = usePenStrokeStore((s) => s.beginStroke);
    const appendPoint = usePenStrokeStore((s) => s.appendPoint);
    const endStroke = usePenStrokeStore((s) => s.endStroke);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setSize({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const samplePointer = (e: KonvaEventObject<PointerEvent>): StrokePoint | null => {
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (!pos) return null;
        return { x: pos.x, y: pos.y, t: e.evt.timeStamp, pressure: e.evt.pressure };
    };

    const handlePointerDown = (e: KonvaEventObject<PointerEvent>) => {
        if (e.evt.pointerType === 'mouse' && e.evt.button !== 0) return;
        const p = samplePointer(e);
        if (p) beginStroke(p);
    };

    const handlePointerMove = (e: KonvaEventObject<PointerEvent>) => {
        if (!isDrawing) return;
        const p = samplePointer(e);
        if (p) appendPoint(p);
    };

    const handlePointerUp = () => {
        if (isDrawing) endStroke();
    };

    const displayPoints = useMemo(() => {
        if (!isDrawing && result) {
            return lerpStroke(result.raw, result.correspondence, lerpAlpha).flatMap((p) => [p.x, p.y]);
        }
        return rawPoints.flatMap((p) => [p.x, p.y]);
    }, [isDrawing, result, lerpAlpha, rawPoints]);

    return (
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <Stage
                width={size.width}
                height={size.height}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ background: '#1a1b1e', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }}
            >
                <Layer>
                    {displayPoints.length >= 4 && (
                        <Line
                            points={displayPoints}
                            stroke={isDrawing ? DRAWING_COLOR : STROKE_COLOR}
                            strokeWidth={2}
                            lineCap="round"
                            lineJoin="round"
                            listening={false}
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
}
