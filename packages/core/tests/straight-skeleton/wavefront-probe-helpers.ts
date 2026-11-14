/*
 * THE STANDING GATE ON LINK WRITING (skeleton wavefront-order spec, decisions 15, 23 and 32): a
 * `WavefrontProbe` that runs `checkWavefront` at every step boundary of every solve it sees, and the report
 * it prints. Part A's four comparisons went with the arithmetic they compared (part B, decisions 19 to 22).
 *
 * Installed only by the wavefront-order tests, around the solves they run, and removed after: in a normal
 * solve the probe is `null` and every call site does nothing.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {checkWavefront} from '@proc-geo/core';
import {setWavefrontProbe, WavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';

export interface WavefrontReport {
    solves: number;
    completeSolves: number;
    boundaries: number;
    /** W1–W4 violations on solves that COMPLETED — the gate (decision 15) asserts this empty. */
    violations: {label: string; step: number; violation: string}[];
    /** The same on solves that did not complete, counted per solve, with the first violation. */
    incompleteSolvesWithViolations: {label: string; step: number; violation: string; count: number}[];
    /** Solves outside the gate by spec decision 32's cause, with how many violations each carried. */
    earlyAcceptanceSolves: {label: string; complete: boolean; detail: string; violations: number}[];
}

export function emptyReport(): WavefrontReport {
    return {
        solves: 0,
        completeSolves: 0,
        boundaries: 0,
        violations: [],
        incompleteSolvesWithViolations: [],
        earlyAcceptanceSolves: [],
    };
}

interface SolveState {
    step: number;
    violations: {step: number; violation: string}[];
    /** The first step boundary at which an exterior edge was accepted while a live bisector names it. */
    earlyAcceptance?: string;
}

/**
 * SPEC DECISION 32's CAUSE, detected rather than listed: an exterior edge accepted while a live bisector
 * still names it as a parent (`ISSUE-skeleton-edge-accepted-before-its-face-closes.md`). W1 to W4 cannot
 * hold on such a solve without changing when an edge is accepted, so decision 15's gate excludes it.
 */
export function acceptedParentOnLiveBisector(context: StraightSkeletonSolverContext): string | undefined {
    for (const edge of context.graph.interiorEdges) {
        if (context.acceptedEdges[edge.id]) {
            continue;
        }
        for (const parent of [edge.clockwiseExteriorEdgeIndex, edge.widdershinsExteriorEdgeIndex]) {
            if (context.acceptedEdges[parent]) {
                return `live e${edge.id} names accepted edge ${parent}`;
            }
        }
    }
    return undefined;
}

/**
 * A recording probe. `label()` names the solve the next calls belong to; the step is counted per solve
 * from its boundaries (step 0 is the boundary after `initInteriorEdges`).
 */
export function recordingProbe(report: WavefrontReport, label: () => string): WavefrontProbe {
    const solves = new WeakMap<StraightSkeletonSolverContext, SolveState>();
    const stateOf = (context: StraightSkeletonSolverContext): SolveState => {
        let state = solves.get(context);
        if (state === undefined) {
            state = {step: 0, violations: []};
            solves.set(context, state);
        }
        return state;
    };

    return {
        stepBoundary(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]) {
            const state = stateOf(context);
            report.boundaries++;
            if (state.earlyAcceptance === undefined) {
                const found = acceptedParentOnLiveBisector(context);
                if (found !== undefined) {
                    state.earlyAcceptance = `step ${state.step}: ${found}`;
                }
            }
            for (const violation of checkWavefront(context, inputs)) {
                state.violations.push({step: state.step, violation});
            }
            state.step++;
        },
        solveFinished(context: StraightSkeletonSolverContext, errors: readonly string[]) {
            const state = stateOf(context);
            const unresolved = context.graph.interiorEdges.some(edge => context.graph.edges[edge.id].target === undefined);
            const complete = errors.length === 0 && !unresolved && context.graph.interiorEdges.length > 0;
            report.solves++;
            if (complete) {
                report.completeSolves++;
            }
            if (state.earlyAcceptance !== undefined) {
                // Outside decision 15's gate by its cause (spec decision 32); counted, never asserted here.
                report.earlyAcceptanceSolves.push({
                    label: label(), complete, detail: state.earlyAcceptance, violations: state.violations.length,
                });
            } else if (complete) {
                report.violations.push(...state.violations.map(v => ({label: label(), ...v})));
            } else if (state.violations.length > 0) {
                report.incompleteSolvesWithViolations.push({
                    label: label(), ...state.violations[0], count: state.violations.length,
                });
            }
            solves.delete(context);
        },
    };
}

/** Run `body` with a recording probe installed, always removing it afterwards. */
export function withWavefrontProbe(report: WavefrontReport, label: () => string, body: () => void): void {
    setWavefrontProbe(recordingProbe(report, label));
    try {
        body();
    } finally {
        setWavefrontProbe(null);
    }
}

/** The gate's report, as printable text. */
export function describeReport(title: string, report: WavefrontReport): string {
    return [
        `Wavefront links — ${title}: ${report.solves} solve(s), ${report.completeSolves} complete, `
        + `${report.boundaries} step boundaries checked; ${report.violations.length} W1–W4 violation(s) on complete solves, `
        + `${report.incompleteSolvesWithViolations.length} incomplete solve(s) with violations.`,
        ...report.violations.slice(0, 25).map(v => `    VIOLATION ${v.label} step ${v.step}: ${v.violation}`),
        ...report.incompleteSolvesWithViolations.slice(0, 25).map(v =>
            `    incomplete ${v.label} step ${v.step} (${v.count} violation(s)): ${v.violation}`),
        `${report.earlyAcceptanceSolves.length} solve(s) outside the gate by spec decision 32's cause `
        + `(an exterior edge accepted while a live bisector names it):`,
        ...report.earlyAcceptanceSolves.slice(0, 25).map(s =>
            `    ${s.complete ? 'complete' : 'incomplete'} ${s.label} ${s.detail} (${s.violations} violation(s))`),
    ].join('\n');
}
