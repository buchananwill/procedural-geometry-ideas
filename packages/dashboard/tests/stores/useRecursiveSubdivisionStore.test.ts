import { subdivideRecursively } from '@proc-geo/core';
import type { RecursiveNode, Strip, Vector2 } from '@proc-geo/core';
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import {
    DEFAULT_RECURSIVE_LEVELS,
    DEFAULT_SHOW_LEAF_FILLS,
    summariseRecursiveTree,
    useRecursiveSubdivisionStore,
} from '../../src/stores/useRecursiveSubdivisionStore';
import {
    ancestorTint,
    leafTerritories,
    recursiveTreeToScene,
    RECURSIVE_LEVEL_STYLES,
} from '../../src/scene/adapters/recursiveSubdivisionToScene';
import type { SceneGroup, ScenePrimitive } from '../../src/scene/types';

/**
 * What the recursive subdivision page reports and what it draws, pinned against a hand-built tree.
 *
 * These numbers exist to catch a subdivision that looks right on the canvas but is not — a picture
 * that reads as deeply cut while producing a single leaf cell, say. A count that drifts silently
 * would take the only check on that with it, so the summary is tested on a tree whose shape is
 * written out rather than solved for, and the tinting is tested on the same tree: which territory a
 * cell belongs to is a fact about the tree's shape, not about the geometry in it.
 *
 * The scene checks live here with the store's rather than beside the adapter because this task owns
 * this file; see the debrief for the follow-up that moves them to `tests/scene/`.
 */

const SQUARE: Vector2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
];

function strip(): Strip {
    return { supportingEdgeIds: [0], boundary: SQUARE, holes: [], frontage: [] };
}

function node(level: number, segments: number, children: RecursiveNode[] = []): RecursiveNode {
    return {
        level,
        boundary: SQUARE,
        segments: Array.from({ length: segments }, strip),
        children,
    };
}

function failedNode(level: number): RecursiveNode {
    return { level, boundary: SQUARE, segments: [], children: [], failure: 'Degenerate region: no area.' };
}

/**
 * Three levels, one failed cell, and one branch that stops a level early — so a level's node count,
 * its segment count and its failure count are all distinct numbers rather than coincidentally equal.
 */
const TREE: RecursiveNode = node(0, 3, [
    node(1, 2),
    failedNode(1),
    node(1, 4, [node(2, 2)]),
]);

describe('summariseRecursiveTree', () => {
    it('counts nodes, segments and failures at each level', () => {
        expect(summariseRecursiveTree(TREE).levels).toEqual([
            { level: 0, nodes: 1, segments: 3, failures: 0 },
            { level: 1, nodes: 3, segments: 6, failures: 1 },
            { level: 2, nodes: 1, segments: 2, failures: 0 },
        ]);
    });

    it('counts only the segments of childless nodes as leaf cells', () => {
        // The level-1 node with a child contributes nothing; its child's two segments are the leaves.
        expect(summariseRecursiveTree(TREE).leafSegments).toBe(4);
    });

    it('totals the segments and failures over the whole tree', () => {
        const summary = summariseRecursiveTree(TREE);
        expect(summary.totalSegments).toBe(11);
        expect(summary.totalFailures).toBe(1);
    });

    it('reports a root that failed as one level with no segments', () => {
        const summary = summariseRecursiveTree(failedNode(0));
        expect(summary.levels).toEqual([{ level: 0, nodes: 1, segments: 0, failures: 1 }]);
        expect(summary.leafSegments).toBe(0);
        expect(summary.totalSegments).toBe(0);
        expect(summary.totalFailures).toBe(1);
    });
});

/** A colour in the terms the tinting is specified in: hue groups, lightness separates. */
interface HslColour {
    hue: number;
    saturation: number;
    lightness: number;
}

function toHsl(hex: string): HslColour {
    const match = hex.match(/^#([0-9a-fA-F]{6})$/);
    if (match === null) throw new Error(`Not a six-digit hex colour: ${hex}`);
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(match[1].substring(at, at + 2), 16) / 255);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const lightness = (max + min) / 2;

    let hue = 0;
    if (chroma > 0) {
        if (max === r) hue = 60 * (((g - b) / chroma) % 6);
        else if (max === g) hue = 60 * ((b - r) / chroma + 2);
        else hue = 60 * ((r - g) / chroma + 4);
    }

    return {
        hue: ((hue % 360) + 360) % 360,
        saturation: chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1)),
        lightness,
    };
}

/** Shortest way round the wheel between two hues, in degrees. */
function hueDistance(a: number, b: number): number {
    const apart = Math.abs(((a - b) % 360) + 360) % 360;
    return Math.min(apart, 360 - apart);
}

/** Perceived brightness, so "lighter with each level" can be asserted in greyscale terms. */
function luminance(hex: string): number {
    const match = hex.match(/^#([0-9a-fA-F]{6})$/);
    if (match === null) throw new Error(`Not a six-digit hex colour: ${hex}`);
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(match[1].substring(at, at + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isGroup(primitive: ScenePrimitive): primitive is SceneGroup {
    return primitive.type === 'group';
}

/** Every filled shape in a scene, groups flattened, in draw order. */
function filledShapes(scene: ScenePrimitive[]): Extract<ScenePrimitive, { type: 'line' }>[] {
    return scene.flatMap((primitive) => {
        if (isGroup(primitive)) return filledShapes(primitive.children);
        return primitive.type === 'line' && primitive.fill !== undefined ? [primitive] : [];
    });
}

const TERRITORY_COUNT = 3;

describe('page defaults', () => {
    it('opens at three levels, where the mechanism is obvious rather than merely present', () => {
        expect(DEFAULT_RECURSIVE_LEVELS).toBe(3);
        expect(useRecursiveSubdivisionStore.getState().levels).toBe(3);
    });

    it('opens with the leaf fills on, and switches them off and back without touching anything else', () => {
        expect(DEFAULT_SHOW_LEAF_FILLS).toBe(true);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(true);

        useRecursiveSubdivisionStore.getState().setShowLeafFills(false);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(false);
        expect(useRecursiveSubdivisionStore.getState().levelVisibility.every((v) => v)).toBe(true);

        useRecursiveSubdivisionStore.getState().setShowLeafFills(true);
        expect(useRecursiveSubdivisionStore.getState().showLeafFills).toBe(true);
    });
});

describe('leafTerritories', () => {
    it('credits every leaf cell to the level-0 segment its branch descends from', () => {
        const { rootCount, cells } = leafTerritories(TREE);

        expect(rootCount).toBe(TERRITORY_COUNT);
        // The two leaves under child 0, then the two under child 2's own child. The failed child
        // contributes none: it has no segments, and it is drawn as a failure patch instead.
        expect(cells.map((cell) => ({ level: cell.level, rootIndex: cell.rootIndex, ordinal: cell.ordinal })))
            .toEqual([
                { level: 1, rootIndex: 0, ordinal: 0 },
                { level: 1, rootIndex: 0, ordinal: 1 },
                { level: 2, rootIndex: 2, ordinal: 0 },
                { level: 2, rootIndex: 2, ordinal: 1 },
            ]);
    });

    it('finds exactly the cells the panel counts as leaves', () => {
        expect(leafTerritories(TREE).cells).toHaveLength(summariseRecursiveTree(TREE).leafSegments);
    });

    it('makes each of a childless root own segments its own territory', () => {
        const { rootCount, cells } = leafTerritories(node(0, 3));
        expect(rootCount).toBe(3);
        expect(cells.map((cell) => cell.rootIndex)).toEqual([0, 1, 2]);
        expect(cells.every((cell) => cell.ordinal === 0)).toBe(true);
    });

    it('has nothing to tint under a root that failed', () => {
        expect(leafTerritories(failedNode(0)).cells).toEqual([]);
    });
});

/**
 * Hue read back from an eight-bit-per-channel hex is quantised: two colours built from the same hue
 * at different lightnesses come back up to about half a degree apart. A degree is the noise floor of
 * this measurement, not a claim about how close the hues need to be.
 */
const HUE_QUANTISATION_DEGREES = 1;

describe('ancestorTint', () => {
    it('gives every cell of one territory the same hue, whatever its depth or place', () => {
        const hues = [0, 1, 2, 3, 7].map((ordinal) => toHsl(ancestorTint(1, 4, ordinal).color).hue);
        for (const hue of hues) {
            expect(hueDistance(hue, hues[0])).toBeLessThan(HUE_QUANTISATION_DEGREES);
        }
    });

    it('separates cells of one territory by lightness alone', () => {
        const tints = [0, 1, 2, 3].map((ordinal) => toHsl(ancestorTint(1, 4, ordinal).color));
        const lightnesses = tints.map((tint) => tint.lightness);
        expect(new Set(lightnesses.map((l) => l.toFixed(3))).size).toBe(lightnesses.length);
        // Slight, not banded: the cells must stay recognisably one territory.
        expect(Math.max(...lightnesses) - Math.min(...lightnesses)).toBeLessThan(0.3);
    });

    it('spreads the territories evenly around the wheel', () => {
        const hues = [0, 1, 2, 3].map((index) => toHsl(ancestorTint(index, 4, 0).color).hue);
        const gaps = hues.slice(1).map((hue, at) => hueDistance(hue, hues[at]));
        for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThan(HUE_QUANTISATION_DEGREES);
        // Four territories, evenly spread: neighbours a right angle apart on the wheel.
        expect(gaps[0]).toBeGreaterThan(60);
    });

    it('is low-alpha, so the strokes over it still read', () => {
        expect(ancestorTint(0, 4, 0).opacity).toBeLessThanOrEqual(0.25);
        expect(ancestorTint(0, 4, 0).opacity).toBeGreaterThan(0);
    });

    it('never lands on the hue reserved for failed cells, at any territory count', () => {
        const failureHue = toHsl('#e64980').hue;
        for (let count = 1; count <= 24; count++) {
            for (let index = 0; index < count; index++) {
                const tint = toHsl(ancestorTint(index, count, index).color);
                expect(hueDistance(tint.hue, failureHue)).toBeGreaterThanOrEqual(29.9);
            }
        }
    });
});

describe('RECURSIVE_LEVEL_STYLES', () => {
    it('thins and dims with every level, in both ramps', () => {
        for (let level = 1; level < RECURSIVE_LEVEL_STYLES.length; level++) {
            const above = RECURSIVE_LEVEL_STYLES[level - 1];
            const here = RECURSIVE_LEVEL_STYLES[level];
            expect(here.segmentWidth).toBeLessThan(above.segmentWidth);
            expect(here.skeletonWidth).toBeLessThan(above.skeletonWidth);
            expect(luminance(here.segmentColour)).toBeLessThan(luminance(above.segmentColour));
            expect(luminance(here.skeletonColour)).toBeLessThan(luminance(above.skeletonColour));
        }
    });

    it('makes the root unmistakably the heaviest level rather than marginally so', () => {
        const root = RECURSIVE_LEVEL_STYLES[0];
        const deepest = RECURSIVE_LEVEL_STYLES[RECURSIVE_LEVEL_STYLES.length - 1];
        expect(root.segmentWidth / deepest.segmentWidth).toBeGreaterThanOrEqual(3);
        expect(root.skeletonWidth / deepest.skeletonWidth).toBeGreaterThanOrEqual(3);
    });
});

describe('recursiveTreeToScene', () => {
    const allLevelsVisible = [true, true, true];

    function groupIds(scene: ScenePrimitive[]): string[] {
        return scene.filter(isGroup).map((group) => group.id);
    }

    it('draws every fill under every stroke, and the root level last of the levels', () => {
        const ids = groupIds(recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        }));

        const lastFill = ids.map((id) => id.startsWith('group:recursive-leaf-fill-')).lastIndexOf(true);
        const firstLevel = ids.findIndex((id) => id.startsWith('group:recursive-level-'));
        expect(lastFill).toBeGreaterThanOrEqual(0);
        expect(lastFill).toBeLessThan(firstLevel);

        expect(ids.filter((id) => id.startsWith('group:recursive-level-'))).toEqual([
            'group:recursive-level-2',
            'group:recursive-level-1',
            'group:recursive-level-0',
        ]);
        expect(ids[ids.length - 1]).toBe('group:recursive-input');
    });

    it('fills one shape per leaf cell, tinted by territory', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        // Everything filled but the failed cell's own patch, which is dashed and keeps its own hue.
        const tints = filledShapes(scene).filter((fill) => fill.stroke.dash === undefined);

        expect(tints).toHaveLength(summariseRecursiveTree(TREE).leafSegments);
        const hues = tints.map((fill) => toHsl(fill.fill?.color ?? '').hue);
        // Two territories among four leaves: the pair from child 0 and the pair under child 2.
        expect(hueDistance(hues[0], hues[1])).toBeLessThan(HUE_QUANTISATION_DEGREES);
        expect(hueDistance(hues[2], hues[3])).toBeLessThan(HUE_QUANTISATION_DEGREES);
        expect(hueDistance(hues[0], hues[2])).toBeGreaterThan(60);
        // A fill draws no outline of its own; the level's segment strokes do that, on top.
        expect(tints.every((fill) => fill.stroke.width === 0)).toBe(true);
    });

    it('hides a level fill with the level that owns the cells', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: [true, true, false],
            showLeafFills: true,
        });
        const hidden = scene.filter(isGroup).filter((group) => group.visible === false).map((g) => g.id);
        expect(hidden).toContain('group:recursive-leaf-fill-2');
        expect(hidden).toContain('group:recursive-level-2');
        expect(hidden).not.toContain('group:recursive-leaf-fill-1');
    });

    it('emits no fill at all when the toggle is off', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: false,
        });
        expect(groupIds(scene).some((id) => id.startsWith('group:recursive-leaf-fill-'))).toBe(false);
        // The failed cell's own patch is the only fill stroke-only rendering has ever had.
        expect(filledShapes(scene)).toHaveLength(1);
    });
});

/**
 * Decision 7, checked on geometry that actually fails.
 *
 * Duck Octagon subdivides cleanly at three levels, so it cannot show that a failure still reads as a
 * failure once its neighbours are tinted. The driver's own census names Pentagon House in groups of
 * three as a fixture that stops subdividing, which is what this uses.
 */
describe('a failed cell among tinted ones', () => {
    const fixture = ALL_TEST_POLYGONS.find((polygon) => polygon.name === 'Pentagon House');
    const tree = subdivideRecursively(fixture?.vertices ?? [], { levels: 3, mergeGroupSize: 3 });

    it('is a fixture that really does fail, or this proves nothing', () => {
        expect(fixture).toBeDefined();
        expect(summariseRecursiveTree(tree).totalFailures).toBeGreaterThan(0);
    });

    it('keeps the failure patch distinguishable from every territory around it', () => {
        const fills = filledShapes(recursiveTreeToScene(tree, {
            levelVisibility: [true, true, true],
            showLeafFills: true,
        }));

        const failurePatches = fills.filter((fill) => fill.stroke.dash !== undefined);
        expect(failurePatches).toHaveLength(summariseRecursiveTree(tree).totalFailures);

        const failureHue = toHsl(failurePatches[0].fill?.color ?? '').hue;
        const tints = fills.filter((fill) => fill.stroke.dash === undefined);
        expect(tints.length).toBeGreaterThan(0);
        for (const tint of tints) {
            expect(hueDistance(toHsl(tint.fill?.color ?? '').hue, failureHue)).toBeGreaterThanOrEqual(29.9);
            // Denser than any territory as well as differently hued, so it reads as a hole.
            expect(tint.fill?.opacity ?? 1).toBeLessThan(failurePatches[0].fill?.opacity ?? 0);
        }
    });
});
