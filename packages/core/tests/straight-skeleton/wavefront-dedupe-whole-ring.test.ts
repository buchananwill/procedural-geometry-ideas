/*
 * THE SAME-START, SAME-SOURCE DEDUPE DROPS A WHOLE RING OF RE-REPORTS (BSA.F97 finding 1, BSA.D293).
 *
 * The dedupe keeps a candidate re-report whenever dropping it would leave its live neighbours with parents
 * that do not meet (`droppableBirths`), and drops it when the candidates make up a whole ring between
 * themselves: nothing is left to join. On the eleven sweep cells below, every drop the rosters make is of
 * that kind — a pair of re-reports born at one node with each other's parents, a ring of zero area — and
 * bearing them leaves the pair in the graph, two edges too many, and on seven of the cells a skeleton that
 * is no longer a tree.
 *
 * STATED AS A PROPERTY OF EACH SOLVE: it completes, and no node bears two bisectors with each other's
 * parents; on the seven cells that solve to a tree today, it still does. The other four are not trees
 * before or after this dedupe and are not asserted to be — this test names no defect.
 */
import {buildSkeletonTree, setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {allCells} from '../sweep-harness/sweep';

setSkeletonLogLevel('silent');

/** `true` where the solve is a tree today; the rosette cells and `k7:s31676` are not, for causes of their own. */
const WHOLE_RING_DEDUPE_CELLS: [string, boolean][] = [
    ['fine:rosette40@40000000000', false],
    ['fine:rosette40@50000000000', false],
    ['fine:rosette40@60000000000', false],
    ['offedge:L:k5:s63352', true],
    ['offedge:plus:k3:s63352', true],
    ['offedge:plus:k6:s31676', true],
    ['offedge:plus:k6:s63352', true],
    ['offedge:plus:k7:s15838', true],
    ['offedge:plus:k7:s31676', false],
    ['offedge:plus:k9:s15838', true],
    ['offedge:plus:k10:s23757', true],
];

describe('the dedupe drops a whole ring of re-reports', () => {
    jest.setTimeout(5 * 60 * 1000);
    const cells = allCells();

    it.each(WHOLE_RING_DEDUPE_CELLS)('%s completes and bears no zero-area pair at one node (tree: %s)', (name, tree) => {
        const cell = cells.find(candidate => candidate.name === name);
        expect(cell).toBeDefined();
        const result = solveSkeleton(cell!.vertices, cell!.options);
        expect(result.complete).toBe(true);

        const {graph} = result;
        const bySourceAndParents = new Set(graph.interiorEdges.map(edge =>
            `${graph.edges[edge.id].source}:${edge.clockwiseExteriorEdgeIndex}:${edge.widdershinsExteriorEdgeIndex}`));
        const zeroAreaPairs = graph.interiorEdges
            .filter(edge => edge.clockwiseExteriorEdgeIndex !== edge.widdershinsExteriorEdgeIndex
                && bySourceAndParents.has(
                    `${graph.edges[edge.id].source}:${edge.widdershinsExteriorEdgeIndex}:${edge.clockwiseExteriorEdgeIndex}`))
            .map(edge => `e${edge.id} from n${graph.edges[edge.id].source}`);
        expect(zeroAreaPairs).toEqual([]);
        if (tree) {
            expect(buildSkeletonTree(result).isTree).toBe(true);
        }
    });
});
