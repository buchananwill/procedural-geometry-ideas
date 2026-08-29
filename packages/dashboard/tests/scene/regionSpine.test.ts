import type { SpineStrategy } from '@proc-geo/core';
import {
    DEFAULT_WAVEFRONT_TIME_FRACTION,
    DEFAULT_WHISKER_PRUNE_FRACTION,
} from '../../src/stores/useRecursiveSubdivisionStore';
import { OFF_EDGE_JITTER_L_SEED_55433 } from '@proc-geo/test-fixtures';
import { regionSpine, summariseSpines, trySolveSkeleton } from '../../src/scene/adapters/regionSpine';
import {
    failedNode,
    LOBED_SPLIT_STRATEGY,
    LOBED_TREE,
    nodeWithBoundary,
    TREE,
} from '../fixtures/recursive-trees';

/**
 * What each spine definition extracts from a region, and what a level's spines came to.
 *
 * Three candidate definitions of "the part that would carry a road" have never been compared, and
 * the page exists to compare them — so what is asserted here is mostly that the three DISAGREE, and
 * that a summary reports a spine that came apart rather than tidying it away. Every node in these
 * fixtures carries a real boundary, so unlike the page's counts these numbers are facts about
 * geometry: a square's skeleton is a fan of four bisectors, 28.28 long in total, and its diameter is
 * two of them.
 *
 * Tested beside the scene adapters rather than beside the store because that is where this lives: it
 * reads a `RecursiveNode` and answers in the tree's own terms, touching no store state at all.
 */

/** The tree's own scale, so a fraction asserted below is a fraction of something written down here. */
const SQUARE_SKELETON_LENGTH = 4 * Math.hypot(5, 5);

/**
 * The clean shape underneath `OFF_EDGE_JITTER_L_SEED_55433`, which is not itself a published fixture:
 * `near-floor-jitter.ts`' header names these six corners, in clockwise winding, as the base its
 * generator perturbed. The jittered fixture adds samples along each edge and displaces them by about
 * 1e-3 units; the corners were never moved.
 */
const REFLEX_L = [
    { x: 100, y: 100 },
    { x: 100, y: 400 },
    { x: 250, y: 400 },
    { x: 250, y: 250 },
    { x: 400, y: 250 },
    { x: 400, y: 100 },
];

describe('trySolveSkeleton', () => {
    it('re-solves a region boundary and reports the solve complete', () => {
        const result = trySolveSkeleton(TREE.boundary);

        expect(result).toBeDefined();
        expect(result?.complete).toBe(true);
        expect(result?.graph.nodes.length).toBeGreaterThan(0);
    });

    it('has no answer for a boundary that is no polygon', () => {
        // Two points and one point are not regions, and asking the solver about them is not a
        // question worth the throw it would produce.
        expect(trySolveSkeleton([])).toBeUndefined();
        expect(trySolveSkeleton([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeUndefined();
    });

    /**
     * THE "NEVER A SECOND DIFFERENTLY-PARAMETERISED SOLVE" GUARANTEE, MADE ASSERTABLE.
     *
     * `trySolveSkeleton`'s contract is that it asks the solver the SAME question the driver already
     * asked when it built the node — same boundary, same parameters. Journal decision 106 made the
     * perceptual floor a parameter and the demo's pages hand the driver 1e-5, so for a window this
     * call sat on the library's 1e-6 and the guarantee was false: a spine could be extracted from a
     * skeleton the tree it belongs to never had. Decision 108(b) closed it.
     *
     * The sub-perceptual jitter fixture is what makes the two floors distinguishable. It is the L
     * below with about 1e-3 units of displacement on inserted edge samples — invisible at any zoom
     * this canvas permits — so at the explorer's floor it must yield the clean L's skeleton exactly.
     * At 1e-6 the jitter survives and the skeleton is several times larger.
     */
    it('solves a sub-perceptually jittered boundary into the clean shape\'s skeleton', () => {
        const clean = trySolveSkeleton(REFLEX_L);
        const jittered = trySolveSkeleton(OFF_EDGE_JITTER_L_SEED_55433);

        expect(clean).toBeDefined();
        expect(jittered).toBeDefined();
        expect(jittered?.graph.nodes).toHaveLength(clean?.graph.nodes.length ?? -1);
        expect(jittered?.graph.interiorEdges).toHaveLength(clean?.graph.interiorEdges.length ?? -1);
    });

    it('extracts the same spine from the jittered boundary as from the clean one', () => {
        // The consequence that matters to this file: the page compares spine definitions, and a
        // definition judged on a skeleton carrying invisible jitter is judged on the wrong skeleton.
        const clean = regionSpine(nodeWithBoundary(REFLEX_L), { kind: 'diameter' });
        const jittered = regionSpine(nodeWithBoundary(OFF_EDGE_JITTER_L_SEED_55433), { kind: 'diameter' });

        expect(jittered?.spine.edges).toHaveLength(clean?.spine.edges.length ?? -1);
        expect(jittered?.spine.length).toBeCloseTo(clean?.spine.length ?? -1, 6);
        expect(jittered?.treeLength).toBeCloseTo(clean?.treeLength ?? -1, 6);
    });
});

describe('regionSpine', () => {
    it('extracts a spine from a region that solved', () => {
        const region = regionSpine(TREE, { kind: 'diameter' });

        expect(region).toBeDefined();
        expect(region?.treeLength).toBeCloseTo(SQUARE_SKELETON_LENGTH, 9);
        // A square's diameter runs corner to centre to opposite corner: two of its four bisectors.
        expect(region?.spine.edges).toHaveLength(2);
        expect(region?.spine.componentCount).toBe(1);
        expect(region?.spine.length).toBeCloseTo(SQUARE_SKELETON_LENGTH / 2, 9);
    });

    it('gives a position for every node its spine names, so a caller need not solve again', () => {
        const region = regionSpine(TREE, { kind: 'diameter' });
        expect(region?.spine.nodeIds.length).toBeGreaterThan(0);
        for (const nodeId of region?.spine.nodeIds ?? []) {
            expect(region?.positions.get(nodeId)).toBeDefined();
        }
    });

    it('has no spine for a region that did not subdivide', () => {
        expect(regionSpine(failedNode(0), { kind: 'diameter' })).toBeUndefined();
    });

    it('reports an empty spine as a spine, not as an absent one', () => {
        // A threshold above everything retains nothing, and that is an answer about the setting
        // rather than a region with no spine to extract — the readout has to be able to tell the two
        // apart, so this must not collapse them.
        const region = regionSpine(TREE, { kind: 'wavefront-time', fraction: 1 });

        expect(region).toBeDefined();
        expect(region?.spine.edges).toHaveLength(0);
        expect(region?.spine.componentCount).toBe(0);
    });
});

describe('summariseSpines', () => {
    it('reports how much of the skeleton each definition kept, and they disagree', () => {
        const strategies: SpineStrategy[] = [
            { kind: 'diameter' },
            { kind: 'wavefront-time', fraction: DEFAULT_WAVEFRONT_TIME_FRACTION },
            { kind: 'whisker-prune', fraction: DEFAULT_WHISKER_PRUNE_FRACTION },
        ];
        const spines = summariseSpines(TREE, strategies);

        // Level 0 is one square: its diameter is half its skeleton. At half the maximum offset
        // nothing survives — a square's corners sit at offset zero and its only interior node is its
        // centre — and a whisker fraction of 0.15 prunes nothing at all.
        expect(spines.map((level) => level.lengthFraction)).toEqual([0.5, 0, 1]);
    });

    it('counts the regions it could and could not extract from, per level', () => {
        const spines = summariseSpines(TREE, [
            { kind: 'diameter' },
            { kind: 'diameter' },
            { kind: 'diameter' },
        ]);

        expect(spines.map((level) => ({
            level: level.level,
            regions: level.regions,
            unavailable: level.unavailable,
        }))).toEqual([
            { level: 0, regions: 1, unavailable: 0 },
            // The failed node of level 1 is a region with no spine, not a region with an empty one.
            { level: 1, regions: 2, unavailable: 1 },
            { level: 2, regions: 1, unavailable: 0 },
        ]);
    });

    it('separates a spine that retained nothing from a region that had none', () => {
        const spines = summariseSpines(TREE, [{ kind: 'wavefront-time', fraction: 1 }]);

        expect(spines[0].regions).toBe(1);
        expect(spines[0].empty).toBe(1);
        expect(spines[0].unavailable).toBe(0);
        expect(spines[0].spineLength).toBe(0);
        expect(spines[0].lengthFraction).toBe(0);
    });

    it('reports a lobed region whose spine came apart, rather than repairing it', () => {
        // Decision 6's picture: two lobes above the threshold, the neck between them below it. The
        // count IS the finding — a summary that took the largest piece, or called this a failure,
        // would hide the one weakness this definition has.
        const spines = summariseSpines(LOBED_TREE, [LOBED_SPLIT_STRATEGY]);

        expect(spines[0].regions).toBe(1);
        expect(spines[0].disconnected).toBe(1);
        expect(spines[0].maxComponentCount).toBe(2);
        expect(spines[0].empty).toBe(0);
        expect(spines[0].spineLength).toBeGreaterThan(0);
    });

    it('reports the same lobed region as whole under a definition that cannot sever it', () => {
        // The control on the test above: same region, a definition that is connected by
        // construction. Without it, "disconnected" could be a fact about the fixture rather than
        // about the strategy.
        const spines = summariseSpines(LOBED_TREE, [{ kind: 'diameter' }]);

        expect(spines[0].disconnected).toBe(0);
        expect(spines[0].maxComponentCount).toBe(1);
        expect(spines[0].lengthFraction).toBeGreaterThan(0);
        expect(spines[0].lengthFraction).toBeLessThan(1);
    });

    it('reports one row per strategy handed in, and names the strategy on the row', () => {
        const spines = summariseSpines(TREE, [{ kind: 'whisker-prune', fraction: 0.3 }]);

        expect(spines).toHaveLength(1);
        expect(spines[0].strategy).toEqual({ kind: 'whisker-prune', fraction: 0.3 });
    });
});
