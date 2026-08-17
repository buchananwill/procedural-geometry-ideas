import {
    ALL_TEST_POLYGONS,
    CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS,
    PREMATURE_BISECTOR_SPLIT_PASSES,
    RECTANGLE,
} from '@proc-geo/test-fixtures';
import {
    buildSkeletonTree,
    extractSpine,
    SkeletonTree,
    SkeletonTreeEdge,
    Spine,
    SpineStrategy,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';

/**
 * Three candidate definitions of the part of a skeleton that would carry a road.
 *
 * The point of the module is that the three DISAGREE, so most of what is asserted here is a
 * disagreement rather than a coordinate: on the rectangle each strategy keeps a different set of
 * arcs, and a suite that only checked each one against itself would pass just as happily on three
 * copies of the same filter.
 *
 * The rest is the substrate's own guarantees carried forward — a connected result where the strategy
 * promises one, a reported one where it does not, and the same answer whatever order the tree's
 * edges arrived in.
 */

/** The rectangle's ridge: the arc between its two degree-three nodes. */
const RIDGE: [number, number] = [4, 5];

/**
 * `wavefront-time` at a fraction that keeps the rectangle's interior and drops its bisectors.
 *
 * Anything strictly between 0 and 1 does that on a rectangle — its only offsets are 0 at the corners
 * and the half-width at the ridge — so this is mid-range rather than tuned.
 */
const MID_RANGE_FRACTION = 0.5;

/**
 * The whisker fraction at which the rectangle's bisectors go and its ridge stays.
 *
 * The rectangle is 4 by 2: its bisectors are √2 long, its ridge is 2, and its diameter is
 * √2 + 2 + √2 ≈ 4.83. So the band that removes the first and keeps the second is
 * (√2/4.83, 2/4.83) ≈ (0.293, 0.414), and 0.35 sits inside it. Above the band the ridge is a
 * whisker too and the spine is empty, which is decision 5's legitimate answer rather than a defect.
 */
const CONVERGING_WHISKER_FRACTION = 0.35;

/** Below the shortest leaf edge as a fraction of the diameter — nothing qualifies as a whisker. */
const SMALL_WHISKER_FRACTION = 0.1;

/**
 * A geometric slack for lengths the solver computed against ones written down here by hand.
 *
 * Loose next to the solver's own epsilon on purpose: these are hand-derived quantities like √2 and
 * the length of a diagonal, not two routes to the same computation.
 */
const GEOMETRIC_TOLERANCE = 1e-9;

function treeOf(vertices: Vector2[]): SkeletonTree {
    const result = solveSkeleton(vertices);
    expect(result.complete).toBe(true);
    expect(result.context).not.toBeNull();
    return buildSkeletonTree(result);
}

/** Every edge as an unordered node pair, which is what "the same arcs" means for a comparison. */
function edgePairs(spine: Spine): string[] {
    return spine.edges.map(edge => `${edge.a}-${edge.b}`);
}

function totalEdgeLength(tree: SkeletonTree): number {
    return tree.edges.reduce((total, edge) => total + edge.length, 0);
}

/** The same tree with its edge list reversed — a different traversal order, the same tree. */
function withReversedEdges(tree: SkeletonTree): SkeletonTree {
    return {...tree, edges: [...tree.edges].reverse()};
}

/**
 * The same graph with one arc added between two of its leaves, closing a cycle.
 *
 * `isTree` goes false to match, which is what `buildSkeletonTree` computes for a graph carrying a
 * cycle and is the flag every strategy reads. Built by hand rather than solved for, because no
 * fixture in the corpus produces a cyclic skeleton — the same mutation approach `skeleton-tree.test`
 * uses to convict `isTree` of being a check rather than a constant.
 */
function withCycleAdded(tree: SkeletonTree): SkeletonTree {
    const [first, second] = tree.leafIds;
    const extra: SkeletonTreeEdge = {
        a: Math.min(first, second),
        b: Math.max(first, second),
        interiorEdgeId: -1,
        length: 1,
    };

    const adjacency = new Map([...tree.adjacency].map(([id, neighbours]) => [id, [...neighbours]]));
    adjacency.set(first, [...(adjacency.get(first) ?? []), second].sort((left, right) => left - right));
    adjacency.set(second, [...(adjacency.get(second) ?? []), first].sort((left, right) => left - right));

    return {
        ...tree,
        edges: [...tree.edges, extra],
        adjacency,
        leafIds: tree.leafIds.filter(id => id !== first && id !== second),
        isTree: false,
    };
}

/** Every fixture that solves and whose skeleton really is a tree, built once for the sweeps. */
function corpusTrees(): {name: string; tree: SkeletonTree}[] {
    return ALL_TEST_POLYGONS
        .map(polygon => ({name: polygon.name, result: solveSkeleton(polygon.vertices)}))
        .filter(({result}) => result.complete && result.context !== null)
        .map(({name, result}) => ({name, tree: buildSkeletonTree(result)}))
        .filter(({tree}) => tree.isTree);
}

describe('extractSpine on the rectangle', () => {
    const tree = treeOf(RECTANGLE);

    it('retains the ridge plus one bisector at each end under diameter', () => {
        const spine = extractSpine(tree, {kind: 'diameter'});

        // Four nodes: two opposite corners and the two degree-three ends of the ridge. A spine of two
        // nodes would mean the polygon's own vertices had been left out of the path.
        expect(spine.nodeIds).toEqual([0, 2, 4, 5]);
        expect(spine.edges).toHaveLength(3);
        expect(edgePairs(spine)).toContain(`${RIDGE[0]}-${RIDGE[1]}`);
        expect(spine.componentCount).toBe(1);
        // √2 + 2 + √2, walked corner to corner through the ridge.
        expect(spine.length).toBeCloseTo(2 + 2 * Math.SQRT2, 9);
    });

    it('retains the ridge alone under a mid-range wavefront-time', () => {
        const spine = extractSpine(tree, {kind: 'wavefront-time', fraction: MID_RANGE_FRACTION});

        expect(spine.nodeIds).toEqual([...RIDGE]);
        expect(edgePairs(spine)).toEqual([`${RIDGE[0]}-${RIDGE[1]}`]);
        expect(spine.componentCount).toBe(1);
        expect(spine.length).toBeCloseTo(2, 9);
    });

    it('retains everything at a small whisker fraction and converges on the ridge at a large one', () => {
        const everything = extractSpine(tree, {kind: 'whisker-prune', fraction: SMALL_WHISKER_FRACTION});
        expect(edgePairs(everything)).toEqual(edgePairs(extractSpine(tree, {kind: 'wavefront-time', fraction: 0})));
        expect(everything.length).toBeCloseTo(totalEdgeLength(tree), 9);

        const converged = extractSpine(tree, {kind: 'whisker-prune', fraction: CONVERGING_WHISKER_FRACTION});
        expect(edgePairs(converged)).toEqual([`${RIDGE[0]}-${RIDGE[1]}`]);
        expect(converged.componentCount).toBe(1);
    });

    it('gives three different answers, which is the point of having three', () => {
        // If all three agreed on a rectangle at least two of them would be wrong: the shape is the
        // worked example precisely because a ridge, a through-route and a pruned tree are distinct
        // things on it.
        const answers = [
            edgePairs(extractSpine(tree, {kind: 'diameter'})),
            edgePairs(extractSpine(tree, {kind: 'wavefront-time', fraction: MID_RANGE_FRACTION})),
            edgePairs(extractSpine(tree, {kind: 'whisker-prune', fraction: SMALL_WHISKER_FRACTION})),
        ].map(pairs => pairs.join(','));

        expect(new Set(answers).size).toBe(3);
    });
});

describe('extractSpine thresholds', () => {
    const tree = treeOf(RECTANGLE);

    it('returns an empty spine rather than throwing when a threshold is above everything', () => {
        const overWavefront = extractSpine(tree, {kind: 'wavefront-time', fraction: 1.5});
        expect(overWavefront).toEqual<Spine>({nodeIds: [], edges: [], componentCount: 0, length: 0});

        // A whisker fraction of one is longer than any single edge can be — the diameter is a path of
        // several — so the prune runs to a fixed point with nothing left.
        const overWhisker = extractSpine(tree, {kind: 'whisker-prune', fraction: 1});
        expect(overWhisker).toEqual<Spine>({nodeIds: [], edges: [], componentCount: 0, length: 0});
    });

    it('reads a fraction of zero as retaining every edge, both thresholds alike', () => {
        expect(extractSpine(tree, {kind: 'wavefront-time', fraction: 0}).edges).toHaveLength(tree.edges.length);
        expect(extractSpine(tree, {kind: 'whisker-prune', fraction: 0}).edges).toHaveLength(tree.edges.length);
    });

    it('keeps the two thresholds dimensionless: scaling the polygon does not change what is retained', () => {
        // The metamorphic statement behind decision 4. A threshold in world units would keep a
        // different set of arcs on a rectangle ten times the size; a fraction of the tree's own scale
        // keeps the same ones, which is why one slider can mean the same thing at every level.
        const scaled = treeOf(RECTANGLE.map(vertex => ({x: vertex.x * 10, y: vertex.y * 10})));
        for (const strategy of [
            {kind: 'wavefront-time', fraction: MID_RANGE_FRACTION},
            {kind: 'whisker-prune', fraction: CONVERGING_WHISKER_FRACTION},
        ] satisfies SpineStrategy[]) {
            expect(edgePairs(extractSpine(scaled, strategy))).toEqual(edgePairs(extractSpine(tree, strategy)));
            expect(extractSpine(scaled, strategy).length)
                .toBeCloseTo(10 * extractSpine(tree, strategy).length, 6);
        }
    });
});

describe('extractSpine connectivity', () => {
    it('splits a lobed region under wavefront-time, and reports the split rather than repairing it', () => {
        // The isthmus fixture is decision 6's picture exactly: two lobes joined by a thin neck. At
        // 0.55 of the maximum offset both lobe centres are still above the threshold and the neck
        // between them is not, so the spine comes back in two pieces. Nothing here bridges them,
        // takes the larger one or fails the call — the count IS the finding.
        const tree = treeOf(CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS);
        const split = extractSpine(tree, {kind: 'wavefront-time', fraction: 0.55});

        expect(split.componentCount).toBe(2);
        expect(split.edges).toHaveLength(2);
        expect(split.length).toBeGreaterThan(0);
    });

    it('splits the lobed 32-gon across a whole band of fractions, not at one knife edge', () => {
        const tree = treeOf(PREMATURE_BISECTOR_SPLIT_PASSES);
        for (const fraction of [0.1, 0.2, 0.3, 0.4]) {
            expect(extractSpine(tree, {kind: 'wavefront-time', fraction}).componentCount).toBe(2);
        }
    });

    it('never disconnects a connected tree under diameter or whisker-prune, over the whole corpus', () => {
        // The assertion lives inside `extractSpine`, so a strategy that ever severed a tree would
        // throw here rather than quietly hand back two pieces. This sweep is what exercises it.
        const trees = corpusTrees();
        expect(trees.length).toBeGreaterThan(30);

        for (const {name, tree} of trees) {
            for (const strategy of [
                {kind: 'diameter'},
                {kind: 'whisker-prune', fraction: 0.05},
                {kind: 'whisker-prune', fraction: 0.25},
                {kind: 'whisker-prune', fraction: 0.6},
            ] satisfies SpineStrategy[]) {
                const spine = extractSpine(tree, strategy);
                expect({name, components: spine.componentCount})
                    .toEqual({name, components: spine.edges.length === 0 ? 0 : 1});
            }
        }
    });
});

describe('extractSpine on a graph that is not a tree', () => {
    const cyclic = withCycleAdded(treeOf(RECTANGLE));

    /**
     * The documented `@throws`, asserted at the PUBLIC entry point rather than one layer down.
     *
     * `skeletonTreeDiameter` has its own test for refusing a cyclic graph, but that says nothing
     * about `extractSpine` still routing through it: a branch that stopped calling for the longest
     * path would silently start answering a question the longest-path argument does not hold for.
     */
    it('refuses the two strategies that need the longest path', () => {
        expect(() => extractSpine(cyclic, {kind: 'diameter'})).toThrow(/requires a tree/);
        expect(() => extractSpine(cyclic, {kind: 'whisker-prune', fraction: 0.2}))
            .toThrow(/requires a tree/);
    });

    it('still answers under wavefront-time, which reads only offsets and lengths', () => {
        // The contrast the docstring draws: one strategy is a filter over per-node offsets and needs
        // no global structure at all, so a cyclic graph is nothing to it.
        const spine = extractSpine(cyclic, {kind: 'wavefront-time', fraction: MID_RANGE_FRACTION});

        expect(spine.nodeIds).toEqual([...RIDGE]);
        expect(edgePairs(spine)).toEqual([`${RIDGE[0]}-${RIDGE[1]}`]);
        expect(spine.componentCount).toBe(1);
    });
});

describe('extractSpine invariants', () => {
    const trees = corpusTrees();

    it('retains only edges of the tree it was given, and only the nodes those edges touch', () => {
        for (const {name, tree} of trees) {
            const treePairs = new Set(tree.edges.map(edge => `${edge.a}-${edge.b}`));
            for (const strategy of [
                {kind: 'diameter'},
                {kind: 'wavefront-time', fraction: 0.4},
                {kind: 'whisker-prune', fraction: 0.2},
            ] satisfies SpineStrategy[]) {
                const spine = extractSpine(tree, strategy);
                const endpoints = new Set(spine.edges.flatMap((edge: SkeletonTreeEdge) => [edge.a, edge.b]));

                expect({name, foreign: edgePairs(spine).filter(pair => !treePairs.has(pair))})
                    .toEqual({name, foreign: []});
                expect({name, nodes: spine.nodeIds}).toEqual({name, nodes: [...endpoints].sort((l, r) => l - r)});
                expect(spine.length)
                    .toBeCloseTo(spine.edges.reduce((total, edge) => total + edge.length, 0), 9);
                expect(spine.length).toBeLessThanOrEqual(totalEdgeLength(tree) + GEOMETRIC_TOLERANCE);
            }
        }
    });

    it('gives the same spine node for node whatever order the tree lists its edges in', () => {
        // Decision 15. Symmetric fixtures are the normal case here — a square's four bisectors are
        // all equally long — so ties are routine, and a strategy that resolved one by visit order
        // would produce a spine that moved when nothing about the geometry had.
        for (const {name, tree} of trees) {
            for (const strategy of [
                {kind: 'diameter'},
                {kind: 'wavefront-time', fraction: 0.35},
                {kind: 'whisker-prune', fraction: 0.15},
            ] satisfies SpineStrategy[]) {
                const spine = extractSpine(tree, strategy);
                const reversed = extractSpine(withReversedEdges(tree), strategy);

                expect({name, ...reversed}).toEqual({name, ...spine});
            }
        }
    });

    it('gives the same spine on a second solve of the same polygon', () => {
        for (const polygon of ALL_TEST_POLYGONS.slice(0, 8)) {
            const result = solveSkeleton(polygon.vertices);
            if (!result.complete || result.context === null) continue;
            const first = buildSkeletonTree(result);
            const second = buildSkeletonTree(solveSkeleton(polygon.vertices));
            if (!first.isTree) continue;

            expect(extractSpine(second, {kind: 'diameter'})).toEqual(extractSpine(first, {kind: 'diameter'}));
        }
    });
});
