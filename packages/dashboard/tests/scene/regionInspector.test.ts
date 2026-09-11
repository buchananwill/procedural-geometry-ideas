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
import { FULL_CORPUS, INCORRECT_ORDERING_E38_E30_COLLISION } from '@proc-geo/test-fixtures';

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
 *
 * ============================================================================
 *  AND ON 2026-09-11 IT WAS CURED. THE SPECIMEN IS EXTINCT.
 * ============================================================================
 *
 * The COAXIALITY LANE (journal decision 137, spec A9/A10) cured it, and the attribution is exact:
 * this region's failure was "an exactly anti-parallel interior edge pair" (decision 108(a)), and the
 * lane is precisely the bar that decides whether such a pair is priced head-on or orphaned.
 * `sourceLiesAhead` answered that POSITIONAL question — "are these two sources on one line?" — at
 * `FLOATING_POINT_EPSILON` (1e-8) while the explorer's own floor is 1e-5, three decades coarser; the
 * pair's lateral offset fell in that band, so the solver refused an event the client could not even
 * see was in question. `r0.1.3` now solves, its canonical 8-vertex ring re-solves complete, and its
 * tree carries no failure of any kind.
 *
 * RE-SWEPT THE WHOLE CORPUS THE SAME DAY — all 59 fixtures × merge groups 1–6 × depths
 * 0.25/0.5/0.6/0.75/0.9/1, at this floor — and there is NOT ONE failing region anywhere, degenerate
 * declines aside; nor does any corpus RING fail as a root at this floor. The prediction above has
 * landed exactly as written, so the two tests that needed an unsolvable driver-cut region are
 * replaced below by the assertion that records the extinction, and the constructed successor the
 * paragraph above calls for is left to the lead: which ring, and whether it is enrolled, is a design
 * act and not a delegate's re-pin.
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

    it('has no unsolvable driver-cut region left to report on: the specimen is extinct', () => {
        /*
         * WHAT THIS REPLACES, AND WHY IT IS AN ASSERTION RATHER THAN A DELETION.
         *
         * Two tests stood here. One pinned the inspector reporting the solver's own diagnostics
         * VERBATIM for `r0.1.3` — that a reader comparing the driver's panel and a fresh solve is
         * comparing the same words. The other pinned the more interesting fact about that region:
         * its boundary AS CAPTURED solved cleanly and only became unsolvable once the root's floor,
         * carried down into region units, took an invisible vertex out of it — so a standalone solve
         * that quietly agreed with the driver would have concealed that the PASS-DOWN, not the
         * polygon, was what made it fail.
         *
         * Both needed an unsolvable driver-cut region, and there is no longer one anywhere in the
         * corpus at this floor — see the block comment on {@link DEFECT_LEVELS} for the cure and its
         * attribution. Deleting them silently would leave the next reader to run the sweep again and
         * find it empty; this asserts the emptiness instead, so the day a region fails here again
         * this test fires and the affordance gets its specimen back.
         *
         * THE AFFORDANCE ITSELF IS NOT UNTESTED. `standaloneSolve`'s three statuses are pinned above
         * and below — `solved` on a region that finishes, `degenerate` on input that is no polygon —
         * and the `incomplete` branch is exercised by the whole-tree canvas's failure-patch tests.
         * What is missing is a REAL specimen for it, and constructing one is a design act the lead
         * owns.
         */
        const failing: string[] = [];
        for (const polygon of FULL_CORPUS) {
            const tree = subdivideRecursively(polygon.vertices, {
                levels: DEFECT_LEVELS,
                perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR,
            });
            for (const node of flattenRecursiveTree(tree)) {
                if (node.failure === undefined || node.failure.startsWith('Degenerate region')) continue;
                failing.push(`${polygon.name}: ${node.id}`);
            }
        }

        expect(failing).toEqual([]);
    });

    it('still solves the region that used to be the specimen, canonical ring and all', () => {
        // THE CURE, QUOTED ON THE REGION IT HAPPENED TO. `r0.1.3` is still in the tree, still nine
        // vertices, and its own floor still removes one of them — everything about the region is as
        // it was except that both rings now solve. That is what makes this an attributed cure rather
        // than a specimen that wandered off: the geometry did not move, the predicate did.
        const region = defectRegion();

        expect(region.failure).toBeUndefined();
        expect(region.boundary).toHaveLength(9);
        expect(region.canonicalBoundary).toHaveLength(8);
        expect(standaloneSolve(region.boundary).status).toBe('solved');
        expect(standaloneSolve(region.canonicalBoundary).status).toBe('solved');
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

    it('draws the boundary of a region that produced no skeleton, and no skeleton group at all', () => {
        // The distinguishing picture: a ring with no arcs under it is a solver failure, a ring with
        // a visible kink is a cutter failure, and the reader is looking at both facts at once.
        //
        // DRAWN FROM A DEGENERATE RING SINCE 2026-09-11, AND THAT IS A LOSS THIS COMMENT OWNS. It used
        // to be drawn from `r0.1.3`'s `canonicalBoundary` — the last ring in the corpus that produced
        // this picture at the explorer's floor, and the coaxiality lane cured it (see the block
        // comment on `DEFECT_LEVELS`). What the branch actually turns on is whether the solve yielded
        // any arcs, and a ring the solver refuses outright yields none, so the branch is still
        // covered; what is gone is the SPECIMEN — a real region that draws a ring with nothing under
        // it — and its constructed successor is the lead's call.
        const boundary = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
        const solve = standaloneSolve(boundary);
        expect(solve.result).toBeUndefined();

        const scene = focusedRegionToScene(boundary, solve);

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
