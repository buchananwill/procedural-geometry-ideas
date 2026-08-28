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
    projectOffsetWavefront,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {
    eventOffsets,
    isContinuous,
    measureMutationReport,
    rawOffsetsOfNode,
    signedRingArea,
    SIMULTANEITY_RELATIVE_BAND,
    TERMINAL_BAND,
    totalRingArea,
    ulpSeparatedPairs,
} from './wavefront-measurement-helpers';

/*
 * ============================================================================
 *  THE NEAR-REGULAR LOSS WAS A SIMULTANEOUS-EVENT PAIR, AND THE TABLE NOW
 *  SAYS SO. THE DIAGNOSIS IS MEASURED; THE FIX IS ASSERTED AGAINST IT.
 * ============================================================================
 *
 * WHAT THIS FILE RECORDS, AND WHY IT IS NOT IN `offset-event-boundary-regression.test.ts`
 *
 * That file sweeps `CLEAN_TEST_POLYGONS`. These four fixtures were all held out of that corpus when
 * this file was written, and three have since been promoted into it — `Near Regular Peanut 32` on
 * 2026-08-27 under journal decision 64, both ellipses on 2026-08-28 under decision 65. They stay
 * enumerated here anyway. THIS LIST IS THE POPULATION THE DIAGNOSIS WAS MEASURED OVER, not the
 * held-out set: the lost-ring counts below and the 48/40 mutation pin are readings taken across
 * exactly these four, and dropping a member as it is promoted would silently change what those
 * numbers describe. `Near Regular Rosette5 40` is the one still out of the corpus, on a
 * translation-envelope failure at 1e11 pinned in `large-coordinate-known-failures.test.ts`.
 * The guarantee for all four — that the projection survives every one of their events — is
 * asserted here, over measurements imported from `wavefront-measurement-helpers.ts`.
 *
 * WHAT WAS WRONG
 *
 * Backlog item 4 — "terminal many-way events cannot be projected" — proposed that at the exact
 * offset of a terminal many-way event the wavefront has finished, so every bisector in the failing
 * chain dies at one node, nothing is born there, and the chain has no successor because its ring
 * has legitimately ceased to exist. THAT HYPOTHESIS WAS REFUTED, clause by clause, by the
 * measurements this file used to carry: a bisector *was* born at the node, the node was *not*
 * terminal, and the chain's bisectors died at several nodes rather than one.
 *
 * What was actually happening is *simultaneous mirror events*. These fixtures are symmetric, so
 * they produce two or more events at genuinely different places in the plane which happen at the
 * same offset. `computeNodeOffsets` re-derives each node's offset from the supporting line of one
 * of its own parent edges, and mirror nodes have different parent edges, so one instant came back
 * as several numbers 7e-15 to 3.5e-13 apart. Querying at the LOWER of such a set left the pair of
 * bisectors meeting at the HIGHER node alive by the table while they had already met in the plane;
 * their span along the exterior edge they shared came out zero or slightly negative,
 * `segmentsAlongExteriorEdge` dropped both of its endpoints, the chain had nothing to continue to,
 * and the ring was lost. Measured, at the commit before the fix: 4 lost rings on Ellipse 16, 6 on
 * Ellipse 32, 19 on Rosette5 40 and 7 on Peanut 32 — 36 in all, reported as 23 `no-successor`
 * chains and the 13 `rejoined-mid-chain` far halves of the same broken loops.
 *
 * WHAT FIXED IT
 *
 * `computeNodeOffsets` canonicalises its table: the re-derived offsets are partitioned into
 * simultaneous sets by connected components under a tolerance relative to the maximum offset, and
 * each set is collapsed onto one of its own members. Mirror nodes then agree bit-for-bit and the
 * span between them is closed by two bisectors that are dead together.
 *
 * NO COMPARISON WAS GIVEN ANY SLACK. The lifetime comparison is still exact and must stay so;
 * widening it duplicates a vertex and shifting it reintroduces the dropout. Only the table those
 * comparisons read has changed.
 *
 * WHAT THIS FILE ASSERTS NOW
 *
 * Both halves, because either alone is worthless. The mechanism is still measured — the mirror sets
 * are still there, their members still sit hundreds of units apart in the plane, and their parent
 * edges still date them to numbers that disagree in the last bits — and the loss those numbers used
 * to cause is asserted to be gone at every event of all four fixtures, and a nanometre either side
 * of each. That the losses are gone by being fixed rather than by having stopped being reported is
 * convicted by mutation, below.
 */

setSkeletonLogLevel('silent');

/**
 * One member of the population this file's diagnosis was measured over. Every one was out of
 * `CLEAN_TEST_POLYGONS` when it was written; three have since been promoted and stay listed, because
 * the counts here describe these four fixtures and no other set.
 */
export interface HeldOutFixture {
    name: string;
    vertices: Vector2[];
}

/**
 * Nodes the canonical table dates to one instant, with the raw numbers their own parent edges date
 * them to.
 *
 * `rawOffsets` is re-derived here from the graph rather than read from the projection: this file's
 * claim is that the *raw* derivation disagrees with itself across mirror nodes, which is a claim
 * about the geometry and not about the table, and a table lookup could not distinguish it from the
 * canonicalisation having simply overwritten everything.
 */
export interface SimultaneousMirrorSet {
    fixtureName: string;
    result: SkeletonSolveResult;
    /** The one value the table gives every member. */
    canonicalOffset: number;
    nodeIds: number[];
    /** Every distinct number the members' own parent edges date them to, ascending. */
    rawOffsets: number[];
    /** The widest distance in the plane between two members. */
    separation: number;
    /** The widest disagreement between two of `rawOffsets`. */
    spread: number;
}

const NEAR_REGULAR_FIXTURES: HeldOutFixture[] = [
    {name: 'Near Regular Ellipse 16', vertices: NEAR_REGULAR_ELLIPSE_16},
    {name: 'Near Regular Ellipse 32', vertices: NEAR_REGULAR_ELLIPSE_32},
    {name: 'Near Regular Rosette5 40', vertices: NEAR_REGULAR_ROSETTE5_40},
    {name: 'Near Regular Peanut 32', vertices: NEAR_REGULAR_PEANUT_32},
];

/**
 * The counts this file was written against, before the fix. They are prose rather than assertions
 * because the assertions below are that every one of them is now zero.
 */
const LOST_RINGS_BEFORE_THE_FIX: Record<string, number> = {
    'Near Regular Ellipse 16': 4,
    'Near Regular Ellipse 32': 6,
    'Near Regular Rosette5 40': 19,
    'Near Regular Peanut 32': 7,
};

/**
 * The widest one instant's re-derived offsets are measured to spread, as a fraction of the solve's
 * maximum offset.
 *
 * Measured on this file's OWN derivation — `rawOffsetsOfNode` dates a node against every parent edge
 * of every incident bisector, where `computeNodeOffsets` reads only the first — so it is wider than
 * the bound recorded against the production constant. Worst over these four fixtures: 4.17e-15, on
 * Near Regular Rosette5 40.
 *
 * The spread is asserted against this MEASUREMENT rather than against
 * {@link SIMULTANEITY_RELATIVE_BAND}, which is ~240x looser: a set that had swallowed a genuinely
 * distinct event would still have to be within the band that built it, so the band cannot detect
 * the thing this assertion exists to detect.
 */
const WITHIN_INSTANT_RELATIVE_SPREAD = 1e-14;

/** Below this separation two nodes are a coincident cluster rather than mirror images. */
const MIRROR_SEPARATION = 1;

/** How far either side of an event the area is sampled to check it is continuous through it. */
const NEIGHBOURHOOD = 1e-6;

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

function separationOf(result: SkeletonSolveResult, nodeIds: number[]): number {
    let widest = 0;
    for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
            const a = result.graph.nodes[nodeIds[i]].position;
            const b = result.graph.nodes[nodeIds[j]].position;
            widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y));
        }
    }
    return widest;
}

/**
 * The sets of nodes the table dates to one instant, over every near-regular fixture, keeping only
 * those whose members are genuinely apart in the plane — a mirror set rather than a cluster of
 * nodes that happen to sit on top of one another.
 */
function simultaneousMirrorSets(): SimultaneousMirrorSet[] {
    const sets: SimultaneousMirrorSet[] = [];
    for (const fixture of NEAR_REGULAR_FIXTURES) {
        const result = solvedHeldOutFixture(fixture);

        const nodeIdsByOffset = new Map<number, number[]>();
        for (const [nodeId, offset] of nodeOffsetsOf(result)) {
            if (offset <= 0) {
                continue;
            }
            nodeIdsByOffset.set(offset, [...(nodeIdsByOffset.get(offset) ?? []), nodeId]);
        }

        for (const [canonicalOffset, nodeIds] of nodeIdsByOffset) {
            const separation = separationOf(result, nodeIds);
            if (nodeIds.length < 2 || separation < MIRROR_SEPARATION) {
                continue;
            }
            const rawOffsets = [...new Set(nodeIds.flatMap(nodeId => rawOffsetsOfNode(result, nodeId)))]
                .sort((a, b) => a - b);
            sets.push({
                fixtureName: fixture.name,
                result,
                canonicalOffset,
                nodeIds,
                rawOffsets,
                separation,
                spread: rawOffsets[rawOffsets.length - 1] - rawOffsets[0],
            });
        }
    }
    return sets;
}

/** Every unclosed chain the projection reports, over every event offset of every fixture. */
function unclosedChainCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const fixture of NEAR_REGULAR_FIXTURES) {
        const result = solvedHeldOutFixture(fixture);
        counts[fixture.name] = 0;
        for (const offset of eventOffsets(result)) {
            counts[fixture.name] += projectOffsetWavefront(result, offset).unclosedChains.length;
        }
    }
    return counts;
}

describe('the near-regular simultaneous mirror events', () => {
    describe('the mechanism, still measured', () => {
        it('puts several nodes at one instant, hundreds of units apart in the plane', () => {
            const byFixture = new Map<string, SimultaneousMirrorSet[]>();
            for (const mirrorSet of simultaneousMirrorSets()) {
                byFixture.set(mirrorSet.fixtureName, [...(byFixture.get(mirrorSet.fixtureName) ?? []), mirrorSet]);
            }

            // Every fixture has them; this is why these four were held out in the first place.
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                expect(byFixture.get(fixture.name) ?? []).not.toHaveLength(0);
            }
            expect(Math.max(...simultaneousMirrorSets().map(mirrorSet => mirrorSet.separation)))
                .toBeGreaterThan(100);
        });

        it('has the members\' own parent edges disagree, in the last bits and no further', () => {
            const problems: string[] = [];
            let disagreeing = 0;
            for (const mirrorSet of simultaneousMirrorSets()) {
                const where = `${mirrorSet.fixtureName} @${mirrorSet.canonicalOffset.toFixed(6)}`;
                if (mirrorSet.spread > 0) {
                    disagreeing += 1;
                }
                // One instant, several numbers — but never further apart than one instant's worth.
                // A wider spread would mean this set has swallowed a genuinely distinct event.
                const spreadBound = computeMaxOffset(mirrorSet.result) * WITHIN_INSTANT_RELATIVE_SPREAD;
                if (mirrorSet.spread > spreadBound) {
                    problems.push(`${where}: raw offsets span ${mirrorSet.spread.toExponential(3)}`);
                }
            }
            expect(problems.join('; ')).toBe('');
            // Non-vacuity: if nothing disagreed there would be nothing here to canonicalise, and
            // every assertion in this file would be passing on an empty population.
            expect(disagreeing).toBeGreaterThan(0);
        });

        it('collapses each set onto one of its own members, never onto an average of them', () => {
            const problems: string[] = [];
            for (const mirrorSet of simultaneousMirrorSets()) {
                const where = `${mirrorSet.fixtureName} @${mirrorSet.canonicalOffset}`;
                // Bit-exact membership. A mean of the set would sit between two members and fail
                // this, which is the mutation this assertion exists to catch.
                if (!mirrorSet.rawOffsets.includes(mirrorSet.canonicalOffset)) {
                    problems.push(`${where}: canonical offset is not one of ${mirrorSet.rawOffsets.join(', ')}`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('leaves two nodes at one offset as two nodes, at their own positions', () => {
            const problems: string[] = [];
            for (const mirrorSet of simultaneousMirrorSets()) {
                const positions = mirrorSet.nodeIds.map(nodeId => mirrorSet.result.graph.nodes[nodeId].position);
                if (new Set(mirrorSet.nodeIds).size !== mirrorSet.nodeIds.length) {
                    problems.push(`${mirrorSet.fixtureName}: a node id appears twice in one set`);
                }
                // The peanut's waist puts two nodes on opposite banks of a thin neck. Unifying
                // offsets must not fuse them, and nothing here may move one onto the other.
                for (let i = 0; i < positions.length; i++) {
                    for (let j = i + 1; j < positions.length; j++) {
                        if (positions[i].x === positions[j].x && positions[i].y === positions[j].y) {
                            problems.push(`${mirrorSet.fixtureName}: two members share a position`);
                        }
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('leaves no ulp-separated pair of event offsets anywhere in the table', () => {
            // Distinct offsets are now distinct EVENTS: no two of them are within one instant's worth
            // of each other, which is the entire content of the fix. The check itself is
            // `ulpSeparatedPairs`, shared with `offset-projection.test.ts`, which makes it of the
            // whole table over `CLEAN_TEST_POLYGONS` where this file makes it of the event offsets of
            // the four fixtures that used to fail it.
            const problems: string[] = [];
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                const result = solvedHeldOutFixture(fixture);
                const band = computeMaxOffset(result) * SIMULTANEITY_RELATIVE_BAND;
                for (const pair of ulpSeparatedPairs(eventOffsets(result), band)) {
                    problems.push(`${fixture.name}: ${pair}`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('the loss it used to cause', () => {
        it('is gone: every event of every near-regular fixture closes', () => {
            // Was 4 / 6 / 19 / 7 — 36 lost rings, reported as 23 `no-successor` chains and 13
            // `rejoined-mid-chain` far halves of the same loops.
            expect(unclosedChainCounts()).toEqual({
                'Near Regular Ellipse 16': 0,
                'Near Regular Ellipse 32': 0,
                'Near Regular Rosette5 40': 0,
                'Near Regular Peanut 32': 0,
            });
            expect(Object.values(LOST_RINGS_BEFORE_THE_FIX).reduce((total, count) => total + count, 0)).toBe(36);
        });

        it('is gone at the instants that used to fail, each of them now one table entry', () => {
            // The failure was always at the LOWER member of a set and the higher members always
            // projected cleanly, so every instant that used to lose a ring is a mirror set here.
            // Each is now a single entry in the table, and the projection at that entry is sound.
            //
            // The members that are not the representative are no longer offsets anything asks for.
            // They are not in the table, and a caller walking the skeleton event by event walks the
            // table. Below an event by less than a nanometre — which is where those raw members now
            // sit — the reconstruction of a bisector's position is itself noisier than the distance
            // to the event, and a span can still sort the wrong way round. That is a property of an
            // exact lifetime comparison and not of mirror events: measured on `CLEAN_TEST_POLYGONS`,
            // which has no mirror sets in it at all, 101 of 810 probes at 1e-13, 1e-14 and 1e-15
            // below an event report an unclosed chain. It is unchanged by this work, in either
            // direction, and is a finding to report rather than a defect this file pins.
            const problems: string[] = [];
            for (const mirrorSet of simultaneousMirrorSets()) {
                const where = `${mirrorSet.fixtureName} @${mirrorSet.canonicalOffset}`;
                if (!eventOffsets(mirrorSet.result).includes(mirrorSet.canonicalOffset)) {
                    problems.push(`${where}: the set's own value is not an event offset`);
                    continue;
                }
                // At the maximum offset the wavefront has been consumed and an empty projection is
                // the documented answer, so only the mid-solve instants are required to carry rings.
                const isTerminal = computeMaxOffset(mirrorSet.result) - mirrorSet.canonicalOffset <= TERMINAL_BAND;
                const projection = projectOffsetWavefront(mirrorSet.result, mirrorSet.canonicalOffset);
                if (projection.unclosedChains.length > 0 || (projection.rings.length === 0 && !isTerminal)) {
                    problems.push(
                        `${where}: ${projection.rings.length} rings, `
                        + `${projection.unclosedChains.length} unclosed chains`);
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('leaves the ring intact at every event, and a nanometre either side of it', () => {
            const problems: string[] = [];
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                const result = solvedHeldOutFixture(fixture);
                const maxOffset = computeMaxOffset(result);
                for (const offset of eventOffsets(result).filter(event => maxOffset - event > TERMINAL_BAND)) {
                    for (const delta of [-1e-9, 0, 1e-9]) {
                        const projection = projectOffsetWavefront(result, offset + delta);
                        if (projection.unclosedChains.length > 0 || projection.rings.length === 0) {
                            problems.push(
                                `${fixture.name} @${offset.toFixed(6)}${delta >= 0 ? '+' : ''}${delta}: `
                                + `${projection.rings.length} rings, ${projection.unclosedChains.length} chains`);
                        }
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });

        it('encloses the area the limit either side of the event encloses', () => {
            // A ring that closes while enclosing the wrong area is worse than one that fails to
            // close, because nothing downstream would report it. Same continuity test, same slack,
            // as the sweep over `CLEAN_TEST_POLYGONS`.
            const problems: string[] = [];
            for (const fixture of NEAR_REGULAR_FIXTURES) {
                const result = solvedHeldOutFixture(fixture);
                for (const offset of eventOffsets(result)) {
                    const before = totalRingArea(computeOffsetRings(result, offset - NEIGHBOURHOOD));
                    const at = totalRingArea(computeOffsetRings(result, offset));
                    const after = totalRingArea(computeOffsetRings(result, offset + NEIGHBOURHOOD));
                    if (!isContinuous(before, at, after)) {
                        problems.push(`${fixture.name} @${offset.toFixed(6)}: ${before} -> ${at} -> ${after}`);
                    }
                }
            }
            expect(problems.join('; ')).toBe('');
        });
    });

    describe('and the report that found the loss still works', () => {
        it('fires when a hand-over on these fixtures is broken by hand', () => {
            // The counts above are worth nothing if `unclosedChains` can no longer be non-empty on
            // these fixtures — a suppressed report would pass them just as well as a fix. So the
            // report is convicted here by exactly the mutation the `CLEAN_TEST_POLYGONS` sweep convicts
            // it with, `measureMutationReport`, run over these four fixtures instead of that corpus:
            // one node's offset is pushed a micrometre later than the rest of the solve dates it,
            // which is six orders of magnitude outside the canonicalisation band and so survives it,
            // and the original offset is queried again. Every such mutation must be REPORTED or
            // HARMLESS; silently returning smaller rings is what the whole module exists to prevent.
            const {silentLosses, fired, mutated} = measureMutationReport(
                NEAR_REGULAR_FIXTURES.map(fixture => ({
                    name: fixture.name,
                    result: solvedHeldOutFixture(fixture),
                })));
            expect(silentLosses.join('; ')).toBe('');

            // Pinned rather than bounded, for the same reason the sibling suite pins its pair: a
            // share-of-corpus bound would still pass if the report's sensitivity quietly halved.
            // Measured at this commit: 48 mid-solve events across the four fixtures that project
            // cleanly, 40 of which the report fires on and 8 of which cost no area at all.
            expect(mutated).toBe(48);
            expect(fired).toBe(40);
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

        it('keeps both mirror rings at every event past the pinch, where one used to be lost', () => {
            // The lower member of each simultaneous pair used to come back with one ring where the
            // higher member had two: the mirror lobe was the ring being dropped. Both members are
            // now one offset and both lobes survive it.
            const result = solvedHeldOutFixture(peanut);
            const problems: string[] = [];

            for (const offset of eventOffsets(result)) {
                const rings = computeOffsetRings(result, offset);
                if (rings.length !== 2) {
                    continue;
                }
                const areas = rings.map(ring => Math.abs(signedRingArea(ring)));
                if (Math.abs(areas[0] - areas[1]) > 1e-9) {
                    problems.push(`@${offset.toFixed(6)}: lobe areas ${areas[0]} and ${areas[1]} differ`);
                }
            }
            expect(problems.join('; ')).toBe('');

            // Non-vacuity: the two-lobe configuration is reached at an event, not merely between
            // events, so the loop above has something to check.
            const twoLobeEvents = eventOffsets(result)
                .filter(offset => computeOffsetRings(result, offset).length === 2);
            expect(twoLobeEvents.length).toBeGreaterThan(0);
        });
    });
});
