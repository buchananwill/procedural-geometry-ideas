/*
 * THE WAVEFRONT'S STORED ORDER (docs/notes/skeleton-wavefront-order-decisions.md). The links are written by
 * every event and are the solver's source of wavefront order; this suite states the invariants W1 to W4
 * directly, convicts `checkWavefront` on hand-broken states, and runs it at every step boundary of every
 * `FULL_CORPUS` fixture and every weighted fixture as the standing gate on link writing (decisions 15, 23).
 * The 642-cell sweep and the recursion census's regions run in `wavefront-order-sweep.test.ts` and
 * `wavefront-order-census.test.ts`; spec decision 32's red cells in `wavefront-order-early-acceptance.test.ts`.
 */
import type {CollisionEvent, StraightSkeletonSolverContext, WavefrontSegment} from '@proc-geo/core';
import {
    bisectWithParams,
    checkWavefront,
    collideEdges,
    handleCollisionEvent,
    ringsOfWavefront,
    setSkeletonLogLevel,
    solveSkeleton,
} from '@proc-geo/core';
import {beginLayerLinks, linkBirth, settleLayerLinks} from '@proc-geo/core/straight-skeleton/wavefront';
import {CROSS, FULL_CORPUS, initContext, T_SHAPE, WEIGHTED_TEST_POLYGONS} from '@proc-geo/test-fixtures';
import {describeReport, emptyReport, withWavefrontProbe} from './wavefront-probe-helpers';

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

    describe('the gate: W1 to W4 at every step boundary (decision 15)', () => {
        it('holds on every FULL_CORPUS fixture and every weighted fixture that solves completely', () => {
            const report = emptyReport();
            let label = '';
            withWavefrontProbe(report, () => label, () => {
                for (const floor of [1e-6, 1e-5]) {
                    for (const fixture of FULL_CORPUS) {
                        label = `corpus@${floor}:${fixture.name}`;
                        solveSkeleton(fixture.vertices, {perceptualFloor: floor});
                    }
                }
                for (const fixture of WEIGHTED_TEST_POLYGONS) {
                    label = `weighted:${fixture.name}`;
                    try {
                        solveSkeleton(fixture.vertices, {weights: fixture.weights});
                    } catch {
                        // A refusal at the weight door (§4's refusal fixtures) runs no solve.
                    }
                }
            });
            // eslint-disable-next-line no-console
            console.log(describeReport('FULL_CORPUS at 1e-6 and 1e-5, and the weighted fixtures', report));
            expect(report.solves).toBeGreaterThan(FULL_CORPUS.length);
            expect(report.violations).toEqual([]);
        });
    });
});
