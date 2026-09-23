import {
    ANTI_PARALLEL_CORRIDOR_ABOVE_FLOOR,
    ANTI_PARALLEL_CORRIDOR_COAXIAL,
    ANTI_PARALLEL_CORRIDOR_FAMILY,
    ANTI_PARALLEL_CORRIDOR_IN_BAND,
    ANTI_PARALLEL_CORRIDOR_SUB_EPSILON,
} from '@proc-geo/test-fixtures';
import type {AntiParallelCorridorFixture} from '@proc-geo/test-fixtures';
import {
    addNode,
    addVectors,
    checkWavefrontCausality,
    dotProduct,
    handleInteriorEdgePair,
    handleInteriorEdgeTriangle,
    handleInteriorNGon,
    initInteriorEdges,
    makeSkeletonNormalisation,
    makeStraightSkeletonSolverContext,
    negateVector,
    normalisePolygon,
    normalize,
    rotateWs90,
    scaleVector,
    sineIsBelow,
    SKELETON_NOISE_FLOOR,
    stepAlgorithm,
    tryToAcceptExteriorEdge,
} from '@proc-geo/core';
import type {AlgorithmStepInput, StraightSkeletonSolverContext, Vector2} from '@proc-geo/core';

/**
 * ============================================================================
 *  THE ANTI-PARALLEL CORRIDOR — spec A16 and A24, journal decision 150.
 * ============================================================================
 *
 * A corridor is a sub-polygon whose live bisectors are all parallel to within the angular resolution
 * while travelling in OPPOSED orientations, between walls that are all parallel. Its two mid-lines
 * either lie on one line — within the coaxiality lane, the client's floor — and meet head-on, or they
 * do not, and then no event exists for them at all: two anti-parallel rays on different lines pass
 * each other.
 *
 * THE HARNESS. The family (see the fixture header in `rectilinear-shapes.ts`) is `COLLINEAR_DUMBBELL`
 * PLUS a recorded displacement δ of the bar's second mid-line source, across the bar, in unit space.
 * Three harnesses read a verdict off the solver itself:
 *
 *   - FAMILY: the ring solved step by step, the second mid-line's node moved by δ as the corridor pair
 *     is born, and the rest of the solve run to the end — so each cell also reports whether the solve
 *     completes and what the solver's own causality check says of the graph;
 *   - R0.2.1: `r0.2.1`'s own corridor rays (direction `(1, 6.65e-6)`, anti-parallel to one ulp,
 *     sources 0.5 apart — journal F57, spec I5) planted in place of the family's pair, stepped by the
 *     two-edge handler alone;
 *   - ARITY: the family's pair planted with one or two further rays in a context whose walls are all
 *     parallel, stepped by the triangle and n-gon handlers — decision 145's ladder is edge-count
 *     independent, so the arm is convicted at every arity.
 *
 * Every cell reads one of:
 *
 *   - 'head-on' — the pair is priced as meeting (cross-wired by the pair handler; priced by the
 *     completion at the triangle and n-gon arities, where exactly parallel walls give both mid-lines a
 *     zero offset rate and `meetHeadOn` has no time to return — the completion's diagnostic names a
 *     pair INSIDE the lane);
 *   - 'orphan-to-completion' — outside the lane, no event and no closure, rescued by the coaxial
 *     completion (spec A19) pricing a pair OUTSIDE the lane as head-on;
 *   - 'orphan-to-throw' — no event, no closure, no candidate: the handler throws;
 *   - 'closed at the leading source' — spec A16's arm.
 */

type Verdict = 'head-on' | 'orphan-to-completion' | 'orphan-to-throw' | 'closed at the leading source';

/** The two floors every sweep here runs at: the library floor and the demo floor. */
const FLOORS = [SKELETON_NOISE_FLOOR, 1e-5];

/** The lateral offsets swept, spec A23 / decision 150: r0.2.1's 2.754e-8 among them. */
const DELTAS = [0, 5e-9, 1e-8, 2.754e-8, 1e-7, 1e-6, 5e-6, 1e-4];

/** `r0.2.1`'s corridor direction in unit space (journal F57; its y-component is F56's misread "sine"). */
const R021_CORRIDOR = normalize({x: 1, y: 6.65e-6})[0];

/** Are this bisector's two exterior parents parallel and opposed — is it a corridor mid-line? */
function isCorridorMidLine(context: StraightSkeletonSolverContext, edgeId: number): boolean {
    const interior = context.getInteriorWithId(edgeId);
    const clockwise = context.getEdgeWithId(interior.clockwiseExteriorEdgeIndex).basisVector;
    const widdershins = context.getEdgeWithId(interior.widdershinsExteriorEdgeIndex).basisVector;
    return sineIsBelow(clockwise, widdershins, context.angularResolution) && dotProduct(clockwise, widdershins) < 0;
}

/** The number of `coaxial-completion` diagnostics, split by whether the named pair was in the lane. */
function completionVerdict(context: StraightSkeletonSolverContext): Verdict | undefined {
    const completions = context.diagnostics.filter(d => d.kind === 'coaxial-completion');
    if (completions.length === 0) {
        return undefined;
    }
    const offsets = completions.map(d => Number(/lateral offset of (\S+) against/.exec(d.detail)![1]));
    return offsets.every(offset => offset <= context.coaxialityFloor) ? 'head-on' : 'orphan-to-completion';
}

/** The verdict on the corridor pair `[first, second]` after its handler ran (or threw). */
function pairVerdict(context: StraightSkeletonSolverContext, [first, second]: number[], threw: boolean): Verdict | string {
    if (threw) {
        return 'orphan-to-throw';
    }
    const completion = completionVerdict(context);
    if (completion !== undefined) {
        return completion;
    }
    const firstEdge = context.getEdgeWithId(first);
    const secondEdge = context.getEdgeWithId(second);
    const firstCulled = context.getInteriorWithId(first).culled === true;
    const secondCulled = context.getInteriorWithId(second).culled === true;
    if (!firstCulled && !secondCulled
        && firstEdge.target === secondEdge.source && secondEdge.target === firstEdge.source) {
        return 'head-on';
    }
    if (firstCulled !== secondCulled) {
        return 'closed at the leading source';
    }
    return `unclassified: targets ${firstEdge.target} / ${secondEdge.target}`;
}

interface FamilyCell {
    verdict: Verdict | string;
    complete: boolean;
    /** The solver's own causality check over the finished graph (journal decision 148), in unit space. */
    causality: number;
}

/**
 * THE FAMILY HARNESS: solve `fixture`'s ring in unit space, and as the corridor pair is born move its
 * second mid-line's node across the corridor by `delta`, then run the solve to the end.
 *
 * Moving the NODE, not re-sourcing the edge, is the construction: a near-simultaneous upstream event
 * displaces the node the coincidence merge places, and everything incident to it moves with it.
 */
function solveFamilyCell(fixture: AntiParallelCorridorFixture, delta: number, floor: number): FamilyCell {
    const ring = normalisePolygon(fixture.vertices, makeSkeletonNormalisation(fixture.vertices));
    const context = makeStraightSkeletonSolverContext(ring, floor);
    initInteriorEdges(context);
    const exteriorIds = context.graph.edges.slice(0, context.graph.numExteriorNodes).map(edge => edge.id);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(edge => edge.id)}];
    let pair: number[] | undefined;
    let threw = false;
    while (inputs.length > 0) {
        const corridor = inputs.find(input => input.interiorEdges.length === 2
            && input.interiorEdges.every(id => isCorridorMidLine(context, id)));
        if (pair === undefined && corridor !== undefined) {
            pair = corridor.interiorEdges;
            const node = context.graph.nodes[context.getEdgeWithId(pair[1]).source];
            node.position = {x: node.position.x, y: node.position.y + delta};
        }
        const output = stepAlgorithm(context, inputs);
        threw ||= (output.errors ?? []).length > 0;
        inputs = output.childSteps;
        exteriorIds.forEach(id => tryToAcceptExteriorEdge(context, id));
    }

    expect(pair).toBeDefined();
    return {
        verdict: pairVerdict(context, pair!, threw),
        complete: exteriorIds.every(id => context.isAccepted(id)),
        causality: checkWavefrontCausality(context.graph, floor, 1).length,
    };
}

/** The family's ring solved to the step at which its corridor pair is born, and that pair. */
function corridorPairOf(floor: number): {context: StraightSkeletonSolverContext; input: AlgorithmStepInput} {
    const {vertices} = ANTI_PARALLEL_CORRIDOR_COAXIAL;
    const ring = normalisePolygon(vertices, makeSkeletonNormalisation(vertices));
    const context = makeStraightSkeletonSolverContext(ring, floor);
    initInteriorEdges(context);
    const children = stepAlgorithm(context, [{interiorEdges: context.graph.interiorEdges.map(edge => edge.id)}]).childSteps;
    const input = children.find(child => child.interiorEdges.length === 2
        && child.interiorEdges.every(id => isCorridorMidLine(context, id)));
    expect(input).toBeDefined();
    return {context, input: input!};
}

/**
 * THE R0.2.1 HARNESS: `r0.2.1`'s two mid-line rays, `delta` apart laterally, planted in place of the
 * family's corridor pair — whose walls are exactly parallel, so the closure's parent gate passes — and
 * stepped by the two-edge handler.
 */
function r021Cell(delta: number, floor: number): Verdict | string {
    const {context, input} = corridorPairOf(floor);
    const [firstId, secondId] = input.interiorEdges;
    const first = context.getEdgeWithId(firstId);
    const second = context.getEdgeWithId(secondId);
    const firstSource = context.graph.nodes[first.source].position;
    const secondNode = addNode(addVectors(
        addVectors(firstSource, scaleVector(R021_CORRIDOR, 0.5)),
        scaleVector(rotateWs90(R021_CORRIDOR), delta)), context.graph);
    first.basisVector = R021_CORRIDOR;
    second.source = secondNode;
    second.basisVector = negateVector(R021_CORRIDOR);
    context.graph.nodes[secondNode].outEdges.push(secondId);

    let threw = false;
    try {
        handleInteriorEdgePair(context, input);
    } catch {
        threw = true;
    }
    return pairVerdict(context, input.interiorEdges, threw);
}

/*
 * THE ARITY HARNESS. A ring of collinear vertices gives every bisector parallel parents, so the parent
 * gate passes and the rays can be placed freely (the construction `terminal-cases.test.ts` uses). The
 * family's pair sits on y = 0, so the second source's displacement is exactly δ, with the ring a
 * unit below it; the third ray trails the first on another line, and the n-gon's fourth trails the
 * second.
 */
const ARITY_RINGS: Record<3 | 4, Vector2[]> = {
    3: [{x: 0, y: -1}, {x: 5, y: -1}, {x: 10, y: -1}],
    4: [{x: 0, y: -1}, {x: 3, y: -1}, {x: 6, y: -1}, {x: 10, y: -1}],
};

function arityRays(delta: number): [Vector2, Vector2][] {
    return [
        [{x: 2.2, y: 0}, {x: 1, y: 0}],
        [{x: 2.6, y: delta}, {x: -1, y: 0}],
        [{x: 2.0, y: 0.2}, {x: 1, y: 0}],
        [{x: 2.8, y: -0.2}, {x: -1, y: 0}],
    ];
}

function arityCell(arity: 3 | 4, delta: number, floor: number): Verdict | string {
    const context = makeStraightSkeletonSolverContext(ARITY_RINGS[arity], floor);
    initInteriorEdges(context);
    const ids = context.graph.interiorEdges.map(edge => edge.id);
    const rays = arityRays(delta);
    ids.forEach((id, index) => {
        const edge = context.getEdgeWithId(id);
        edge.source = addNode(rays[index][0], context.graph);
        context.graph.nodes[edge.source].outEdges.push(id);
        edge.basisVector = rays[index][1];
    });

    let threw = false;
    try {
        if (arity === 3) {
            handleInteriorEdgeTriangle(context, {interiorEdges: ids});
        } else {
            handleInteriorNGon(context, {interiorEdges: ids});
        }
    } catch {
        threw = true;
    }
    if (threw) {
        return 'orphan-to-throw';
    }
    const completion = completionVerdict(context);
    if (completion !== undefined) {
        return completion;
    }
    return ids.some(id => context.getInteriorWithId(id).culled === true)
        ? 'closed at the leading source'
        : 'unclassified';
}

/** Every cell of the sweep, one row each, in a fixed order. */
function sweepRows(): string[] {
    const rows: string[] = [];
    for (const floor of FLOORS) {
        for (const delta of DELTAS) {
            const family = solveFamilyCell(ANTI_PARALLEL_CORRIDOR_COAXIAL, delta, floor);
            rows.push(`floor ${floor}, δ ${delta}: family ${family.verdict}; r0.2.1 ${r021Cell(delta, floor)}; `
                + `triangle ${arityCell(3, delta, floor)}; n-gon ${arityCell(4, delta, floor)}`);
        }
    }
    return rows;
}

/**
 * HISTORY, NOT A PIN: THE TABLE BEFORE SPEC A16's ARM — measured on `85f45a8` and asserted by this
 * file, green, before the arm was written. Every cell inside the lane was head-on (dispatch 1's cure of
 * the band `(1e-8, 1e-6]`); every cell outside it was an ORPHAN that only the coaxial completion
 * rescued, at every arity. The table the solver reads today is this one with each orphan replaced by
 * 'closed at the leading source' — {@link flippedByTheArm} — and nothing else moved.
 */
const PRE_ARM_TABLE = [
    'floor 0.000001, δ 0: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 5e-9: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 1e-8: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 2.754e-8: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 1e-7: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 0.000001: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.000001, δ 0.000005: family orphan-to-completion; r0.2.1 orphan-to-completion; triangle orphan-to-completion; n-gon orphan-to-completion',
    'floor 0.000001, δ 0.0001: family orphan-to-completion; r0.2.1 orphan-to-completion; triangle orphan-to-completion; n-gon orphan-to-completion',
    'floor 0.00001, δ 0: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 5e-9: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 1e-8: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 2.754e-8: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 1e-7: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 0.000001: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 0.000005: family head-on; r0.2.1 head-on; triangle head-on; n-gon head-on',
    'floor 0.00001, δ 0.0001: family orphan-to-completion; r0.2.1 orphan-to-completion; triangle orphan-to-completion; n-gon orphan-to-completion',
];

/** A pre-arm row as the arm leaves it: every orphan closed, every head-on cell priced as before. */
function flippedByTheArm(row: string): string {
    return row.replaceAll('orphan-to-completion', 'closed at the leading source');
}

describe('the swept table', () => {
    it('reads the pre-arm table with every orphan closed at the leading source, and nothing else moved', () => {
        expect(sweepRows()).toEqual(PRE_ARM_TABLE.map(flippedByTheArm));
    });

    it('reaches neither the completion as an orphan nor the throw in any cell', () => {
        const rows = sweepRows();
        expect(rows.filter(row => row.includes('orphan'))).toEqual([]);
        // Each cell is head-on inside the lane and closed outside it: the lane is the floor, and the
        // family's displacement is exact in unit space (the arity pair sits on y = 0).
        for (const floor of FLOORS) {
            for (const delta of DELTAS) {
                const expected = delta <= floor ? 'head-on' : 'closed at the leading source';
                expect(rows).toContain(`floor ${floor}, δ ${delta}: family ${expected}; r0.2.1 ${expected}; `
                    + `triangle ${expected}; n-gon ${expected}`);
            }
        }
    });

    it.each(FLOORS)('completes every family cell at floor %p with no causality violation', (floor) => {
        for (const delta of DELTAS) {
            const cell = solveFamilyCell(ANTI_PARALLEL_CORRIDOR_COAXIAL, delta, floor);
            expect(`${delta}: complete ${cell.complete}, causality ${cell.causality}`)
                .toBe(`${delta}: complete true, causality 0`);
        }
    });
});

/** The arity harness's pair turned round: the same two lines, each source now BEHIND the other. */
function retreatingPairCell(delta: number): Verdict | string {
    const context = makeStraightSkeletonSolverContext(ARITY_RINGS[3], SKELETON_NOISE_FLOOR);
    initInteriorEdges(context);
    const pair = context.graph.interiorEdges.slice(0, 2).map(edge => edge.id);
    const rays: [Vector2, Vector2][] = [[{x: 2.6, y: 0}, {x: 1, y: 0}], [{x: 2.2, y: delta}, {x: -1, y: 0}]];
    pair.forEach((id, index) => {
        const edge = context.getEdgeWithId(id);
        edge.source = addNode(rays[index][0], context.graph);
        context.graph.nodes[edge.source].outEdges.push(id);
        edge.basisVector = rays[index][1];
    });
    let threw = false;
    try {
        handleInteriorEdgePair(context, {interiorEdges: pair});
    } catch {
        threw = true;
    }
    return pairVerdict(context, pair, threw);
}

describe('the closure is at the leading source', () => {
    it('ties an approaching pair to the lower edge id: the other edge ends at its source, and it retires', () => {
        // Both sources of an approaching pair are leading sources — each lies ahead of the other along
        // the other's ray — so the tie is broken by edge id, not by the partition's ordering.
        const {context, input} = corridorPairOf(SKELETON_NOISE_FLOOR);
        const [first, second] = input.interiorEdges.toSorted((a, b) => a - b);
        const node = context.graph.nodes[context.getEdgeWithId(second).source];
        node.position = {x: node.position.x, y: node.position.y + 5e-6};

        handleInteriorEdgePair(context, {interiorEdges: [second, first]});

        expect(context.getInteriorWithId(first).culled).toBe(true);
        expect(context.getEdgeWithId(first).target).toBe(context.getEdgeWithId(first).source);
        expect(context.getEdgeWithId(second).target).toBe(context.getEdgeWithId(first).source);
        expect(context.getInteriorWithId(second).culled).not.toBe(true);
        expect(context.diagnostics).toEqual([]);
    });
});

/*
 * THE RETREATING CONTROL — an interpretation, pinned so the lead can rule on it. Spec A16 says a
 * coaxial-and-retreating pair, and a non-coaxial one retreating, is closed at the leading source. For
 * a retreating opposed pair NO source is a leading source: each lies BEHIND the other along the other's
 * ray, so wiring either edge to the other's source runs it backwards along its own basis — journal
 * decision 70's defect, which the solver's own causality check now diagnoses as a direction violation.
 * The arm therefore finds no anchor, the completion finds no pair pointing together, and the throw
 * stands, before the arm and after it. No solver-produced state reaches this: across the whole core
 * suite, the arm's precondition (parallel walls, parallel bases, opposed orientations) was met only
 * by this file's constructed cells, every one of them approaching.
 */
describe('the retreating control', () => {
    it.each([0, 2.754e-8, 5e-6, 1e-4])('throws on a retreating pair at a lateral offset of %p', (delta) => {
        expect(retreatingPairCell(delta)).toBe<Verdict>('orphan-to-throw');
    });
});

describe('the four named fixtures, at the library floor', () => {
    it.each([
        [ANTI_PARALLEL_CORRIDOR_COAXIAL, 'head-on'],
        [ANTI_PARALLEL_CORRIDOR_SUB_EPSILON, 'head-on'],
        [ANTI_PARALLEL_CORRIDOR_IN_BAND, 'head-on'],
        // Before the arm: 'orphan-to-completion' at every arity.
        [ANTI_PARALLEL_CORRIDOR_ABOVE_FLOOR, 'closed at the leading source'],
    ].map(([fixture, verdict]) => [(fixture as AntiParallelCorridorFixture).name, verdict, fixture]) as
        [string, Verdict, AntiParallelCorridorFixture][])('%s reads %p at every arity', (_name, verdict, fixture) => {
        const cell = solveFamilyCell(fixture, fixture.lateralDisplacement, SKELETON_NOISE_FLOOR);
        expect(cell).toEqual({verdict, complete: true, causality: 0});
        expect(arityCell(3, fixture.lateralDisplacement, SKELETON_NOISE_FLOOR)).toBe(verdict);
        expect(arityCell(4, fixture.lateralDisplacement, SKELETON_NOISE_FLOOR)).toBe(verdict);
    });

    it('is the family the fixture file exports, in ascending displacement', () => {
        expect(ANTI_PARALLEL_CORRIDOR_FAMILY.map(fixture => fixture.lateralDisplacement))
            .toEqual([0, 5e-9, 2.754e-8, 5e-6]);
    });
});
