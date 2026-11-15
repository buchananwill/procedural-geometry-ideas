import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { solveSkeleton } from '@proc-geo/core';
import { HOLED_F1 } from '@proc-geo/test-fixtures';
import {
    BLOCKING_DIAGNOSTIC_HEADINGS,
    INFORMATIONAL_DIAGNOSTIC_KINDS,
    SKELETON_INCOMPLETE_TITLE,
    STEP_REFUSAL_KINDS,
} from '../../src/components/holed-fixture-text';
import {
    adaptHoledSteppedResult,
    describeBlockingDiagnostics,
    holedSolveView,
    solveHoledSkeletonGuarded,
    solveHoledSkeletonSteppedGuarded,
} from '../../src/hooks/skeleton-solve-boundary';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { E_PRIME, holesOf } from '../fixtures/holed-specimens';

/** Core's own `types.ts`, where `SkeletonDiagnosticKind` and its doc comment live: the fresh source of the kinds. */
const CORE_TYPES_SOURCE = join(__dirname, '..', '..', '..', 'core', 'src', 'straight-skeleton', 'types.ts');

/*
 * ============================================================================
 *  THE HOLED SOLVE AT THE DASHBOARD'S BOUNDARY (dashboard holed-fixtures spec, decisions 15, 16, 36, 37, 44, 50, 51)
 * ============================================================================
 *
 * FRESHNESS: like every dashboard test, this runs against core's BUILT `dist/`, only as fresh as core's last build.
 * The diagnostic-kind tests below read core's source `types.ts` and fail by name when `dist` lags it (BSA.D323).
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
        const refusalDetails = new Set(blocking
            .filter(d => (STEP_REFUSAL_KINDS as readonly string[]).includes(d.kind)).map(d => d.detail));
        for (const diagnostic of blocking) {
            // A step-failure that only echoes a refusal is the refusal's, and is shown as it (BSA.D323).
            if (diagnostic.kind === 'step-failure' && refusalDetails.has(diagnostic.detail)) continue;
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

describe('a refusal reads as a refusal, with its detail once (BSA.D323)', () => {
    const outcome = solveHoledSkeletonGuarded(E_PRIME.outline, {...OPTIONS, holes: holesOf(E_PRIME)});
    const diagnostics = outcome.result!.diagnostics;
    const refusals = diagnostics.filter(d => (STEP_REFUSAL_KINDS as readonly string[]).includes(d.kind));
    const text = describeBlockingDiagnostics(diagnostics)!;

    it('E′: core pushes its refusal and a step-failure with the identical detail', () => {
        expect(refusals.length).toBeGreaterThan(0);
        for (const refusal of refusals) {
            expect(diagnostics.some(d => d.kind === 'step-failure' && d.detail === refusal.detail)).toBe(true);
        }
    });

    it('E′: the text heads it as refused, never as a step that threw, and prints each refusal\'s detail once', () => {
        expect(text).not.toContain(BLOCKING_DIAGNOSTIC_HEADINGS['step-failure']);
        for (const refusal of refusals) {
            const heading = BLOCKING_DIAGNOSTIC_HEADINGS[refusal.kind as keyof typeof BLOCKING_DIAGNOSTIC_HEADINGS];
            expect(heading.startsWith('Refused: ')).toBe(true);
            expect(text).toContain(`${heading}\n${refusal.detail}`);
            expect(text.split(refusal.detail).length - 1).toBe(1);
        }
    });

    it('a step-failure no refusal carries keeps its own heading', () => {
        const genuine = describeBlockingDiagnostics([
            ...diagnostics, {kind: 'step-failure', detail: 'Sub-polygon [1, 2, 3] threw: something else.'}])!;
        expect(genuine).toContain(`${BLOCKING_DIAGNOSTIC_HEADINGS['step-failure']}\nSub-polygon [1, 2, 3] threw: something else.`);
    });

    it('each heading of the two refusal kinds is worded from its doc comment in core', () => {
        // The doc comment as prose: each line's ` * ` prefix folded into one space.
        const source = readFileSync(CORE_TYPES_SOURCE, 'utf8').replace(/\s*\n\s*\*\s*/g, ' ');
        expect(source).toContain('a meeting on a third front');
        expect(BLOCKING_DIAGNOSTIC_HEADINGS['simultaneous-across-rings']).toContain('a meeting on a third front');
        expect(source).toContain('a ring of fewer than three bisectors at its start, no event at all');
        expect(BLOCKING_DIAGNOSTIC_HEADINGS['multi-ring-step-refused'])
            .toContain('a ring of fewer than three bisectors at its start, no event at all');
    });
});

describe('the holed solve as the hook exposes it (BSA.D323)', () => {
    const holes = holesOf(HOLED_F1);
    const good = solveHoledSkeletonGuarded(HOLED_F1.outline, {...OPTIONS, holes});
    const refused = solveHoledSkeletonGuarded([{x: 0, y: 0}, {x: 0, y: 10}, {x: 6, y: 10}, {x: 10, y: 0}], {...OPTIONS, holes});

    it('a solve that stands carries its own maps and the outline\'s remap', () => {
        const view = holedSolveView(true, good, null);
        expect(view).toEqual({holedSolve: good.result, refused: false, solverLoopMaps: good.result!.loopMaps,
            solverVertexRemap: good.result!.loopMaps![0].vertexToNode});
    });

    it('while a refusal stands the last good result stays, and none of its maps do', () => {
        expect(refused.error).not.toBeNull();
        const view = holedSolveView(true, refused, good.result);
        expect(view.holedSolve).toBe(good.result);
        expect(view.refused).toBe(true);
        // So the DebugPanel's removed count and every map-indexed drawing read nothing stale.
        expect(view.solverLoopMaps).toBeNull();
        expect(view.solverVertexRemap).toBeNull();
    });

    it('a single loop has no holed view', () => {
        expect(holedSolveView(false, {result: null, error: null}, good.result))
            .toEqual({holedSolve: null, refused: false, solverLoopMaps: null, solverVertexRemap: null});
    });
});

/*
 * EVERY BLOCKING KIND HAS A HEADING (decision 50). The heading table is typed `Record<BlockingDiagnosticKind, string>`,
 * where a blocking kind is every `SkeletonDiagnosticKind` not listed as informational, so a kind core adds is blocking
 * here until it is classified and fails to compile until it has a heading.
 *
 * TWO SOURCES, AND WHICH IS FRESH (BSA.D323). The kind list below is read from CORE'S SOURCE, `types.ts`, so it is
 * always current. The `Record`'s type check is not: the dashboard compiles against core's BUILT declarations
 * (`dist/index.d.ts`), which are only as fresh as core's last build. The freshness test below fails, naming the fix,
 * when the built union differs from the source's: rebuild core (`pnpm --filter @proc-geo/core build`).
 */
describe('every diagnostic kind core has is classified, and every blocking kind has a heading', () => {
    const unionOf = (text: string, where: string): string[] => {
        const union = /type SkeletonDiagnosticKind\s*=([^;]*);/.exec(text);
        if (union === null) throw new Error(`no SkeletonDiagnosticKind union in ${where}`);
        return [...union[1].matchAll(/'([a-z-]+)'|"([a-z-]+)"/g)].map(match => match[1] ?? match[2]);
    };
    const coreKinds = (): string[] => unionOf(readFileSync(CORE_TYPES_SOURCE, 'utf8'), CORE_TYPES_SOURCE);
    const builtKinds = (): string[] => {
        const declarations = join(dirname(require.resolve('@proc-geo/core')), 'index.d.ts');
        return unionOf(readFileSync(declarations, 'utf8'), declarations);
    };

    it('core\'s built declarations carry the source\'s kinds; if not, rebuild core before trusting the type check', () => {
        expect({built: builtKinds(), note: 'stale core dist: run pnpm --filter @proc-geo/core build'})
            .toEqual({built: coreKinds(), note: 'stale core dist: run pnpm --filter @proc-geo/core build'});
    });

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
        // The doc comment of `complete` in core's `types.ts` lists them. The list here is HARD-CODED from that comment,
        // not read from it: a kind added to the comment needs adding here by hand.
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
