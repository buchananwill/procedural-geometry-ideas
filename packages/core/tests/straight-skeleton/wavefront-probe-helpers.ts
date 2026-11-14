/*
 * PART A'S INSTRUMENT (skeleton wavefront-order spec, decisions 15 to 17): a `WavefrontProbe` that checks
 * W1 to W4 at every step boundary and compares the four link-derived answers against today's id
 * arithmetic at every call, and the report it prints.
 *
 * Installed only by the wavefront-order tests, around the solves they run, and removed after: in a normal
 * solve the probe is `null` and every call site does nothing.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext, WavefrontSegment} from '@proc-geo/core';
import {checkWavefront, ringsOfWavefront} from '@proc-geo/core';
import {
    linkGuardRefuses,
    NeighbourGuardSite,
    setWavefrontProbe,
    WavefrontProbe,
    wavefrontSegmentsOf,
} from '@proc-geo/core/straight-skeleton/wavefront';

/** One distinct disagreement: where it was seen first, both answers, and how often it recurred. */
export interface Disagreement {
    label: string;
    step: number;
    detail: string;
    arithmetic: string;
    links: string;
    occurrences: number;
}

export interface Comparison {
    calls: number;
    /** Disagreements on solves that went on to complete, keyed by what disagreed. */
    disagreements: Map<string, Disagreement>;
    disagreementCount: number;
    /** The same, on solves that did not complete (a step failed or an edge was left unresolved). */
    incompleteDisagreements: Map<string, Disagreement>;
    incompleteDisagreementCount: number;
}

function comparison(): Comparison {
    return {
        calls: 0,
        disagreements: new Map(),
        disagreementCount: 0,
        incompleteDisagreements: new Map(),
        incompleteDisagreementCount: 0,
    };
}

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
    segments: Comparison;
    /** Segments compared with the opposite reading of the section (from = clockwiseBisector). */
    segmentsReversedAgreements: number;
    guard: Comparison;
    guardTable: Record<string, number>;
    /** Splits the link guard refuses and the arithmetic permits that went on to be RESOLVED in that step. */
    guardDisagreementsFired: string[];
    splitsResolved: number;
    /** Segment disagreements in which every differing pair is one 2-ring whose two bisectors share both parents. */
    segmentsTwoRingTies: number;
    partition: Comparison;
    rings: Comparison;
    ringsNull: number;
    validatingCalls: number;
    multipleValidating: number;
    multipleValidatingSamples: string[];
    notes: Map<string, {count: number; samples: string[]}>;
}

export function emptyReport(): WavefrontReport {
    return {
        solves: 0,
        completeSolves: 0,
        boundaries: 0,
        violations: [],
        incompleteSolvesWithViolations: [],
        earlyAcceptanceSolves: [],
        segments: comparison(),
        segmentsReversedAgreements: 0,
        guard: comparison(),
        guardTable: {},
        guardDisagreementsFired: [],
        splitsResolved: 0,
        segmentsTwoRingTies: 0,
        partition: comparison(),
        rings: comparison(),
        ringsNull: 0,
        validatingCalls: 0,
        multipleValidating: 0,
        multipleValidatingSamples: [],
        notes: new Map(),
    };
}

interface PendingDisagreement {
    target: Comparison;
    key: string;
    record: Omit<Disagreement, 'occurrences'>;
}

interface SolveState {
    step: number;
    violations: {step: number; violation: string}[];
    pending: PendingDisagreement[];
    /** `step|instigator|edge` of every split the link guard refuses and the arithmetic permits. */
    guardDisagreements: Set<string>;
    firedDisagreements: string[];
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

const segmentKey = (segment: WavefrontSegment) => `${segment.from}>${segment.to}`;
const segmentSet = (segments: readonly WavefrontSegment[]) => segments.map(segmentKey).sort().join(' ');
const setOfSets = (sets: readonly (readonly number[])[]) => sets
    .filter(set => set.length > 0)
    .map(set => `[${[...set].sort((a, b) => a - b).join(',')}]`)
    .sort()
    .join(' ');
const cyclic = (ring: readonly number[]) => {
    if (ring.length === 0) {
        return '()';
    }
    const start = ring.indexOf(Math.min(...ring));
    return `(${[...ring.slice(start), ...ring.slice(0, start)].join(',')})`;
};
const setOfCycles = (rings: readonly (readonly number[])[]) => rings.map(cyclic).sort().join(' ');

/**
 * A recording probe. `label()` names the solve the next calls belong to; the step is counted per solve
 * from its boundaries (step 0 is the boundary after `initInteriorEdges`; comparisons made while running
 * step k carry k).
 */
export function recordingProbe(report: WavefrontReport, label: () => string): WavefrontProbe {
    const solves = new WeakMap<StraightSkeletonSolverContext, SolveState>();
    let suspended = false;

    const stateOf = (context: StraightSkeletonSolverContext): SolveState => {
        let state = solves.get(context);
        if (state === undefined) {
            state = {step: 0, violations: [], pending: [], guardDisagreements: new Set(), firedDisagreements: []};
            solves.set(context, state);
        }
        return state;
    };

    const disagree = (
        context: StraightSkeletonSolverContext,
        target: Comparison,
        detail: string,
        arithmetic: string,
        links: string,
    ) => {
        const state = stateOf(context);
        state.pending.push({
            target,
            key: `${label()} | ${detail} | ${arithmetic} | ${links}`,
            record: {label: label(), step: state.step, detail, arithmetic, links},
        });
    };

    const note = (kind: string, sample: string) => {
        const entry = report.notes.get(kind) ?? {count: 0, samples: []};
        entry.count++;
        if (entry.samples.length < 6) {
            entry.samples.push(sample);
        }
        report.notes.set(kind, entry);
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
            for (const fired of state.firedDisagreements) {
                report.guardDisagreementsFired.push(`${complete ? '[complete]' : '[incomplete]'} ${fired}`);
            }
            if (state.earlyAcceptance !== undefined) {
                // Outside decision 15's gate by its cause (spec decision 32); counted, never asserted here.
                report.earlyAcceptanceSolves.push({
                    label: label(), complete, detail: state.earlyAcceptance, violations: state.violations.length,
                });
                if (complete) {
                    report.completeSolves++;
                }
            } else if (complete) {
                report.completeSolves++;
                report.violations.push(...state.violations.map(v => ({label: label(), ...v})));
            } else if (state.violations.length > 0) {
                report.incompleteSolvesWithViolations.push({
                    label: label(), ...state.violations[0], count: state.violations.length,
                });
            }
            for (const {target, key, record} of state.pending) {
                const map = complete ? target.disagreements : target.incompleteDisagreements;
                const existing = map.get(key);
                if (existing === undefined) {
                    map.set(key, {...record, occurrences: 1});
                } else {
                    existing.occurrences++;
                }
                if (complete) {
                    target.disagreementCount++;
                } else {
                    target.incompleteDisagreementCount++;
                }
            }
            solves.delete(context);
        },
        segments(context: StraightSkeletonSolverContext, exteriorEdge: number, arithmetic: readonly WavefrontSegment[]) {
            if (suspended) {
                return;
            }
            report.segments.calls++;
            const links = segmentSet(wavefrontSegmentsOf(context, exteriorEdge));
            const asRead = segmentSet(arithmetic);
            if (asRead === links) {
                return;
            }
            const reversed = segmentSet(arithmetic.map(s => ({exteriorEdge, from: s.to, to: s.from})));
            if (reversed === links) {
                report.segmentsReversedAgreements++;
            }
            // Is every arithmetic pair the links do not hold a 2-ring of two bisectors with one parent set?
            const held = new Set(wavefrontSegmentsOf(context, exteriorEdge).map(segmentKey));
            const differing = arithmetic.filter(s => !held.has(segmentKey(s)));
            const parentsOf = (id: number) => {
                const edge = context.getInteriorWithId(id);
                return [edge.clockwiseExteriorEdgeIndex, edge.widdershinsExteriorEdgeIndex].sort((a, b) => a - b).join(',');
            };
            const twoRingTie = differing.length > 0 && differing.every(s => s.from >= 0 && s.to >= 0
                && parentsOf(s.from) === parentsOf(s.to)
                && context.wavefront.clockwiseNeighbour[s.from] === s.to
                && context.wavefront.clockwiseNeighbour[s.to] === s.from);
            if (twoRingTie) {
                report.segmentsTwoRingTies++;
            }
            disagree(context, report.segments,
                `segments of edge ${exteriorEdge}${twoRingTie ? ' [2-ring, both bisectors on one parent pair]' : ' [OTHER]'}`,
                asRead, links);
        },
        validatingSegments(context: StraightSkeletonSolverContext, bisectorId: number, exteriorEdge: number, count: number) {
            if (suspended) {
                return;
            }
            report.validatingCalls++;
            if (count > 1) {
                report.multipleValidating++;
                if (report.multipleValidatingSamples.length < 10) {
                    report.multipleValidatingSamples.push(`${label()} step ${stateOf(context).step}: e${bisectorId} on edge ${exteriorEdge}, ${count} segments`);
                }
            }
        },
        guard(
            context: StraightSkeletonSolverContext,
            site: NeighbourGuardSite,
            instigator: number,
            exteriorEdge: number,
            arithmeticRefuses: boolean,
            struckSegment: () => WavefrontSegment | null,
        ) {
            if (suspended) {
                return;
            }
            report.guard.calls++;
            suspended = true;
            let segment: WavefrontSegment | null;
            try {
                segment = struckSegment();
            } finally {
                suspended = false;
            }
            const links = segment === null ? 'no-segment' : linkGuardRefuses(context, instigator, segment) ? 'refuse' : 'permit';
            const arithmetic = arithmeticRefuses ? 'refuse' : 'permit';
            const cell = `${site}: arithmetic ${arithmetic}, links ${links}`;
            report.guardTable[cell] = (report.guardTable[cell] ?? 0) + 1;
            if (links !== 'no-segment' && links !== arithmetic) {
                if (links === 'refuse') {
                    stateOf(context).guardDisagreements.add(`${stateOf(context).step}|${instigator}|${exteriorEdge}`);
                }
                disagree(context, report.guard,
                    `${site}: e${instigator} (cw e${context.wavefront.clockwiseNeighbour[instigator]}, ws e${context.wavefront.widdershinsNeighbour[instigator]}) against edge ${exteriorEdge}, segment ${segment ? segmentKey(segment) : '-'}`,
                    arithmetic, links);
            }
        },
        partition(
            context: StraightSkeletonSolverContext,
            input: readonly number[],
            childSteps: readonly AlgorithmStepInput[],
            outgoing: readonly number[],
        ) {
            report.partition.calls++;
            const arithmetic = setOfSets(childSteps.map(child => child.interiorEdges));
            const links = setOfSets(ringsOfWavefront(context, outgoing));
            if (arithmetic !== links) {
                disagree(context, report.partition, `partition of [${input.join(',')}]`, arithmetic, links);
            }
        },
        splitResolved(context: StraightSkeletonSolverContext, instigator: number, segment: WavefrontSegment) {
            const state = stateOf(context);
            report.splitsResolved++;
            if (state.guardDisagreements.has(`${state.step}|${instigator}|${segment.exteriorEdge}`)) {
                state.firedDisagreements.push(`${label()} step ${state.step}: e${instigator} on edge ${segment.exteriorEdge}, segment ${segmentKey(segment)}`);
            }
        },
        subPolygonRings(context: StraightSkeletonSolverContext, input: readonly number[], rings: number[][] | null) {
            if (rings === null) {
                report.ringsNull++;
                return;
            }
            report.rings.calls++;
            const arithmetic = setOfCycles(rings);
            const links = setOfCycles(ringsOfWavefront(context, input));
            if (arithmetic !== links) {
                disagree(context, report.rings, `rings of [${input.join(',')}]`, arithmetic, links);
            }
        },
        layerNote(context: StraightSkeletonSolverContext, kind: string, detail: string) {
            note(kind, `${label()} step ${stateOf(context).step}: ${detail}`);
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

function describeComparison(name: string, c: Comparison): string[] {
    const lines = [
        `${name}: ${c.calls} call(s), ${c.disagreementCount} disagreement(s) on complete solves `
        + `(${c.disagreements.size} distinct), ${c.incompleteDisagreementCount} on incomplete solves `
        + `(${c.incompleteDisagreements.size} distinct)`,
    ];
    for (const [title, map] of [['complete', c.disagreements], ['incomplete', c.incompleteDisagreements]] as const) {
        [...map.values()].slice(0, 25).forEach(d => lines.push(
            `    [${title}] ${d.label} step ${d.step} (${d.occurrences}x): ${d.detail}\n`
            + `        arithmetic: ${d.arithmetic}\n        links:      ${d.links}`));
    }
    return lines;
}

/** The report of spec decision 17, as printable text. */
export function describeReport(title: string, report: WavefrontReport): string {
    const lines = [
        `Wavefront order, part A — ${title}: ${report.solves} solve(s), ${report.completeSolves} complete, `
        + `${report.boundaries} step boundaries checked; ${report.violations.length} W1–W4 violation(s) on complete solves, `
        + `${report.incompleteSolvesWithViolations.length} incomplete solve(s) with violations.`,
        ...report.violations.slice(0, 25).map(v => `    VIOLATION ${v.label} step ${v.step}: ${v.violation}`),
        ...report.incompleteSolvesWithViolations.slice(0, 25).map(v =>
            `    incomplete ${v.label} step ${v.step} (${v.count} violation(s)): ${v.violation}`),
        `${report.earlyAcceptanceSolves.length} solve(s) outside the gate by spec decision 32's cause `
        + `(an exterior edge accepted while a live bisector names it):`,
        ...report.earlyAcceptanceSolves.slice(0, 25).map(s =>
            `    ${s.complete ? 'complete' : 'incomplete'} ${s.label} ${s.detail} (${s.violations} violation(s))`),
        ...describeComparison('1. activeExteriorEdgeSegments', report.segments),
        `    (disagreements that agree under the reversed reading of every section: ${report.segmentsReversedAgreements}; `
        + `whose every differing pair is a 2-ring on one parent pair: ${report.segmentsTwoRingTies})`,
        ...describeComparison('2. neighbour guard', report.guard),
        ...Object.entries(report.guardTable).sort().map(([cell, count]) => `    ${cell}: ${count}`),
        `    splits resolved: ${report.splitsResolved}; of them, splits the link guard refuses and the arithmetic `
        + `permitted: ${report.guardDisagreementsFired.length}`,
        ...report.guardDisagreementsFired.slice(0, 40).map(s => `        fired ${s}`),
        ...describeComparison('3. partition child steps', report.partition),
        ...describeComparison('4. ringsOfSubPolygon', report.rings),
        `    ringsOfSubPolygon returned null on ${report.ringsNull} layer(s)`,
        `validateSplitReachesEdge: ${report.validatingCalls} validating call(s), ${report.multipleValidating} with more than one validating segment`,
        ...report.multipleValidatingSamples.map(s => `    ${s}`),
        ...[...report.notes.entries()].map(([kind, {count, samples}]) =>
            `link-writing note ${kind}: ${count}\n${samples.map(s => `    ${s}`).join('\n')}`),
    ];
    return lines.join('\n');
}
