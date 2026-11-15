import { REMOVED_VERTEX_INDEX } from '@proc-geo/core';
import type { SkeletonSolveResult } from '@proc-geo/core';
import { HOLED_F1, HOLED_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import type { HoledTestPolygon } from '@proc-geo/test-fixtures';
import { HOLED_REFUSED_CANVAS_TEXT, HOLED_REFUSED_STALE_CANVAS_TEXT } from '../../src/components/holed-fixture-text';
import { solveHoledSkeletonGuarded, solveHoledSkeletonSteppedGuarded } from '../../src/hooks/skeleton-solve-boundary';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { skeletonToScene } from '../../src/scene/adapters/skeletonToScene';
import type { SceneGroup, SceneLabel, SceneLine, ScenePrimitive, SceneRegion } from '../../src/scene/types';
import type { DebugDisplayOptions } from '../../src/types';
import { REFUSAL_SPECIMEN, holesOf } from '../fixtures/holed-specimens';
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
    it('the refusal specimen: the unresolved edges are drawn with their toggle off', () => {
        const result = solved(REFUSAL_SPECIMEN);
        expect(result.complete).toBe(false);
        const {scene} = draw(REFUSAL_SPECIMEN, ALL_FLAGS_OFF, result);
        const unresolved = group(scene, 'group:unresolved-edges');
        expect(unresolved.visible).toBe(true);
        expect(unresolved.children.length).toBeGreaterThan(0);
    });

    it('a complete holed result keeps the toggle\'s word', () => {
        const {scene} = draw(HOLED_F1, ALL_FLAGS_OFF);
        expect(group(scene, 'group:unresolved-edges').visible).toBe(false);
    });
});

/*
 * ============================================================================
 *  NODE 7'S REVIEW FIXES ON THE CANVAS (BSA.D323)
 * ============================================================================
 */

/** Every primitive of a scene, groups opened. */
function flatten(scene: ScenePrimitive[]): ScenePrimitive[] {
    return scene.flatMap(p => p.type === 'group' ? flatten(p.children) : [p]);
}

/** F1's outline with a vertex clicked onto its right wall at (10, 5): the solve removes it as collinear. */
const F1_WITH_INSERTED: { x: number; y: number }[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 5}, {x: 10, y: 0}];
/** The same after (10, 10) is deleted: the new wall from (0, 10) to (10, 5) touches the hole, and core refuses it. */
const F1_AFTER_DELETE: { x: number; y: number }[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 10, y: 5}, {x: 10, y: 0}];
/** F1's outline with (10, 10) dragged to (6, 10): the right wall now crosses the hole, and core refuses it. */
const F1_DRAGGED_ACROSS: { x: number; y: number }[] = [{x: 0, y: 0}, {x: 0, y: 10}, {x: 6, y: 10}, {x: 10, y: 0}];

const STALE_GREY = '#868e96';

function sceneOf(vertices: { x: number; y: number }[], holes: { vertices: { x: number; y: number }[] }[],
    debug: DebugDisplayOptions, extra: Partial<Parameters<typeof skeletonToScene>[0]>): ScenePrimitive[] {
    return skeletonToScene({
        vertices, skeleton: null, debug, collisionSweepLines: null, nodeOffsetDistances: null,
        selectedDebugNodes: new Set(), invScale: 1, holes, ...extra,
    });
}

describe('M1: while core refuses the current loops, nothing indexed by the last good solve\'s maps is drawn', () => {
    const holes = holesOf(HOLED_F1);
    const lastGood = solved({...HOLED_F1, outline: F1_WITH_INSERTED});
    const refusal = solveHoledSkeletonGuarded(F1_AFTER_DELETE, {perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR, holes});

    it('the scenario: the inserted vertex is removed by the good solve, and the edit after it is refused', () => {
        expect(lastGood.loopMaps?.[0].vertexToNode[3]).toBe(REMOVED_VERTEX_INDEX);
        expect(refusal.result).toBeNull();
        expect(refusal.error).not.toBeNull();
    });

    it('no removed mark lands on (10, 0), or anywhere, with the stale maps and the stale skeleton given', () => {
        const scene = sceneOf(F1_AFTER_DELETE, holes, LABELS_AND_DIRECTIONS, {
            skeleton: lastGood.graph, solverLoopMaps: lastGood.loopMaps,
            solverVertexRemap: lastGood.loopMaps?.[0].vertexToNode, refused: true,
        });
        const marks = flatten(scene).filter((p): p is SceneLabel => p.type === 'label' && p.text === 'x');
        expect(marks).toEqual([]);
    });

    it('the current loops are numbered in caller order, on the current vertices, and the arrows run caller order', () => {
        const scene = sceneOf(F1_AFTER_DELETE, holes, LABELS_AND_DIRECTIONS, {
            skeleton: lastGood.graph, solverLoopMaps: lastGood.loopMaps, refused: true,
        });
        const nodeLabels = group(scene, 'group:debug-labels').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.style.color === '#ffffff')
            .map(label => ({text: label.text, x: label.x, y: label.y}));
        const current = [...F1_AFTER_DELETE, ...holes[0].vertices];
        expect(nodeLabels).toEqual(current.map((v, index) => ({text: `${index}`, x: v.x, y: v.y})));
        const arrows = group(scene, 'group:polygon').children
            .filter((p): p is SceneLine => p.type === 'line' && p.arrow !== undefined);
        expect(arrows[0].points).toEqual([0, 0, 0, 10]);
        expect(arrows[4].points).toEqual([8, 5.5, 7, 6.5]);
    });

    it('maps of the same shape are not indexed either: a reversed hole\'s arrows run caller order while refused', () => {
        // The last good solve had F1's hole given clockwise, so its map reverses the hole; the outline was then dragged
        // across the hole. Every map still has one entry per vertex, so only the refusal can say they are stale.
        const clockwise = [{vertices: [{x: 8, y: 5.5}, {x: 7, y: 4.5}, {x: 6, y: 5.5}, {x: 7, y: 6.5}]}];
        const lastClockwise = solved({...HOLED_F1, holes: clockwise});
        expect(lastClockwise.loopMaps?.[1].reversed).toBe(true);
        const scene = sceneOf(F1_DRAGGED_ACROSS, clockwise, LABELS_AND_DIRECTIONS, {
            skeleton: lastClockwise.graph, solverLoopMaps: lastClockwise.loopMaps, refused: true,
        });
        const arrows = group(scene, 'group:polygon').children
            .filter((p): p is SceneLine => p.type === 'line' && p.arrow !== undefined);
        expect(arrows[4].points).toEqual([8, 5.5, 7, 4.5]);
    });

    it('maps that do not fit the current loops are never indexed, even without the refusal flag', () => {
        const scene = sceneOf(F1_AFTER_DELETE, holes, {...ALL_FLAGS_OFF, showNodeIndices: true}, {
            solverLoopMaps: lastGood.loopMaps,
        });
        const marks = flatten(scene).filter((p): p is SceneLabel => p.type === 'label' && p.text === 'x');
        expect(marks).toEqual([]);
    });

    it('the last good skeleton is drawn as a dashed grey ghost with its own outline, never in the skeleton\'s yellow', () => {
        const scene = sceneOf(F1_AFTER_DELETE, holes, ALL_FLAGS_OFF, {skeleton: lastGood.graph, refused: true});
        const edges = group(scene, 'group:skeleton-edges').children as SceneLine[];
        expect(edges.length).toBeGreaterThan(0);
        for (const edge of edges) {
            expect(edge.stroke).toEqual({color: STALE_GREY, width: 1.5, dash: [6, 4]});
        }
        const ghosts = group(scene, 'group:polygon').children
            .filter((p): p is SceneLine => p.type === 'line' && p.stroke.color === STALE_GREY);
        expect(ghosts).toHaveLength(2);
        expect(ghosts[0].closed).toBe(true);
        expect(ghosts[0].stroke.dash).toEqual([6, 4]);
        // And the canvas itself says what the ghost is.
        const banner = flatten(scene).filter((p): p is SceneLabel => p.type === 'label' && p.text === HOLED_REFUSED_STALE_CANVAS_TEXT);
        expect(banner).toHaveLength(1);
    });

    it('nothing else of the last good solve is drawn: no node or interior labels, unresolved rays, sweeps or previews', () => {
        const everything: DebugDisplayOptions = Object.fromEntries(
            Object.keys(ALL_FLAGS_OFF).map(key => [key, true])) as unknown as DebugDisplayOptions;
        const scene = sceneOf(F1_AFTER_DELETE, holes, everything, {
            skeleton: lastGood.graph, solverLoopMaps: lastGood.loopMaps, refused: true, incomplete: true,
            primaryEdges: [{source: {x: 1, y: 1}, target: {x: 2, y: 2}} as never],
            primaryEdgeIntersections: [{x: 1, y: 1}],
            collisionSweepLines: [{sourceX: 0, sourceY: 0, targetX: 1, targetY: 1, offsetDistance: 1, edgeIdA: 0,
                edgeIdB: 1, eventType: 'x', intersectionType: 'y', alongRay1: 0, alongRay2: 0} as never],
            nodeOffsetDistances: new Map([[8, 1]]),
            selectedDebugNodes: new Set([8]),
        });
        for (const id of ['group:primary-edges', 'group:unresolved-edges', 'group:selected-node-edges',
            'group:collision-sweep', 'group:debug-node-labels', 'group:intersection-nodes']) {
            expect({id, children: group(scene, id).children}).toEqual({id, children: []});
        }
        const labels = group(scene, 'group:debug-labels').children as SceneLabel[];
        // Only the current loops' own labels: lengths, edge indices and node indices, in caller order.
        expect(labels.filter(label => !['#4dabf7', '#ffffff'].includes(label.style.color))).toEqual([]);
    });
});

describe('M2: while core refuses the current loops, the region is not filled', () => {
    const holes = holesOf(HOLED_F1);
    const lastGood = solved(HOLED_F1);

    it('the scenario: an outline dragged across F1\'s hole is refused', () => {
        const refusal = solveHoledSkeletonGuarded(F1_DRAGGED_ACROSS, {perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR, holes});
        expect(refusal.result).toBeNull();
    });

    it.each([['the stale skeleton kept', true], ['no skeleton', false]])('no region and no filled line, with %s', (_how, keep) => {
        for (const debug of [ALL_FLAGS_OFF, LABELS_AND_DIRECTIONS]) {
            const scene = sceneOf(F1_DRAGGED_ACROSS, holes, debug, {
                skeleton: keep ? lastGood.graph : null, solverLoopMaps: lastGood.loopMaps, refused: true,
            });
            const primitives = flatten(scene);
            expect(primitives.filter(p => p.type === 'region')).toEqual([]);
            expect(primitives.filter(p => p.type === 'line' && p.fill !== undefined)).toEqual([]);
        }
    });

    it('the current loops are stroked closed in red, unfilled, and the canvas says why', () => {
        const scene = sceneOf(F1_DRAGGED_ACROSS, holes, ALL_FLAGS_OFF, {refused: true});
        const strokes = group(scene, 'group:polygon').children.filter((p): p is SceneLine => p.type === 'line');
        expect(strokes.map(line => ({points: line.points, closed: line.closed, stroke: line.stroke}))).toEqual(
            [F1_DRAGGED_ACROSS, holes[0].vertices].map(loop => ({
                points: loop.flatMap(v => [v.x, v.y]), closed: true, stroke: {color: '#ff6b6b', width: 2}})));
        const banner = group(scene, 'group:polygon').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.text === HOLED_REFUSED_CANVAS_TEXT);
        expect(banner).toHaveLength(1);
    });

    it('without the refusal the same loops keep their even-odd region', () => {
        const scene = sceneOf(HOLED_F1.outline.map(v => ({...v})), holes, ALL_FLAGS_OFF, {skeleton: lastGood.graph,
            solverLoopMaps: lastGood.loopMaps});
        expect(flatten(scene).filter(p => p.type === 'region')).toHaveLength(1);
    });
});

describe('L2: one numbering whether the skeleton is shown or hidden', () => {
    const exteriorLabels = (scene: ScenePrimitive[]) => group(scene, 'group:debug-labels').children
        .filter((p): p is SceneLabel => p.type === 'label' && ['#4dabf7', '#ffffff'].includes(p.style.color))
        .map(label => ({text: label.text, colour: label.style.color, x: label.x, y: label.y}));

    function shownAndHidden(fixture: HoledTestPolygon) {
        const {result, scene: shown} = draw(fixture, LABELS_AND_DIRECTIONS);
        const hidden = sceneOf(fixture.outline.map(v => ({...v})), holesOf(fixture), LABELS_AND_DIRECTIONS, {
            solverLoopMaps: result.loopMaps});
        return {result, shown: exteriorLabels(shown), hidden: exteriorLabels(hidden)};
    }

    it('F1 with its hole given clockwise: e4 sits at one place, the solver\'s, shown or hidden', () => {
        const clockwise: HoledTestPolygon = {...HOLED_F1, holes: [{vertices: [
            {x: 8, y: 5.5}, {x: 7, y: 4.5}, {x: 6, y: 5.5}, {x: 7, y: 6.5}]}]};
        const {shown, hidden} = shownAndHidden(clockwise);
        const e4 = (labels: typeof shown) => labels.find(label => label.text === 'e4' && label.colour === '#4dabf7')!;
        // Solver edge 4 runs (7, 6.5) to (6, 5.5) on the reversed hole.
        expect([e4(shown).x, e4(shown).y]).toEqual([6.5, 6]);
        expect([e4(hidden).x, e4(hidden).y]).toEqual([6.5, 6]);
    });

    it.each(ROSTER)('%s: the hidden labels are the shown labels', (_name, fixture) => {
        const {shown, hidden} = shownAndHidden(fixture);
        const tolerance = 1e-9 * extentOf(fixture);
        expect(hidden.map(label => label.text)).toEqual(shown.map(label => label.text));
        hidden.forEach((label, i) => {
            expect(Math.hypot(label.x - shown[i].x, label.y - shown[i].y)).toBeLessThanOrEqual(tolerance);
        });
    });

    it.each(ROSTER)('%s: every exterior edge label e{n} sits at the middle of the solved graph\'s edge n', (_name, fixture) => {
        const {result, scene} = draw(fixture, LABELS_AND_DIRECTIONS);
        const graph = result.graph;
        const tolerance = 1e-9 * extentOf(fixture);
        const labels = group(scene, 'group:debug-labels').children
            .filter((p): p is SceneLabel => p.type === 'label' && p.style.color === '#4dabf7' && /^e\d+$/.test(p.text));
        expect(labels).toHaveLength(graph.numExteriorNodes);
        for (const label of labels) {
            const edge = graph.edges[Number(label.text.slice(1))];
            const a = graph.nodes[edge.source].position;
            const b = graph.nodes[edge.target!].position;
            expect(Math.hypot((a.x + b.x) / 2 - label.x, (a.y + b.y) / 2 - label.y)).toBeLessThanOrEqual(tolerance);
        }
    });

    it('a hole\'s removed vertex is marked with the skeleton hidden too', () => {
        const withCollinear: HoledTestPolygon = {
            name: 'F1 outline, a square hole with a vertex on its top wall',
            outline: HOLED_F1.outline,
            holes: [{vertices: [{x: 4, y: 4}, {x: 6, y: 4}, {x: 6, y: 6}, {x: 5, y: 6}, {x: 4, y: 6}]}],
        };
        const result = solved(withCollinear);
        const scene = sceneOf(HOLED_F1.outline.map(v => ({...v})), holesOf(withCollinear),
            {...ALL_FLAGS_OFF, showNodeIndices: true}, {solverLoopMaps: result.loopMaps});
        const marks = flatten(scene).filter((p): p is SceneLabel => p.type === 'label' && p.text === 'x');
        expect(marks.map(mark => ({x: mark.x, y: mark.y}))).toEqual([{x: 5, y: 6}]);
    });
});

describe('L3: a step-through frame that is not the last shows pending bisectors as the toggle says', () => {
    const stepped = solveHoledSkeletonSteppedGuarded(REFUSAL_SPECIMEN.outline, {
        perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR, holes: holesOf(REFUSAL_SPECIMEN)}).result!;
    const frame = (index: number, pendingFrame: boolean, debug: DebugDisplayOptions) => sceneOf(
        REFUSAL_SPECIMEN.outline.map(v => ({...v})), holesOf(REFUSAL_SPECIMEN), debug, {
            skeleton: stepped.snapshots[index], solverLoopMaps: stepped.result.loopMaps,
            incomplete: !stepped.result.complete, pendingFrame});

    it('the refusal specimen steps through more than one frame, incomplete, with targetless bisectors on its first', () => {
        expect(stepped.result.complete).toBe(false);
        expect(stepped.snapshots.length).toBeGreaterThan(1);
        expect(group(frame(0, true, ALL_FLAGS_OFF), 'group:unresolved-edges').children.length).toBeGreaterThan(0);
    });

    it('on a frame before the last, incomplete does not force the pending bisectors on screen', () => {
        expect(group(frame(0, true, ALL_FLAGS_OFF), 'group:unresolved-edges').visible).toBe(false);
    });

    it('on a frame before the last, the toggle still shows them', () => {
        expect(group(frame(0, true, {...ALL_FLAGS_OFF, showUnresolvedEdges: true}), 'group:unresolved-edges').visible)
            .toBe(true);
    });

    it('on the last frame decision 30 holds: incomplete shows them with the toggle off', () => {
        const last = stepped.snapshots.length - 1;
        expect(group(frame(last, false, ALL_FLAGS_OFF), 'group:unresolved-edges').visible).toBe(true);
    });
});
