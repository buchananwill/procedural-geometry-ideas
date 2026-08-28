import {canonicaliseForSolve, runAlgorithmV5} from '@proc-geo/core';
import {INVISIBLE_VERTEX_INDEX, INVISIBLE_VERTEX_RECTANGLE} from '@proc-geo/test-fixtures';
import {skeletonToScene} from '../../src/scene/adapters/skeletonToScene';
import type {ScenePrimitive, SceneGroup, SceneLabel} from '../../src/scene/types';
import type {DebugDisplayOptions} from '../../src/types';

/*
 * ============================================================================
 *  THE OVERLAY NUMBERS THE POLYGON THE SOLVER SOLVED.
 * ============================================================================
 *
 * Journal decision 75, 2026-08-28. This canvas draws interior edge ids, parent pairs and skeleton
 * node ids straight from the solved graph, and it used to draw the exterior vertex and edge numbers
 * from the caller's own array. The two are the same numbering only while the boundary stage removes
 * nothing — and it removes any vertex lying on its own edge, which is precisely what this canvas's
 * click-to-insert creates, since it projects the click onto the segment.
 *
 * WHAT THAT LOOKED LIKE. A dashboard inspection of a first solve reported a bisector missing from a
 * three-way collision and three consecutive primary bisectors each carrying the parent pair of the
 * vertex before it — "a very serious defect to allow a primary bisector to be accepted with the
 * wrong pair of parent edges". The graph was correct in every particular. The picture was showing
 * two index spaces at once, and one removed vertex is the whole of the difference between them.
 * `invisible-vertex-renumbering.test.ts` in the core package is the same shape read from the graph.
 */

const DEBUG_ALL_LABELS: DebugDisplayOptions = {
    showExteriorEdgeLengths: false,
    showInteriorEdgeLengths: false,
    showSelectedNodeEdgeLengths: false,
    showSkeletonNodes: false,
    showPrimaryIntersectionNodes: false,
    showNodeIndices: true,
    showEdgeIndices: true,
    showOffsetDistances: false,
    showSweepEventDetails: false,
    showUnresolvedEdges: false,
    showEdgeDirections: false,
    showParentEdges: true,
    showCollisionSweep: false,
};

function labelsOf(scene: ScenePrimitive[]): SceneLabel[] {
    const labels: SceneLabel[] = [];
    const walk = (primitives: ScenePrimitive[]): void => {
        for (const primitive of primitives) {
            if (primitive.type === 'label') labels.push(primitive);
            if (primitive.type === 'group') walk((primitive as SceneGroup).children);
        }
    };
    walk(scene);
    return labels;
}

/** The scene the straight-skeleton page builds for this fixture, with every index label on. */
function sceneForFixture(withRemap: boolean): ScenePrimitive[] {
    const vertices = INVISIBLE_VERTEX_RECTANGLE.map(vertex => ({...vertex}));
    return skeletonToScene({
        vertices,
        skeleton: runAlgorithmV5(vertices).graph,
        debug: DEBUG_ALL_LABELS,
        collisionSweepLines: null,
        nodeOffsetDistances: null,
        selectedDebugNodes: new Set<number>(),
        invScale: 1,
        solverVertexRemap: withRemap ? canonicaliseForSolve(vertices).indexRemap : null,
    });
}

/**
 * The label drawn at `position` IN THE VERTEX SLOT — white for a number, red for the removed mark.
 *
 * Filtered by that slot rather than by position alone because an exterior edge label lands on the
 * same point: the vertex this fixture loses is the exact midpoint of the edge that replaces it, so
 * the solve's `e4` is drawn precisely where the caller's vertex 5 sits.
 */
function labelAt(labels: SceneLabel[], position: {x: number, y: number}): string[] {
    return labels
        .filter(label => label.style?.color === '#ffffff' || label.style?.color === '#ff6b6b')
        .filter(label => Math.hypot(label.x - position.x, label.y - position.y) < 1e-9)
        .map(label => label.text);
}

describe('exterior labels are the solver\'s indices, not the caller\'s', () => {
    const labels = labelsOf(sceneForFixture(true));

    it('numbers fifteen vertices for sixteen inputs, and stops at 14', () => {
        const vertexNumbers = labels
            .filter(label => /^\d+$/.test(label.text) && label.style?.color === '#ffffff')
            .map(label => Number(label.text))
            .sort((first, second) => first - second);

        expect(vertexNumbers).toEqual(Array.from({length: 15}, (_unused, index) => index));
    });

    it('draws the number the solver uses at the vertex the caller calls 6', () => {
        // The vertex after the removal. Its bisector carries the parents [5,4] on the graph, and
        // labelling it 6 here is what made those parents look like the vertex before it.
        expect(labelAt(labels, INVISIBLE_VERTEX_RECTANGLE[6])).toContain('5');
        expect(labelAt(labels, INVISIBLE_VERTEX_RECTANGLE[6])).not.toContain('6');
    });

    it('marks the removed vertex rather than numbering it', () => {
        expect(labelAt(labels, INVISIBLE_VERTEX_RECTANGLE[INVISIBLE_VERTEX_INDEX])).toEqual(['x']);
    });

    it('labels the exterior edges the solve has, one fewer than the caller wrote', () => {
        const edgeNumbers = labels
            .filter(label => /^e\d+$/.test(label.text) && label.style?.color === '#4dabf7')
            .map(label => label.text);

        expect(edgeNumbers).toHaveLength(15);
        expect(edgeNumbers).not.toContain('e15');
    });

    it('still numbers the vertices without a remap, and simply marks nothing', () => {
        // The remap is optional and only the marking depends on it: a caller that cannot supply one
        // must not fall back to the caller-indexed numbering this file exists to remove.
        const withoutRemap = labelsOf(sceneForFixture(false));

        expect(labelAt(withoutRemap, INVISIBLE_VERTEX_RECTANGLE[6])).toContain('5');
        expect(labelAt(withoutRemap, INVISIBLE_VERTEX_RECTANGLE[INVISIBLE_VERTEX_INDEX])).toEqual([]);
    });
});
