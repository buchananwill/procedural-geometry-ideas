import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import { solveArticulation } from '@proc-geo/core';
import type { ElementConstraints, StrategyId, Vector2, TransformDelta } from '@proc-geo/core';

export type TransformMode = 'translate' | 'rotate';

interface DragSession {
    /** Pose cached at drag start; every update re-solves from here. */
    originElements: Vector2[];
    startPointer: Vector2;
    /** Pointer position as of the last updateDrag call (rotate mode angle tracking). */
    lastPointer: Vector2;
    /** Unwrapped total rotation swept so far, may legitimately exceed +-PI. */
    accumulatedAngle: number;
}

export interface ArticulationStoreState {
    elements: Vector2[];
    constraints: ElementConstraints[];
    selection: number[];
    pivotIndex: number;
    strategyId: StrategyId;
    transformMode: TransformMode;
    drag: DragSession | null;
    /** From the last solve; < 1 means constraints clamped the input. */
    appliedFraction: number;
    /**
     * The strategy that actually produced `appliedFraction` -- solveArticulation
     * dispatches discontiguous selections to rigid regardless of `strategyId`, so
     * this can differ from it.
     */
    appliedStrategyId: StrategyId;
    /**
     * Selected elements the last solve stopped moving ahead of the rest of the
     * selection. Empty when the selection moved (or was blocked) as one body.
     */
    frozenElementIndices: number[];

    addElement: (p: Vector2) => void;
    deleteSelected: () => void;
    clearAll: () => void;
    selectOnly: (index: number) => void;
    toggleSelect: (index: number) => void;
    marqueeSelect: (indices: number[], additive: boolean) => void;
    clearSelection: () => void;
    setPivot: (index: number) => void;
    setStrategy: (id: StrategyId) => void;
    setTransformMode: (mode: TransformMode) => void;
    setConstraints: (index: number, constraints: ElementConstraints) => void;
    /** Apply one constraint struct to several elements (paste target). */
    applyConstraintsTo: (indices: number[], constraints: ElementConstraints) => void;
    beginDrag: (pointer: Vector2) => void;
    updateDrag: (pointer: Vector2) => void;
    endDrag: () => void;
}

const angleAround = (center: Vector2, p: Vector2) => Math.atan2(p.y - center.y, p.x - center.x);

/** Smallest signed representation of an angle difference, in (-PI, PI]. */
function normalizeAngle(a: number): number {
    let r = a;
    while (r <= -Math.PI) r += 2 * Math.PI;
    while (r > Math.PI) r -= 2 * Math.PI;
    return r;
}

export const useArticulationStore = create<ArticulationStoreState>()(
    immer((set) => ({
        elements: [],
        constraints: [],
        selection: [],
        pivotIndex: 0,
        strategyId: 'rigid',
        transformMode: 'rotate',
        drag: null,
        appliedFraction: 1,
        appliedStrategyId: 'rigid',
        frozenElementIndices: [],

        addElement: (p) =>
            set((s) => {
                if (s.elements.length === 0) {
                    s.elements.push(p);
                    s.constraints.push({});
                    return;
                }
                const dFirst = Math.hypot(p.x - s.elements[0].x, p.y - s.elements[0].y);
                const last = s.elements[s.elements.length - 1];
                const dLast = Math.hypot(p.x - last.x, p.y - last.y);
                if (dFirst < dLast) {
                    s.elements.unshift(p);
                    s.constraints.unshift({});
                    s.selection = s.selection.map((i) => i + 1);
                    s.pivotIndex += 1;
                } else {
                    s.elements.push(p);
                    s.constraints.push({});
                }
            }),

        deleteSelected: () =>
            set((s) => {
                if (s.selection.length === 0) return;
                const dead = new Set(s.selection);
                const survivors = s.elements
                    .map((el, i) => ({ el, c: s.constraints[i], i }))
                    .filter(({ i }) => !dead.has(i));
                // pivot follows the nearest surviving element by index distance
                let newPivot = 0;
                let bestDist = Infinity;
                survivors.forEach(({ i }, newIndex) => {
                    const d = Math.abs(i - s.pivotIndex);
                    if (d < bestDist) {
                        bestDist = d;
                        newPivot = newIndex;
                    }
                });
                s.elements = survivors.map(({ el }) => el);
                s.constraints = survivors.map(({ c }) => c);
                s.selection = [];
                s.pivotIndex = newPivot;
                s.drag = null;
                s.appliedFraction = 1;
                s.frozenElementIndices = [];
            }),

        clearAll: () =>
            set((s) => {
                s.elements = [];
                s.constraints = [];
                s.selection = [];
                s.pivotIndex = 0;
                s.drag = null;
                s.appliedFraction = 1;
                s.appliedStrategyId = s.strategyId;
                s.frozenElementIndices = [];
            }),

        selectOnly: (index) =>
            set((s) => {
                s.selection = [index];
            }),

        toggleSelect: (index) =>
            set((s) => {
                const at = s.selection.indexOf(index);
                if (at >= 0) s.selection.splice(at, 1);
                else s.selection.push(index);
            }),

        marqueeSelect: (indices, additive) =>
            set((s) => {
                s.selection = additive ? [...new Set([...s.selection, ...indices])] : indices;
            }),

        clearSelection: () =>
            set((s) => {
                s.selection = [];
            }),

        setPivot: (index) =>
            set((s) => {
                if (index >= 0 && index < s.elements.length) s.pivotIndex = index;
            }),

        setStrategy: (id) =>
            set((s) => {
                s.strategyId = id;
            }),

        setTransformMode: (mode) =>
            set((s) => {
                s.transformMode = mode;
            }),

        setConstraints: (index, constraints) =>
            set((s) => {
                if (index >= 0 && index < s.constraints.length) s.constraints[index] = constraints;
            }),

        applyConstraintsTo: (indices, constraints) =>
            set((s) => {
                for (const i of indices) {
                    if (i >= 0 && i < s.constraints.length) s.constraints[i] = { ...constraints };
                }
            }),

        beginDrag: (pointer) =>
            set((s) => {
                s.drag = {
                    originElements: current(s).elements.map((p) => ({ ...p })),
                    startPointer: pointer,
                    lastPointer: pointer,
                    accumulatedAngle: 0,
                };
                s.appliedFraction = 1;
                s.appliedStrategyId = s.strategyId;
                s.frozenElementIndices = [];
            }),

        updateDrag: (pointer) =>
            set((s) => {
                if (!s.drag) return;
                const plain = current(s);
                const origin = plain.drag!.originElements;
                let delta: TransformDelta;
                if (plain.transformMode === 'translate') {
                    delta = {
                        kind: 'translate' as const,
                        vector: { x: pointer.x - s.drag.startPointer.x, y: pointer.y - s.drag.startPointer.y },
                    };
                } else {
                    const pivotPos = origin[plain.pivotIndex];
                    if (!pivotPos) return;
                    const lastVec = { x: s.drag.lastPointer.x - pivotPos.x, y: s.drag.lastPointer.y - pivotPos.y };
                    const currVec = { x: pointer.x - pivotPos.x, y: pointer.y - pivotPos.y };
                    const lastLen = Math.hypot(lastVec.x, lastVec.y);
                    const currLen = Math.hypot(currVec.x, currVec.y);
                    if (lastLen >= 12 && currLen >= 12) {
                        const a0 = angleAround(pivotPos, s.drag.lastPointer);
                        const a1 = angleAround(pivotPos, pointer);
                        s.drag.accumulatedAngle += normalizeAngle(a1 - a0);
                    }
                    s.drag.lastPointer = pointer;
                    delta = { kind: 'rotate' as const, angle: s.drag.accumulatedAngle };
                }
                const result = solveArticulation({
                    chain: { elements: origin, constraints: plain.constraints },
                    selection: plain.selection,
                    pivotIndex: plain.pivotIndex,
                    strategyId: plain.strategyId,
                    delta,
                });
                s.elements = result.elements;
                s.appliedFraction = result.appliedFraction;
                s.appliedStrategyId = result.appliedStrategyId;
                s.frozenElementIndices = result.frozenElementIndices;
            }),

        endDrag: () =>
            set((s) => {
                s.drag = null;
                s.appliedFraction = 1;
                s.appliedStrategyId = s.strategyId;
                s.frozenElementIndices = [];
            }),
    })),
);
