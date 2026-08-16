import {
    NEAR_REGULAR_ELLIPSE_16,
    NEAR_REGULAR_ELLIPSE_32,
    NEAR_REGULAR_PEANUT_32,
    NEAR_REGULAR_ROSETTE5_40,
} from '@proc-geo/test-fixtures';
import {
    computeMaxOffset,
    computeNodeOffsets,
    computeOffsetRings,
    dotProduct,
    projectOffsetWavefront,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    UnclosedChain,
    UnclosedChainReason,
    Vector2,
} from '@proc-geo/core';
// Package-internal: the projection's own derivation of which bisectors are alive at an offset and
// where they sit. The diagnosis below is a claim about that exact derivation, so it has to call it
// rather than restate it — a restatement would keep passing after the real formula moved.
import {AliveBisector, collectAliveBisectors} from '../../src/straight-skeleton/offset-projection';
import {eventOffsets, signedRingArea} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  THE NEAR-REGULAR LOSS IS A SIMULTANEOUS-EVENT PAIR, NOT A TERMINATED RING.
 *  MEASURED, NOT ASSUMED. THESE ASSERTIONS PIN A DIAGNOSIS.
 * ============================================================================
 *
 * WHAT THIS FILE RECORDS, AND WHY IT IS NOT IN `offset-event-boundary-regression.test.ts`
 *
 * That file is a specification: it asserts, over `ALL_TEST_POLYGONS`, that the projection survives
 * every event, and it changes only if that guarantee regresses. This file is the opposite kind of
 * artefact — it pins CURRENT, BROKEN behaviour over four fixtures deliberately held out of that
 * corpus, and it is expected to change the day the defect below is fixed. Two reasons to change,
 * two files.
 *
 * Backlog item 4 — "terminal many-way events cannot be projected" — proposed that at the exact
 * offset of a terminal many-way event the wavefront has finished, so every bisector in the failing
 * chain dies at one node, nothing is born there, and the chain has no successor because its ring has
 * legitimately ceased to exist.
 *
 * THAT HYPOTHESIS IS REFUTED. Every clause of it fails, in every named case, and the assertions
 * below are the measurement rather than a description of it:
 *
 *   1. The chain's bisectors do NOT all die at one node. Near Regular Ellipse 16 @72.361834 walks
 *      thirteen bisectors that die at six distinct nodes.
 *   2. The node the chain runs into DOES have a bisector born at it — in every case, without
 *      exception. Nothing has ceased to exist there.
 *   3. That node is NOT terminal. Near Regular Rosette5 40 fails at 37.456461 of a maximum 88.670259,
 *      and the whole ring is present and sound a nanometre either side of the failure.
 *
 * WHAT IS ACTUALLY HAPPENING
 *
 * These fixtures are symmetric, so they produce *simultaneous mirror events*: two or more events at
 * genuinely different places in the plane which happen at the same offset. `computeNodeOffsets`
 * re-derives each node's offset from the supporting line of one of its own parent edges, and mirror
 * nodes have different parent edges, so the same instant comes back as offsets 7e-15 to 3.5e-13
 * apart. They are one event in the wavefront and several distinct numbers in the table.
 *
 * Query at the LOWER of such a pair and the pair of bisectors meeting at the HIGHER node is still
 * alive by the table while having already met in the plane. Their span along the exterior edge they
 * share therefore comes out with length zero or slightly negative. `segmentsAlongExteriorEdge` drops
 * both of its endpoints — an inverted span sorts close-before-open and the close finds no pending
 * start, and an exactly-zero-length span hits the deliberate close-before-open tie-break to the same
 * effect. The chain that ran through that bisector has nothing to continue to, and the ring is lost.
 *
 * The signature is unambiguous: the failure is always at the lower member of an ULP-separated pair,
 * and the higher member always projects cleanly.
 *
 * ONE BREAK IS REPORTED TWICE
 *
 * A broken loop yields two `UnclosedChain`s, not one, and only the first of them is about the
 * defect. `assembleRings` seeds a walk at every unvisited segment: the walk that reaches the dropped
 * span stops with `no-successor`, and a later seed picks up the rest of the same loop and walks
 * forward into the segment that first walk started from — already visited, so it stops with
 * `rejoined-mid-chain`. The two are one ring. That is asserted rather than asserted-in-prose: every
 * rejoined chain's last bisector is the FIRST bisector of a `no-successor` chain at the same offset,
 * which is precisely the seed the earlier walk began at. So the mechanism below is measured on the
 * `no-successor` population — the half that carries a terminal bisector to interrogate — and the
 * other half is tied back to it by that linkage.
 *
 * The module header of `offset-projection.ts` states that two live bisectors bounding a zero-length
 * span cannot occur. On these fixtures it does occur, and that is the defect. Fixing it is NOT the
 * change proposed by item 4 — a "terminated chain" predicate would be answering a question none of
 * these cases asks.
 *
 * WHY THESE TESTS ASSERT THE PRESENT, BROKEN BEHAVIOUR
 *
 * They pin a diagnosis so it cannot rot, in the same spirit as `reflex-subdivision.test.ts` pinning
 * its failing set. A change in either direction is a real finding: if the counts below move, the
 * mechanism has moved with them and this comment needs re-measuring, not adjusting.
 *
 * The near-regular fixtures are imported individually and stay OUT of `ALL_TEST_POLYGONS`, and so
 * out of the sweep in `offset-event-boundary-regression.test.ts`. Nothing here promotes them.
 */

setSkeletonLogLevel('silent');

/** A fixture that is exported individually and deliberately kept out of `ALL_TEST_POLYGONS`. */
export interface HeldOutFixture {
    name: string;
    vertices: Vector2[];
}

/** One run of wavefront the projection could not close, with everything needed to explain it. */
export interface LostRingCase {
    fixtureName: string;
    result: SkeletonSolveResult;
    /** The event offset that was queried. */
    offset: number;
    chain: UnclosedChain;
}

/**
 * The span the projection failed to build: the opening endpoint of the chain's terminal bisector and
 * the closing endpoint that should have paired with it, measured along their shared exterior edge.
 */
export interface FailedSpan {
    exteriorEdgeId: number;
    openBisectorId: number;
    closeBisectorId: number;
    /** Signed length along the edge basis — the close's coordinate minus the open's. */
    length: number;
}

/** Where and when a chain's terminal bisector dies, read from one solve's one offset table. */
export interface DeathNode {
    /** The node the terminal bisector is wired to. */
    nodeId: number;
    /** That node's re-derived offset — the instant the bisector's lifetime ends. */
    offset: number;
    position: Vector2;
    /** The whole table the offset came from, so a caller comparing against it reads the same one. */
    nodeOffsets: Map<number, number>;
}

const NEAR_REGULAR_FIXTURES: HeldOutFixture[] = [
    {name: 'Near Regular Ellipse 16', vertices: NEAR_REGULAR_ELLIPSE_16},
    {name: 'Near Regular Ellipse 32', vertices: NEAR_REGULAR_ELLIPSE_32},
    {name: 'Near Regular Rosette5 40', vertices: NEAR_REGULAR_ROSETTE5_40},
    {name: 'Near Regular Peanut 32', vertices: NEAR_REGULAR_PEANUT_32},
];

/**
 * The unclosed-chain count per fixture, measured rather than inherited.
 *
 * Item 4 recorded a different set and the decision spec a third; both are superseded by this one,
 * taken at this commit. These are counts of (event offset, chain) pairs over every event offset of
 * the fixture.
 */
const LOST_RINGS_PER_FIXTURE: Record<string, number> = {
    'Near Regular Ellipse 16': 4,
    'Near Regular Ellipse 32': 6,
    'Near Regular Rosette5 40': 19,
    'Near Regular Peanut 32': 7,
};

/**
 * The same losses split by how the walk failed, rather than by fixture.
 *
 * Both halves are pinned because they are one mechanism reported twice: the walk that dies is a
 * `no-successor`, and the remainder of the very same loop, walked from a different seed, arrives
 * back at that dead walk's first segment and is reported as a `rejoined-mid-chain`. The linkage is
 * asserted below; these counts stop either population drifting unnoticed behind it.
 */
const LOST_RINGS_PER_REASON: Record<UnclosedChainReason, number> = {
    'no-successor': 23,
    'rejoined-mid-chain': 13,
};

/** How far apart two re-derived offsets of one simultaneous event may be. Femtometres, not slack. */
const SIMULTANEITY_BAND = 1e-12;

const NEAR_REGULAR_SOLVES = new Map<string, SkeletonSolveResult>();

function solvedHeldOutFixture(fixture: HeldOutFixture): SkeletonSolveResult {
    const cached = NEAR_REGULAR_SOLVES.get(fixture.name);
    if (cached !== undefined) {
        return cached;
    }
    const result = solveSkeleton(fixture.vertices);
    if (!result.complete || result.context === null) {
        throw new Error(`Fixture "${fixture.name}" no longer solves; this file assumes it does.`);
    }
    NEAR_REGULAR_SOLVES.set(fixture.name, result);
    return result;
}

/** The offset table of a solve, built once per solve rather than once per assertion. */
const NODE_OFFSETS = new WeakMap<SkeletonSolveResult, Map<number, number>>();

function nodeOffsetsOf(result: SkeletonSolveResult): Map<number, number> {
    const cached = NODE_OFFSETS.get(result);
    if (cached !== undefined) {
        return cached;
    }
    const offsets = computeNodeOffsets(result);
    NODE_OFFSETS.set(result, offsets);
    return offsets;
}

/** Every chain the projection failed to close, over every event offset of every near-regular fixture. */
function lostRingCases(): LostRingCase[] {
    const cases: LostRingCase[] = [];
    for (const fixture of NEAR_REGULAR_FIXTURES) {
        const result = solvedHeldOutFixture(fixture);
        for (const offset of eventOffsets(result)) {
            for (const chain of projectOffsetWavefront(result, offset).unclosedChains) {
                cases.push({fixtureName: fixture.name, result, offset, chain});
            }
        }
    }
    return cases;
}

/**
 * The losses whose walk simply ran out of successor — the primary failure.
 *
 * The `rejoined-mid-chain` losses are the *other* half of the same broken loop and carry no
 * terminal bisector of their own to interrogate, so every test that reasons about the bisector a
 * walk died on starts here. That they share the root cause is asserted separately, by linkage,
 * rather than assumed.
 */
function noSuccessorLosses(): LostRingCase[] {
    return lostRingCases().filter(lost => lost.chain.reason === 'no-successor');
}

/** The losses whose walk forked back into ground an earlier walk had already covered. */
function rejoinedLosses(): LostRingCase[] {
    return lostRingCases().filter(lost => lost.chain.reason === 'rejoined-mid-chain');
}

/** The bisector the walk ran out of road on: the last id in the chain. */
function terminalBisectorOf(chain: UnclosedChain): number {
    return chain.bisectorIds[chain.bisectorIds.length - 1];
}

/**
 * Where the chain's terminal bisector is wired to die, and when.
 *
 * Every clause of the refuted hypothesis is a claim about this one node, so the derivation of it —
 * follow the terminal bisector to its target, then read that target out of the solve's offset table
 * — is made once here rather than restated per assertion.
 */
function deathNodeOf(lost: LostRingCase): DeathNode {
    const nodeOffsets = nodeOffsetsOf(lost.result);
    const nodeId = lost.result.graph.edges[terminalBisectorOf(lost.chain)].target!;
    const offset = nodeOffsets.get(nodeId);
    if (offset === undefined) {
        throw new Error(
            `${lost.fixtureName} @${lost.offset}: n${nodeId} ends a walked chain but has no re-derived offset.`);
    }
    return {nodeId, offset, position: lost.result.graph.nodes[nodeId].position, nodeOffsets};
}

/**
 * The span that should have continued the chain and did not.
 *
 * The chain's terminal bisector opens a span on its clockwise parent edge; the live bisector naming
 * that same edge as its widdershins parent closes it. Returns null if no live bisector closes there
 * at all, which would be a different failure from the one measured here.
 */
function failedSpanOf(lost: LostRingCase): FailedSpan | null {
    const {result, offset} = lost;
    const {graph} = result;
    const alive: AliveBisector[] = collectAliveBisectors(result, nodeOffsetsOf(result), offset);

    const openBisectorId = terminalBisectorOf(lost.chain);
    const opener = alive.find(candidate => candidate.id === openBisectorId);
    if (opener === undefined) {
        // The walk reached this bisector at this offset, so the projection called it alive; if the
        // same call now says otherwise, the diagnosis below is measuring a different mechanism.
        throw new Error(
            `${lost.fixtureName} @${offset}: b${openBisectorId} terminates a walked chain but is not alive.`);
    }
    const exteriorEdgeId = opener.clockwiseParentId;

    const closer = alive.find(candidate => candidate.widdershinsParentId === exteriorEdgeId);
    if (closer === undefined) {
        return null;
    }

    const exteriorEdge = graph.edges[exteriorEdgeId];
    const edgeSource = graph.nodes[exteriorEdge.source].position;
    const alongEdge = (point: Vector2): number =>
        dotProduct({x: point.x - edgeSource.x, y: point.y - edgeSource.y}, exteriorEdge.basisVector);

    return {
        exteriorEdgeId,
        openBisectorId,
        closeBisectorId: closer.id,
        length: alongEdge(closer.position) - alongEdge(opener.position),
    };
}

/** Node ids whose re-derived offset is exactly `offset`. */
function nodesAtExactly(nodeOffsets: Map<number, number>, offset: number): number[] {
    return [...nodeOffsets.entries()].filter(([, value]) => value === offset).map(([nodeId]) => nodeId);
}

function bisectorsBornAt(result: SkeletonSolveResult, nodeId: number): number[] {
    return result.graph.interiorEdges
        .filter(interiorEdge => result.graph.edges[interiorEdge.id]?.source === nodeId)
        .map(interiorEdge => interiorEdge.id);
}

describe('the near-regular ring loss, diagnosed', () => {
    describe('the loss itself', () => {
        it('is still present, in the numbers this comment was written against', () => {
            const counts: Record<string, number> = {};
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                counts[fixture.name] = 0;
            }
            for (const lost of lostRingCases()) {
                counts[lost.fixtureName] += 1;
            }
            // A move in EITHER direction is a finding: the diagnosis above was measured against
            // these counts and has to be re-measured if they change.
            expect(counts).toEqual(LOST_RINGS_PER_FIXTURE);
        });

        it('reports every loss as one of exactly two chain reasons, in known proportion', () => {
            const counts: Record<string, number> = {'no-successor': 0, 'rejoined-mid-chain': 0};
            for (const lost of lostRingCases()) {
                // A reason outside the two seeded keys adds a third one and fails the comparison,
                // so this is also the assertion that no unaccounted-for reason has appeared.
                counts[lost.chain.reason] = (counts[lost.chain.reason] ?? 0) + 1;
            }
            expect(counts).toEqual(LOST_RINGS_PER_REASON);
        });

        it('accounts for the rejoined chains as the far side of a broken chain, not a second defect', () => {
            const problems: string[] = [];
            for (const rejoined of rejoinedLosses()) {
                const rejoinTarget = terminalBisectorOf(rejoined.chain);
                const where = `${rejoined.fixtureName} @${rejoined.offset.toFixed(6)}`;

                // The walk stopped because `indexByStartBisector` sent it to a segment already
                // visited. If the loop it rejoined is the one a `no-successor` walk broke, that
                // segment is the seed that walk started from — its chain's FIRST bisector.
                const broken = noSuccessorLosses().filter(lost =>
                    lost.fixtureName === rejoined.fixtureName
                    && lost.offset === rejoined.offset
                    && lost.chain.bisectorIds[0] === rejoinTarget);
                if (broken.length === 0) {
                    problems.push(
                        `${where}: rejoins at b${rejoinTarget}, which seeds no broken chain at this offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
            expect(rejoinedLosses().length).toBe(LOST_RINGS_PER_REASON['rejoined-mid-chain']);
        });
    });

    describe('every clause of the terminal-event hypothesis fails', () => {
        it('runs into a node that has a bisector born at it', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const death = deathNodeOf(lost);
                const born = bisectorsBornAt(lost.result, death.nodeId);
                if (born.length === 0) {
                    problems.push(`${lost.fixtureName} @${lost.offset.toFixed(6)}: nothing born at n${death.nodeId}`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('runs into a node that is not terminal, and is not even the last event of its fixture', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const death = deathNodeOf(lost);
                if (!(death.offset < computeMaxOffset(lost.result))) {
                    problems.push(
                        `${lost.fixtureName} @${lost.offset.toFixed(6)}: n${death.nodeId} is at the maximum offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('walks bisectors that die at several different nodes, not at one', () => {
            const spreads = lostRingCases()
                .filter(lost => lost.chain.bisectorIds.length > 3)
                .map(lost => new Set(
                    lost.chain.bisectorIds.map(id => lost.result.graph.edges[id]?.target)).size);
            expect(spreads.length).toBeGreaterThan(0);
            expect(Math.min(...spreads)).toBeGreaterThan(1);
        });

        it('leaves the ring intact, and the projection sound, a nanometre either side', () => {
            const problems: string[] = [];
            for (const lost of lostRingCases()) {
                for (const delta of [-1e-9, 1e-9]) {
                    const projection = projectOffsetWavefront(lost.result, lost.offset + delta);
                    if (projection.unclosedChains.length > 0 || projection.rings.length === 0) {
                        problems.push(
                            `${lost.fixtureName} @${lost.offset.toFixed(6)}${delta > 0 ? '+' : ''}${delta}: `
                            + `${projection.rings.length} rings, ${projection.unclosedChains.length} chains`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('what is actually happening', () => {
        it('queries the lower member of a pair of re-derived offsets for one simultaneous event', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const death = deathNodeOf(lost);
                const gap = death.offset - lost.offset;
                const where = `${lost.fixtureName} @${lost.offset.toFixed(6)}`;

                // The terminal bisector is still alive: its death is in the future, by femtometres.
                if (!(gap > 0)) {
                    problems.push(`${where}: n${death.nodeId} is not later than the query (gap ${gap})`);
                } else if (gap > SIMULTANEITY_BAND) {
                    problems.push(`${where}: n${death.nodeId} is ${gap.toExponential(3)} later, not one event`);
                }

                // And the query offset is some *other* node's reading of the same instant.
                const twins = nodesAtExactly(death.nodeOffsets, lost.offset)
                    .filter(nodeId => nodeId !== death.nodeId);
                if (twins.length === 0) {
                    problems.push(`${where}: no other node reads this offset`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('pairs nodes that are the same instant at genuinely different places', () => {
            const problems: string[] = [];
            for (const lost of noSuccessorLosses()) {
                const death = deathNodeOf(lost);
                for (const twin of nodesAtExactly(death.nodeOffsets, lost.offset)) {
                    const twinPosition = lost.result.graph.nodes[twin].position;
                    const separation = Math.hypot(
                        twinPosition.x - death.position.x, twinPosition.y - death.position.y);
                    if (separation < 1) {
                        problems.push(
                            `${lost.fixtureName} @${lost.offset.toFixed(6)}: n${twin} and n${death.nodeId} are `
                            + `${separation} apart — a coincident cluster, not a mirror pair`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('drops a span of non-positive length between two bisectors the table still calls alive', () => {
            const problems: string[] = [];
            let measured = 0;
            for (const lost of noSuccessorLosses()) {
                const span = failedSpanOf(lost);
                const where = `${lost.fixtureName} @${lost.offset.toFixed(6)}`;
                if (span === null) {
                    problems.push(`${where}: no live bisector closes on the terminal bisector's parent edge`);
                    continue;
                }
                measured += 1;
                // Zero or inverted, and never more than a femtometre of either: the two bisectors have
                // met, which the module header asserts cannot happen while both are alive.
                if (span.length > 0) {
                    problems.push(
                        `${where}: span b${span.openBisectorId}->b${span.closeBisectorId} on `
                        + `e${span.exteriorEdgeId} has positive length ${span.length.toExponential(3)}`);
                } else if (span.length < -SIMULTANEITY_BAND) {
                    problems.push(`${where}: span is ${span.length.toExponential(3)}, too long to be one event`);
                }
            }
            expect(problems.join('; ')).toBe('');
            expect(measured).toBeGreaterThan(0);
        });
    });

    describe('the peanut lobes finish together, so no lobe is ever alone', () => {
        const peanut = NEAR_REGULAR_FIXTURES.find(fixture => fixture.name === 'Near Regular Peanut 32')!;

        it('carries two rings of equal area right up to a single shared maximum offset', () => {
            const result = solvedHeldOutFixture(peanut);
            const maxOffset = computeMaxOffset(result);

            // Sampled past the neck pinch, where the wavefront is two lobes rather than one ring.
            for (const offset of [maxOffset - 1e0, maxOffset - 1e-1, maxOffset - 1e-3]) {
                const rings = computeOffsetRings(result, offset);
                expect(rings).toHaveLength(2);
                expect(Math.abs(signedRingArea(rings[0]))).toBeCloseTo(Math.abs(signedRingArea(rings[1])), 9);
            }
            expect(computeOffsetRings(result, maxOffset)).toEqual([]);
        });

        it('loses one of the two mirror rings at the lower offset of each pair, and neither at the higher', () => {
            const result = solvedHeldOutFixture(peanut);
            const offsets = eventOffsets(result);
            const problems: string[] = [];

            for (const [index, offset] of offsets.entries()) {
                const projection = projectOffsetWavefront(result, offset);
                if (projection.unclosedChains.length === 0) {
                    continue;
                }
                const twin = offsets[index + 1];
                if (twin === undefined || twin - offset > SIMULTANEITY_BAND) {
                    problems.push(`@${offset.toFixed(6)}: no simultaneous twin above it`);
                    continue;
                }
                const atTwin = computeOffsetRings(result, twin);
                if (projection.rings.length !== 1 || atTwin.length !== 2) {
                    problems.push(
                        `@${offset.toFixed(6)}: ${projection.rings.length} rings here, ${atTwin.length} at the twin`);
                    continue;
                }
                // The ring that survived is one of the twin's two, unchanged: exactly one was lost.
                const survivor = Math.abs(signedRingArea(projection.rings[0].vertices.map(vertex => vertex.position)));
                for (const ring of atTwin) {
                    if (Math.abs(Math.abs(signedRingArea(ring)) - survivor) > 1e-9) {
                        problems.push(`@${offset.toFixed(6)}: surviving ring area ${survivor} is not the twin's`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });
});
