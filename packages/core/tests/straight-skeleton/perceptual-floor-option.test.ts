import {
    canonicaliseForSolve,
    flattenRecursiveTree,
    runAlgorithmV5,
    SKELETON_NOISE_FLOOR,
    solveSkeleton,
    subdivideRecursively,
    uniformLevelSpecs,
} from '@proc-geo/core';
import type {Vector2} from '@proc-geo/core';
import {FULL_CORPUS, OFF_EDGE_JITTER_L_SEED_55433} from '@proc-geo/test-fixtures';

/*
 * ============================================================================
 *  THE PERCEPTUAL FLOOR IS THE CLIENT'S — journal decision 106.
 * ============================================================================
 *
 * The solver must not create geometry the client will throw away in its renderer. A client that can
 * measure its own rendering limits derives a floor from them and passes it in; the library default
 * stays conservative for a headless consumer that cannot. These tests hold three things:
 *
 *   1. THE OPTION IS ACTUALLY HONOURED. A coarser floor removes boundary geometry the library floor
 *      keeps, through every entry point that takes the option — the direct solve, the legacy solve,
 *      the boundary stage on its own, and the recursion driver.
 *   2. OMITTING IT IS THE OLD BEHAVIOUR EXACTLY. Absent the option every entry point behaves as it
 *      did before the option existed, which is the promise a headless consumer relies on.
 *   3. A COARSER FLOOR NEVER ADDS GEOMETRY. The floor screens the input; raising it can only ever
 *      remove more. A floor that made the solve produce MORE would mean the stage was creating
 *      structure rather than removing it, and every argument for the option would be void.
 *
 * The committed suites everywhere else run at the library default. This is the ONE suite that varies
 * the floor, deliberately: journal decision 104 forbids moving a tolerance on an unforced judgement,
 * and a suite that swept floors everywhere would make every other pin a function of a number nobody
 * ruled.
 */

/**
 * The floor `apps/demo` derives from its canvas: 2 CSS px of separation ÷ a Konva zoom cap of 100,
 * over a 2000-unit reference world extent. Ten times coarser than the library default.
 *
 * RESTATED HERE AS A NUMBER RATHER THAN IMPORTED, because `@proc-geo/core` must not depend on the
 * dashboard and the derivation is the dashboard's to own. `perceptual-floor.test.ts` over there pins
 * the chain that produces it; this suite only needs A floor coarser than the default, and using the
 * demo's makes the two documents describe the same experiment.
 */
const DEMO_FLOOR = 1e-5;

/** The fixture the option is convicted on, and why it is the right one. */
const JITTERED: Vector2[] = OFF_EDGE_JITTER_L_SEED_55433;

/**
 * A reflex L resampled with off-edge jitter at seed 55433: 18 vertices, of which 12 deviate from
 * their chords by between the library floor and the demo floor.
 *
 * THE DISCRIMINATION IS TOTAL, which is what makes it a conviction rather than a coincidence. At
 * 1e-6 the boundary stage removes NOTHING — all 18 survive and the solver works on the jittered
 * ring. At 1e-5 it removes twelve and hands the solver the six-vertex reflex L the jitter was
 * sampled onto in the first place. The jitter is real structure to the library floor and invisible
 * to a canvas that caps at 100x, and that is the whole of decision 106 in one fixture.
 */
const JITTERED_VERTEX_COUNT = 18;
const JITTERED_VERTEX_COUNT_AT_DEMO_FLOOR = 6;

describe('the option is honoured: a coarser floor removes what the default keeps', () => {
    it('solveSkeleton keeps every vertex at the library floor', () => {
        const result = solveSkeleton(JITTERED);
        expect(result.graph.numExteriorNodes).toBe(JITTERED_VERTEX_COUNT);
        expect(result.diagnostics.filter(d => d.kind === 'vertices-canonicalised')).toEqual([]);
    });

    it('solveSkeleton removes the sub-demo-floor jitter at the demo floor', () => {
        const result = solveSkeleton(JITTERED, {perceptualFloor: DEMO_FLOOR});
        expect(result.graph.numExteriorNodes).toBe(JITTERED_VERTEX_COUNT_AT_DEMO_FLOOR);
        expect(result.complete).toBe(true);
    });

    it('reports the removal against the floor it was given, not the default', () => {
        const result = solveSkeleton(JITTERED, {perceptualFloor: DEMO_FLOOR});
        const removal = result.diagnostics.find(d => d.kind === 'vertices-canonicalised');
        expect(removal?.detail).toContain(`${DEMO_FLOOR}`);
        expect(removal?.detail).toContain('12 vertex(es) removed');
    });

    it('runAlgorithmV5 honours it too — the dashboard explorer drives that entry point', () => {
        expect(runAlgorithmV5(JITTERED).graph.numExteriorNodes)
            .toBe(JITTERED_VERTEX_COUNT);
        expect(runAlgorithmV5(JITTERED, {perceptualFloor: DEMO_FLOOR}).graph.numExteriorNodes)
            .toBe(JITTERED_VERTEX_COUNT_AT_DEMO_FLOOR);
    });

    it('canonicaliseForSolve honours it, so an overlay drawing the remap agrees with the solve', () => {
        expect(canonicaliseForSolve(JITTERED).vertices.length)
            .toBe(JITTERED_VERTEX_COUNT);
        expect(canonicaliseForSolve(JITTERED, {perceptualFloor: DEMO_FLOOR}).vertices.length)
            .toBe(JITTERED_VERTEX_COUNT_AT_DEMO_FLOOR);
    });

    /**
     * THE DRIVER'S OPTION IS THE SAME ONE, and it has to be: the driver measures the floor ONCE on
     * the root region and passes it down, so a client that set a floor on `solveSkeleton` but not on
     * the recursion would have every sub-region screened against a floor its renderer never chose.
     */
    it('subdivideRecursively takes the same floor and it reaches the root solve', () => {
        const levels = uniformLevelSpecs(
            {levels: 1, mergeGroupSize: 1, depthFraction: 1, residue: 'recurse'});
        expect(subdivideRecursively(JITTERED, {levels}).canonicalBoundary.length)
            .toBe(JITTERED_VERTEX_COUNT);
        expect(subdivideRecursively(JITTERED, {levels, perceptualFloor: DEMO_FLOOR})
            .canonicalBoundary.length)
            .toBe(JITTERED_VERTEX_COUNT_AT_DEMO_FLOOR);
    });
});

describe('omitting the option is the library default, exactly', () => {
    /**
     * Written against the whole corpus rather than one fixture because the promise is about the
     * package's behaviour, not about one shape: a headless consumer that never passes the option must
     * get bit-identical answers to the ones it got before the option existed. Stating the default
     * explicitly and stating nothing at all must be the same call.
     */
    it.each(FULL_CORPUS.map(fixture => [fixture.name, fixture.vertices] as const))(
        '%s solves identically with the floor omitted and stated', (_name, vertices) => {
            const omitted = solveSkeleton(vertices);
            const stated = solveSkeleton(vertices, {perceptualFloor: SKELETON_NOISE_FLOOR});
            expect(stated.graph.nodes).toEqual(omitted.graph.nodes);
            expect(stated.graph.edges).toEqual(omitted.graph.edges);
            expect(stated.complete).toBe(omitted.complete);
        });
});

describe('a coarser floor never adds geometry', () => {
    /**
     * THE MONOTONICITY GUARD. The floor's entire job is to remove boundary vertices that cannot be
     * seen; a coarser floor removes a superset of what a finer one removes, because
     * `canonicalisePolygon`'s predicate is a strict comparison of one deviation against one number.
     * So no reading below may grow as the floor rises.
     *
     * IT IS THE SOLVE THAT IS MEASURED, NOT THE BOUNDARY STAGE, which is what makes this worth
     * asserting: the boundary claim is nearly a tautology, while the skeleton's node and edge counts
     * are the output of a whole solve on the reduced ring, and nothing about the algorithm forces
     * those to shrink with their input. Measured over the corpus at five floors on 2026-08-29: zero
     * violations, so the property is real and this is a guard rather than a hope.
     *
     * A LADDER, NOT A PAIR. Two floors would leave a non-monotone middle invisible — the corpus has
     * fixtures whose jitter sits between 1e-6 and 1e-5, and others whose features only clear 3e-5.
     */
    const LADDER = [SKELETON_NOISE_FLOOR, 3e-6, DEMO_FLOOR, 3e-5, 1e-4];

    it.each(FULL_CORPUS.map(fixture => [fixture.name, fixture.vertices] as const))(
        '%s never grows as the floor rises', (_name, vertices) => {
            let previous: {exterior: number; nodes: number; edges: number} | undefined;
            for (const perceptualFloor of LADDER) {
                const graph = solveSkeleton(vertices, {perceptualFloor}).graph;
                const reading = {
                    exterior: graph.numExteriorNodes,
                    nodes: graph.nodes.length,
                    edges: graph.edges.length,
                };
                if (previous !== undefined) {
                    expect(reading.exterior).toBeLessThanOrEqual(previous.exterior);
                    expect(reading.nodes).toBeLessThanOrEqual(previous.nodes);
                    expect(reading.edges).toBeLessThanOrEqual(previous.edges);
                }
                previous = reading;
            }
        });

    /**
     * The recursion's answer to the same question, at the level the pass-down actually operates on.
     * A coarser root floor cannot leave a region holding MORE boundary than a finer one did, because
     * the root floor is a caller-space length and every region restates that one length.
     */
    it('a coarser root floor never leaves a region with more boundary', () => {
        const levels = uniformLevelSpecs(
            {levels: 2, mergeGroupSize: 2, depthFraction: 0.6, residue: 'recurse'});
        for (const fixture of FULL_CORPUS) {
            const boundaryTotal = (perceptualFloor: number) =>
                flattenRecursiveTree(subdivideRecursively(fixture.vertices, {levels, perceptualFloor}))
                    .reduce((total, node) => total + node.canonicalBoundary.length, 0);
            expect(boundaryTotal(DEMO_FLOOR)).toBeLessThanOrEqual(boundaryTotal(SKELETON_NOISE_FLOOR));
        }
    });
});
