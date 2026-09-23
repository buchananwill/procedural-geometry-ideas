import {
    addNode,
    addVectors,
    angularResolution,
    conditioningBound,
    crossProduct,
    CROSS_PRODUCT_ROUNDING_UNITS,
    directionsAreSame,
    dotProduct,
    ensureBisectionIsInterior,
    handleInteriorEdgePair,
    initInteriorEdges,
    intersectRays,
    makeRay,
    makeStraightSkeletonSolverContext,
    negateVector,
    normalize,
    perceptualBound,
    rotateWs90,
    scaleVector,
    sineIsBelow,
    SKELETON_NOISE_FLOOR,
    UNIT_ROUNDOFF,
    vectorsAreEqual,
} from '@proc-geo/core';
import type {IntersectionType, Vector2} from '@proc-geo/core';

/**
 * ============================================================================
 *  THE ANGULAR RESOLUTION — spec A1–A14 and A23, journal decisions 134, 144, 145 and 146.
 * ============================================================================
 *
 * ONE angular bar, a FUNCTION of the client's perceptual floor δ:
 *
 *     angularResolution(δ) = max( √2·δ , sqrt(k·√2·u / δ) ),    u = 2⁻⁵³,  k = 2
 *
 * the larger of what the client can SEE (a turn of `√2·δ` moves a vertex δ off its chord on the
 * longest edge a unit region carries) and what the arithmetic can PRICE (an intersection divided by
 * a sine carrying `k·u` of absolute error lands within δ only above `sqrt(k·√2·u/δ)`). `k = 2` is
 * argued in `constants.ts` — the classical γ₂ bound on a two-term cross product of unit vectors,
 * valid at every angle — and it replaces the spec's estimated `4u` (spec I6).
 *
 * THIS FILE PINS THREE THINGS, and each dies to a different mutation:
 *
 *   1. THE DERIVATION, as arithmetic rather than as a decimal: each bound is its formula bit for
 *      bit, `conditioningBound(δ)²·δ` returns `k·√2·u` to the last ulp, `k` itself is convicted
 *      against an exact evaluation of the cross product, and the crossover is where the two bounds
 *      meet. Change `k`, drop the `max`, or swap either bound and a block below dies.
 *   2. THE ORDERING (spec A11): ONE bar is identity's and priceability's at once — ordering (i) at
 *      equality — so a pair just under the resolution is not priced and IS identical, and one at or
 *      over it is priced. The context computes that one bar once (spec A8).
 *   3. THE PARTITION (spec A14), as a sweep: every sine from 1e-12 to 1e-1 at every floor rung lands
 *      in exactly ONE cell — (a) priced, (b) same orientation below the resolution, closed or merged
 *      as identical, (c) opposed orientation below the resolution. A sine with no verdict is spec
 *      A25's STOP 2.
 *
 * CELL (c) SINCE DISPATCH 2 (spec A16, journal decision 150): an opposed pair below the resolution
 * is PRICED head-on when it is coaxial within the lane and approaching, and CLOSED at the leading
 * source by `solveParallelClosure`'s anti-parallel arm otherwise. Dispatch 1 pinned the table before
 * the arm, when a non-coaxial opposed pair was refused by every closure — the bisector test was
 * orientation-sensitive at any bar — and reached the coaxial completion or, with no pair pointing
 * together, the throw; that table is kept as history beside the one that replaced it.
 *
 * ----------------------------------------------------------------------------
 *  HISTORY — WHAT THIS FILE PINNED BEFORE 2026-09-23, KEPT SO THE RECORD IS NOT LOST
 * ----------------------------------------------------------------------------
 *
 * Under journal decision 105 this suite pinned the TWO laundered bars and the refusal to unify them:
 *
 *   - `PARALLEL_GATE_SINE_BAR = sqrt(ε(2 − ε)) = 1.4142e-4` as the EXACT sine-space restatement of
 *     `areEqual(|dot|, 1)` — `1 − |cos t| < ε ⟺ sin²t < ε(2 − ε)` — asserted to agree with the dot
 *     test at every orientation around the bar, and `DIRECTION_SINE_BAR = ε = 1e-8`, the epsilon read
 *     as a sine, four orders tighter;
 *   - that the two were NOT one number: collapsing the gate onto the identity bar moved 13 tests
 *     across 4 suites (every large-coordinate signature, the off-edge jitter class, the census gate),
 *     and collapsing the identity bar onto the gate stopped `seed 55433, k=4` solving;
 *   - the sine FORM (scale-free, isotropic, division-free, orientation separated) and the SYMMETRY of
 *     `intersectRays`' two collinearity exits, which had been asked at `1e-4` and `1e-8`.
 *
 * Both constants are RETIRED (journal decision 146): neither contains anything but the scratch
 * epsilon, which decision 144 supersedes everywhere. The form and the symmetry pins survive below,
 * restated against the derived resolution.
 */

/** The floor ladder of `perceptual-floor-option.test.ts`, spec A23. */
const FLOOR_LADDER = [SKELETON_NOISE_FLOOR, 3e-6, 1e-5, 3e-5, 1e-4];

/** `k·√2·u`, the product `conditioningBound` divides by the floor. Every factor is exact but √2. */
const CONDITIONING_NUMERATOR = CROSS_PRODUCT_ROUNDING_UNITS * Math.SQRT2 * UNIT_ROUNDOFF;

/** One unit in the last place of `x`. */
function ulp(x: number): number {
    return 2 ** (Math.floor(Math.log2(Math.abs(x))) - 52);
}

/** A unit vector at `radians` from the x-axis. */
function unit(radians: number): Vector2 {
    return {x: Math.cos(radians), y: Math.sin(radians)};
}

/** A unit vector whose sine against `base` is `sine` exactly in exact arithmetic, turned widdershins. */
function turnedBySine(base: Vector2, sine: number): Vector2 {
    return normalize({
        x: base.x * Math.sqrt(1 - sine * sine) - base.y * sine,
        y: base.y * Math.sqrt(1 - sine * sine) + base.x * sine,
    })[0];
}

describe('the derivation, pinned as arithmetic (spec A1–A4)', () => {
    it('reads u as the unit roundoff 2⁻⁵³ — half of Number.EPSILON — and k as 2', () => {
        expect(UNIT_ROUNDOFF).toBe(2 ** -53);
        expect(UNIT_ROUNDOFF).toBe(Number.EPSILON / 2);
        expect(CROSS_PRODUCT_ROUNDING_UNITS).toBe(2);
    });

    it.each(FLOOR_LADDER)('at δ = %p the perceptual bound is √2·δ, bit for bit', (floor) => {
        expect(perceptualBound(floor)).toBe(Math.SQRT2 * floor);
    });

    it.each(FLOOR_LADDER)('at δ = %p the conditioning bound is sqrt(k·√2·u / δ), bit for bit', (floor) => {
        expect(conditioningBound(floor)).toBe(Math.sqrt(2 * Math.SQRT2 * 2 ** -53 / floor));
    });

    it.each(FLOOR_LADDER)('at δ = %p conditioningBound(δ)²·δ returns k·√2·u to the last ulp', (floor) => {
        // The formula, not a decimal: square the bound back and multiply the floor in, and the
        // numerator comes back within ONE ulp on every rung (a correctly rounded division, square
        // root, square and product; the worst case over 1e-9..1e-2 is two ulps, never more).
        const bound = conditioningBound(floor);
        expect(Math.abs(bound * bound * floor - CONDITIONING_NUMERATOR))
            .toBeLessThanOrEqual(ulp(CONDITIONING_NUMERATOR));
    });

    it.each(FLOOR_LADDER)('at δ = %p the resolution is the larger of the two bounds', (floor) => {
        expect(angularResolution(floor))
            .toBe(Math.max(perceptualBound(floor), conditioningBound(floor)));
    });

    it('crosses over at δ* = (k·u/√2)^(1/3) — (√2·u)^(1/3) ≈ 5.39e-6 — where the bar is 2⁻¹⁷', () => {
        // √2·δ = sqrt(k√2u/δ)  ⟺  δ³ = k·u/√2. At k = 2 that is √2·u, and the bar there is
        // √2·(√2·u)^(1/3) = 2^(1/2 − 52.5/3) = 2⁻¹⁷ in exact arithmetic.
        const crossover = Math.cbrt(Math.SQRT2 * UNIT_ROUNDOFF);
        expect(crossover).toBeCloseTo(5.3948e-6, 9);
        expect(Math.abs(perceptualBound(crossover) - conditioningBound(crossover)))
            .toBeLessThanOrEqual(2 * ulp(conditioningBound(crossover)));
        expect(angularResolution(crossover)).toBeCloseTo(2 ** -17, 18);

        // Below it conditioning governs, above it perception — the `max` is live on both sides.
        expect(conditioningBound(crossover * 0.99)).toBeGreaterThan(perceptualBound(crossover * 0.99));
        expect(perceptualBound(crossover * 1.01)).toBeGreaterThan(conditioningBound(crossover * 1.01));
    });

    it('governs by conditioning at the library floor and by perception at the demo floor', () => {
        // Spec A4 in numbers, at k = 2: 1.7721e-5 at 1e-6 (12.5× the perceptual bound), and the
        // perceptual 1.4142e-5 at 1e-5.
        expect(angularResolution(SKELETON_NOISE_FLOOR)).toBe(conditioningBound(SKELETON_NOISE_FLOOR));
        expect(angularResolution(SKELETON_NOISE_FLOOR)).toBeCloseTo(1.77206e-5, 9);
        expect(angularResolution(1e-5)).toBe(perceptualBound(1e-5));
        expect(angularResolution(1e-5)).toBeCloseTo(1.41421e-5, 9);
    });
});

describe('k = 2 is a bound on the evaluated cross product, convicted against its exact value', () => {
    /*
     * THE ARGUMENT IN `constants.ts`, MEASURED. The exact value of `a.x·b.y − b.x·a.y` on the stored
     * doubles is recovered with error-free transformations — Dekker's TwoProduct by Veltkamp
     * splitting (no FMA in JavaScript) and Knuth's TwoSum — so the evaluation error of the solver's
     * own `crossProduct` is known exactly and checked against the derived bound
     * `u·(|P| + |Q|) + u·|ĉ|`, which is at most `2u` on unit vectors.
     */
    const SPLITTER = 2 ** 27 + 1;
    const split = (a: number): [number, number] => {
        const c = SPLITTER * a;
        const high = c - (c - a);
        return [high, a - high];
    };
    const twoProduct = (a: number, b: number): [number, number] => {
        const p = a * b;
        const [aHigh, aLow] = split(a);
        const [bHigh, bLow] = split(b);
        return [p, ((aHigh * bHigh - p) + aHigh * bLow + aLow * bHigh) + aLow * bLow];
    };
    const twoSum = (a: number, b: number): [number, number] => {
        const s = a + b;
        const bVirtual = s - a;
        return [s, (a - (s - bVirtual)) + (b - bVirtual)];
    };

    /** `crossProduct(a, b)` and its exact evaluation error, as `[computed, error, |P| + |Q|]`. */
    function crossError(a: Vector2, b: Vector2): [number, number, number] {
        const [p, pLow] = twoProduct(a.x, b.y);
        const [q, qLow] = twoProduct(b.x, a.y);
        const [computed, subtractionLow] = twoSum(p, -q);
        // exact = (p + pLow) − (q + qLow) = computed + subtractionLow + pLow − qLow
        return [computed, -(subtractionLow + pLow - qLow), Math.abs(p) + Math.abs(q)];
    }

    /** A deterministic generator, so the sample is the same on every run. */
    function makeRandom(seed: number): () => number {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) | 0;
            let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
            mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
            return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
        };
    }

    it('never exceeds u·(|P| + |Q|) + u·|ĉ|, nor 2u, over 50 000 unit pairs at every angle', () => {
        const random = makeRandom(146);
        let worstInU = 0;
        for (let sample = 0; sample < 50_000; sample++) {
            const a = unit(random() * 2 * Math.PI);
            // Half the sample near-parallel (sine down to 1e-12), half at any angle.
            const angle = sample % 2 === 0
                ? (random() < 0.5 ? 1 : -1) * 10 ** (-12 + 11 * random())
                : random() * 2 * Math.PI;
            const b = unit(Math.atan2(a.y, a.x) + angle);
            const [computed, error, magnitudes] = crossError(a, b);
            expect(Math.abs(error)).toBeLessThanOrEqual(
                UNIT_ROUNDOFF * magnitudes + UNIT_ROUNDOFF * Math.abs(computed));
            worstInU = Math.max(worstInU, Math.abs(error) / UNIT_ROUNDOFF);
        }
        expect(worstInU).toBeLessThanOrEqual(CROSS_PRODUCT_ROUNDING_UNITS);
    });

    it('is exact in the subtraction where Sterbenz applies, so the near-parallel error is at most u', () => {
        // Same-sign products within a factor of two: the subtraction is exact and only the two
        // product roundings remain, bounded by u·(|P| + |Q|) ≤ u.
        const random = makeRandom(1446);
        for (let sample = 0; sample < 20_000; sample++) {
            const a = unit(Math.PI / 8 + random() * Math.PI / 4);
            const b = unit(Math.atan2(a.y, a.x) + 10 ** (-10 + 6 * random()));
            const [, error, magnitudes] = crossError(a, b);
            expect(Math.abs(error)).toBeLessThanOrEqual(UNIT_ROUNDOFF * magnitudes);
        }
    });
});

describe('ONE bar, computed once, stated at every call (spec A8, A11, A15)', () => {
    it.each(FLOOR_LADDER)('the context at δ = %p carries angularResolution(δ), computed there', (floor) => {
        const context = makeStraightSkeletonSolverContext(
            [{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 1, y: 0}], floor);
        expect(context.angularResolution).toBe(angularResolution(floor));
    });

    it('the context defaults to the library floor\'s resolution', () => {
        const context = makeStraightSkeletonSolverContext([{x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}, {x: 1, y: 0}]);
        expect(context.angularResolution).toBe(angularResolution(SKELETON_NOISE_FLOOR));
    });

    it('has no default bar left on either predicate: every caller states one', () => {
        // A parameter with a default does not count toward `Function.length`, so a restored default
        // bar reads as arity 2 here.
        expect(sineIsBelow.length).toBe(3);
        expect(directionsAreSame.length).toBe(3);
        expect(intersectRays.length).toBe(4);
    });

    it.each(FLOOR_LADDER)('at δ = %p a sine just under the bar is IDENTICAL and just over it is PRICED', (floor) => {
        // Ordering (i) at equality: identity's bar and priceability's bar are the same double, so
        // there is no band in which a pair is neither.
        const bar = angularResolution(floor);
        const base = unit(0.3);
        const under = turnedBySine(base, bar * 0.99);
        const over = turnedBySine(base, bar * 1.01);

        expect(directionsAreSame(base, under, bar)).toBe(true);
        expect(sineIsBelow(base, under, bar)).toBe(true);
        expect(directionsAreSame(base, over, bar)).toBe(false);
        expect(sineIsBelow(base, over, bar)).toBe(false);

        const source = {x: 0, y: 0};
        const across = scaleVector(rotateWs90(base), 0.5);
        expect(intersectRays(makeRay(source, base), makeRay(across, under), floor, bar)[2])
            .toBe<IntersectionType>('parallel');
        expect(['converging', 'diverging'])
            .toContain(intersectRays(makeRay(source, base), makeRay(across, over), floor, bar)[2]);
    });
});

describe('ensureBisectionIsInterior asks "is this vertex straight?" at the resolution (spec A15, A20)', () => {
    /*
     * On the RAW parent directions, which carry no weight. A turn of 1.5e-8 — past the retired 1e-8
     * bar and far inside the resolution — is straight, so the bisection is not flipped; a turn of
     * twice the resolution is a turn, and a widdershins one is flipped. (The rate's own zero test in
     * `addBisectionEdge` stays at the scratch epsilon, measured at its site; D14 stays open.)
     */
    const bar = angularResolution(SKELETON_NOISE_FLOOR);
    const edge = (id: number, basisVector: Vector2) => ({id, source: id, basisVector});
    const bisected = {x: 0, y: 1};

    it('leaves a sub-resolution turn unflipped, whichever way its sign reads', () => {
        const clockwise = edge(0, {x: 1, y: 0});
        for (const sine of [1.5e-8, -1.5e-8, bar * 0.5, -bar * 0.5]) {
            const widdershins = edge(1, turnedBySine({x: -1, y: 0}, sine));
            expect(ensureBisectionIsInterior(clockwise, widdershins, bisected, bar)).toEqual(bisected);
        }
    });

    it('flips a widdershins turn past the resolution, and only that one', () => {
        const clockwise = edge(0, {x: 1, y: 0});
        const widdershinsTurn = edge(1, turnedBySine({x: -1, y: 0}, bar * 2));
        const clockwiseTurn = edge(1, turnedBySine({x: -1, y: 0}, -bar * 2));
        expect(crossProduct(clockwise.basisVector, widdershinsTurn.basisVector)).toBeLessThan(0);
        expect(ensureBisectionIsInterior(clockwise, widdershinsTurn, bisected, bar)).toEqual(negateVector(bisected));
        expect(ensureBisectionIsInterior(clockwise, clockwiseTurn, bisected, bar)).toEqual(bisected);
    });
});

/*
 * ----------------------------------------------------------------------------
 *  THE PARTITION (spec A14), SWEPT
 * ----------------------------------------------------------------------------
 */

type Cell = 'a: priced' | 'b: identical — closed or merged' | 'c: opposed — head-on or closed';

/**
 * The cell a pair at `sine` lands in at floor δ, read off the solver's own predicates.
 *
 * A pair is built twice for each sine and orientation — sources a unit apart along the first ray
 * (coaxial) and half a unit across it (not coaxial) — and every one of the four rays sets must give a
 * verdict that belongs to exactly one cell:
 *
 *   (a) `intersectRays` prices it: 'converging' or 'diverging'.
 *   (b) same orientation, not priced: 'co-linear-from-1/2' (merged onto the leading source) or
 *       'parallel' — and `directionsAreSame` at the bar holds, which is `solveParallelClosure`'s
 *       bisector test, so the closure can take it.
 *   (c) opposed orientation, not priced: 'head-on' (priced as a head-on meeting by `meetHeadOn`) or
 *       'parallel' — parallel to within the bar (`sineIsBelow`) with a negative dot, the set spec
 *       A16's anti-parallel arm reads: a 'head-on' pair is priced, and a 'parallel' one is closed at
 *       the leading source. What the solver then does with each is pinned by the table below.
 */
function cellOf(sine: number, opposed: boolean, floor: number): Cell[] {
    const bar = angularResolution(floor);
    const base = unit(0.7);
    const turned = turnedBySine(base, sine);
    const second = opposed ? negateVector(turned) : turned;
    const cells: Cell[] = [];

    const sourcePlacements = [
        opposed ? scaleVector(base, 1) : scaleVector(base, -1),
        scaleVector(rotateWs90(base), 0.5),
    ];
    for (const secondSource of sourcePlacements) {
        const [, , type] = intersectRays(makeRay({x: 0, y: 0}, base), makeRay(secondSource, second), floor, bar);
        const candidates: Cell[] = [];
        if (type === 'converging' || type === 'diverging') {
            candidates.push('a: priced');
        }
        if ((type === 'co-linear-from-1' || type === 'co-linear-from-2' || type === 'parallel')
            && dotProduct(base, second) > 0 && directionsAreSame(base, second, bar)) {
            candidates.push('b: identical — closed or merged');
        }
        if ((type === 'head-on' || type === 'parallel')
            && dotProduct(base, second) < 0
            && !directionsAreSame(base, second, bar)
            && sineIsBelow(base, second, bar)) {
            candidates.push('c: opposed — head-on or closed');
        }
        // EXACTLY ONE verdict per ray pair — none is spec A25's STOP 2, two is a band.
        expect(candidates).toHaveLength(1);
        cells.push(candidates[0]);
    }
    return cells;
}

/**
 * What the SOLVER does with an opposed pair of cell (c) — `cellOf`'s two placements (0: coaxial,
 * sources a unit apart along the first ray; 1: across, half a unit to its side), run through the
 * two-edge handler at the library floor.
 *
 * The pair is planted in a context whose walls are all parallel (a ring of three collinear vertices,
 * the construction `terminal-cases.test.ts` uses), so the parallel closure's parent gate passes and
 * the verdict is the ladder's own: 'priced head-on' (cross-wired), 'completion' (spec A19),
 * 'throw', or 'closed at the leading source' (spec A16's arm, a culled anchor).
 */
function opposedPairOutcome(sine: number, placement: 0 | 1): string {
    const context = makeStraightSkeletonSolverContext(
        [{x: 0, y: -1}, {x: 5, y: -1}, {x: 10, y: -1}], SKELETON_NOISE_FLOOR);
    initInteriorEdges(context);
    const pair = context.graph.interiorEdges.slice(0, 2).map(edge => edge.id);
    const base = unit(0.7);
    const origin = {x: 2, y: 3};
    const secondSource = placement === 0 ? scaleVector(base, 1) : scaleVector(rotateWs90(base), 0.5);
    const rays: [Vector2, Vector2][] = [
        [origin, base],
        [addVectors(origin, secondSource), negateVector(turnedBySine(base, sine))],
    ];
    pair.forEach((edgeId, index) => {
        const edge = context.getEdgeWithId(edgeId);
        edge.source = addNode(rays[index][0], context.graph);
        context.graph.nodes[edge.source].outEdges.push(edgeId);
        edge.basisVector = rays[index][1];
    });

    try {
        handleInteriorEdgePair(context, {interiorEdges: pair});
    } catch {
        return 'throw';
    }
    if (context.diagnostics.some(d => d.kind === 'coaxial-completion')) {
        return 'completion';
    }
    const [first, second] = pair.map(id => context.getEdgeWithId(id));
    if (pair.some(id => context.getInteriorWithId(id).culled === true)) {
        return 'closed at the leading source';
    }
    return first.target === second.source && second.target === first.source ? 'priced head-on' : 'unclassified';
}

/** 1e-12 to 1e-1, eight samples a decade, plus each rung's own bar and its immediate neighbours. */
function sweptSines(floor: number): number[] {
    const sines: number[] = [];
    for (let exponent = -12; exponent <= -1; exponent += 1 / 8) {
        sines.push(10 ** exponent);
    }
    const bar = angularResolution(floor);
    sines.push(bar * (1 - 1e-9), bar * (1 + 1e-9), bar * 0.5, bar * 2);
    return sines.toSorted((a, b) => a - b);
}

describe('the sine partition: every sine in exactly one cell, at every floor rung (spec A14, A23)', () => {
    it.each(FLOOR_LADDER)('at δ = %p no sine from 1e-12 to 1e-1 is without a verdict, or has two', (floor) => {
        const bar = angularResolution(floor);
        for (const sine of sweptSines(floor)) {
            for (const opposed of [false, true]) {
                const cells = cellOf(sine, opposed, floor);
                // Both placements of one sine and orientation agree about the cell: coaxiality moves
                // a pair within its cell, never across one.
                expect(new Set(cells).size).toBe(1);

                // AND THE CELL IS THE ONE THE RESOLUTION NAMES, read off the vectors actually built
                // (`turnedBySine` rounds, so the sine is re-measured rather than assumed).
                const expected: Cell = !sineIsBelow(unit(0.7), turnedBySine(unit(0.7), sine), bar)
                    ? 'a: priced'
                    : opposed ? 'c: opposed — head-on or closed' : 'b: identical — closed or merged';
                expect(cells[0]).toBe(expected);
            }
        }
    });

    it('pins the dispatch-2 table: at the library floor every opposed sine under 1.7721e-5 is priced head-on or closed', () => {
        // SPEC A16's ARM FLIPPED THIS TABLE (journal decision 150). Each cell-(c) row names what the
        // solver does with both of `cellOf`'s placements. COAXIAL — sources a unit apart along the
        // first ray, so the symmetric lateral is the sine itself: inside the 1e-6 lane the pair is
        // PRICED head-on (cross-wired), and past it, at 1e-5 and 1.7e-5, it is CLOSED at the leading
        // source. ACROSS — half a unit to the side, never coaxial: CLOSED at the leading source at
        // every sine, the first source being the one the second ray reaches forward.
        //
        // HISTORY, NOT A PIN — the same rows before the arm, measured on `85f45a8`: coaxial 1e-12 to
        // 1e-6 priced head-on, 1e-5 and 1.7e-5 reaching the COMPLETION; across, every row reaching
        // the THROW (the level pair points together in neither direction, so the completion had no
        // candidate).
        const rows = [1e-12, 1e-9, 1e-7, 1e-6, 1e-5, 1.7e-5, 1.8e-5, 1e-4, 1e-1].map(sine => {
            const cell = cellOf(sine, true, SKELETON_NOISE_FLOOR)[1];
            return cell === 'a: priced'
                ? `${sine}: ${cell}`
                : `${sine}: ${cell} | coaxial: ${opposedPairOutcome(sine, 0)} | across: ${opposedPairOutcome(sine, 1)}`;
        });
        expect(rows).toEqual([
            '1e-12: c: opposed — head-on or closed | coaxial: priced head-on | across: closed at the leading source',
            '1e-9: c: opposed — head-on or closed | coaxial: priced head-on | across: closed at the leading source',
            '1e-7: c: opposed — head-on or closed | coaxial: priced head-on | across: closed at the leading source',
            '0.000001: c: opposed — head-on or closed | coaxial: priced head-on | across: closed at the leading source',
            '0.00001: c: opposed — head-on or closed | coaxial: closed at the leading source | across: closed at the leading source',
            '0.000017: c: opposed — head-on or closed | coaxial: closed at the leading source | across: closed at the leading source',
            '0.000018: a: priced',
            '0.0001: a: priced',
            '0.1: a: priced',
        ]);
    });
});

describe('the sine form is scale-free where the normalised box is not', () => {
    /*
     * THE REASON THE FORM CHANGED AND NOT ONLY THE NAME (journal decision 105), restated at the
     * derived bar. The division-free form asks the question of the raw vector, so the verdict cannot
     * depend on how far away the candidate happens to be, nor on its orientation in the plane.
     */
    const bar = angularResolution(SKELETON_NOISE_FLOOR);

    it('gives one verdict for a separation and every scaled copy of it', () => {
        const basis = normalize({x: 3, y: 4})[0];
        const offRay = turnedBySine(basis, bar * 3);

        for (const scale of [1e-12, 1e-6, 1e-3, 1, 1e3, 1e6]) {
            expect(directionsAreSame(scaleVector(basis, scale), basis, bar)).toBe(true);
            expect(directionsAreSame(scaleVector(offRay, scale), basis, bar)).toBe(false);
        }
    });

    it('is isotropic, where the component-wise box was up to sqrt(2) looser on the diagonal', () => {
        const angle = 1.2e-8;
        const axisPair = [unit(0), unit(angle)] as const;
        const diagonalPair = [unit(Math.PI / 4), unit(Math.PI / 4 + angle)] as const;

        expect(vectorsAreEqual(axisPair[0], axisPair[1])).toBe(false);
        expect(vectorsAreEqual(diagonalPair[0], diagonalPair[1])).toBe(true);

        const tight = 1e-8;
        expect(sineIsBelow(...axisPair, tight)).toBe(sineIsBelow(...diagonalPair, tight));
        expect(sineIsBelow(...axisPair, tight)).toBe(false);
    });

    it('separates parallelism from orientation, and takes the sign exactly', () => {
        const a = unit(0);
        const antiParallel = negateVector(a);
        expect(sineIsBelow(a, antiParallel, bar)).toBe(true);
        expect(directionsAreSame(a, antiParallel, bar)).toBe(false);
    });

    it('refuses a zero-length operand rather than calling it parallel to everything', () => {
        expect(sineIsBelow({x: 0, y: 0}, unit(0), bar)).toBe(false);
        expect(directionsAreSame({x: 0, y: 0}, unit(0), bar)).toBe(false);
    });

    it('is the polynomial, not a division: |cross| against bar * |a| * |b|', () => {
        const a = {x: 2, y: 0};
        const b = {x: 1e-9, y: 1};
        expect(sineIsBelow(a, b, 1e-3))
            .toBe(Math.abs(crossProduct(a, b)) < 1e-3 * 2 * Math.hypot(1e-9, 1));
    });
});

describe("intersectRays' two collinearity exits ask the coaxial question, from both ends alike", () => {
    /*
     * SPEC A15's ROW, LANDED IN DISPATCH 2 (journal decisions 147(e) and 150). 'co-linear-from-1' and
     * 'co-linear-from-2' ask whether two same-way sources lie on ONE LINE — the coaxiality question
     * (spec A9), a DISTANCE — so they take `sourceLiesAhead`'s form: the forward sign exact, and the
     * SYMMETRIC lateral within the coaxiality lane, the client's floor. They share one bar and one
     * lateral, so they remain mirror images (journal decision 105): a pair reaches a collinear verdict
     * from both ends or from neither.
     *
     * RE-POINTED FROM A TILT TO A LATERAL. Dispatch 1 swept the ray TILT at sources ten units apart and
     * asserted a collinear verdict everywhere under the angular resolution — the SINE form, whose lateral
     * bar is `|sep| · resolution`, 1.8e-4 at that separation. Under the coaxial form a tilt of 1e-6 at
     * ten units is a lateral of 1e-5, ten times the lane, and is 'parallel'. The sweep is now over the
     * lateral itself, at half a unit's separation, which is what the question is about.
     */
    const bar = angularResolution(SKELETON_NOISE_FLOOR);
    const along = unit(0.3);
    const SEPARATION = 0.5;

    /** Both orderings of two same-way rays `SEPARATION` apart along `along` and `lateral` across it. */
    const collinearVerdicts = (lateral: number): string[] => {
        const first = {x: 0, y: 0};
        const second = addVectors(scaleVector(along, SEPARATION), scaleVector(rotateWs90(along), lateral));
        return [[first, second], [second, first]].map(([one, other]) =>
            intersectRays(makeRay(one, along), makeRay(other, along), SKELETON_NOISE_FLOOR, bar)[2]);
    };

    it.each([0, 1e-12, 1e-9, 1e-7, 0.99e-6])(
        'reaches a collinear verdict from both ends at a lateral of %p, inside the lane',
        (lateral) => {
            expect(collinearVerdicts(lateral).every(type => type.startsWith('co-linear'))).toBe(true);
        },
    );

    it.each([1.01e-6, 2e-6, 5e-6])(
        'refuses a collinear verdict from either end at a lateral of %p, past the lane, though its sine is inside the resolution',
        (lateral) => {
            // The sine of the separation against the basis is lateral / 0.5 — at most 1e-5, inside the
            // 1.7721e-5 resolution — so the retired sine form called every one of these collinear.
            expect(lateral / SEPARATION).toBeLessThan(bar);
            expect(collinearVerdicts(lateral)).toEqual(['parallel', 'parallel']);
        },
    );

    it('is decided by the lateral and not by the separation: ten units apart, a 1e-6 tilt is parallel', () => {
        // Dispatch 1's own cell, which the sine form called collinear.
        const tilted = unit(1e-6);
        const verdicts = [[{x: 0, y: 0}, {x: 10, y: 0}], [{x: 10, y: 0}, {x: 0, y: 0}]].map(([one, other]) =>
            intersectRays(makeRay(one, tilted), makeRay(other, tilted), SKELETON_NOISE_FLOOR, bar)[2]);
        expect(verdicts).toEqual(['parallel', 'parallel']);
    });
});
