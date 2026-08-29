import {
    flattenRecursiveTree,
    subdivideRecursively,
    uniformLevelSpecs,
    MAX_RECURSION_LEVELS,
} from '@proc-geo/core';
import type { RecursiveNode } from '@proc-geo/core';
import type { SceneGroup, ScenePrimitive } from '../../src/scene/types';
import {
    describeProvenance,
    focusedRegionToScene,
    regionListRows,
    standaloneSolve,
} from '../../src/scene/adapters/regionInspector';
import { recursiveTreeToScene } from '../../src/scene/adapters/recursiveSubdivisionToScene';
import { EXPLORER_PERCEPTUAL_FLOOR } from '../../src/scene/perceptual-floor';
import { RESIDUE_TREE, TREE } from '../fixtures/recursive-trees';
import { INCORRECT_ORDERING_E38_E30_COLLISION } from '@proc-geo/test-fixtures';

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
 * The dials the last surviving failing region in the corpus is taken at.
 *
 * RE-SPECIMENED 2026-08-29, AND THE MOVE IS BIGGER THAN THE PREVIOUS ONES. The specimen was `r0.2.1`
 * of the seed-55433 L at depth 0.5 / merge group 6, chosen because its captured boundary reproduced
 * its failure when solved standing alone. Journal decision 108(b) put every dashboard solve path on
 * {@link EXPLORER_PERCEPTUAL_FLOOR}, and at 1e-5 that fixture's tree carries NO failing region at all
 * — the defect was below what this canvas can draw, which is decision 106's thesis landing on the very
 * test that measured it.
 *
 * What replaced it was found by sweeping the whole corpus over depths 0.25/0.5/0.6/0.75/0.9/1 and
 * merge groups 1–6 at the demo floor. That sweep returns EXACTLY ONE failing region: `r0.1.3` of
 * `Incorrect Ordering e38-e30 Collision` at depth 0.25, merge group 3 — the same region journal
 * decision 108(a) signalled as the price of the unified threading, an exactly anti-parallel interior
 * edge pair whose two maxOffsets sit 3.5e-7 apart.
 *
 * PERISHABLE, AND MORE SO THAN ANY SPECIMEN BEFORE IT. This is not one of five candidates; it is the
 * last one. A fix to decision 101's coincident-arrival defect is expected to cure it, and when it does
 * there is nothing in the corpus to re-point to — the successor to this specimen is a fixture
 * constructed on purpose, not another one harvested. Say so here rather than leaving the next reader
 * to run the sweep again and find it empty.
 */
const DEFECT_LEVELS = uniformLevelSpecs({
    levels: MAX_RECURSION_LEVELS,
    mergeGroupSize: 3,
    depthFraction: 0.25,
    residue: 'recurse',
});

/** The one region left in the corpus that the driver cannot solve at the explorer's floor. */
const DEFECT_REGION_ID = 'r0.1.3';

/**
 * The failing region, found by id rather than by index path.
 *
 * BY ID BECAUSE THE ID IS THE HANDLE. The inspector lists regions by id (journal decision 97) and the
 * core census names them the same way, so a specimen quoted as `r0.1.3` should be fetched as `r0.1.3`
 * — an index path like `children[1].children[3]` is a second, silently-drifting spelling of the same
 * region, and this tree does not even honour it: residue children make the ordinal path disagree with
 * the id.
 */
function defectRegion(): RecursiveNode {
    const tree = subdivideRecursively(INCORRECT_ORDERING_E38_E30_COLLISION, {
        levels: DEFECT_LEVELS,
        perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR,
    });
    const region = flattenRecursiveTree(tree).find((node) => node.id === DEFECT_REGION_ID);
    if (region === undefined) throw new Error(`${DEFECT_REGION_ID} is no longer in this tree`);
    return region;
}

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
        // THE WHOLE AFFORDANCE, ON THE REGION IT WAS BUILT FOR. The inspector solves the polygon the
        // driver's wavefront actually ran on and gets the same incomplete solve the driver recorded,
        // which is what puts the driver's verdict and a fresh one in the same frame.
        //
        // ON `canonicalBoundary`, NOT `boundary`, and that distinction is now the whole test. The
        // driver's floor reaches this region as the ROOT's floor restated in region units — 4e-5 here,
        // coarser than the raw 1e-5 — and it removes one vertex whose deviation is 2.17e-5. The solve
        // that failed is the solve of the 8-vertex ring that came out of that removal, so that is the
        // ring handed in here. Core's own `unsolvableRegion()` made exactly this move for exactly this
        // reason (finding F38a: a region can be made unsolvable BY the pass-down).
        const region = defectRegion();

        expect(region.failure).toBeDefined();
        expect(region.boundary).toHaveLength(9);
        expect(region.canonicalBoundary).toHaveLength(8);

        const solve = standaloneSolve(region.canonicalBoundary);
        expect(solve.status).toBe('incomplete');
        expect(solve.detail).toContain('2 interior edge(s) finished without a target node: 17, 19');
        // Verbatim: the driver's recorded failure CONTAINS this solve's detail as a substring, so a
        // reader comparing the two panels is comparing the same words and not a paraphrase.
        expect(region.failure).toContain(solve.detail);
    });

    it('reports a handed-in boundary that solves where the driver failed, rather than hiding it', () => {
        // THE DIFFERENCE IS THE FINDING, which is what `standaloneSolve`'s docstring promises. This
        // region's boundary AS CAPTURED solves cleanly: it is only unsolvable once the root's floor,
        // carried down into region units, has taken an invisible vertex out of it. A standalone solve
        // that quietly agreed with the driver here would conceal the most interesting fact about this
        // region — that the pass-down, not the polygon, is what made it fail.
        const region = defectRegion();

        expect(standaloneSolve(region.boundary).status).toBe('solved');
        expect(standaloneSolve(region.canonicalBoundary).status).toBe('incomplete');
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
        //
        // Drawn from `canonicalBoundary` for the same reason the diagnostics pin above reads it: that
        // is the ring the failing solve ran on, and it is the only ring in the corpus that still
        // produces this picture at the explorer's floor.
        const region = defectRegion();
        const boundary = region.canonicalBoundary;
        const scene = focusedRegionToScene(boundary, standaloneSolve(boundary));

        expect(groupIds(scene)).toEqual(['group:focus-boundary', 'group:focus-vertices']);
        expect(childrenOf(scene, 'group:focus-boundary')).toHaveLength(1);
        expect(childrenOf(scene, 'group:focus-vertices')).toHaveLength(2 * boundary.length);
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
