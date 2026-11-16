/*
 * THE STANDING GATE ON LINK WRITING (skeleton wavefront-order spec, decisions 15, 23 and 32): a
 * `WavefrontProbe` that runs `checkWavefront` at every step boundary of every solve it sees, the rosters it
 * is run over, and the report it prints. Part A's four comparisons went with the arithmetic they compared
 * (part B, decisions 19 to 22).
 *
 * Installed only by the wavefront-order tests, around the solves they run, and removed after: in a normal
 * solve the probe is `null` and every call site does nothing.
 *
 * EVERY SOLVE IS COUNTED (BSA.F97 finding 2, BSA.D293). A solve is any context that reaches a step boundary. One
 * that never reports its end — a throw outside `stepAlgorithm` — is closed when its roster entry returns and
 * counted as thrown, so it is never silently lost.
 *
 * EVERY VIOLATION OF EVERY COMPLETE SOLVE IS ASSERTED (skeleton edge-acceptance spec, decision 22). Stage 1's
 * decision 32 excluded a solve from the boundary at which an exterior edge was accepted while a live bisector named
 * it; under the acceptance cure that cause cannot hold at a boundary, so the exclusion is gone. The cause is still
 * detected ({@link acceptedParentOnLiveBisector}) and reported, and the early-acceptance file holds it empty.
 *
 * A FACE THAT NEVER CLOSES IS SIGNALLED (decision 9): `solveFinished` records every exterior edge a solve ends
 * with unaccepted, and the gates assert that no complete solve ends with one and that every solve ending with one
 * carries a step failure or an unresolved interior edge.
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
import {setWavefrontProbe, WavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront-check';
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
    /** W1–W4 violations on solves that COMPLETED, at every boundary — the gate (decision 15) asserts this empty. */
    violations: {label: string; step: number; violation: string}[];
    /** The same on solves that did not complete, counted per solve, with the first violation. */
    incompleteSolvesWithViolations: {label: string; step: number; violation: string; count: number}[];
    /** Solves that reached a step boundary and never reported their end: a throw outside `stepAlgorithm`. */
    thrownSolves: {label: string; step: number}[];
    /**
     * Solves on which stage 1 decision 32's cause holds from step `fromStep`: an exterior edge accepted while a live
     * bisector names it. Reported, never excluded; the early-acceptance file asserts this empty.
     */
    earlyAcceptanceSolves: {label: string; complete: boolean; fromStep: number; detail: string}[];
    /**
     * Solves that ended with an exterior edge unaccepted (edge-acceptance spec, decision 9), with whether the solve
     * completed and whether it was signalled (a step failure or an unresolved interior edge). The gates assert none
     * is complete and every one is signalled.
     */
    unacceptedAtEnd: {label: string; edges: number[]; complete: boolean; signalled: boolean}[];
    /**
     * Every firing of the holed solver's two rules (skeleton flat-ring and third-front spec, decision 47): a flat ring
     * closed or a third-front meeting resolved. Both are reached only in a step of several rings, so a single-loop
     * roster asserts this empty (decision 3).
     */
    holedRuleFirings: {label: string; rule: 'flat-ring' | 'third-front'}[];
}

/** Decision 9's two assertions, as the lists that should be empty: complete solves, then unsignalled ones. */
export function unacceptedFaceFindings(report: WavefrontReport): {complete: string[]; unsignalled: string[]} {
    const describe = (solve: WavefrontReport['unacceptedAtEnd'][number]) => `${solve.label}: edge(s) ${solve.edges.join(', ')}`;
    return {
        complete: report.unacceptedAtEnd.filter(solve => solve.complete).map(describe),
        unsignalled: report.unacceptedAtEnd.filter(solve => !solve.signalled).map(describe),
    };
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
        unacceptedAtEnd: [],
        holedRuleFirings: [],
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
 * STAGE 1 DECISION 32's CAUSE, detected rather than listed: an exterior edge accepted while a live bisector
 * still names it as a parent (`ISSUE-skeleton-edge-accepted-before-its-face-closes.md`). The acceptance cure makes
 * it impossible at a step boundary (edge-acceptance spec, decision 22); this stays as the detector the
 * early-acceptance file holds empty over every roster.
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
    if (state.cause !== undefined) {
        report.earlyAcceptanceSolves.push({
            label: state.label,
            complete,
            fromStep: state.cause.step,
            detail: state.cause.detail,
        });
    }
    if (complete) {
        report.violations.push(...state.violations.map(v => ({label: state.label, ...v})));
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
            // DECISION 9: a face that never closes is signalled.
            const unaccepted = Array.from({length: context.graph.numExteriorNodes}, (_unused, edge) => edge)
                .filter(edge => !context.isAccepted(edge));
            if (unaccepted.length > 0) {
                report.unacceptedAtEnd.push({
                    label: state.label, edges: unaccepted, complete, signalled: errors.length > 0 || unresolved,
                });
            }
            closeSolve(report, state, complete);
            open.delete(context);
            seen++;
        },
        flatRingClosed(context: StraightSkeletonSolverContext) {
            report.holedRuleFirings.push({label: stateOf(context).label, rule: 'flat-ring'});
        },
        thirdFrontResolved(context: StraightSkeletonSolverContext) {
            report.holedRuleFirings.push({label: stateOf(context).label, rule: 'third-front'});
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
        `${report.earlyAcceptanceSolves.length} solve(s) on which stage 1 decision 32's cause holds `
        + `(an exterior edge accepted while a live bisector names it):`,
        ...report.earlyAcceptanceSolves.slice(0, 25).map(s =>
            `    ${s.complete ? 'complete' : 'incomplete'} ${s.label} from step ${s.fromStep}: ${s.detail}`),
        `${report.unacceptedAtEnd.length} solve(s) ending with an exterior edge unaccepted:`,
        ...report.unacceptedAtEnd.slice(0, 25).map(s =>
            `    ${s.complete ? 'complete' : 'incomplete'}${s.signalled ? '' : ', UNSIGNALLED'} ${s.label}: `
            + `edge(s) ${s.edges.join(', ')}`),
    ].join('\n');
}
