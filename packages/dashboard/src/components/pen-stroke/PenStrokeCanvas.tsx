import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { lerpStroke, smoothStroke } from '@proc-geo/core';
import type { StrokePoint } from '@proc-geo/core';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';

const STROKE_COLOR = '#4dd0e1';
const DRAWING_COLOR = '#7a8288';

const PREVIEW_WINDOW_MS = 1600;
const PREVIEW_MAX_POINTS = 256;
const PREVIEW_RAW_COLOR = '#5c6470';
const PREVIEW_SMOOTH_COLOR = '#ffa94d';

/**
 * Single-stroke drawing canvas: LMB (or pen/touch) down begins a stroke and
 * wipes the previous one, dragging captures raw (x, y, t, pressure) samples,
 * release terminates the line. After release the canvas shows the lerped
 * morph between the raw capture and its spline correspondence.
 *
 * With the live smoothing preview enabled, hovering (pen up) leaves a
 * short-lived ghost trail: the raw cursor path plus where the currently
 * selected smoothing variant would place it. Hover samples live in a ref and
 * are rendered by an rAF loop that mutates the Konva nodes directly — they
 * never touch the store, so 120 Hz pointer moves cause zero React renders.
 */
export default function PenStrokeCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

    const rawPoints = usePenStrokeStore((s) => s.rawPoints);
    const isDrawing = usePenStrokeStore((s) => s.isDrawing);
    const result = usePenStrokeStore((s) => s.result);
    const lerpAlpha = usePenStrokeStore((s) => s.lerpAlpha);
    const previewEnabled = usePenStrokeStore((s) => s.smoothingPreviewEnabled);
    const beginStroke = usePenStrokeStore((s) => s.beginStroke);
    const appendPoint = usePenStrokeStore((s) => s.appendPoint);
    const endStroke = usePenStrokeStore((s) => s.endStroke);

    const hoverBufferRef = useRef<StrokePoint[]>([]);
    const previewRawRef = useRef<Konva.Line>(null);
    const previewSmoothRef = useRef<Konva.Line>(null);
    const previewHeadRef = useRef<Konva.Circle>(null);

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

    useEffect(() => {
        if (!previewEnabled) {
            hoverBufferRef.current = [];
            return;
        }
        let raf = 0;
        const tick = () => {
            const buffer = hoverBufferRef.current;
            const now = performance.now();
            while (buffer.length > 0 && now - buffer[0].t > PREVIEW_WINDOW_MS) buffer.shift();

            const rawLine = previewRawRef.current;
            const smoothLine = previewSmoothRef.current;
            const head = previewHeadRef.current;
            if (rawLine && smoothLine && head) {
                const state = usePenStrokeStore.getState();
                const visible = !state.isDrawing && buffer.length >= 2;
                rawLine.visible(visible);
                smoothLine.visible(visible);
                head.visible(visible);
                if (visible) {
                    const smoothed = smoothStroke(buffer, state.smoothing);
                    rawLine.points(buffer.flatMap((p) => [p.x, p.y]));
                    smoothLine.points(smoothed.flatMap((p) => [p.x, p.y]));
                    const tip = smoothed[smoothed.length - 1];
                    head.position({ x: tip.x, y: tip.y });
                }
                rawLine.getLayer()?.batchDraw();
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [previewEnabled]);

    const samplePointer = (e: KonvaEventObject<PointerEvent>): StrokePoint | null => {
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (!pos) return null;
        return { x: pos.x, y: pos.y, t: e.evt.timeStamp, pressure: e.evt.pressure };
    };

    const handlePointerDown = (e: KonvaEventObject<PointerEvent>) => {
        if (e.evt.pointerType === 'mouse' && e.evt.button !== 0) return;
        const p = samplePointer(e);
        if (p) {
            hoverBufferRef.current = [];
            beginStroke(p);
        }
    };

    const handlePointerMove = (e: KonvaEventObject<PointerEvent>) => {
        const p = samplePointer(e);
        if (!p) return;
        if (isDrawing) {
            appendPoint(p);
        } else if (previewEnabled) {
            const buffer = hoverBufferRef.current;
            buffer.push(p);
            if (buffer.length > PREVIEW_MAX_POINTS) buffer.shift();
        }
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
                {previewEnabled && (
                    <Layer listening={false}>
                        <Line
                            ref={previewRawRef}
                            points={[]}
                            stroke={PREVIEW_RAW_COLOR}
                            strokeWidth={1.5}
                            opacity={0.5}
                            lineCap="round"
                            lineJoin="round"
                            visible={false}
                        />
                        <Line
                            ref={previewSmoothRef}
                            points={[]}
                            stroke={PREVIEW_SMOOTH_COLOR}
                            strokeWidth={2}
                            opacity={0.9}
                            lineCap="round"
                            lineJoin="round"
                            visible={false}
                        />
                        <Circle
                            ref={previewHeadRef}
                            radius={4}
                            fill={PREVIEW_SMOOTH_COLOR}
                            visible={false}
                        />
                    </Layer>
                )}
            </Stage>
        </div>
    );
}
