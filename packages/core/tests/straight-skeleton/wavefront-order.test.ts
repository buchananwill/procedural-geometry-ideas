/*
 * THE WAVEFRONT'S STORED ORDER (docs/notes/skeleton-wavefront-order-decisions.md). The links are written by
 * every event and are the solver's source of wavefront order; this suite states the invariants W1 to W4
 * directly, convicts `checkWavefront` on hand-broken states, and runs it at every step boundary of every
 * `FULL_CORPUS` fixture and every weighted fixture as the standing gate on link writing (decisions 15, 23).
 * The 642-cell sweep and the recursion census's regions run in `wavefront-order-sweep.test.ts` and
 * `wavefront-order-census.test.ts`; spec decision 32's red cells in `wavefront-order-early-acceptance.test.ts`.
 */
import type {BisectionParams, CollisionEvent, StraightSkeletonSolverContext, WavefrontSegment} from '@proc-geo/core';
import {
    bisectWithParams,
    checkWavefront,
    collideEdges,
    handleCollisionEvent,
    ringsOfWavefront,
    setSkeletonLogLevel,
} from '@proc-geo/core';
import {selectPartitionEvents} from '@proc-geo/core/straight-skeleton/algorithm-complex-cases';
import {priceHeadOnPair} from '@proc-geo/core/straight-skeleton/collision-helpers';
import {
    activeWavefrontProbe,
    beginLayerLinks,
    linkBirth,
    linkInitialRing,
    linkPairCollapse,
    retireBisectors,
    settleLayerLinks,
} from '@proc-geo/core/straight-skeleton/wavefront';
import {CROSS, FULL_CORPUS, initContext, T_SHAPE, WEIGHTED_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {corpusRoster, describeReport, runRoster, unaccountedEntries} from './wavefront-probe-helpers';

setSkeletonLogLevel('silent');

const interiorIds = (context: StraightSkeletonSolverContext) => context.graph.interiorEdges.map(edge => edge.id);

describe('the wavefront links', () => {
    describe('the first ring is the loop\'s vertex order (decision 8)', () => {
        it('links the bisector at vertex i to the bisectors at i + 1 and i − 1', () => {
            const context = initContext(T_SHAPE);
            const n = context.graph.numExteriorNodes;
            for (let i = 0; i < n; i++) {
                expect(context.wavefront.clockwiseNeighbour[n + i]).toBe(n + (i + 1) % n);
                expect(context.wavefront.widdershinsNeighbour[n + i]).toBe(n + (i - 1 + n) % n);
            }
        });

        it('holds -1 in every exterior slot', () => {
            const context = initContext(T_SHAPE);
            const n = context.graph.numExteriorNodes;
            expect(context.wavefront.clockwiseNeighbour.slice(0, n).every(id => id === -1)).toBe(true);
            expect(context.wavefront.widdershinsNeighbour.slice(0, n).every(id => id === -1)).toBe(true);
        });

        it('is one ring, sound by W1 to W4', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            expect(ringsOfWavefront(context, ids)).toEqual([ids]);
            expect(checkWavefront(context, [{interiorEdges: ids}])).toEqual([]);
        });

        it('is plain data, carried by structuredClone (decision 7)', () => {
            const context = initContext(T_SHAPE);
            expect(structuredClone(context.wavefront)).toEqual(context.wavefront);
        });
    });

    describe('checkWavefront convicts each invariant', () => {
        it('W1: a bisector that is not live still holding its neighbours', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            context.accept(ids[0]);
            const violations = checkWavefront(context, [{interiorEdges: ids.slice(1)}]);
            expect(violations.some(v => v.startsWith('W1:') && v.includes(`e${ids[0]} is not live`))).toBe(true);
        });

        it('W1: a clockwise link with no inverse', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            context.wavefront.clockwiseNeighbour[ids[0]] = ids[2];
            const violations = checkWavefront(context, [{interiorEdges: ids}]);
            expect(violations.some(v => v.startsWith('W1:'))).toBe(true);
        });

        it('W2: neighbours that do not share the parent between them', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            const [a, b, c] = ids;
            // Splice b out of the ring and close it on itself: every link has an inverse, the parents do not meet.
            context.wavefront.clockwiseNeighbour[a] = c;
            context.wavefront.widdershinsNeighbour[c] = a;
            context.wavefront.clockwiseNeighbour[b] = b;
            context.wavefront.widdershinsNeighbour[b] = b;
            const violations = checkWavefront(context, [{interiorEdges: ids}]);
            expect(violations.some(v => v.startsWith('W2:') && v.includes(`e${a}'s clockwise parent`))).toBe(true);
            expect(violations.some(v => v.startsWith('W4:'))).toBe(true);
        });

        it('W3: a step input that is not a union of whole rings', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            const violations = checkWavefront(context, [{interiorEdges: ids.slice(1)}]);
            expect(violations.some(v => v.startsWith('W3:') && v.includes('not its clockwise neighbour'))).toBe(true);
            expect(violations.some(v => v.startsWith('W3:') && v.includes(`live e${ids[0]} stands in no step input`))).toBe(true);
        });

        it('W3: a step input holding a bisector that is not live', () => {
            const context = initContext(T_SHAPE);
            const ids = interiorIds(context);
            context.accept(ids[0]);
            context.wavefront.clockwiseNeighbour[ids[0]] = -1;
            context.wavefront.widdershinsNeighbour[ids[0]] = -1;
            const violations = checkWavefront(context, [{interiorEdges: ids}]);
            expect(violations.some(v => v.startsWith('W3:') && v.includes(`holds e${ids[0]}, which is not live`))).toBe(true);
        });
    });

    /*
     * THE PAIRWISE EVENTS, DRIVEN DIRECTLY. `handleCollisionEvent`'s pair collapse and vertex-to-vertex
     * branches are reached in a solve only by the pairwise fallback, which the corpus and the census never
     * reach (every layer there resolves whole) and only the 642-cell sweep does.
     * These tests run each branch as one layer — handle, bear, settle — and hold its links to W1 to W4.
     */
    describe('the pairwise events write their links (decision 9)', () => {
        const resolveLayer = (context: StraightSkeletonSolverContext, event: CollisionEvent): number[] => {
            beginLayerLinks(context);
            const born = handleCollisionEvent(event, context).map(params => {
                const id = bisectWithParams(context, params);
                linkBirth(context, params, id);
                return id;
            });
            settleLayerLinks(context);
            return born;
        };
        const eventOf = (context: StraightSkeletonSolverContext, first: number, second: number, type: string) => {
            const event = collideEdges(first, second, context).find(candidate => candidate.eventType === type);
            expect(event).toBeDefined();
            return event!;
        };

        it('the pair collapse replaces two neighbours with one bisector in their place', () => {
            // A clockwise 4 × 1 rectangle: its right edge collapses where the bisectors at its two ends meet.
            const context = initContext([{x: 0, y: 1}, {x: 4, y: 1}, {x: 4, y: 0}, {x: 0, y: 0}]);
            const [b0, b1, b2, b3] = interiorIds(context);
            const [born] = resolveLayer(context, eventOf(context, b1, b2, 'interiorPair'));
            expect(ringsOfWavefront(context, [b0])).toEqual([[b0, born, b3]]);
            expect(checkWavefront(context, [{interiorEdges: [b0, born, b3]}])).toEqual([]);
        });

        it('a bisector the layer refuses to bear is spliced out, joining its two neighbours', () => {
            // The rectangle's right-edge collapse again, but its bisector is never born — as when
            // `handleInteriorNGon` filters a birth whose parent the layer has accepted. The layer settles with
            // the collapse's two outer neighbours linked to each other, and no pending token left anywhere.
            const context = initContext([{x: 0, y: 1}, {x: 4, y: 1}, {x: 4, y: 0}, {x: 0, y: 0}]);
            const [b0, b1, b2, b3] = interiorIds(context);
            beginLayerLinks(context);
            expect(handleCollisionEvent(eventOf(context, b1, b2, 'interiorPair'), context)).toHaveLength(1);
            expect(context.wavefront.clockwiseNeighbour[b0]).toBeLessThan(-1);
            settleLayerLinks(context);
            expect(context.wavefront.clockwiseNeighbour[b0]).toBe(b3);
            expect(context.wavefront.widdershinsNeighbour[b3]).toBe(b0);
            expect(ringsOfWavefront(context, [b0])).toEqual([[b0, b3]]);
            expect([...context.wavefront.clockwiseNeighbour, ...context.wavefront.widdershinsNeighbour]
                .every(id => id >= -1)).toBe(true);
        });

        it('the vertex-to-vertex event divides a ring in two', () => {
            // A clockwise square: the bisectors at opposite corners meet at its centre and share no parent.
            const context = initContext([{x: 0, y: 2}, {x: 2, y: 2}, {x: 2, y: 0}, {x: 0, y: 0}]);
            const [b0, b1, b2, b3] = interiorIds(context);
            const [first, second] = resolveLayer(context, eventOf(context, b0, b2, 'interiorNonAdjacent'));
            expect(ringsOfWavefront(context, [b1, b3])).toEqual([[b1, first], [b3, second]]);
            expect(checkWavefront(context, [{interiorEdges: [b1, first]}, {interiorEdges: [b3, second]}])).toEqual([]);
        });
    });

    describe('a segment is a linked pair, and the arithmetic\'s section reads as one', () => {
        it('every split names a struck segment that is a linked pair of the struck edge (decisions 5, 11)', () => {
            const struck: WavefrontSegment[] = [];
            let context: StraightSkeletonSolverContext | undefined;
            for (const polygon of [T_SHAPE, CROSS]) {
                context = initContext(polygon);
                const n = context.graph.numExteriorNodes;
                for (const bisector of interiorIds(context)) {
                    for (let edge = 0; edge < n; edge++) {
                        for (const event of collideEdges(bisector, edge, context)) {
                            if (event.eventType === 'interiorAgainstExterior' && event.struckSegment !== undefined) {
                                const segment = event.struckSegment;
                                expect(segment.exteriorEdge).toBe(edge);
                                expect(context.getInteriorWithId(segment.from).clockwiseExteriorEdgeIndex).toBe(edge);
                                expect(context.wavefront.clockwiseNeighbour[segment.from]).toBe(segment.to);
                                struck.push(segment);
                            }
                        }
                    }
                }
            }
            expect(struck.length).toBeGreaterThan(0);
        });
    });

    /*
     * COINCIDENT SPLITS OF ONE SEGMENT (BSA.F97 finding 1, BSA.D293). Two instigators strike one segment at one
     * point in one layer — the reviewer's ring `from → to → P → Ix → Q → Iy → R`, with `(from, to)` the struck
     * segment of edge 0. No roster reaches it, so it is built: a clockwise heptagon whose ring is b0 → … → b6,
     * whose segment (b0, b1) is struck at one point by b3 (Ix) and by b5 (Iy). Each split divides its own
     * ring, so whichever split is resolved first the layer leaves three rings: [from, by, R], [bx, Q, ay] and
     * [to, P, ax], where bx and ax are the bisectors Ix's split bears (towards its clockwise side, and towards
     * its widdershins side) and by and ay are Iy's.
     *
     * Both orders are asserted because the defect is in one of them: the two positions along the edge tie,
     * and a tie read as "ahead of the earlier cut" is right only when the earlier instigator stands
     * clockwise-after the later one. The wrong answer joins two of the three rings into one that still
     * satisfies W1 to W4, so the rings themselves are asserted, not only `checkWavefront`.
     */
    describe('coincident splits of one segment (BSA.F97 finding 1)', () => {
        const HEPTAGON = Array.from({length: 7}, (_, i) => ({
            x: Math.cos(Math.PI / 2 - 2 * Math.PI * i / 7),
            y: Math.sin(Math.PI / 2 - 2 * Math.PI * i / 7),
        }));
        const AT = {x: 0.1, y: 0.2};
        const ORDERS = [['Ix', 'Iy'], ['Iy', 'Ix']] as const;

        const splitOf = (instigator: number, segment: WavefrontSegment): CollisionEvent => ({
            offsetDistance: 0.5,
            arrival: {distance: 0.5, weight: 1, uncertainty: 0},
            positionUncertainty: 0,
            collidingEdges: [instigator, segment.exteriorEdge],
            position: AT,
            intersectionData: [0.5, 0.5, 'converging'],
            eventType: 'interiorAgainstExterior',
            struckSegment: segment,
        });

        /** A ring read from its smallest id, and a set of rings in order of their first ids. */
        const canonical = (rings: number[][]) => rings
            .map(ring => {
                const start = ring.indexOf(Math.min(...ring));
                return [...ring.slice(start), ...ring.slice(0, start)];
            })
            .toSorted((a, b) => a[0] - b[0]);

        /** One layer: both splits resolved in `order`, named struck segment (b0, b1) as at generation. */
        const coincidentLayer = (order: readonly ('Ix' | 'Iy')[]) => {
            const context = initContext(HEPTAGON);
            const [from, to, P, Ix, Q, Iy, R] = interiorIds(context);
            expect(context.getInteriorWithId(from).clockwiseExteriorEdgeIndex).toBe(0);
            expect(context.getInteriorWithId(to).widdershinsExteriorEdgeIndex).toBe(0);
            const segment: WavefrontSegment = {exteriorEdge: 0, from, to};
            const instigators = {Ix, Iy};
            beginLayerLinks(context);
            const borne = new Map<'Ix' | 'Iy', BisectionParams[]>();
            for (const name of order) {
                borne.set(name, handleCollisionEvent(splitOf(instigators[name], segment), context));
            }
            const handled = order.flatMap(name => borne.get(name)!);
            expect(handled).toHaveLength(4);
            return {context, ids: {from, to, P, Q, R}, borne, handled};
        };

        const bearAndSettle = (context: StraightSkeletonSolverContext, params: BisectionParams[]) => {
            const ids = new Map(params.map(p => {
                const id = bisectWithParams(context, p);
                linkBirth(context, p, id);
                return [p, id] as const;
            }));
            settleLayerLinks(context);
            return ids;
        };

        const expectThreeRings = (layer: ReturnType<typeof coincidentLayer>, born: Map<BisectionParams, number>) => {
            const {context, ids: {from, to, P, Q, R}, borne} = layer;
            const [bx, ax] = borne.get('Ix')!.map(p => born.get(p)!);
            const [by, ay] = borne.get('Iy')!.map(p => born.get(p)!);
            const live = [from, to, P, Q, R, bx, ax, by, ay];
            const rings = ringsOfWavefront(context, live);
            expect(canonical(rings)).toEqual(canonical([[from, by, R], [bx, Q, ay], [to, P, ax]]));
            expect(checkWavefront(context, rings.map(ring => ({interiorEdges: ring})))).toEqual([]);
        };

        it.each(ORDERS)('the later split takes the piece on its own ring (%s, then %s)', (...order) => {
            const layer = coincidentLayer(order);
            expectThreeRings(layer, bearAndSettle(layer.context, layer.handled));
        });

        it.each(ORDERS)('the same-start, same-source dedupe keeps a bisector W2 needs (%s, then %s)', (...order) => {
            // ax and ay share their clockwise parent (edge 0) and their source (the one node both splits are
            // sited on), which is the dedupe's key for a re-report of one split. They are two splits, and
            // splicing either out leaves its two neighbours with parents that do not meet.
            const layer = coincidentLayer(order);
            const kept = selectPartitionEvents(layer.context, layer.handled);
            expectThreeRings(layer, bearAndSettle(layer.context, kept));
        });
    });

    /*
     * ADJACENCY BY LINK (BSA.F97 finding 3, BSA.D293). Two bisectors collapse as neighbours when the links say
     * they are neighbours, never because they share a parent: once an exterior edge bounds two segments of one
     * ring, two bisectors that share it need not be adjacent. Built by hand, since no roster reaches it: the
     * heptagon's ring re-linked as the single ring its two coincident splits would make if the second struck
     * the wrong piece — sound by W1 to W4, with edge 0 bounding three of its segments.
     */
    describe('adjacency is read from the links (BSA.F97 finding 3)', () => {
        const HEPTAGON = Array.from({length: 7}, (_, i) => ({
            x: Math.cos(Math.PI / 2 - 2 * Math.PI * i / 7),
            y: Math.sin(Math.PI / 2 - 2 * Math.PI * i / 7),
        }));

        const oneRingWithThreeSegmentsOfEdge0 = () => {
            const context = initContext(HEPTAGON);
            const [b0, b1, b2, b3, b4, b5, b6] = interiorIds(context);
            const node = context.terminateEdgesAtPoint([b3, b5], {x: 0.1, y: 0.2}, 0);
            context.acceptAll([b3, b5]);
            retireBisectors(context, [b3, b5]);
            const bear = (clockwise: number, widdershins: number) => bisectWithParams(context, {
                clockwiseExteriorEdgeIndex: clockwise, widdershinsExteriorEdgeIndex: widdershins, source: node.id,
            });
            const bx = bear(3, 0);
            const ax = bear(0, 2);
            const by = bear(5, 0);
            const ay = bear(0, 4);
            const ring = [b0, bx, b4, ay, b1, b2, ax, by, b6];
            linkInitialRing(context, ring);
            expect(checkWavefront(context, [{interiorEdges: ring}])).toEqual([]);
            return {context, b0, b1, bx, ring};
        };

        it('two bisectors that share a parent but are not neighbours do not collide as a pair', () => {
            const {context, b0, b1} = oneRingWithThreeSegmentsOfEdge0();
            expect(context.getInteriorWithId(b0).clockwiseExteriorEdgeIndex)
                .toBe(context.getInteriorWithId(b1).widdershinsExteriorEdgeIndex);
            const meeting = collideEdges(b0, b1, context).find(event => event.collidingEdges[1] === b1);
            expect(meeting).toBeDefined();
            expect(meeting!.eventType).toBe('interiorNonAdjacent');
            // The coaxial completion prices a named pair the same way.
            expect(priceHeadOnPair(context.getInteriorWithId(b0), context.getInteriorWithId(b1), context).eventType)
                .toBe('interiorNonAdjacent');
        });

        it('the pair collapse refuses two bisectors that are not neighbours', () => {
            const {context, b0, b1} = oneRingWithThreeSegmentsOfEdge0();
            beginLayerLinks(context);
            const params: BisectionParams = {
                clockwiseExteriorEdgeIndex: context.getInteriorWithId(b1).clockwiseExteriorEdgeIndex,
                widdershinsExteriorEdgeIndex: context.getInteriorWithId(b0).widdershinsExteriorEdgeIndex,
                source: 0,
            };
            expect(() => linkPairCollapse(context, [b0, b1], b0, b1, params)).toThrow(/not neighbours/);
        });

        it('the pair collapse takes its sides from the links, whichever collider instigates', () => {
            // b1 and b2 of a clockwise rectangle are neighbours, b1 widdershins of b2: the collapse bisector
            // takes b1's widdershins parent and b2's clockwise parent, and stands between b0 and b3.
            for (const swap of [false, true]) {
                const context = initContext([{x: 0, y: 1}, {x: 4, y: 1}, {x: 4, y: 0}, {x: 0, y: 0}]);
                const [b0, b1, b2, b3] = interiorIds(context);
                const event = collideEdges(b1, b2, context).find(candidate => candidate.eventType === 'interiorPair');
                expect(event).toBeDefined();
                beginLayerLinks(context);
                const [collapse] = handleCollisionEvent(
                    swap ? {...event!, collidingEdges: [b2, b1]} : event!, context);
                expect(collapse.widdershinsExteriorEdgeIndex).toBe(context.getInteriorWithId(b1).widdershinsExteriorEdgeIndex);
                expect(collapse.clockwiseExteriorEdgeIndex).toBe(context.getInteriorWithId(b2).clockwiseExteriorEdgeIndex);
                const born = bisectWithParams(context, collapse);
                linkBirth(context, collapse, born);
                settleLayerLinks(context);
                expect(ringsOfWavefront(context, [b0])).toEqual([[b0, born, b3]]);
            }
        });
    });

    /*
     * A BROKEN LINK IS NEVER DROPPED SILENTLY (BSA.D293). An edge's segments are read from the links, and a
     * segment whose `to` is not live is a W1 break; asked for the edge's segments, the context throws rather
     * than leave the split that asked with one segment fewer. No roster reaches it, so it is built.
     */
    describe('a segment whose clockwise end is not live (BSA.D293)', () => {
        it('throws from the split validation that reads it', () => {
            const context = initContext(T_SHAPE);
            const [b0, , b2] = interiorIds(context);
            context.accept(context.wavefront.clockwiseNeighbour[b0]);
            expect(() => context.validateSplitReachesEdge(b2, 0, {distance: 0.1, weight: 1, uncertainty: 0}))
                .toThrow(/not a live bisector/);
        });
    });

    /*
     * THE GATE'S ACCOUNTING (BSA.F97 finding 2, BSA.D293), driven through the probe with hand-made boundaries:
     * a solve's violations are discarded only from the first boundary at which decision 32's cause holds, and
     * every solve is counted, one that throws outside `stepAlgorithm` and one that never finishes included.
     * These state the gate's mechanism on built inputs; which roster solves trip the cause is the red file's.
     */
    describe('the gate counts every solve and asserts every violation before the cause', () => {
        const probe = () => activeWavefrontProbe()!;
        /** A T-shape context whose every interior edge has a target, so a finished solve reads as complete. */
        const finishedContext = () => {
            const context = initContext(T_SHAPE);
            context.graph.interiorEdges.forEach(edge => {
                context.graph.edges[edge.id].target = 0;
            });
            return context;
        };

        it('asserts the violations at boundaries before the cause and discards those from it on', () => {
            const report = runRoster([{
                label: 'built',
                run: () => {
                    const context = finishedContext();
                    const ids = interiorIds(context);
                    // Boundary 0: one input that leaves out a live bisector (W3), with no accepted parent yet.
                    probe().stepBoundary!(context, [{interiorEdges: ids.slice(1)}]);
                    // Boundary 1: an exterior edge accepted while the bisectors that name it are live.
                    context.accept(context.getInteriorWithId(ids[2]).clockwiseExteriorEdgeIndex);
                    probe().stepBoundary!(context, [{interiorEdges: ids.slice(1)}]);
                    probe().solveFinished!(context, []);
                },
            }]);
            expect(report.solves).toBe(1);
            expect(report.completeSolves).toBe(1);
            expect(report.violations.length).toBeGreaterThan(0);
            expect(report.violations.every(v => v.step === 0)).toBe(true);
            expect(report.earlyAcceptanceSolves).toHaveLength(1);
            expect(report.earlyAcceptanceSolves[0].fromStep).toBe(1);
            expect(report.earlyAcceptanceSolves[0].discarded).toBeGreaterThan(0);
        });

        it('counts a solve that throws outside stepAlgorithm, and records the throw on its entry', () => {
            const report = runRoster([{
                label: 'thrown',
                run: () => {
                    const context = finishedContext();
                    probe().stepBoundary!(context, [{interiorEdges: interiorIds(context)}]);
                    throw new Error('outside stepAlgorithm');
                },
            }]);
            expect(report.solves).toBe(1);
            expect(report.thrownSolves).toEqual([{label: 'thrown', step: 1}]);
            expect(report.entries).toEqual([{label: 'thrown', solves: 1, error: 'outside stepAlgorithm'}]);
        });

        it('names an entry that ran no solve and threw nothing', () => {
            const report = runRoster([{label: 'silent', run: () => undefined}]);
            expect(unaccountedEntries(report)).toEqual([{label: 'silent', solves: 0}]);
        });
    });

    describe('the gate: W1 to W4 at every step boundary (decision 15)', () => {
        it('holds on every FULL_CORPUS fixture and every weighted fixture that solves completely', () => {
            const roster = corpusRoster();
            expect(roster).toHaveLength(2 * FULL_CORPUS.length + WEIGHTED_TEST_POLYGONS.length);
            const report = runRoster(roster);
            // eslint-disable-next-line no-console
            console.log(describeReport('FULL_CORPUS at 1e-6 and 1e-5, and the weighted fixtures', report));
            expect(report.entries).toHaveLength(roster.length);
            // No corpus fixture throws; a weighted fixture may, refused at the weight door. Each is recorded.
            expect(report.entries.filter(entry => entry.label.startsWith('corpus@') && entry.error !== undefined)).toEqual([]);
            expect(unaccountedEntries(report)).toEqual([]);
            expect(report.violations).toEqual([]);
        });
    });
});
