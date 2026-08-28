import type {Vector2} from '@proc-geo/core';

/*
 * ============================================================================
 *  THREE RECORDED FAILURES FROM THE 2026-08-28 JITTER SWEEP. Export-only.
 * ============================================================================
 *
 * DELIBERATELY OUT OF `ALL_TEST_POLYGONS`. Several suites sweep that list asserting every entry
 * solves completely; these three do not, and journal decision 53 permits an exclusion only as a
 * visible, pinned characterisation of a defect awaiting its fix. That pin is
 * `packages/core/tests/straight-skeleton/along-edge-jitter-known-failures.test.ts`, which asserts
 * the current failing behaviour exactly and says what to do when a cell starts passing. Promote a
 * fixture into `ALL_TEST_POLYGONS` and delete its block there when its solve completes.
 *
 * ----------------------------------------------------------------------------
 * WHERE THEY CAME FROM — the construction, so the numbers below are reproducible rather than magic
 * ----------------------------------------------------------------------------
 *
 * Measured 2026-08-28 while re-measuring `docs/notes/solver-hardening-backlog.md` item 2. That item
 * records that reflex shapes whose edge samples are jittered ALONG the edge line fail badly while
 * jitter with an OFF-EDGE component passes 80/80. Re-measured, the polarity has inverted at small
 * magnitudes: with the canonicalisation stage on — the default, and the configuration that matters —
 * along-edge jitter now scores 0/80 at every magnitude, while off-edge jitter at 1e-3 units on a
 * 300-unit shape scores 22/80 failing for the reflex L and 46/80 for the double-reflex plus.
 *
 * The generator, exactly:
 *
 *   - Base shapes are the two fixtures from
 *     `packages/core/tests/straight-skeleton/reflex-subdivision.test.ts`, in clockwise winding:
 *     REFLEX_L        = (100,100) (100,400) (250,400) (250,250) (400,250) (400,100)
 *     DOUBLE_REFLEX_PLUS = (200,100) (200,200) (100,200) (100,300) (200,300) (200,400)
 *                          (300,400) (300,300) (400,300) (400,200) (300,200) (300,100)
 *   - Each edge carries its own corner plus `k - 1` samples at parameter `step / k`, in the vertex
 *     order `insertRegularly` produces. Corners are NEVER moved: moving one changes the silhouette.
 *   - Per inserted sample, two draws from the fixed LCG of
 *     `packages/core/tests/straight-skeleton/subdivision-helpers.ts` seeded with the cell's seed —
 *     first an along-edge displacement `(random() * 2 - 1) * 1e-3`, clamped to
 *     +/- 0.49 * edgeLength / k so the samples stay strictly between their neighbours and in
 *     boundary order, then an across-edge displacement `(random() * 2 - 1) * 1e-3` applied along the
 *     edge normal. Both draws happen for every sample; the along-edge family discards the second.
 *   - Solved with `solveSkeleton(vertices)` at the default `SKELETON_NOISE_FLOOR` of 1e-6.
 *
 * ----------------------------------------------------------------------------
 * WHY 1e-3 AND NOT ANY OTHER MAGNITUDE — the band is the point, not the number
 * ----------------------------------------------------------------------------
 *
 * The noise floor is a UNIT-SPACE constant, and these shapes normalise by 256, so a caller-space
 * off-edge displacement of 1e-3 lands at about 3.9e-6 in unit space: a few times the 1e-6 floor.
 * Big enough to survive canonicalisation, small enough that the resulting polygon is still
 * near-degenerate. That is precisely the regime the backlog item calls "the regime a real hand-drawn
 * L-shaped or cross-shaped region falls into". Move a decade either way and it goes quiet — at 1e-6
 * the stage removes the perturbation entirely and at 0.1 the shapes are ordinarily non-degenerate,
 * both 0-or-1 of 80. These three are samples of a BAND just above the floor, not of a threshold.
 */

/**
 * Reflex L, k = 3, seed 15838, off-edge jitter at 1e-3. Eighteen vertices; the smallest failing L
 * cell in the sweep.
 *
 * Canonicalisation removes three of the fifteen inserted samples as invisible (largest discarded
 * deviation 9.03e-7, just under the floor) and the remaining fifteen-vertex ring then fails in a
 * two-edge base case, leaving interior edges 40 and 41 without a target node.
 */
export const OFF_EDGE_JITTER_L_SEED_15838: Vector2[] = [
    {x: 100, y: 100},
    {x: 99.99931040087343, y: 199.9997482466274},
    {x: 99.99913385964092, y: 299.99945830215466},
    {x: 100, y: 400},
    {x: 150.00075333579304, y: 400.00073304080405},
    {x: 199.9992164863064, y: 400.0003412887184},
    {x: 250, y: 400},
    {x: 249.99990207676962, y: 349.99992387772494},
    {x: 250.0005854203524, y: 299.999192912024},
    {x: 250, y: 250},
    {x: 299.99928422587413, y: 250.00054524685257},
    {x: 349.9994893964282, y: 250.00006182499882},
    {x: 400, y: 250},
    {x: 399.99910841906814, y: 200.0002717059604},
    {x: 399.99995569333527, y: 150.00027843890385},
    {x: 400, y: 100},
    {x: 299.9990789698097, y: 99.9997503422182},
    {x: 199.99990862228583, y: 99.99903816329409},
];

/**
 * Reflex L, k = 3, seed 55433, off-edge jitter at 1e-3. Eighteen vertices, and THE SPECIMEN OF THE
 * CLASS: not one of them is under the noise floor, so the canonicalisation stage removes nothing and
 * the solver is handed the whole eighteen-vertex ring.
 *
 * That is what rules out the easy misreading of the other two — that the failure is an artefact of a
 * ring left ragged by partial canonicalisation. It is not. Every vertex here is above the floor, the
 * only diagnostics are `step-failure` and `unresolved-edges`, and the solve still dies in a two-edge
 * base case leaving interior edges 48 and 49 without a target node.
 */
export const OFF_EDGE_JITTER_L_SEED_55433: Vector2[] = [
    {x: 100, y: 100},
    {x: 100.00047923759976, y: 200.00043852333167},
    {x: 99.99980784323206, y: 299.99950638874157},
    {x: 100, y: 400},
    {x: 150.0002162884213, y: 399.9999566053781},
    {x: 199.99903907242137, y: 400.00049433247045},
    {x: 250, y: 400},
    {x: 249.99924828096246, y: 350.0007724625487},
    {x: 250.00086114324117, y: 300.0006588195497},
    {x: 250, y: 250},
    {x: 300.0009256457612, y: 250.0009827838014},
    {x: 350.00067914129886, y: 250.00014263380737},
    {x: 400, y: 250},
    {x: 400.0008210907816, y: 199.99998963527196},
    {x: 400.0001215347485, y: 149.99939462870825},
    {x: 400, y: 100},
    {x: 299.99990066944434, y: 99.99933472471358},
    {x: 200.0001817400409, y: 100.00036942793382},
];

/**
 * Double-reflex plus, k = 2, seed 7919, off-edge jitter at 1e-3. Twenty-four vertices — one inserted
 * sample per edge, the smallest possible perturbation of this shape, and the smallest failing plus
 * cell in the sweep.
 *
 * Canonicalisation removes four of the twelve samples (largest discarded deviation 6.51e-7) and the
 * remaining twenty-vertex ring fails with interior edges 44 and 58 unresolved. Both of those edges
 * have basis vector exactly (1, 0): the plus's facing walls are still exactly parallel, which is the
 * degeneracy this shape carries and the jitter does not remove.
 */
export const OFF_EDGE_JITTER_PLUS_SEED_7919: Vector2[] = [
    {x: 200, y: 100},
    {x: 199.99987663352815, y: 149.99961019128654},
    {x: 200, y: 200},
    {x: 150.0009513151627, y: 199.9993990629227},
    {x: 100, y: 200},
    {x: 99.99951167211076, y: 249.99926074526738},
    {x: 100, y: 300},
    {x: 150.0004519690834, y: 300.000310679968},
    {x: 200, y: 300},
    {x: 199.99996716406895, y: 349.99904583923984},
    {x: 200, y: 400},
    {x: 250.00070026948117, y: 400.0005302757747},
    {x: 300, y: 400},
    {x: 299.9996577394628, y: 350.0002440581033},
    {x: 300, y: 300},
    {x: 349.99925144745407, y: 300.00004566323713},
    {x: 400, y: 300},
    {x: 400.00036588472545, y: 249.99992812009808},
    {x: 400, y: 200},
    {x: 349.99925520094297, y: 200.00087747494737},
    {x: 300, y: 200},
    {x: 300.0001665342809, y: 150.00051462988276},
    {x: 300, y: 100},
    {x: 249.9990539987348, y: 100.00077191036614},
];

/**
 * Reflex L, k = 4, seed 55433, off-edge jitter at 1e-3. Twenty-four vertices. THE ONE OF THIS FILE'S
 * FOUR THAT SOLVES.
 *
 * Same generator, same magnitude, same band as the three above — and its whole point is that the
 * ROOT solves completely while the recursive driver still cuts sub-regions out of it that do not.
 * That combination is what a test of the driver needs and cannot get anywhere else since 2026-08-28:
 * the corpus's failure census has been empty since journal decision 56, and the `COLLINEAR_DUMBBELL`
 * regions that stood in for it were cured by the split-at-the-vertex correction in
 * `generateSplitEventFromTheEdgeItself`. The three fixtures above cannot serve, because they fail at
 * the root and so produce no tree to find a failing region in.
 *
 * Measured 2026-08-28 at three levels and full depth with the residue voided: in merge groups of
 * FOUR it produces exactly one failed region, of thirteen boundary vertices and real area, with
 * seventeen solved leaf segments around it. It is used by
 * `packages/core/tests/straight-skeleton/recursive-subdivision.test.ts` and by the dashboard's
 * `recursiveSubdivisionToScene.test.ts`.
 *
 * PERISHABLE, like the three above and for the same reason: the region fails because of a solver
 * defect (journal decision 67), not by design, and a later fix will cure it. Both consumers gate on
 * the failure still being there and say so when it is not.
 */
export const OFF_EDGE_JITTER_L_SEED_55433_K4: Vector2[] = [
    {x: 100, y: 100},
    {x: 100.00047923759976, y: 175.00043852333167},
    {x: 99.99980784323206, y: 249.99950638874154},
    {x: 100.00004339462193, y: 325.0002162884213},
    {x: 100, y: 400},
    {x: 137.49903907242137, y: 400.00049433247045},
    {x: 174.9992275374513, y: 399.9992482809625},
    {x: 212.49934118045027, y: 400.0008611432412},
    {x: 250, y: 400},
    {x: 250.0009827838014, y: 362.4990743542388},
    {x: 250.00014263380737, y: 324.99932085870114},
    {x: 250.00082109078159, y: 287.49998963527196},
    {x: 250, y: 250},
    {x: 287.5006053712917, y: 250.00012153474847},
    {x: 325.00009933055566, y: 250.00066527528642},
    {x: 362.4998182599591, y: 249.99963057206617},
    {x: 400, y: 250},
    {x: 399.99935882457856, y: 212.4995594113115},
    {x: 400.00078110487993, y: 175.00004620398676},
    {x: 400.000201410308, y: 137.5009276161492},
    {x: 400, y: 100},
    {x: 324.9990349160498, y: 99.9991656587529},
    {x: 249.99966353428923, y: 99.99994063785533},
    {x: 174.9997539987238, y: 100.00025361789157},
];
