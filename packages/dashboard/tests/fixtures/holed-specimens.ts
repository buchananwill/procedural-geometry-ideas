import type { HoledTestPolygon } from '@proc-geo/test-fixtures';

/**
 * NODE 5'S E′, THE REFUSAL SPECIMEN (dashboard holed-fixtures spec, decision 51; the simultaneous-rings spec): the
 * outline [0,21]×[0,10] with holes [3,9]×[3,7] and [12,18]×[3,7], every gap 3, so a corner of each hole reaches one
 * wall together and core refuses the layer. Not in the roster, which holds fixtures that solve (node 6, decision 29),
 * so the dashboard's tests build it here.
 */
export const E_PRIME: HoledTestPolygon = {
    name: 'E′: two holes, every gap equal',
    outline: [{x: 0, y: 0}, {x: 0, y: 10}, {x: 21, y: 10}, {x: 21, y: 0}],
    holes: [
        {vertices: [{x: 3, y: 3}, {x: 9, y: 3}, {x: 9, y: 7}, {x: 3, y: 7}]},
        {vertices: [{x: 12, y: 3}, {x: 18, y: 3}, {x: 18, y: 7}, {x: 12, y: 7}]},
    ],
};

/** A fixture's holes in the shape the dashboard's store and boundary take: mutable copies. */
export function holesOf(fixture: HoledTestPolygon): { vertices: { x: number; y: number }[]; weights?: number[] }[] {
    return fixture.holes.map(hole => ({
        vertices: hole.vertices.map(vertex => ({x: vertex.x, y: vertex.y})),
        weights: hole.weights === undefined ? undefined : [...hole.weights],
    }));
}
