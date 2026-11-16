import type { HoledTestPolygon } from '@proc-geo/test-fixtures';

/**
 * THE REFUSAL SPECIMEN (dashboard holed-fixtures spec, decision 51, as the skeleton flat-ring and third-front spec,
 * decision 53, replaces it): grid draw `uniform-1-523` of building-shell's two-courtyard fuzz, in cm. A 1350 by 700 block
 * with a wing [1350, 1700] x [450, 650] on its E side, round the holes [900, 1150] x [300, 450] and [150, 550] x
 * [200, 600]. A later layer gathers two bisectors of one ring and one of the other at one node, a vertex event across
 * rings of three runs, and core refuses it by name. It replaces node 5's E′, which those rules cure. Not in the roster,
 * which holds fixtures that solve (node 6, decision 29), so the dashboard's tests build it here.
 */
export const REFUSAL_SPECIMEN: HoledTestPolygon = {
    name: 'grid draw uniform-1-523: three runs at one node',
    outline: [{x: 0, y: 0}, {x: 0, y: 700}, {x: 1350, y: 700}, {x: 1350, y: 650}, {x: 1700, y: 650}, {x: 1700, y: 450},
        {x: 1350, y: 450}, {x: 1350, y: 0}],
    holes: [
        {vertices: [{x: 900, y: 300}, {x: 1150, y: 300}, {x: 1150, y: 450}, {x: 900, y: 450}]},
        {vertices: [{x: 150, y: 200}, {x: 550, y: 200}, {x: 550, y: 600}, {x: 150, y: 600}]},
    ],
};

/** A fixture's holes in the shape the dashboard's store and boundary take: mutable copies. */
export function holesOf(fixture: HoledTestPolygon): { vertices: { x: number; y: number }[]; weights?: number[] }[] {
    return fixture.holes.map(hole => ({
        vertices: hole.vertices.map(vertex => ({x: vertex.x, y: vertex.y})),
        weights: hole.weights === undefined ? undefined : [...hole.weights],
    }));
}
