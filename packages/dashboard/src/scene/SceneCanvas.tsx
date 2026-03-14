import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Stage, Layer, Line, Circle, Text, Arrow } from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import type { ScenePrimitive } from "./types";

export interface SceneCanvasProps {
    scene: ScenePrimitive[];
    stageScale: number;
    stagePosition: { x: number; y: number };
    onScaleChange: (scale: number) => void;
    onPositionChange: (pos: { x: number; y: number }) => void;
    interactionOverlay?: (invScale: number) => ReactNode;
    onStageClick?: (logicalPos: { x: number; y: number }, e: KonvaEventObject<MouseEvent>) => void;
}

function getTouchDistance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(t1: Touch, t2: Touch): { x: number; y: number } {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

function applyOpacity(color: string, opacity?: number): string {
    if (opacity === undefined || opacity >= 1) return color;
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
}

function renderPrimitive(p: ScenePrimitive, invScale: number): ReactNode {
    switch (p.type) {
        case 'line': {
            if (p.arrow) {
                return (
                    <Arrow
                        points={p.points}
                        stroke={p.stroke.color}
                        fill={p.stroke.color}
                        strokeWidth={p.stroke.width * invScale}
                        dash={p.stroke.dash?.map(d => d * invScale)}
                        opacity={p.stroke.opacity}
                        pointerLength={p.arrow.pointerLength * invScale}
                        pointerWidth={p.arrow.pointerWidth * invScale}
                        listening={false}
                    />
                );
            }
            return (
                <Line
                    points={p.points}
                    stroke={p.stroke.color}
                    strokeWidth={p.stroke.width * invScale}
                    dash={p.stroke.dash?.map(d => d * invScale)}
                    opacity={p.stroke.opacity}
                    closed={p.closed}
                    fill={p.closed && p.fill ? applyOpacity(p.fill.color, p.fill.opacity) : undefined}
                    fillEnabled={p.closed && p.fill ? true : undefined}
                    listening={false}
                />
            );
        }
        case 'point': {
            return (
                <Circle
                    x={p.x}
                    y={p.y}
                    radius={p.radius * invScale}
                    fill={p.fill.color}
                    opacity={p.fill.opacity}
                    stroke={p.stroke?.color}
                    strokeWidth={p.stroke ? p.stroke.width * invScale : 0}
                    listening={false}
                />
            );
        }
        case 'label': {
            return (
                <Text
                    x={p.x}
                    y={p.y}
                    offsetX={p.offsetX != null ? p.offsetX * invScale : undefined}
                    offsetY={p.offsetY != null ? p.offsetY * invScale : undefined}
                    text={p.text}
                    fontSize={p.style.fontSize * invScale}
                    fill={p.style.color}
                    fontStyle={p.style.bold ? "bold" : undefined}
                    listening={false}
                />
            );
        }
        case 'group': {
            if (p.visible === false) return null;
            return <>{p.children.map((child, i) => <Fragment key={i}>{renderPrimitive(child, invScale)}</Fragment>)}</>;
        }
        default: {
            const _exhaustive: never = p;
            return _exhaustive;
        }
    }
}

export function SceneCanvas({
    scene,
    stageScale,
    stagePosition,
    onScaleChange,
    onPositionChange,
    interactionOverlay,
    onStageClick,
}: SceneCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<ReturnType<typeof Stage> | null>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

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

    // Pan tracking refs
    const isPanning = useRef(false);
    const panStart = useRef({ x: 0, y: 0 });

    // Touch refs
    const PAN_THRESHOLD = 8;
    const lastTouchDist = useRef(0);
    const lastTouchCenter = useRef({ x: 0, y: 0 });
    const isTouchPanning = useRef(false);
    const touchPanStart = useRef({ x: 0, y: 0 });
    const touchStartPos = useRef({ x: 0, y: 0 });
    const touchOnVertex = useRef(false);

    const invScale = 1 / stageScale;

    const getLogicalPointerPosition = useCallback(
        (stage: { getPointerPosition: () => { x: number; y: number } | null }): { x: number; y: number } | null => {
            const pos = stage.getPointerPosition();
            if (!pos) return null;
            return {
                x: (pos.x - stagePosition.x) / stageScale,
                y: (pos.y - stagePosition.y) / stageScale,
            };
        },
        [stageScale, stagePosition]
    );

    const handleStageClick = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            if (e.evt.button !== 0) return;
            if (e.target.getClassName() === "Circle") return;

            const stage = e.target.getStage();
            if (!stage) return;
            const pos = getLogicalPointerPosition(stage);
            if (!pos) return;

            onStageClick?.(pos, e);
        },
        [getLogicalPointerPosition, onStageClick]
    );

    const handleWheel = useCallback(
        (e: KonvaEventObject<WheelEvent>) => {
            e.evt.preventDefault();
            const stage = e.target.getStage();
            if (!stage) return;

            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const scaleBy = 1.1;
            const oldScale = stageScale;
            const newScale = e.evt.deltaY < 0
                ? Math.min(oldScale * scaleBy, 10)
                : Math.max(oldScale / scaleBy, 0.1);

            const mousePointTo = {
                x: (pointer.x - stagePosition.x) / oldScale,
                y: (pointer.y - stagePosition.y) / oldScale,
            };

            onScaleChange(newScale);
            onPositionChange({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
        },
        [stageScale, stagePosition, onScaleChange, onPositionChange]
    );

    const handleMouseDown = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            const isMiddle = e.evt.button === 1;
            const isAltLeft = e.evt.button === 0 && e.evt.altKey;
            if (!isMiddle && !isAltLeft) return;

            e.evt.preventDefault();
            isPanning.current = true;
            panStart.current = { x: e.evt.clientX - stagePosition.x, y: e.evt.clientY - stagePosition.y };
        },
        [stagePosition]
    );

    const handleMouseMove = useCallback(
        (e: KonvaEventObject<MouseEvent>) => {
            if (!isPanning.current) return;
            onPositionChange({
                x: e.evt.clientX - panStart.current.x,
                y: e.evt.clientY - panStart.current.y,
            });
        },
        [onPositionChange]
    );

    const handleMouseUp = useCallback(() => {
        isPanning.current = false;
    }, []);

    const handleTouchStart = useCallback(
        (e: KonvaEventObject<TouchEvent>) => {
            const touches = e.evt.touches;
            if (touches.length === 2) {
                e.evt.preventDefault();
                isTouchPanning.current = false;
                touchOnVertex.current = false;
                lastTouchDist.current = getTouchDistance(touches[0], touches[1]);
                lastTouchCenter.current = getTouchCenter(touches[0], touches[1]);
            } else if (touches.length === 1) {
                const isOnVertex = e.target.getClassName() === 'Circle' && e.target.draggable();
                touchOnVertex.current = isOnVertex;
                if (isOnVertex) return;
                isTouchPanning.current = false;
                touchStartPos.current = { x: touches[0].clientX, y: touches[0].clientY };
                touchPanStart.current = {
                    x: touches[0].clientX - stagePosition.x,
                    y: touches[0].clientY - stagePosition.y,
                };
            }
        },
        [stagePosition],
    );

    const handleTouchMove = useCallback(
        (e: KonvaEventObject<TouchEvent>) => {
            const touches = e.evt.touches;
            if (touches.length === 2) {
                e.evt.preventDefault();
                const newDist = getTouchDistance(touches[0], touches[1]);
                const newCenter = getTouchCenter(touches[0], touches[1]);

                if (lastTouchDist.current > 0) {
                    const ratio = newDist / lastTouchDist.current;
                    const oldScale = stageScale;
                    const newScale = Math.min(Math.max(oldScale * ratio, 0.1), 10);

                    const container = containerRef.current;
                    const rect = container?.getBoundingClientRect();
                    const cx = newCenter.x - (rect?.left ?? 0);
                    const cy = newCenter.y - (rect?.top ?? 0);

                    const pointTo = {
                        x: (cx - stagePosition.x) / oldScale,
                        y: (cy - stagePosition.y) / oldScale,
                    };

                    onScaleChange(newScale);
                    onPositionChange({
                        x: cx - pointTo.x * newScale,
                        y: cy - pointTo.y * newScale,
                    });
                }

                lastTouchDist.current = newDist;
                lastTouchCenter.current = newCenter;
                isTouchPanning.current = false;
            } else if (touches.length === 1 && !touchOnVertex.current) {
                const dx = touches[0].clientX - touchStartPos.current.x;
                const dy = touches[0].clientY - touchStartPos.current.y;
                if (!isTouchPanning.current && Math.sqrt(dx * dx + dy * dy) < PAN_THRESHOLD) return;

                e.evt.preventDefault();
                isTouchPanning.current = true;
                onPositionChange({
                    x: touches[0].clientX - touchPanStart.current.x,
                    y: touches[0].clientY - touchPanStart.current.y,
                });
            }
        },
        [stageScale, stagePosition, onScaleChange, onPositionChange],
    );

    const handleTouchEnd = useCallback(
        (e: KonvaEventObject<TouchEvent>) => {
            const wasPanning = isTouchPanning.current;
            lastTouchDist.current = 0;
            isTouchPanning.current = false;

            if (touchOnVertex.current || wasPanning) {
                touchOnVertex.current = false;
                return;
            }
            touchOnVertex.current = false;

            // Treat as a tap
            if (e.evt.changedTouches.length === 0) return;
            const touch = e.evt.changedTouches[0];
            const container = containerRef.current;
            const rect = container?.getBoundingClientRect();
            const screenX = touch.clientX - (rect?.left ?? 0);
            const screenY = touch.clientY - (rect?.top ?? 0);
            const logicalX = (screenX - stagePosition.x) / stageScale;
            const logicalY = (screenY - stagePosition.y) / stageScale;

            onStageClick?.({ x: logicalX, y: logicalY }, e as unknown as KonvaEventObject<MouseEvent>);
        },
        [onStageClick, stageScale, stagePosition],
    );

    return (
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            <Stage
                ref={stageRef as RefObject<never>}
                width={size.width}
                height={size.height}
                scaleX={stageScale}
                scaleY={stageScale}
                x={stagePosition.x}
                y={stagePosition.y}
                onClick={handleStageClick}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ background: "#1a1b1e", borderRadius: 8, cursor: "crosshair", touchAction: "none" }}
            >
                <Layer>
                    {scene.map((p, i) => (
                        <Fragment key={i}>{renderPrimitive(p, invScale)}</Fragment>
                    ))}
                </Layer>
                {interactionOverlay && (
                    <Layer>
                        {interactionOverlay(invScale)}
                    </Layer>
                )}
            </Stage>
        </div>
    );
}
