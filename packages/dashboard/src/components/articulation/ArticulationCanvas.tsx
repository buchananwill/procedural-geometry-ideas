import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Line, Circle, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useArticulationStore } from '../../stores/useArticulationStore';
import { screenToWorld } from './screen-to-world';

const LINK_COLOR = '#5c6470';
const ELEMENT_COLOR = '#7a8288';
const SELECTED_COLOR = '#4dd0e1';
const PIVOT_RING_COLOR = '#ffa94d';
const CLAMPED_COLOR = '#ff6b6b';
const ELEMENT_RADIUS = 8;
const DRAG_THRESHOLD_PX = 4;

type PointerSession =
    | { type: 'maybe-add'; start: { x: number; y: number }; shift: boolean }
    | { type: 'marquee'; start: { x: number; y: number }; currentPos: { x: number; y: number }; shift: boolean }
    | { type: 'maybe-transform'; index: number; start: { x: number; y: number } }
    | { type: 'transform' };

/**
 * Pan trigger shared with the other demo canvases: middle-drag, or alt plus
 * left-drag. Left-drag alone is spoken for here by add, marquee and transform.
 */
function isPanTrigger(event: PointerEvent): boolean {
    const isMiddleButton = event.button === 1;
    const isAltLeftButton = event.button === 0 && event.altKey;
    return isMiddleButton || isAltLeftButton;
}

export interface ArticulationCanvasProps {
    stagePosition: { x: number; y: number };
    onPositionChange: (pos: { x: number; y: number }) => void;
}

export function ArticulationCanvas({ stagePosition, onPositionChange }: ArticulationCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });
    const sessionRef = useRef<PointerSession | null>(null);
    const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    /**
     * Pointer-to-stage-origin offset held for the duration of a pan drag. At most
     * one gesture is ever live: a pan and a pointer session are mutually exclusive.
     */
    const panOriginRef = useRef<{ x: number; y: number } | null>(null);

    const elements = useArticulationStore((s) => s.elements);
    const selection = useArticulationStore((s) => s.selection);
    const pivotIndex = useArticulationStore((s) => s.pivotIndex);
    const clampedElementIndices = useArticulationStore((s) => s.clampedElementIndices);
    const drag = useArticulationStore((s) => s.drag);

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
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
                useArticulationStore.getState().deleteSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const worldPointerPosition = (e: KonvaEventObject<PointerEvent>) => {
        const stage = e.target.getStage();
        const screenPosition = stage?.getPointerPosition();
        if (!screenPosition) return null;
        return screenToWorld(screenPosition, stagePosition);
    };

    /**
     * Drop a live gesture, discharging whatever the store is owed for it, so that
     * another gesture can take over without stranding a drag or a marquee rect.
     */
    const abandonSession = () => {
        const session = sessionRef.current;
        sessionRef.current = null;
        if (!session) return;
        if (session.type === 'transform') useArticulationStore.getState().endDrag();
        if (session.type === 'marquee') setMarquee(null);
    };

    const beginPan = (e: KonvaEventObject<PointerEvent>) => {
        e.evt.preventDefault();
        abandonSession();
        panOriginRef.current = {
            x: e.evt.clientX - stagePosition.x,
            y: e.evt.clientY - stagePosition.y,
        };
    };

    const handleElementPointerDown = (index: number, e: KonvaEventObject<PointerEvent>) => {
        // A pan owns the pointer until it ends: no second gesture may start under it.
        if (panOriginRef.current) return;
        // A pan press over an element belongs to the stage: leave the event to bubble.
        if (isPanTrigger(e.evt)) return;
        e.cancelBubble = true;
        if (e.evt.button !== 0) return;
        const store = useArticulationStore.getState();
        if (e.evt.ctrlKey || e.evt.metaKey) {
            store.setPivot(index);
            return;
        }
        if (e.evt.shiftKey) {
            store.toggleSelect(index);
            return;
        }
        if (store.selection.includes(index)) {
            const pos = worldPointerPosition(e);
            if (pos) {
                sessionRef.current = { type: 'maybe-transform', index, start: pos };
            }
        } else {
            store.selectOnly(index);
        }
    };

    const handleStagePointerDown = (e: KonvaEventObject<PointerEvent>) => {
        if (panOriginRef.current) return;
        if (isPanTrigger(e.evt)) {
            beginPan(e);
            return;
        }
        if (e.target !== e.target.getStage()) return; // element handlers own their events
        if (e.evt.button !== 0) return;
        const pos = worldPointerPosition(e);
        if (pos) sessionRef.current = { type: 'maybe-add', start: pos, shift: e.evt.shiftKey };
    };

    const handlePointerMove = (e: KonvaEventObject<PointerEvent>) => {
        const panOrigin = panOriginRef.current;
        if (panOrigin) {
            onPositionChange({ x: e.evt.clientX - panOrigin.x, y: e.evt.clientY - panOrigin.y });
            return;
        }
        const session = sessionRef.current;
        const pos = worldPointerPosition(e);
        if (!session || !pos) return;
        if (session.type === 'transform') {
            useArticulationStore.getState().updateDrag(pos);
            return;
        }
        const moved = Math.hypot(pos.x - session.start.x, pos.y - session.start.y);
        if (session.type === 'maybe-transform' && moved >= DRAG_THRESHOLD_PX) {
            const store = useArticulationStore.getState();
            store.beginDrag(session.start);
            sessionRef.current = { type: 'transform' };
            store.updateDrag(pos);
            return;
        }
        if (session.type === 'maybe-add' && moved >= DRAG_THRESHOLD_PX) {
            sessionRef.current = { type: 'marquee', start: session.start, currentPos: pos, shift: session.shift };
        }
        if (sessionRef.current?.type === 'marquee') {
            const m = sessionRef.current;
            m.currentPos = pos;
            m.shift = m.shift || e.evt.shiftKey;
            setMarquee({
                x: Math.min(m.start.x, pos.x),
                y: Math.min(m.start.y, pos.y),
                w: Math.abs(pos.x - m.start.x),
                h: Math.abs(pos.y - m.start.y),
            });
        }
    };

    const handlePointerUp = () => {
        if (panOriginRef.current) {
            panOriginRef.current = null;
            abandonSession();
            return;
        }
        const session = sessionRef.current;
        sessionRef.current = null;
        const store = useArticulationStore.getState();
        if (!session) return;
        if (session.type === 'transform') {
            store.endDrag();
            return;
        }
        if (session.type === 'maybe-transform') {
            // never crossed the drag threshold: treat as a plain click that collapses selection
            store.selectOnly(session.index);
            return;
        }
        if (session.type === 'maybe-add') {
            store.addElement(session.start);
            return;
        }
        // marquee
        const x0 = Math.min(session.start.x, session.currentPos.x);
        const x1 = Math.max(session.start.x, session.currentPos.x);
        const y0 = Math.min(session.start.y, session.currentPos.y);
        const y1 = Math.max(session.start.y, session.currentPos.y);
        const hits = store.elements
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
            .map(({ i }) => i);
        store.marqueeSelect(hits, session.shift);
        setMarquee(null);
    };

    const handlePointerLeave = () => {
        panOriginRef.current = null;
        const session = sessionRef.current;
        sessionRef.current = null;
        if (!session) return;
        const store = useArticulationStore.getState();
        if (session.type === 'transform') {
            store.endDrag();
            return;
        }
        if (session.type === 'marquee') {
            const x0 = Math.min(session.start.x, session.currentPos.x);
            const x1 = Math.max(session.start.x, session.currentPos.x);
            const y0 = Math.min(session.start.y, session.currentPos.y);
            const y1 = Math.max(session.start.y, session.currentPos.y);
            const hits = store.elements
                .map((p, i) => ({ p, i }))
                .filter(({ p }) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
                .map(({ i }) => i);
            store.marqueeSelect(hits, session.shift);
            setMarquee(null);
            return;
        }
        // maybe-add or maybe-transform sliding off the stage before crossing the drag
        // threshold: cancel outright, never create an element or select on click.
    };

    // Red means element-clamped for as long as a drag is live: the elements the
    // solver reports at one of their bounds, whatever the applied fraction. The
    // badge is the only selection-clamp indicator.
    const clampedElements = new Set(clampedElementIndices);
    const showsAsClamped = (index: number) => drag !== null && clampedElements.has(index);
    const linkPoints = elements.flatMap((p) => [p.x, p.y]);

    return (
        <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            <Stage
                width={size.width}
                height={size.height}
                x={stagePosition.x}
                y={stagePosition.y}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                style={{ background: '#1a1b1e', borderRadius: 8, touchAction: 'none' }}
            >
                <Layer>
                    {elements.length >= 2 && (
                        <Line points={linkPoints} stroke={LINK_COLOR} strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
                    )}
                    {elements.map((p, i) => {
                        const isSelected = selection.includes(i);
                        const isPivot = i === pivotIndex;
                        return (
                            <Circle
                                key={i}
                                x={p.x}
                                y={p.y}
                                radius={ELEMENT_RADIUS}
                                fill={isSelected ? (showsAsClamped(i) ? CLAMPED_COLOR : SELECTED_COLOR) : ELEMENT_COLOR}
                                stroke={isPivot ? PIVOT_RING_COLOR : undefined}
                                strokeWidth={isPivot ? 3 : 0}
                                onPointerDown={(e) => handleElementPointerDown(i, e)}
                            />
                        );
                    })}
                    {marquee && (
                        <Rect
                            x={marquee.x}
                            y={marquee.y}
                            width={marquee.w}
                            height={marquee.h}
                            stroke={SELECTED_COLOR}
                            dash={[4, 4]}
                            strokeWidth={1}
                            listening={false}
                        />
                    )}
                </Layer>
            </Stage>
        </div>
    );
}
