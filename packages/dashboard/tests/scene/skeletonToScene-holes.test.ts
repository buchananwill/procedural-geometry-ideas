import { REMOVED_VERTEX_INDEX } from '@proc-geo/core';
import type { SkeletonSolveResult } from '@proc-geo/core';
import { HOLED_F1, HOLED_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import type { HoledTestPolygon } from '@proc-geo/test-fixtures';
import { solveHoledSkeletonGuarded } from '../../src/hooks/skeleton-solve-boundary';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { skeletonToScene } from '../../src/scene/adapters/skeletonToScene';
import type { SceneGroup, SceneLabel, SceneLine, ScenePrimitive, SceneRegion } from '../../src/scene/types';
import type { DebugDisplayOptions } from '../../src/types';
import { E_PRIME, holesOf } from '../fixtures/holed-specimens';
import { ALL_FLAGS_OFF } from './single-loop-scene-digest';

/*
 * ============================================================================
 *  A HOLED FIXTURE ON THE CANVAS (dashboard holed-fixtures spec, decisions 24 to 31 and 45)
 * ============================================================================
 *
 * The polygon is one even-odd region with a closed stroke per loop; every arrow and exterior edge label lies on one
 * loop's own edge, so no segment joins two loops; the exterior numbers are the solver's global ids; a vertex the solver
 * removed from a hole is marked on that hole; and an incomplete result shows what was not finished.
 */

const LABELS_AND_DIRECTIONS: DebugDisplayOptions = {
    ...ALL_FLAGS_OFF, showEdgeIndices: true, showNodeIndices: true, showEdgeDirections: true,
};

interface Drawn {
    fixture: HoledTestPolygon;
    result: SkeletonSolveResult;
    loops: { x: number; y: number }[][];
    scene: ScenePrimitive[];
}

function solved(fixture: HoledTestPolygon): SkeletonSolveResult {
    const outcome = solveHoledSkeletonGuarded(fixture.outline.map(v => ({...v})), {
        perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR, weights: fixture.weights, holes: holesOf(fixture)});
    if (outcome.result === null) throw new Error(`${fixture.name}: ${outcome.error}`);
    return outcome.result;
}

function draw(fixture: HoledTestPolygon, debug: DebugDisplayOptions, result = solved(fixture)): Drawn {
    const holes = holesOf(fixture);
    const vertices = fixture.outline.map(v => ({...v}));
    const scene = skeletonToScene({
        vertices, skeleton: result.graph, debug, collisionSweepLines: null, nodeOffsetDistances: null,
        selectedDebugNodes: new Set(), invScale: 1, solverVertexRemap: result.loopMaps?.[0].vertexToNode ?? null,
        holes, solverLoopMaps: result.loopMaps, incomplete: !result.complete,
    });
    return {fixture, result, loops: [vertices, ...holes.map(hole => hole.vertices)], scene};
}

function group(scene: ScenePrimitive[], id: string): SceneGroup {
    const found = scene.find((p): p is SceneGroup => p.type === 'group' && p.id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
}

const extentOf = (fixture: HoledTestPolygon) => {
    const xs = fixture.outline.map(v => v.x);
    const ys = fixture.outline.map(v => v.y);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/** The loop and edge whose two ends are `a` and `b`, in either order, within `tolerance`; null when none is. */
function loopEdgeOf(loops: { x: number; y: number }[][], a: { x: number; y: number }, b: { x: number; y: number },
    tolerance: number): { loop: number; edge: number } | null {
    const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= tolerance;
    for (const [loop, ring] of loops.entries()) {
        for (let edge = 0; edge < ring.length; edge++) {
            const from = ring[edge];
            const to = ring[(edge + 1) % ring.length];
            if ((near(from, a) && near(to, b)) || (near(from, b) && near(to, a))) return {loop, edge};
        }
    }
    return null;
}

const ROSTER = HOLED_TEST_POLYGONS.map(fixture => [fixture.name, fixture] as const);

describe('the polygon of a holed fixture', () => {
    it.each(ROSTER)('%s: one region of 1 + h rings, each a loop, filled at 0.1 of the outline\'s blue', (_name, fixture) => {
        const {loops, scene} = draw(fixture, ALL_FLAGS_OFF);
        const regions = group(scene, 'group:polygon').children.filter((p): p is SceneRegion => p.type === 'region');
        expect(regions).toHaveLength(1);
        expect(regions[0].rings).toEqual(loops.map(loop => loop.flatMap(v => [v.x, v.y])));
        expect(regions[0].rings).toHaveLength(1 + fixture.holes.length);
        expect(regions[0].fill).toEqual({color: '#4c6ef5', opacity: 0.1});
    });

    it.each(ROSTER)('%s: one closed stroke per loop, and nothing else stroked', (_name, fixture) => {
        const {loops, scene} = draw(fixture, ALL_FLAGS_OFF);
        const lines = group(scene, 'group:polygon').children.filter((p): p is SceneLine => p.type === 'line');
        expect(lines.map(line => ({points: line.points, closed: line.closed, stroke: line.stroke})))
            .toEqual(loops.map(loop => ({points: loop.flatMap(v => [v.x, v.y]), closed: true, stroke: {color: '#4c6ef5', width: 2}})));
    });
});

describe('edge directions and exterior labels stay on one loop\'s own edge (decisions 26 and 27)', () => {
    it.each(ROSTER)('%s: every arrow is one edge of one loop, drawn the way the solver walks it', (_name, fixture) => {
        const {loops, scene, result} = draw(fixture, LABELS_AND_DIRECTIONS);
        const tolerance = 1e-9 * extentOf(fixture);
        const arrows = group(scene, 'group:polygon').children.filter((p): p is SceneLine => p.type === 'line' && p.arrow !== undefined);
        expect(arrows).toHaveLength(loops.reduce((total, loop) => total + loop.length, 0));
        const graph = result.graph;
        for (const arrow of arrows) {
            const from = {x: arrow.points[0], y: arrow.points[1]};
            const to = {x: arrow.points[2], y: arrow.points[3]};
            expect(loopEdgeOf(loops, from, to, tolerance)).not.toBeNull();
            // The same direction as a solved exterior edge: some edge runs from `from` to `to`.
            const solvedEdge = Array.from({length: graph.numExteriorNodes}, (_unused, e) => e).find(e => {
                const source = graph.nodes[graph.edges[e].source].position;
                const target = graph.nodes[graph.edges[e].target!].position;
                return Math.hypot(source.x - from.x, source.y - from.y) <= tolerance
                    && Math.hypot(target.x - to.x, target.y - to.y) <= tolerance;
            });
            expect({arrow: arrow.points, solved: solvedEdge !== undefined}).toEqual({arrow: arrow.points, solved: true});
        }
    });

    it.each(ROSTER)('%s: every exterior edge label sits at the middle of one loop\'s own edge', (_name, fixture) => {
        const {loops, scene} = draw(fixture, LABELS_AND_DIRECTIONS);
        const tolerance = 1e-9 * extentOf(fixture);
        const labels = group(scene, 'group:debug-labels').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.style.color === '#4dabf7' && /^e\d+$/.test(p.text));
        const midpoints = loops.flatMap(loop => loop.map((v, i) => {
            const next = loop[(i + 1) % loop.length];
            return {x: (v.x + next.x) / 2, y: (v.y + next.y) / 2};
        }));
        for (const label of labels) {
            const onEdge = midpoints.some(m => Math.hypot(m.x - label.x, m.y - label.y) <= tolerance);
            expect({label: label.text, onEdge}).toEqual({label: label.text, onEdge: true});
        }
    });

    it.each(ROSTER)('%s: the exterior node labels are the solver\'s global ids 0 .. numExteriorNodes − 1', (_name, fixture) => {
        const {scene, result} = draw(fixture, LABELS_AND_DIRECTIONS);
        const numbers = group(scene, 'group:debug-labels').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.style.color === '#ffffff')
            .map(label => Number(label.text))
            .sort((a, b) => a - b);
        expect(numbers).toEqual(Array.from({length: result.graph.numExteriorNodes}, (_unused, id) => id));
    });

    it('F1: e3\'s label sits at (5, 0), the middle of the outline\'s last edge, not across the loops', () => {
        // Decision 27's worked example: the modulo over all eight nodes would put it at (9, 2.75).
        const {scene} = draw(HOLED_F1, LABELS_AND_DIRECTIONS);
        const e3 = group(scene, 'group:debug-labels').children
            .find((p): p is SceneLabel => p.type === 'label' && p.text === 'e3' && p.style.color === '#4dabf7')!;
        expect(e3.x).toBeCloseTo(5, 9);
        expect(e3.y).toBeCloseTo(0, 9);
    });

    it('F1: the hole given clockwise is reversed, so caller edge 0 is drawn from (7,4.5) to (8,5.5)', () => {
        // Decision 26's worked example, on F1's hole given clockwise.
        const clockwise: HoledTestPolygon = {...HOLED_F1, holes: [{vertices: [
            {x: 8, y: 5.5}, {x: 7, y: 4.5}, {x: 6, y: 5.5}, {x: 7, y: 6.5}]}]};
        const {scene, result} = draw(clockwise, LABELS_AND_DIRECTIONS);
        expect(result.loopMaps?.[1].reversed).toBe(true);
        const arrows = group(scene, 'group:polygon').children.filter((p): p is SceneLine => p.type === 'line' && p.arrow !== undefined);
        expect(arrows[4].points).toEqual([7, 4.5, 8, 5.5]);
    });
});

describe('the removed mark is per loop (decision 29)', () => {
    it('marks a hole\'s collinear vertex on the hole, where the solver removed it', () => {
        const withCollinear: HoledTestPolygon = {
            name: 'F1 outline, a square hole with a vertex on its top wall',
            outline: HOLED_F1.outline,
            holes: [{vertices: [{x: 4, y: 4}, {x: 6, y: 4}, {x: 6, y: 6}, {x: 5, y: 6}, {x: 4, y: 6}]}],
        };
        const {scene, result} = draw(withCollinear, {...ALL_FLAGS_OFF, showNodeIndices: true});
        expect(result.loopMaps?.[1].vertexToNode[3]).toBe(REMOVED_VERTEX_INDEX);
        const marks = group(scene, 'group:debug-labels').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.text === 'x');
        expect(marks.map(mark => ({x: mark.x, y: mark.y}))).toEqual([{x: 5, y: 6}]);
    });
});

describe('an incomplete holed result shows what was not finished (decision 30)', () => {
    it('E′: the unresolved edges are drawn with their toggle off', () => {
        const result = solved(E_PRIME);
        expect(result.complete).toBe(false);
        const {scene} = draw(E_PRIME, ALL_FLAGS_OFF, result);
        const unresolved = group(scene, 'group:unresolved-edges');
        expect(unresolved.visible).toBe(true);
        expect(unresolved.children.length).toBeGreaterThan(0);
    });

    it('a complete holed result keeps the toggle\'s word', () => {
        const {scene} = draw(HOLED_F1, ALL_FLAGS_OFF);
        expect(group(scene, 'group:unresolved-edges').visible).toBe(false);
    });
});
