import { subdivideRecursively, uniformLevelSpecs, FULL_DEPTH_FRACTION, MAX_RECURSION_LEVELS } from '@proc-geo/core';
import type { SceneGroup, ScenePrimitive } from '../../src/scene/types';
import {
    describeProvenance,
    focusedRegionToScene,
    regionListRows,
    standaloneSolve,
} from '../../src/scene/adapters/regionInspector';
import { recursiveTreeToScene } from '../../src/scene/adapters/recursiveSubdivisionToScene';
import { RESIDUE_TREE, TREE } from '../fixtures/recursive-trees';
import { OFF_EDGE_JITTER_L_SEED_55433 } from '@proc-geo/test-fixtures';

/**
 * The region inspector: one region of a subdivision tree, listed by id and drawn on its own.
 *
 * What is asserted here is the affordance journal decision 97 asks for, in the two halves that can
 * fail separately — that a region can be FOUND by name, and that looking at it says which of two
 * things went wrong. The second half is the whole point: a boundary drawn alone with its vertices
 * numbered, beside a fresh solve of that same boundary, distinguishes a cutter defect from a solver
 * defect, and neither is visible on the whole-tree canvas.
 */

/**
 * The dials the core suite's failing-region specimen is taken at, so the region inspected here is
 * the one `region-tree.test.ts` and `recursive-subdivision.test.ts` pin.
 *
 * RE-SPECIMENED 2026-08-29. This was the census grid's own composition and the region was `r0.10` of
 * the seed-55433 L — F35's large arm patch — until journal decision 100's fold fix cured it: it was
 * carrying an invisible spike that canonicalisation's clamped predicate had screened above the floor,
 * and removing the spike makes the region solve. That fixture's whole census count went 3 to 0.
 *
 * `r0.2.1` at depth 0.5, merge group 6 replaces it, and it was chosen for THIS suite's requirement
 * above all: of the five regions left anywhere in the corpus that still fail a solve, it is one of
 * only two whose captured boundary reproduces the same failure when the inspector solves it standing
 * alone. A region whose standalone solve SUCCEEDS would leave the test below asserting nothing.
 */
const DEFECT_LEVELS = uniformLevelSpecs({
    levels: MAX_RECURSION_LEVELS,
    mergeGroupSize: 6,
    depthFraction: 0.5,
    residue: 'recurse',
});

function groupIds(scene: ScenePrimitive[]): string[] {
    return scene.filter((primitive): primitive is SceneGroup => primitive.type === 'group')
        .map((group) => group.id);
}

function childrenOf(scene: ScenePrimitive[], id: string): ScenePrimitive[] {
    const group = scene.find(
        (primitive): primitive is SceneGroup => primitive.type === 'group' && primitive.id === id);
    return group?.children ?? [];
}

describe('the region list', () => {
    it('lists every region of the tree in the order its ids number them', () => {
        const rows = regionListRows(TREE);

        expect(rows.map((row) => row.node.id)).toEqual(['r0', 'r0.0', 'r0.1', 'r0.2', 'r0.2.0']);
        expect(rows.map((row) => row.indent)).toEqual([0, 1, 1, 1, 2]);
    });

    it('names where each region came from inside its parent', () => {
        expect(regionListRows(RESIDUE_TREE).map((row) => row.origin))
            .toEqual(['root', 'residue ring 0', 'residue ring 1']);
        expect(describeProvenance(TREE.children[1])).toBe('segment 1');
    });
});

describe('the standalone solve', () => {
    it('completes on a region whose boundary is a polygon the solver can finish', () => {
        const solve = standaloneSolve(TREE.boundary);

        expect(solve.status).toBe('solved');
        expect(solve.detail).toBe('');
        expect(solve.result?.complete).toBe(true);
    });

    it('refuses a boundary that is no polygon, without throwing', () => {
        const solve = standaloneSolve([{ x: 0, y: 0 }, { x: 1, y: 1 }]);

        expect(solve.status).toBe('degenerate');
        expect(solve.result).toBeUndefined();
    });

    it('reports the solver\'s own diagnostics for the live defect region, verbatim', () => {
        // THE WHOLE AFFORDANCE, ON THE REGION IT WAS BUILT FOR. `r0.2.1` of the seed-55433 L is one
        // of the five sub-polygons the driver still cannot solve: the inspector solves its captured
        // boundary again and gets the same incomplete solve the driver got, which is what puts the
        // driver's verdict and a fresh one in the same frame.
        const tree = subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, { levels: DEFECT_LEVELS });
        const region = tree.children[2].children[1];

        expect(region.id).toBe('r0.2.1');
        expect(region.failure).toBeDefined();

        const solve = standaloneSolve(region.boundary);
        expect(solve.status).toBe('incomplete');
        expect(solve.detail).toContain('2 interior edge(s) finished without a target node: 29, 32');
        expect(region.failure).toContain(solve.detail);
    });
});

describe('the focused picture', () => {
    it('draws the boundary and a numbered dot per vertex, and the skeleton under them', () => {
        const scene = focusedRegionToScene(TREE.boundary, standaloneSolve(TREE.boundary));

        // Skeleton first so the boundary lands on top of it: here the boundary is the subject and
        // the solve is the evidence about it, which is the reverse of the whole-tree canvas.
        expect(groupIds(scene)).toEqual([
            'group:focus-skeleton', 'group:focus-boundary', 'group:focus-vertices',
        ]);

        const vertices = childrenOf(scene, 'group:focus-vertices');
        expect(vertices.filter((primitive) => primitive.type === 'point'))
            .toHaveLength(TREE.boundary.length);
        expect(vertices.filter((primitive) => primitive.type === 'label')
            .map((primitive) => (primitive.type === 'label' ? primitive.text : '')))
            .toEqual(TREE.boundary.map((_unused, index) => `${index}`));
    });

    it('draws the boundary of a region that will not solve, and no skeleton at all', () => {
        // The distinguishing picture: a ring with no arcs under it is a solver failure, a ring with
        // a visible kink is a cutter failure, and the reader is looking at both facts at once.
        const tree = subdivideRecursively(OFF_EDGE_JITTER_L_SEED_55433, { levels: DEFECT_LEVELS });
        const region = tree.children[2].children[1];
        const scene = focusedRegionToScene(region.boundary, standaloneSolve(region.boundary));

        expect(groupIds(scene)).toEqual(['group:focus-boundary', 'group:focus-vertices']);
        expect(childrenOf(scene, 'group:focus-boundary')).toHaveLength(1);
        expect(childrenOf(scene, 'group:focus-vertices'))
            .toHaveLength(2 * region.boundary.length);
    });
});

describe('the whole-tree canvas names its failure patches', () => {
    it('labels an unsolved patch with the region id the inspector lists it under', () => {
        // Canvas and panel cite the same region, which is what lets a reader carry a defect from one
        // to the other. Without the id the patch says only THAT something failed.
        const scene = recursiveTreeToScene(TREE, { levelVisibility: [], showLeafFills: false });
        const labels = scene
            .filter((primitive): primitive is SceneGroup => primitive.type === 'group')
            .flatMap((group) => group.children)
            .filter((primitive) => primitive.type === 'label')
            .map((primitive) => (primitive.type === 'label' ? primitive.text : ''));

        expect(labels).toContain('unsolved r0.1');
    });
});
