/*
 * THE NEIGHBOUR GUARD'S STANDING TEST (skeleton wavefront-order spec, decisions 19 and 30; BSA.D292).
 *
 * The guard refuses a split whose struck segment is bounded by the instigator, or by the instigator's
 * neighbour on the side the segment would be reached from: such a strike is the edge event of the
 * instigator and its neighbour misread as a split. With validation ahead of it, the guard decides a solve
 * on one cell of the 642-cell sweep, `offedge:plus:k7:s7919`.
 *
 * STATED AS A PROPERTY OF THAT SOLVE: at every step boundary, for every reflex primary bisector of every
 * step input and every exterior edge that input bounds, `generateSplitEvent` — the guarded generator the
 * collision layer asks — offers no split on a segment the instigator's own ring forbids. The test also
 * requires the solve to complete and the generator to offer splits, so it cannot pass by offering none.
 *
 * NOT ASKED OF `generateSplitEventFromTheEdgeItself`: its direct-strike path carries no guard (in today's
 * code or the arithmetic's before it), and on this very cell a direct strike on a neighbour's neighbour is
 * resolved (e106 on (e170, e189) of edge 22). That path is BSA.F96's, and measured separately.
 */
import type {AlgorithmStepInput, StraightSkeletonSolverContext} from '@proc-geo/core';
import {generateSplitEvent, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '@proc-geo/core/straight-skeleton/wavefront-check';
import {allCells} from '../sweep-harness/sweep';

setSkeletonLogLevel('silent');

const GUARDED_CELL = 'offedge:plus:k7:s7919';

describe('the neighbour guard', () => {
    it(`offers no split on ${GUARDED_CELL} that strikes a segment bounded by its instigator or its neighbour`, () => {
        const cell = allCells().find(candidate => candidate.name === GUARDED_CELL);
        expect(cell).toBeDefined();
        const forbidden: string[] = [];
        let offered = 0;
        let step = 0;
        setWavefrontProbe({
            stepBoundary: (context: StraightSkeletonSolverContext, inputs: readonly AlgorithmStepInput[]) => {
                for (const input of inputs) {
                    const edges = [...new Set(input.interiorEdges.flatMap(id => {
                        const bisector = context.getInteriorWithId(id);
                        return [bisector.clockwiseExteriorEdgeIndex, bisector.widdershinsExteriorEdgeIndex];
                    }))];
                    for (const id of input.interiorEdges) {
                        const instigator = context.getInteriorWithId(id);
                        if (!context.isReflexEdge(instigator) || context.edgeRank(id) !== 'primary') {
                            continue;
                        }
                        for (const edge of edges) {
                            const event = generateSplitEvent(instigator, context.getEdgeWithId(edge), context);
                            if (event?.struckSegment === undefined) {
                                continue;
                            }
                            offered++;
                            const segment = event.struckSegment;
                            const clockwise = context.wavefront.clockwiseNeighbour[id];
                            const widdershins = context.wavefront.widdershinsNeighbour[id];
                            if (segment.from === id || segment.from === clockwise
                                || segment.to === id || segment.to === widdershins) {
                                forbidden.push(`step ${step}: e${id} (cw e${clockwise}, ws e${widdershins}) offered `
                                    + `(e${segment.from}, e${segment.to}) of edge ${edge}`);
                            }
                        }
                    }
                }
                step++;
            },
        });
        let complete: boolean;
        try {
            complete = solveSkeleton(cell!.vertices, cell!.options).complete;
        } finally {
            setWavefrontProbe(null);
        }
        expect(complete).toBe(true);
        expect(offered).toBeGreaterThan(0);
        expect([...new Set(forbidden)]).toEqual([]);
    });
});
