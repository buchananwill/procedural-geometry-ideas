/*
 * THE STANDING GATE ON LINK WRITING (skeleton wavefront-order spec, decisions 15, 23 and 32): a
 * `WavefrontProbe` that runs `checkWavefront` at every step boundary of every solve it sees, the rosters it
 * is run over, and the report it prints. Part A's four comparisons went with the arithmetic they compared
 * (part B, decisions 19 to 22).
 *
 * Installed only by the wavefront-order tests, around the solves they run, and removed after: in a normal
 * solve the probe is `null` and every call site does nothing.
 *
 * EVERY SOLVE IS COUNTED, AND THE EXCLUSION STARTS WHERE ITS CAUSE DOES (BSA.F97 finding 2, BSA.D293). A solve
 * is any context that reaches a step boundary. One that never reports its end — a throw outside
 * `stepAlgorithm` — is closed when its roster entry returns and counted as thrown, so it is never silently
 * lost. Spec decision 32's exclusion discards a solve's violations only from the first step boundary at
 * which its cause holds; every violation at an earlier boundary is asserted like any other.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {
    checkWavefront,
    FULL_DEPTH_FRACTION,
    flattenRecursiveTree,
    MAX_RECURSION_LEVELS,
    solveSkeleton,
    subdivideRecursively,
    uniformLevelSpecs,
} from '@proc-geo/core';
import {setWavefrontProbe, WavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront';
import {FULL_CORPUS, WEIGHTED_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {allCells} from '../sweep-harness/sweep';

/** One run of a roster: a call that may run several simple-polygon solves (a decomposed polygon), or none. */
export interface RosterEntry {
    label: string;
    run: () => void;
}

/** What one roster entry came to. */
export interface EntryRecord {
    label: string;
    /** Simple-polygon solves this entry ran: every context that reached a step boundary. */
    solves: number;
    /** What the entry threw, if it threw. */
    error?: string;
}

export interface WavefrontReport {
    /** Every roster entry run, in order. The gate asserts its length against the roster's. */
    entries: EntryRecord[];
    solves: number;
    completeSolves: number;
    boundaries: number;
    /**
     * W1–W4 violations on solves that COMPLETED — the gate (decision 15) asserts this empty. On a solve that
     * trips decision 32's cause, the violations at the boundaries before the cause are here too.
     */
    violations: {label: string; step: number; violation: string}[];
    /** The same on solves that did not complete, counted per solve, with the first violation. */
    incompleteSolvesWithViolations: {label: string; step: number; violation: string; count: number}[];
    /** Solves that reached a step boundary and never reported their end: a throw outside `stepAlgorithm`. */
    thrownSolves: {label: string; step: number}[];
    /**
     * Solves on which decision 32's cause holds from step `fromStep`, with how many violations were discarded
     * (at that boundary and after) and how many came before it (asserted above when the solve completed).
     */
    earlyAcceptanceSolves: {
        label: string; complete: boolean; fromStep: number; detail: string; discarded: number; before: number;
    }[];
}

export function emptyReport(): WavefrontReport {
    return {
        entries: [],
        solves: 0,
        completeSolves: 0,
        boundaries: 0,
        violations: [],
        incompleteSolvesWithViolations: [],
        thrownSolves: [],
        earlyAcceptanceSolves: [],
    };
}

interface SolveState {
    label: string;
    step: number;
    violations: {step: number; violation: string}[];
    /** The first step boundary at which an exterior edge was accepted while a live bisector names it. */
    cause?: {step: number; detail: string};
}

/**
 * SPEC DECISION 32's CAUSE, detected rather than listed: an exterior edge accepted while a live bisector
 * still names it as a parent (`ISSUE-skeleton-edge-accepted-before-its-face-closes.md`). W1 to W4 cannot
 * hold on such a solve without changing when an edge is accepted, so decision 15's gate excludes it from
 * the boundary at which the cause first holds.
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

/** Fold one solve's state into the report. `complete` is `false` for a solve that never reported its end. */
function closeSolve(report: WavefrontReport, state: SolveState, complete: boolean): void {
    report.solves++;
    if (complete) {
        report.completeSolves++;
    }
    const causeStep = state.cause?.step ?? Infinity;
    const asserted = state.violations.filter(v => v.step < causeStep);
    if (state.cause !== undefined) {
        report.earlyAcceptanceSolves.push({
            label: state.label,
            complete,
            fromStep: state.cause.step,
            detail: state.cause.detail,
            discarded: state.violations.length - asserted.length,
            before: asserted.length,
        });
    }
    if (complete) {
        report.violations.push(...asserted.map(v => ({label: state.label, ...v})));
    } else if (state.violations.length > 0) {
        report.incompleteSolvesWithViolations.push({
            label: state.label, ...state.violations[0], count: state.violations.length,
        });
    }
}

/**
 * A recording probe over one roster. `label()` names the solve the next calls belong to; the step is
 * counted per solve from its boundaries (step 0 is the boundary after `initInteriorEdges`). `closeOpen()`
 * closes every solve that reached a boundary and never finished, counting each as thrown, and returns how
 * many solves it closed or saw finish since the last call.
 */
function recordingProbe(report: WavefrontReport, label: () => string): {probe: WavefrontProbe; closeOpen: () => number} {
    const open = new Map<StraightSkeletonSolverContext, SolveState>();
    let seen = 0;
    const stateOf = (context: StraightSkeletonSolverContext): SolveState => {
        let state = open.get(context);
        if (state === undefined) {
            state = {label: label(), step: 0, violations: []};
            open.set(context, state);
        }
        return state;
    };

    const probe: WavefrontProbe = {
        stepBoundary(context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]) {
            const state = stateOf(context);
            report.boundaries++;
            if (state.cause === undefined) {
                const found = acceptedParentOnLiveBisector(context);
                if (found !== undefined) {
                    state.cause = {step: state.step, detail: found};
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
            closeSolve(report, state, complete);
            open.delete(context);
            seen++;
        },
    };
    const closeOpen = () => {
        for (const state of open.values()) {
            report.thrownSolves.push({label: state.label, step: state.step});
            closeSolve(report, state, false);
            seen++;
        }
        open.clear();
        const count = seen;
        seen = 0;
        return count;
    };
    return {probe, closeOpen};
}

/**
 * Run every entry of a roster with a recording probe installed, always removing it afterwards. A throw
 * from an entry is recorded on that entry, never swallowed unseen.
 */
export function runRoster(roster: readonly RosterEntry[]): WavefrontReport {
    const report = emptyReport();
    let label = '';
    const {probe, closeOpen} = recordingProbe(report, () => label);
    setWavefrontProbe(probe);
    try {
        for (const entry of roster) {
            label = entry.label;
            let error: string | undefined;
            try {
                entry.run();
            } catch (e) {
                error = e instanceof Error ? e.message : String(e);
            }
            report.entries.push({label: entry.label, solves: closeOpen(), ...(error === undefined ? {} : {error})});
        }
    } finally {
        setWavefrontProbe(null);
    }
    return report;
}

/** Roster entries that ran no solve and threw nothing: a solve the gate would have missed without a trace. */
export function unaccountedEntries(report: WavefrontReport): EntryRecord[] {
    return report.entries.filter(entry => entry.solves === 0 && entry.error === undefined);
}

// ── The rosters (spec decision 15) ───────────────────────────────────────────────────────────────────

/** `FULL_CORPUS` at the floors 1e-6 and 1e-5, then every weighted fixture. */
export function corpusRoster(): RosterEntry[] {
    return [
        ...[1e-6, 1e-5].flatMap(floor => FULL_CORPUS.map(fixture => ({
            label: `corpus@${floor}:${fixture.name}`,
            run: () => {
                solveSkeleton(fixture.vertices, {perceptualFloor: floor});
            },
        }))),
        // A refusal at the weight door (§4's refusal fixtures) throws and runs no solve; it is recorded.
        ...WEIGHTED_TEST_POLYGONS.map(fixture => ({
            label: `weighted:${fixture.name}`,
            run: () => {
                solveSkeleton(fixture.vertices, {weights: fixture.weights});
            },
        })),
    ];
}

/** Every root cell of the 642-cell sweep. A cell refused at the boundary stage throws and runs no solve. */
export function sweepRoster(): RosterEntry[] {
    return allCells().map(cell => ({
        label: cell.name,
        run: () => {
            solveSkeleton(cell.vertices, cell.options);
        },
    }));
}

export const CENSUS_DEPTH_FRACTIONS = [0.25, 0.6, FULL_DEPTH_FRACTION];
const CENSUS_MERGE_GROUP_SIZES = [1, 2, 3, 4];

/** What a census roster's regions came to, filled in as it runs. */
export interface CensusTally {
    regions: number;
    /** Regions declined as degenerate before any solve ran (`subdivideNode`'s screen, outcome `declined-degenerate`). */
    screened: number;
}

/**
 * The recursion census at one depth: `FULL_CORPUS` × merge groups 1–4, three levels, residue recursed. Each
 * entry solves the root and every region; `tally` counts the regions, so the gate can hold the solves
 * against them.
 */
export function censusRoster(depthFraction: number, tally: CensusTally): RosterEntry[] {
    return CENSUS_MERGE_GROUP_SIZES.flatMap(mergeGroupSize => FULL_CORPUS.map(fixture => ({
        label: `${fixture.name}|d${depthFraction}|m${mergeGroupSize}`,
        run: () => {
            const root = subdivideRecursively(fixture.vertices, {
                levels: uniformLevelSpecs({
                    levels: MAX_RECURSION_LEVELS, mergeGroupSize, depthFraction, residue: 'recurse',
                }),
            });
            for (const node of flattenRecursiveTree(root)) {
                tally.regions++;
                if (node.outcome.kind === 'declined-degenerate') {
                    tally.screened++;
                }
            }
        },
    })));
}

/** The gate's report, as printable text. */
export function describeReport(title: string, report: WavefrontReport): string {
    const thrownEntries = report.entries.filter(entry => entry.error !== undefined);
    return [
        `Wavefront links — ${title}: ${report.entries.length} roster entries, ${report.solves} solve(s), `
        + `${report.completeSolves} complete, ${report.thrownSolves.length} thrown outside stepAlgorithm, `
        + `${report.boundaries} step boundaries checked; ${report.violations.length} W1–W4 violation(s) on complete solves, `
        + `${report.incompleteSolvesWithViolations.length} incomplete solve(s) with violations.`,
        ...report.violations.slice(0, 25).map(v => `    VIOLATION ${v.label} step ${v.step}: ${v.violation}`),
        ...report.incompleteSolvesWithViolations.slice(0, 25).map(v =>
            `    incomplete ${v.label} step ${v.step} (${v.count} violation(s)): ${v.violation}`),
        ...report.thrownSolves.slice(0, 25).map(s => `    thrown ${s.label} after step boundary ${s.step - 1}`),
        `${thrownEntries.length} roster entr(y/ies) threw:`,
        ...thrownEntries.slice(0, 25).map(entry => `    ${entry.label} (${entry.solves} solve(s)): ${entry.error!.slice(0, 160)}`),
        `${report.earlyAcceptanceSolves.length} solve(s) outside the gate from spec decision 32's cause `
        + `(an exterior edge accepted while a live bisector names it):`,
        ...report.earlyAcceptanceSolves.slice(0, 25).map(s =>
            `    ${s.complete ? 'complete' : 'incomplete'} ${s.label} from step ${s.fromStep}: ${s.detail} `
            + `(${s.discarded} violation(s) discarded, ${s.before} before the cause)`),
    ].join('\n');
}
