import { FULL_DEPTH_FRACTION, subdivideRecursively } from '@proc-geo/core';
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import {
    recursiveTreeToScene,
    RECURSIVE_LEVEL_STYLES,
    RESIDUE_RING_COLOURS,
    residueRingStyle,
    styleForLevel,
} from '../../src/scene/adapters/recursiveSubdivisionToScene';
import { ancestorTint } from '../../src/scene/adapters/recursiveTerritoryTint';
import { leafTerritories } from '../../src/scene/adapters/leafTerritories';
import { summariseRecursiveTree } from '../../src/stores/useRecursiveSubdivisionStore';
import type { SceneGroup, ScenePrimitive } from '../../src/scene/types';
import { failedNode, node, RESIDUE_TREE, TREE, TREE_TERRITORY_COUNT } from '../fixtures/recursive-trees';

/**
 * What the recursive subdivision page draws: which cell belongs to which territory, what colour that
 * makes it, and the order the layers are laid down in.
 *
 * These checks exist to catch a picture that reads as deeply cut while saying nothing true about the
 * subdivision behind it — a tint that drifts off its ancestor, or a root boundary buried under its
 * own children. Most of them run against a hand-built tree, because ancestry is a fact about the
 * tree's shape; the last suite runs against real geometry, because a failure has to be real to prove
 * it still reads as one.
 */

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

describe('leafTerritories', () => {
    it('credits every leaf cell to the level-0 segment its branch descends from', () => {
        const { rootCount, cells } = leafTerritories(TREE);

        expect(rootCount).toBe(TREE_TERRITORY_COUNT);
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
        // Four territories, evenly spread: neighbours the better part of a right angle apart.
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
 * Decision 11: the residue must read as a different kind of thing from the segments around it, at
 * every level, and its rings must read as several rings where a pinch has separated them.
 *
 * Three channels are asserted rather than one, because the page is read on a colour screen, in a
 * greyscale screenshot, and by someone counting loops — and hue alone survives none of the three.
 */
describe('residueRingStyle', () => {
    it('shares no colour with the segment or skeleton ramps at any level', () => {
        const segmentColours = new Set(RECURSIVE_LEVEL_STYLES.map((style) => style.segmentColour));
        const skeletonColours = new Set(RECURSIVE_LEVEL_STYLES.map((style) => style.skeletonColour));
        for (let level = 0; level < RECURSIVE_LEVEL_STYLES.length; level++) {
            for (let ring = 0; ring < RESIDUE_RING_COLOURS.length; ring++) {
                const { colour } = residueRingStyle(level, ring);
                expect(segmentColours.has(colour)).toBe(false);
                expect(skeletonColours.has(colour)).toBe(false);
            }
        }
    });

    it('gives the rings of one node different colours and different dashes from each other', () => {
        const rings = [0, 1, 2, 3].map((index) => residueRingStyle(1, index));
        expect(new Set(rings.map((style) => style.colour)).size).toBe(rings.length);
        expect(new Set(rings.map((style) => style.dash.join(','))).size).toBe(rings.length);
    });

    it('cycles rather than running off the end of its palette', () => {
        expect(residueRingStyle(0, RESIDUE_RING_COLOURS.length)).toEqual(residueRingStyle(0, 0));
        expect(residueRingStyle(0, -1).colour).toBeDefined();
    });

    it('thins with depth in step with the level it belongs to', () => {
        for (let level = 0; level < RECURSIVE_LEVEL_STYLES.length; level++) {
            expect(residueRingStyle(level, 0).width).toBe(styleForLevel(level).segmentWidth);
        }
    });

    it('is faint enough to be drawn through', () => {
        expect(residueRingStyle(0, 0).fill.opacity ?? 1).toBeLessThan(0.25);
        expect(residueRingStyle(0, 0).fill.opacity ?? 0).toBeGreaterThan(0);
    });
});

describe('the residue on the canvas', () => {
    const allLevelsVisible = [true, true, true];

    function residueGroups(scene: ScenePrimitive[]): SceneGroup[] {
        return scene.filter(isGroup).filter((group) => group.id.startsWith('group:recursive-residue-'));
    }

    it('draws one ring per residue ring, at the level of the node that holds it', () => {
        const scene = recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        const groups = residueGroups(scene);

        expect(groups.map((group) => group.id))
            .toEqual(['group:recursive-residue-0', 'group:recursive-residue-1']);
        expect(groups[0].children).toHaveLength(RESIDUE_TREE.residueRings.length);
        expect(groups[1].children).toHaveLength(1);
        expect(groups[0].children.every((child) => child.type === 'line' && child.closed === true)).toBe(true);
    });

    it('draws the residue over every segment stroke, and still under the input polygon', () => {
        const ids = recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        }).filter(isGroup).map((group) => group.id);

        const lastLevel = ids.map((id) => id.startsWith('group:recursive-level-')).lastIndexOf(true);
        const firstResidue = ids.findIndex((id) => id.startsWith('group:recursive-residue-'));
        expect(firstResidue).toBeGreaterThan(lastLevel);
        expect(ids[ids.length - 1]).toBe('group:recursive-input');
    });

    it("hides a level's residue with the level whose interior it is", () => {
        const hidden = recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: [true, false, true],
            showLeafFills: true,
        }).filter(isGroup).filter((group) => group.visible === false).map((group) => group.id);

        expect(hidden).toContain('group:recursive-residue-1');
        expect(hidden).not.toContain('group:recursive-residue-0');
    });

    it('strokes the rings of one node apart from each other', () => {
        const [rootResidue] = residueGroups(recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        }));
        const strokes = rootResidue.children.flatMap((child) =>
            child.type === 'line' ? [child.stroke] : []);

        expect(strokes).toHaveLength(2);
        expect(strokes[0].color).not.toBe(strokes[1].color);
        expect(strokes[0].dash?.join(',')).not.toBe(strokes[1].dash?.join(','));
        // Dashed at all, which is what separates a residue ring from a segment border in greyscale.
        expect(strokes.every((stroke) => (stroke.dash?.length ?? 0) > 0)).toBe(true);
    });

    it('keeps the stroke-only comparison honest: rings outlined, none of them filled', () => {
        const scene = recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: false,
        });
        expect(residueGroups(scene)).toHaveLength(2);
        expect(residueGroups(scene).flatMap((group) => group.children)
            .every((child) => child.type === 'line' && child.fill === undefined)).toBe(true);

        // The failure patch keeps its fill either way — it is the one fill this page has always had,
        // and a hole in the subdivision drawn as an outline reads as one more cell border.
        expect(filledShapes(scene).every((fill) => fill.stroke.color === '#e64980')).toBe(true);
    });

    it('has no residue layer at all when nothing was left over', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        expect(residueGroups(scene)).toEqual([]);
    });
});

/**
 * Decision 7, checked on geometry that actually fails.
 *
 * Duck Octagon subdivides cleanly at three levels, so it cannot show that a failure still reads as a
 * failure once its neighbours are tinted. The driver's own census names Pentagon House in groups of
 * three as a fixture that stops subdividing, which is what this uses.
 *
 * Solved at FULL depth with the residue voided, so the only fills in the scene are territories and
 * failure patches: at `FULL_DEPTH_FRACTION` the wavefront is fully consumed and no residue ring is
 * produced at all, which keeps this suite's fill census about the failure and nothing else.
 */
describe('a failed cell among tinted ones', () => {
    const fixture = ALL_TEST_POLYGONS.find((polygon) => polygon.name === 'Pentagon House');
    const tree = subdivideRecursively(fixture?.vertices ?? [], {
        levels: 3,
        mergeGroupSize: 3,
        depthFraction: FULL_DEPTH_FRACTION,
        residue: 'void',
    });

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
