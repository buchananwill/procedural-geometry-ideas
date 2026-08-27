import {ALL_TEST_POLYGONS, RECTANGLE, SQUARE} from '@proc-geo/test-fixtures';
import {
    buildSkeletonTree,
    computeNodeOffsets,
    InteriorEdge,
    PolygonEdge,
    SkeletonSolveResult,
    SkeletonTree,
    skeletonTreeDiameter,
    solveSkeleton,
    Vector2,
} from '@proc-geo/core';
import {place} from './placement-helpers';

/**
 * The skeleton tree substrate: a solved skeleton as a weighted undirected graph.
 *
 * The module makes no policy choice, so almost nothing here is a golden coordinate. What is asserted
 * is what the structure *is* — the polygon's own vertices are its leaves, adjacency is symmetric,
 * `isTree` is a check rather than a constant, the diameter is the longest leaf-to-leaf path by
 * summed length — and those statements hold for any polygon and would keep holding if the module
 * were reimplemented.
 *
 * Three places name a number on purpose:
 *
 * - the **square**, which is the worked example. Five nodes, four edges, four leaves, and a diameter
 *   of three nodes with the length of the square's diagonal. A diameter of two nodes would mean the
 *   polygon's own vertices had been left out of the tree.
 * - the **rectangle**, which is the smallest fixture whose skeleton has a genuine internal edge
 *   rather than a fan: a central ridge between two nodes of degree three, which the diameter runs
 *   along.
 * - the **corpus report**, which pins the count of fixtures that build a tree and the count whose
 *   weighted diameter is strictly longer than their longest hop-count path.
 */

/**
 * Summation-order slack, and nothing else.
 *
 * Where a test recomputes a path length by walking the path itself, it adds the same edge lengths as
 * the module does but in its own order, and floating-point addition is not associative. The
 * quantities compared are otherwise the identical numbers, so the agreement wanted is at the level
 * of the last bits rather than at a geometric tolerance.
 */
const SUMMATION_RELATIVE_TOLERANCE = 1e-12;

/** Geometric slack for a coordinate the solver computed against one written down here by hand. */
const GEOMETRIC_TOLERANCE = 1e-9;

function solved(vertices: Vector2[]): SkeletonSolveResult {
    const result = solveSkeleton(vertices);
    expect(result.complete).toBe(true);
    expect(result.context).not.toBeNull();
    return result;
}

function degreeOf(tree: SkeletonTree, nodeId: number): number {
    return (tree.adjacency.get(nodeId) as number[]).length;
}

function edgeBetween(tree: SkeletonTree, left: number, right: number): number | undefined {
    return tree.edges.find(edge =>
        (edge.a === left && edge.b === right) || (edge.a === right && edge.b === left))?.length;
}

/** The length of a path, summed by the test rather than read off anything the module returned. */
function pathLength(tree: SkeletonTree, path: number[]): number {
    let total = 0;
    for (let index = 0; index + 1 < path.length; index++) {
        const length = edgeBetween(tree, path[index], path[index + 1]);
        expect(length).toBeDefined();
        total += length as number;
    }
    return total;
}

/** Every path from one node, found without weights: in a tree there is only one route to each node. */
function pathsFrom(tree: SkeletonTree, sourceId: number): Map<number, number[]> {
    const paths = new Map<number, number[]>([[sourceId, [sourceId]]]);
    const queue = [sourceId];
    while (queue.length > 0) {
        const nodeId = queue.shift() as number;
        for (const neighbour of tree.adjacency.get(nodeId) as number[]) {
            if (!paths.has(neighbour)) {
                paths.set(neighbour, [...(paths.get(nodeId) as number[]), neighbour]);
                queue.push(neighbour);
            }
        }
    }
    return paths;
}

/** The longest leaf-to-leaf path by summed length, found by brute force over every pair. */
function longestLeafPathByLength(tree: SkeletonTree): number[] {
    let longest: number[] = [];
    let longestLength = -Infinity;
    for (const leaf of tree.leafIds) {
        const paths = pathsFrom(tree, leaf);
        for (const other of tree.leafIds) {
            const path = paths.get(other) as number[];
            const length = pathLength(tree, path);
            if (length > longestLength) {
                longest = path;
                longestLength = length;
            }
        }
    }
    return longest;
}

/** The longest leaf-to-leaf path by HOP COUNT — what an unweighted diameter would return. */
function longestLeafPathByHops(tree: SkeletonTree): number[] {
    let longest: number[] = [];
    for (const leaf of tree.leafIds) {
        const paths = pathsFrom(tree, leaf);
        for (const other of tree.leafIds) {
            const path = paths.get(other) as number[];
            if (path.length > longest.length) {
                longest = path;
            }
        }
    }
    return longest;
}

function relativeDifference(left: number, right: number): number {
    const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
    return Math.abs(left - right) / scale;
}

/**
 * The same solve with one extra arc joining two nodes that were not joined before.
 *
 * The arc is a fabrication and is meant to be: decision 14 asks for a graph carrying a cycle, which
 * a correct solver does not produce. Only the ids are load-bearing — `buildSkeletonTree` reads the
 * two endpoints and their positions — so the basis vector and the parent edge indices are
 * placeholders. Nothing on the original result is mutated.
 */
function withArcAdded(result: SkeletonSolveResult, source: number, target: number): SkeletonSolveResult {
    const id = result.graph.edges.length;
    const edge: PolygonEdge = {id, source, target, basisVector: {x: 1, y: 0}};
    const interiorEdge: InteriorEdge = {
        id,
        clockwiseExteriorEdgeIndex: 0,
        widdershinsExteriorEdgeIndex: 1,
        length: 0,
    };
    return {
        ...result,
        graph: {
            ...result.graph,
            edges: [...result.graph.edges, edge],
            interiorEdges: [...result.graph.interiorEdges, interiorEdge],
        },
    };
}

/** The same solve with one arc taken out of the skeleton. Nothing on the original is mutated. */
function withArcRemoved(result: SkeletonSolveResult, interiorEdgeId: number): SkeletonSolveResult {
    return {
        ...result,
        graph: {
            ...result.graph,
            interiorEdges: result.graph.interiorEdges.filter(edge => edge.id !== interiorEdgeId),
        },
    };
}

describe('buildSkeletonTree on the square', () => {
    const result = solved(SQUARE);
    const tree = buildSkeletonTree(result);

    it('has the polygon vertices as its leaves', () => {
        expect(tree.nodeIds).toEqual([0, 1, 2, 3, 4]);
        expect(tree.edges).toHaveLength(4);
        expect(tree.leafIds).toEqual([0, 1, 2, 3]);
        expect(tree.isTree).toBe(true);
    });

    it('meets at one interior node of degree four', () => {
        const interiorNodes = tree.nodeIds.filter(nodeId => nodeId >= result.graph.numExteriorNodes);
        expect(interiorNodes).toEqual([4]);
        expect(degreeOf(tree, 4)).toBe(4);
        expect(tree.adjacency.get(4)).toEqual([0, 1, 2, 3]);
    });

    it('places its one interior node at the centre, half the side away from every edge', () => {
        expect(result.graph.nodes[4].position.x).toBeCloseTo(1, 9);
        expect(result.graph.nodes[4].position.y).toBeCloseTo(1, 9);
        expect(tree.offsets.get(4)).toBeCloseTo(1, 9);
        for (const leaf of tree.leafIds) {
            expect(tree.offsets.get(leaf)).toBe(0);
        }
    });

    it('gives every bisector the half-diagonal for its length', () => {
        for (const edge of tree.edges) {
            expect(edge.length).toBeCloseTo(Math.SQRT2, 9);
        }
    });
});

describe('skeletonTreeDiameter on the square', () => {
    const tree = buildSkeletonTree(solved(SQUARE));
    const diameter = skeletonTreeDiameter(tree);

    /**
     * THREE NODES, NOT TWO. Two would mean the polygon's own vertices had been excluded from the
     * tree, which would sever every leaf and leave the diameter running between the wrong endpoints.
     */
    it('runs corner to centre to corner', () => {
        expect(diameter).toHaveLength(3);
        expect(diameter[1]).toBe(4);
        expect(tree.leafIds).toContain(diameter[0]);
        expect(tree.leafIds).toContain(diameter[2]);
        expect(diameter[0]).not.toBe(diameter[2]);
    });

    it('is as long as the square diagonal', () => {
        expect(pathLength(tree, diameter)).toBeCloseTo(2 * Math.SQRT2, 9);
    });

    /**
     * Every one of the square's four bisectors is exactly the half-diagonal long, so all six pairs of
     * corners are tied at the diagonal and the square has six diameters rather than one. The tie
     * breaks to the lowest node id, which is what makes the answer a function of the tree alone: the
     * lowest-id endpoint is corner 0, and the lowest-id partner tied with it is corner 1.
     */
    it('breaks the square total tie by lowest node id', () => {
        const cornerPairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
        for (const [left, right] of cornerPairs) {
            expect(pathLength(tree, [left, 4, right])).toBeCloseTo(2 * Math.SQRT2, 9);
        }
        expect(diameter).toEqual([0, 4, 1]);
    });
});

describe('a skeleton with a genuine internal edge', () => {
    const result = solved(RECTANGLE);
    const tree = buildSkeletonTree(result);

    /** The 4x2 rectangle's ridge runs from (1, 1) to (3, 1): two units, along the long axis. */
    it('has a central ridge between two nodes of degree three', () => {
        const ridgeNodes = tree.nodeIds.filter(nodeId => degreeOf(tree, nodeId) === 3);
        expect(ridgeNodes).toHaveLength(2);
        expect(tree.isTree).toBe(true);

        const ridgeLength = edgeBetween(tree, ridgeNodes[0], ridgeNodes[1]);
        expect(ridgeLength).toBeCloseTo(2, 9);
    });

    it('runs its diameter along that ridge', () => {
        const ridgeNodes = tree.nodeIds.filter(nodeId => degreeOf(tree, nodeId) === 3);
        const diameter = skeletonTreeDiameter(tree);
        expect(diameter).toHaveLength(4);
        expect(diameter).toContain(ridgeNodes[0]);
        expect(diameter).toContain(ridgeNodes[1]);
        expect(pathLength(tree, diameter)).toBeCloseTo(2 + 2 * Math.SQRT2, 9);
    });

    /**
     * The arc that ends a collapse is written down twice, once by each of the two bisectors that
     * closed it — here as `4 -> 5` and `5 -> 4`. Two straight arcs sharing both endpoints are one
     * arc, so the pair is one undirected edge keyed by the lower interior edge id. Keeping both would
     * put a two-cycle in the skeleton of every polygon that ends in a collapse, and would report
     * `isTree === false` for this rectangle, whose skeleton is a tree.
     */
    it('counts an arc recorded from both ends once', () => {
        const ridge = result.graph.interiorEdges.filter(interiorEdge => {
            const edge = result.graph.edges[interiorEdge.id];
            return (edge.source === 4 && edge.target === 5) || (edge.source === 5 && edge.target === 4);
        });
        expect(ridge.map(interiorEdge => interiorEdge.id)).toEqual([8, 9]);

        expect(result.graph.interiorEdges).toHaveLength(6);
        expect(tree.edges).toHaveLength(5);
        const ridgeEdges = tree.edges.filter(edge => edge.a === 4 && edge.b === 5);
        expect(ridgeEdges).toHaveLength(1);
        expect(ridgeEdges[0].interiorEdgeId).toBe(8);
    });
});

describe('the shape of the tree, over the whole corpus', () => {
    const trees = ALL_TEST_POLYGONS.map(polygon => ({
        name: polygon.name,
        result: solved(polygon.vertices),
        tree: buildSkeletonTree(solveSkeleton(polygon.vertices)),
    }));

    /**
     * A `false` here is a finding against the SOLVER, not against this module: the straight skeleton
     * of a simple polygon is a tree, so a cycle or a disconnection in one means the solve produced a
     * structure the geometry does not have. The offenders are named rather than counted.
     */
    it('builds a tree from every fixture', () => {
        const notTrees = trees.filter(entry => !entry.tree.isTree).map(entry => entry.name);
        expect(notTrees).toEqual([]);
        // 38 became 39 when the T-Shape started solving completely (the degenerate-closure path)
        // and joined the buildable corpus. Its two culled self-loop bisectors are excluded from the
        // tree by `InteriorEdge.culled`, which is what keeps it a tree here.
        //
        // 39 became 42 on 2026-08-27: `Golf Cart`, `Near Regular Circle 16` and
        // `Near Regular Circle 32` were promoted into `ALL_TEST_POLYGONS` under journal decision
        // 53. This is the corpus size, so it tracks the list.
        //
        // 42 became 44 later the same day: `Short Edge Promontory` and `Near Regular Peanut 32`
        // were promoted under journal decision 64. Both build trees, so `notTrees` above is still
        // empty.
        expect(trees).toHaveLength(44);
    });

    it.each(trees)('$name keys every edge with a < b, once per node pair', ({tree}) => {
        const keys = new Set<string>();
        for (const edge of tree.edges) {
            expect(edge.a).toBeLessThan(edge.b);
            expect(tree.nodeIds).toContain(edge.a);
            expect(tree.nodeIds).toContain(edge.b);
            keys.add(`${edge.a}:${edge.b}`);
        }
        expect(keys.size).toBe(tree.edges.length);
    });

    it.each(trees)('$name has symmetric adjacency matching its edges', ({tree}) => {
        let degreeTotal = 0;
        for (const nodeId of tree.nodeIds) {
            const neighbours = tree.adjacency.get(nodeId);
            expect(neighbours).toBeDefined();
            degreeTotal += (neighbours as number[]).length;
            for (const neighbour of neighbours as number[]) {
                expect(tree.adjacency.get(neighbour)).toContain(nodeId);
            }
            expect([...(neighbours as number[])]).toEqual([...(neighbours as number[])].sort((l, r) => l - r));
        }
        expect(degreeTotal).toBe(2 * tree.edges.length);
        expect(tree.adjacency.size).toBe(tree.nodeIds.length);
    });

    /**
     * DECISION 2, stated over the corpus rather than over the square alone: every original polygon
     * vertex is in the tree and every one of them is a leaf. Excluding them would sever every leaf
     * the three spine strategies are built to find.
     */
    it.each(trees)('$name makes every polygon vertex a leaf', ({result, tree}) => {
        const exteriorNodeIds = [...Array(result.graph.numExteriorNodes).keys()];
        for (const nodeId of exteriorNodeIds) {
            expect(tree.nodeIds).toContain(nodeId);
            expect(degreeOf(tree, nodeId)).toBe(1);
        }
        expect(tree.leafIds).toEqual(exteriorNodeIds);
    });

    it.each(trees)('$name lists exactly its degree-one nodes as leaves', ({tree}) => {
        expect(tree.leafIds).toEqual(tree.nodeIds.filter(nodeId => degreeOf(tree, nodeId) === 1));
    });
});

describe('offsets', () => {
    const trees = ALL_TEST_POLYGONS.map(polygon => ({
        name: polygon.name,
        result: solved(polygon.vertices),
    }));

    /**
     * DECISION 3: the offset table is `computeNodeOffsets`' own numbers, entry for entry, never a
     * second derivation of the same quantity. `Object.is` rather than `toBeCloseTo` — a value read
     * from one source and a value re-derived by another route agree to a tolerance and disagree in
     * the last bits, which is exactly the difference this test exists to see.
     */
    it.each(trees)('$name reads its offsets straight from computeNodeOffsets', ({result}) => {
        const tree = buildSkeletonTree(result);
        const nodeOffsets = computeNodeOffsets(result);
        for (const nodeId of tree.nodeIds) {
            expect(tree.offsets.has(nodeId)).toBe(nodeOffsets.has(nodeId));
            expect(Object.is(tree.offsets.get(nodeId), nodeOffsets.get(nodeId))).toBe(true);
        }
        expect(tree.offsets.size).toBe(tree.nodeIds.length);
    });

    it.each(trees)('$name puts every polygon vertex at offset zero', ({result}) => {
        const tree = buildSkeletonTree(result);
        for (const leaf of tree.leafIds) {
            expect(tree.offsets.get(leaf)).toBe(0);
        }
        for (const nodeId of tree.nodeIds.filter(id => id >= result.graph.numExteriorNodes)) {
            expect(tree.offsets.get(nodeId) as number).toBeGreaterThan(0);
        }
    });
});

describe('edge length', () => {
    const fixtures = ALL_TEST_POLYGONS.map(polygon => ({name: polygon.name, vertices: polygon.vertices}));

    /**
     * DECISION 4: the Euclidean distance between the two node positions, in caller space — not the
     * `length` the solver records on an interior edge, which is measured along that edge's own basis
     * and in the units the solve ran in.
     */
    it.each(fixtures)('$name measures each edge between its two node positions', ({vertices}) => {
        const result = solved(vertices);
        const tree = buildSkeletonTree(result);
        for (const edge of tree.edges) {
            const from = result.graph.nodes[edge.a].position;
            const to = result.graph.nodes[edge.b].position;
            expect(edge.length).toBeCloseTo(Math.hypot(to.x - from.x, to.y - from.y), 9);
            expect(edge.length).toBeGreaterThan(0);
        }
    });

    /**
     * An ABSOLUTE length, in the caller's own space: scaling the polygon by `k` scales every edge
     * length and every offset by `k`, and leaves the structure — the node ids and the edges between
     * them — untouched. That is what makes a consumer expressing a whisker threshold as a fraction
     * divide by something taken from this tree rather than compare against a world constant.
     *
     * The diameter's LENGTH scales with it; the identity of its endpoints is not asserted across the
     * two solves, and deliberately so. Measured on the square: at scale 1 all four bisectors come
     * back as the identical double, 1.4142135623730951455, so all six corner pairs tie and decision
     * 10 breaks the tie by node id. At scale 7 the bisector to corner 2 comes back one ulp longer
     * than the other three — 9.8994949366116671285 against 9.8994949366116653522 — so there is no
     * tie left to break and corner 2 wins outright. Decision 10 makes the diameter a pure function
     * of THE TREE, which both of these are; it cannot make two different sets of numbers tie the same
     * way, and no tolerance is admissible here that would force them to.
     */
    it.each(fixtures)('$name scales its lengths with the polygon', ({vertices}) => {
        const scale = 7;
        const tree = buildSkeletonTree(solved(vertices));
        const scaledTree = buildSkeletonTree(solved(place(vertices, scale, 0)));

        expect(scaledTree.nodeIds).toEqual(tree.nodeIds);
        expect(scaledTree.edges.map(edge => [edge.a, edge.b])).toEqual(tree.edges.map(edge => [edge.a, edge.b]));
        expect(relativeDifference(
            pathLength(scaledTree, skeletonTreeDiameter(scaledTree)),
            scale * pathLength(tree, skeletonTreeDiameter(tree)),
        )).toBeLessThan(GEOMETRIC_TOLERANCE);

        for (let index = 0; index < tree.edges.length; index++) {
            expect(relativeDifference(scaledTree.edges[index].length, scale * tree.edges[index].length))
                .toBeLessThan(GEOMETRIC_TOLERANCE);
        }
        for (const nodeId of tree.nodeIds) {
            expect(relativeDifference(
                scaledTree.offsets.get(nodeId) as number,
                scale * (tree.offsets.get(nodeId) as number),
            )).toBeLessThan(GEOMETRIC_TOLERANCE);
        }
    });
});

describe('skeletonTreeDiameter over the corpus', () => {
    const trees = ALL_TEST_POLYGONS.map(polygon => ({
        name: polygon.name,
        tree: buildSkeletonTree(solveSkeleton(polygon.vertices)),
    }));

    it.each(trees)('$name returns a walkable path between two leaves', ({tree}) => {
        const diameter = skeletonTreeDiameter(tree);
        expect(diameter.length).toBeGreaterThanOrEqual(3);
        expect(tree.leafIds).toContain(diameter[0]);
        expect(tree.leafIds).toContain(diameter[diameter.length - 1]);
        expect(new Set(diameter).size).toBe(diameter.length);
        for (let index = 0; index + 1 < diameter.length; index++) {
            expect(tree.adjacency.get(diameter[index])).toContain(diameter[index + 1]);
        }
    });

    /** The path is the longest there is, checked against every leaf pair rather than against itself. */
    it.each(trees)('$name is the longest path between any two leaves', ({tree}) => {
        const measured = pathLength(tree, skeletonTreeDiameter(tree));
        const brute = pathLength(tree, longestLeafPathByLength(tree));
        expect(relativeDifference(measured, brute)).toBeLessThan(SUMMATION_RELATIVE_TOLERANCE);
    });

    /**
     * WEIGHTED BY LENGTH, NOT BY HOP COUNT. A skeleton's arcs vary enormously in length, so the path
     * with the most arcs on it is routinely not the longest one — and it is the long spine that every
     * strategy built on this wants.
     */
    it.each(trees)('$name is at least as long as its longest hop-count path', ({tree}) => {
        const weighted = pathLength(tree, skeletonTreeDiameter(tree));
        const byHops = pathLength(tree, longestLeafPathByHops(tree));
        expect(weighted).toBeGreaterThanOrEqual(byHops * (1 - SUMMATION_RELATIVE_TOLERANCE));
    });

    /**
     * And the distinction is not academic on this corpus: on 26 of the 44 fixtures the longest
     * hop-count path is STRICTLY shorter than the diameter. `Mid-case Failure End` is the widest
     * margin measured — 532.52 against 350.42, a third of the length lost — so a hop-count
     * implementation would fail this file rather than pass it quietly.
     *
     * 22 became 23 when the T-Shape joined the buildable corpus, with its longest hop-count path
     * strictly shorter than its weighted diameter.
     *
     * 23 became 24 with the 2026-08-27 promotions (journal decision 53). Attributed per fixture:
     * `Golf Cart` alone joins the offenders, for the T-Shape's reason — a long stem spine reached
     * over few hops. `Near Regular Circle 16` and `Near Regular Circle 32` do not: a regular n-gon
     * resolves to a single interior node, so every leaf path is one hop and the two measures tie.
     *
     * 24 became 26 later on 2026-08-27 with the decision-64 promotions. Attributed per fixture:
     * BOTH `Short Edge Promontory` and `Near Regular Peanut 32` join the offenders, and the 24
     * already there are unchanged — re-running the filter over the 42 alone still gives 24.
     * Neither is a regular n-gon: the promontory has a long western body reached over few hops
     * past its short eastern edges, and the peanut's waist gives it a spine whose lobes are
     * densely sampled, so in both the hop-count path leaves the long way round unwalked.
     */
    it('reports how many fixtures a hop-count diameter would get wrong', () => {
        const shorter = trees.filter(({tree}) =>
            pathLength(tree, longestLeafPathByHops(tree)) < pathLength(tree, skeletonTreeDiameter(tree)) - 1e-9);
        expect(shorter).toHaveLength(26);

        const midCase = trees.find(entry => entry.name === 'Mid-case Failure End') as typeof trees[number];
        expect(pathLength(midCase.tree, skeletonTreeDiameter(midCase.tree))).toBeCloseTo(532.5233, 3);
        expect(pathLength(midCase.tree, longestLeafPathByHops(midCase.tree))).toBeCloseTo(350.4199, 3);
    });

    /**
     * DECISION 10, stated as the property it exists for: a pure function of the tree. Reversing the
     * edge list changes every order the traversal could see and must change nothing about the answer.
     * A tie broken by visitation order instead of by node id would move here.
     */
    it.each(trees)('$name does not depend on the order its edges are listed in', ({tree}) => {
        const reversed: SkeletonTree = {...tree, edges: [...tree.edges].reverse()};
        expect(skeletonTreeDiameter(reversed)).toEqual(skeletonTreeDiameter(tree));
    });
});

describe('isTree, convicted by mutation', () => {
    /** A flag that is always true is not a check, so each mutation is shown flipping it. */
    it('goes false when an added arc closes a cycle', () => {
        const result = solved(SQUARE);
        expect(buildSkeletonTree(result).isTree).toBe(true);

        const cyclic = buildSkeletonTree(withArcAdded(result, 0, 1));
        expect(cyclic.isTree).toBe(false);
        expect(cyclic.nodeIds).toHaveLength(5);
        expect(cyclic.edges).toHaveLength(5);
    });

    /**
     * The counting half of the check cannot see this one: four edges over five nodes is exactly the
     * count a tree of this size has, and only the traversal notices that corner 0 is joined to
     * nothing. Both halves are load-bearing, so both are convicted.
     */
    it('goes false when the graph is disconnected but the counts still balance', () => {
        const result = solved(SQUARE);
        const severed = withArcAdded(withArcRemoved(result, 4), 1, 2);
        const tree = buildSkeletonTree(severed);

        expect(tree.nodeIds).toHaveLength(5);
        expect(tree.edges).toHaveLength(4);
        expect(tree.adjacency.get(0)).toEqual([]);
        expect(tree.isTree).toBe(false);
    });

    it('goes false when an arc is missing and nothing replaces it', () => {
        const result = solved(SQUARE);
        const tree = buildSkeletonTree(withArcRemoved(result, 4));
        expect(tree.edges).toHaveLength(3);
        expect(tree.isTree).toBe(false);
    });

    /**
     * DECISION 7: a broken skeleton comes back whole. A diagnostic tool looking at one is precisely
     * the case where throwing, or handing back a partial structure, helps least.
     */
    it('returns the broken structure fully populated', () => {
        const result = solved(SQUARE);
        const tree = buildSkeletonTree(withArcAdded(result, 0, 1));

        expect(tree.nodeIds).toEqual([0, 1, 2, 3, 4]);
        expect(tree.adjacency.size).toBe(5);
        expect(tree.offsets.size).toBe(5);
        expect(tree.leafIds).toEqual([2, 3]);
        for (const edge of tree.edges) {
            expect(Number.isFinite(edge.length)).toBe(true);
        }
    });

    /**
     * DECISION 11: on a cyclic graph the two-traversal argument does not hold, so the diameter would
     * be silently wrong rather than absent. It is refused instead.
     */
    it('makes skeletonTreeDiameter refuse the result', () => {
        const result = solved(SQUARE);
        expect(() => skeletonTreeDiameter(buildSkeletonTree(withArcAdded(result, 0, 1))))
            .toThrow(/requires a tree/);
    });
});

describe('preconditions', () => {
    /** The same pair every entry point in the projection module requires, through the same check. */
    it('refuses an incomplete solve', () => {
        const result = solved(SQUARE);
        expect(() => buildSkeletonTree({...result, complete: false})).toThrow(/complete skeleton solve/);
    });

    it('refuses a merged graph with no solver context', () => {
        const result = solved(SQUARE);
        expect(() => buildSkeletonTree({...result, context: null})).toThrow(/solver context/);
    });
});
