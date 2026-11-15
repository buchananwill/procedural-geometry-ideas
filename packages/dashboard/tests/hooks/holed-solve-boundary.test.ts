import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { solveSkeleton } from '@proc-geo/core';
import { HOLED_F1 } from '@proc-geo/test-fixtures';
import {
    BLOCKING_DIAGNOSTIC_HEADINGS,
    INFORMATIONAL_DIAGNOSTIC_KINDS,
    SKELETON_INCOMPLETE_TITLE,
} from '../../src/components/holed-fixture-text';
import {
    adaptHoledSteppedResult,
    describeBlockingDiagnostics,
    solveHoledSkeletonGuarded,
    solveHoledSkeletonSteppedGuarded,
} from '../../src/hooks/skeleton-solve-boundary';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { E_PRIME, holesOf } from '../fixtures/holed-specimens';

/*
 * ============================================================================
 *  THE HOLED SOLVE AT THE DASHBOARD'S BOUNDARY (dashboard holed-fixtures spec, decisions 15, 16, 36, 37, 44, 50, 51)
 * ============================================================================
 */

const OPTIONS = {perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR};

describe('the holed solve, guarded', () => {
    it('solves F1 complete, with a loop map per loop and no message', () => {
        const outcome = solveHoledSkeletonGuarded(HOLED_F1.outline, {...OPTIONS, holes: holesOf(HOLED_F1)});
        expect(outcome.error).toBeNull();
        expect(outcome.result?.complete).toBe(true);
        expect(outcome.result?.loopMaps).toHaveLength(2);
        expect(describeBlockingDiagnostics(outcome.result!.diagnostics)).toBeNull();
    });

    it('returns core\'s own words when a hole crosses the outline (decision 36)', () => {
        const crossing = [{vertices: [{x: 8, y: 4}, {x: 12, y: 4}, {x: 12, y: 6}, {x: 8, y: 6}]}];
        let thrown = '';
        try {
            solveSkeleton(HOLED_F1.outline, {...OPTIONS, holes: crossing});
        } catch (error) {
            thrown = (error as Error).message;
        }
        expect(thrown).not.toBe('');
        const outcome = solveHoledSkeletonGuarded(HOLED_F1.outline, {...OPTIONS, holes: crossing});
        expect(outcome.result).toBeNull();
        expect(outcome.error).toBe(thrown);
        // It names the loop and the caller's vertex (skeleton loops-input spec, decision 26).
        expect(outcome.error).toMatch(/crosses hole 0's edge from vertex 0/);
    });

    it('gives E′ complete: false and a text holding each present blocking kind\'s heading and detail', () => {
        const outcome = solveHoledSkeletonGuarded(E_PRIME.outline, {...OPTIONS, holes: holesOf(E_PRIME)});
        expect(outcome.error).toBeNull();
        const result = outcome.result!;
        expect(result.complete).toBe(false);
        const blocking = result.diagnostics.filter(d => d.kind in BLOCKING_DIAGNOSTIC_HEADINGS);
        expect(blocking.map(d => d.kind)).toContain('simultaneous-across-rings');
        const text = describeBlockingDiagnostics(result.diagnostics)!;
        for (const diagnostic of blocking) {
            expect(text).toContain(BLOCKING_DIAGNOSTIC_HEADINGS[diagnostic.kind as keyof typeof BLOCKING_DIAGNOSTIC_HEADINGS]);
            expect(text).toContain(diagnostic.detail);
        }
        // An informational diagnostic is never a heading of the alert.
        for (const diagnostic of result.diagnostics.filter(d => !(d.kind in BLOCKING_DIAGNOSTIC_HEADINGS))) {
            expect(text).not.toContain(diagnostic.detail);
        }
    });
});

describe('the holed step-through, guarded and adapted (decision 16)', () => {
    it('carries E′\'s snapshots and the Skeleton incomplete text as its error', () => {
        const outcome = solveHoledSkeletonSteppedGuarded(E_PRIME.outline, {...OPTIONS, holes: holesOf(E_PRIME)});
        expect(outcome.error).toBeNull();
        const adapted = adaptHoledSteppedResult(outcome.result!);
        expect(adapted.snapshots).toBe(outcome.result!.snapshots);
        expect(adapted.snapshots.length).toBeGreaterThan(1);
        expect(adapted.error).toBe(describeBlockingDiagnostics(outcome.result!.result.diagnostics));
        expect(adapted.error).not.toBeNull();
    });

    it('carries F1\'s snapshots with no error', () => {
        const outcome = solveHoledSkeletonSteppedGuarded(HOLED_F1.outline, {...OPTIONS, holes: holesOf(HOLED_F1)});
        const adapted = adaptHoledSteppedResult(outcome.result!);
        expect(adapted.error).toBeNull();
        expect(adapted.snapshots[adapted.snapshots.length - 1]).toEqual(outcome.result!.result.graph);
    });

    it('returns the refusal, with no result, for a hole crossing the outline', () => {
        const crossing = [{vertices: [{x: 8, y: 4}, {x: 12, y: 4}, {x: 12, y: 6}, {x: 8, y: 6}]}];
        const outcome = solveHoledSkeletonSteppedGuarded(HOLED_F1.outline, {...OPTIONS, holes: crossing});
        expect(outcome.result).toBeNull();
        expect(outcome.error).toMatch(/crosses hole 0's edge/);
    });
});

/*
 * EVERY BLOCKING KIND HAS A HEADING (decision 50). The heading table is typed `Record<BlockingDiagnosticKind, string>`,
 * where a blocking kind is every `SkeletonDiagnosticKind` not listed as informational, so a kind core adds is blocking
 * here until it is classified and fails to compile until it has a heading. This reads the union from core's built
 * declarations as well, so the check stands even where the type checker is not run.
 */
describe('every diagnostic kind core has is classified, and every blocking kind has a heading', () => {
    const coreKinds = (): string[] => {
        const declarations = readFileSync(join(dirname(require.resolve('@proc-geo/core')), 'index.d.ts'), 'utf8');
        const union = /type SkeletonDiagnosticKind\s*=([^;]*);/.exec(declarations);
        expect(union).not.toBeNull();
        return [...union![1].matchAll(/'([a-z-]+)'|"([a-z-]+)"/g)].map(match => match[1] ?? match[2]);
    };

    it('reads at least the fourteen kinds core had when this was written', () => {
        expect(coreKinds().length).toBeGreaterThanOrEqual(14);
    });

    it('gives every kind that is not informational a heading', () => {
        const informational = new Set<string>(INFORMATIONAL_DIAGNOSTIC_KINDS);
        const missing = coreKinds().filter(kind => !informational.has(kind) && !(kind in BLOCKING_DIAGNOSTIC_HEADINGS));
        expect(missing).toEqual([]);
    });

    it('heads no kind core does not have, and no kind twice', () => {
        const kinds = new Set(coreKinds());
        expect(Object.keys(BLOCKING_DIAGNOSTIC_HEADINGS).filter(kind => !kinds.has(kind))).toEqual([]);
        expect(INFORMATIONAL_DIAGNOSTIC_KINDS.filter(kind => !kinds.has(kind))).toEqual([]);
        expect(Object.keys(BLOCKING_DIAGNOSTIC_HEADINGS).filter(kind => informationalHas(kind))).toEqual([]);
    });

    it('heads exactly the kinds SkeletonSolveResult.complete names as blocking', () => {
        // The doc comment of `complete` in core lists them; read from the same declarations.
        expect(Object.keys(BLOCKING_DIAGNOSTIC_HEADINGS).sort()).toEqual([
            'holed-equal-time-violation', 'holed-planarity-violation', 'holed-time-order-violation',
            'holed-topology-violation', 'multi-ring-step-refused', 'simultaneous-across-rings', 'step-failure',
            'unresolved-edges',
        ]);
    });

    it('titles the alert as the spec does', () => {
        expect(SKELETON_INCOMPLETE_TITLE).toBe('Skeleton incomplete');
    });
});

function informationalHas(kind: string): boolean {
    return (INFORMATIONAL_DIAGNOSTIC_KINDS as readonly string[]).includes(kind);
}
