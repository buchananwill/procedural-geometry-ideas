/*
 * A LEVEL RIDGE REACHED AT ONE MOMENT AT TWO POINTS IS PAIRED WITH THE NEARER (BSA.F107, BSA.D335).
 *
 * Two walls that face each other meet along a whole line at one instant, so the ridge bisector they bear is LEVEL: every
 * point of it has the same time. Any other bisector with one of those two walls as a parent reaches that line at that
 * same instant, wherever it reaches it. So when two such bisectors are still live, the ridge has two rival meetings at
 * one moment and at two points, and time cannot say which comes first. Position along the ridge's ray can: the ridge
 * grows from its source, and the nearer meeting ends it. The pairwise fallback used to break that tie by edge id, which
 * here took the far meeting, ran the ridge past the near one and left a node inside another wall's face, with the solve
 * reporting `complete` and no diagnostic.
 *
 * THE OUTLINE is `LEVEL_RIDGE_TIE`, a bar [0,1000]×[0,500] with a notch [300,600]×[400,500] cut from its top:
 *
 *  - The right block's walls x = 600 (W, from the notch to the top) and x = 1000 (E) face each other. Its top wall
 *    collapses at t* = 400 / (w_W + w_E), exactly as W and E meet, so the ridge is born at the top at t* and runs down
 *    the line x = 600 + w_W · t*.
 *  - The notch's floor (y = 400, steep) is overtaken by the tab's gentle roof (y = 500, fast), parallel and facing the
 *    same way, and the bisector between W and the tab's roof follows. It reaches the ridge line at t*, at
 *    y = 500 − w_roof · t*: the NEAR meeting.
 *  - The hip between E and the bar's floor (y = 0) reaches the ridge line at t* too, at y = w_floor · t*: the FAR one.
 *
 * Measured on the parent of BSA.D335's stage 1 commit: the far meeting is taken, no node lies at the near point, and an
 * arc runs from the ridge's source to the far point. Times here are in the caller's units at the given speeds; the solver
 * normalises speeds, which scales every time alike and moves no position.
 */
import type {StraightSkeletonGraph, Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';
import {LEVEL_RIDGE_TIE} from './level-ridge-fixtures';

setSkeletonLogLevel('silent');

const [wFloor, wE, wTop, wW, , , wRoof] = LEVEL_RIDGE_TIE.weights;
const ridgeTime = 400 / (wW + wE);
const ridgeX = 600 + wW * ridgeTime;
/** Where the ridge is born: the right block's top wall gone. */
const RIDGE_SOURCE: Vector2 = {x: ridgeX, y: 500 - wTop * ridgeTime};
/** Where the bisector between W and the tab's roof reaches the ridge. */
const NEAR_MEETING: Vector2 = {x: ridgeX, y: 500 - wRoof * ridgeTime};
/** Where the hip between E and the floor reaches the ridge. */
const FAR_MEETING: Vector2 = {x: ridgeX, y: wFloor * ridgeTime};

/** Positions agree to a millionth of the outline's 1000-unit extent. */
const POSITION_TOLERANCE = 1e-3;
const near = (p: Vector2, q: Vector2) => Math.hypot(p.x - q.x, p.y - q.y) <= POSITION_TOLERANCE;

const nodesAt = (graph: StraightSkeletonGraph, point: Vector2) =>
    graph.nodes.filter(node => near(node.position, point));

/** True where a non-culled interior arc joins the two points, in either direction. */
function hasArc(graph: StraightSkeletonGraph, from: Vector2, to: Vector2): boolean {
    return graph.interiorEdges.some(interior => {
        const edge = graph.edges[interior.id];
        if (interior.culled || edge.target === undefined) {
            return false;
        }
        const source = graph.nodes[edge.source].position;
        const target = graph.nodes[edge.target].position;
        return (near(source, from) && near(target, to)) || (near(source, to) && near(target, from));
    });
}

describe('a level ridge reached at one moment at two points is paired with the nearer (BSA.F107, BSA.D335)', () => {
    const result = solveSkeleton(LEVEL_RIDGE_TIE.vertices, {weights: LEVEL_RIDGE_TIE.weights});

    it('states the tie: the near meeting lies between the ridge source and the far one', () => {
        expect(RIDGE_SOURCE.y).toBeGreaterThan(NEAR_MEETING.y);
        expect(NEAR_MEETING.y).toBeGreaterThan(FAR_MEETING.y);
    });

    it('completes, with no diagnostic but the winding', () => {
        expect(result.complete).toBe(true);
        expect(result.diagnostics.map(diagnostic => diagnostic.kind)).toEqual(['winding-normalised']);
    });

    it('ends the ridge at the near meeting: one node there, joined to the ridge source', () => {
        expect(nodesAt(result.graph, RIDGE_SOURCE)).toHaveLength(1);
        expect(nodesAt(result.graph, NEAR_MEETING)).toHaveLength(1);
        expect(hasArc(result.graph, RIDGE_SOURCE, NEAR_MEETING)).toBe(true);
    });

    it('runs no arc from the ridge source to the far meeting', () => {
        expect(hasArc(result.graph, RIDGE_SOURCE, FAR_MEETING)).toBe(false);
    });
});
