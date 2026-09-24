import { FULL_DEPTH_FRACTION, subdivideRecursively, uniformLevelSpecs } from '@proc-geo/core';
import type { LevelSpec } from '@proc-geo/core';
import { OFF_EDGE_JITTER_PLUS_SEED_7919 } from '@proc-geo/test-fixtures';
import {
    RECURSED_SEGMENT_OPACITY,
    recursiveTreeToScene,
    RECURSIVE_LEVEL_STYLES,
    RESIDUE_RING_COLOURS,
    residueRingStyle,
    SPINE_COLOUR,
    SPINE_WIDTH_MULTIPLIER,
    styleForLevel,
} from '../../src/scene/adapters/recursiveSubdivisionToScene';
import { ancestorTint, FAILURE_COLOUR } from '../../src/scene/adapters/recursiveTerritoryTint';
import { leafTerritories } from '../../src/scene/adapters/leafTerritories';
import { regionSpine } from '../../src/scene/adapters/regionSpine';
import { summariseRecursiveTree } from '../../src/stores/useRecursiveSubdivisionStore';
import type { SceneGroup, ScenePrimitive } from '../../src/scene/types';
import {
    failedNode,
    LOBED_SPLIT_STRATEGY,
    LOBED_TREE,
    node,
    RESIDUE_TREE,
    RESIDUE_TREE_LEVELS,
    TREE,
    TREE_LEVELS,
    TREE_TERRITORY_COUNT,
} from '../fixtures/recursive-trees';

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
        expect(leafTerritories(TREE).cells).toHaveLength(summariseRecursiveTree(TREE, TREE_LEVELS).leafSegments);
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

        expect(tints).toHaveLength(summariseRecursiveTree(TREE, TREE_LEVELS).leafSegments);
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
 * Decision 10: a cell that was subdivided and a cell that is final must not be drawn identically.
 *
 * The distinction is per NODE rather than per level, because a level can hold both: one region's
 * segments recursed and its sibling's did not. And it has to survive the droste reading, where a
 * node's own ring of cells is final while its courtyard goes on subdividing — which is the case that
 * makes "has no children" the wrong question to draw from.
 */
describe('a subdivided cell against a final one', () => {
    const allLevelsVisible = [true, true, true];

    /** The segment outlines drawn for one level, told from its skeleton arcs by their colour. */
    function segmentOpacities(scene: ScenePrimitive[], level: number): (number | undefined)[] {
        const group = scene.filter(isGroup).find((g) => g.id === `group:recursive-level-${level}`);
        return (group?.children ?? []).flatMap((child) =>
            child.type === 'line' && child.stroke.color === styleForLevel(level).segmentColour
                ? [child.stroke.opacity]
                : []);
    }

    it('is a real distinction rather than an invisible one', () => {
        expect(RECURSED_SEGMENT_OPACITY).toBeGreaterThan(0);
        expect(RECURSED_SEGMENT_OPACITY).toBeLessThan(1);
    });

    it('draws a subdivided cell fainter than a final one', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });

        // The root's three cells all became regions, so all three are hints.
        expect(segmentOpacities(scene, 0)).toEqual([
            RECURSED_SEGMENT_OPACITY, RECURSED_SEGMENT_OPACITY, RECURSED_SEGMENT_OPACITY,
        ]);
        // The deepest level's cells are the last word, so they are drawn at full strength — which is
        // the absence of an opacity rather than an opacity of one.
        expect(segmentOpacities(scene, 2)).toEqual([undefined, undefined]);
    });

    it('tells two nodes of one level apart, since one recursed and its sibling did not', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        const atOne = segmentOpacities(scene, 1);

        // Level 1 holds a childless node of two cells and a subdivided node of four; a distinction
        // drawn per level rather than per node would give all six the same stroke.
        expect(atOne.filter((opacity) => opacity === undefined)).toHaveLength(2);
        expect(atOne.filter((opacity) => opacity === RECURSED_SEGMENT_OPACITY)).toHaveLength(4);
    });

    it('draws a droste node’s ring at full strength, courtyard or no courtyard', () => {
        // The case the old reading got wrong: the root's segments are leaves, and the recursion went
        // down the RESIDUE. Drawing its ring as a hint would say the cells were subdivided when the
        // level's spec said they were final.
        const scene = recursiveTreeToScene(RESIDUE_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        expect(RESIDUE_TREE.children).toEqual([]);
        expect(RESIDUE_TREE.residueChildren.length).toBeGreaterThan(0);
        expect(segmentOpacities(scene, 0)).toEqual([undefined, undefined, undefined]);
    });

    it('keeps the distinction with the fills off, where it is the only one left', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: false,
        });
        expect(segmentOpacities(scene, 0).every((opacity) => opacity === RECURSED_SEGMENT_OPACITY))
            .toBe(true);
        expect(segmentOpacities(scene, 2).every((opacity) => opacity === undefined)).toBe(true);
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
 * A fixture that subdivides cleanly cannot show that a failure still reads as a failure once its
 * neighbours are tinted, so the specimen has to be one the driver really does stop subdividing.
 *
 * RE-SPECIMENED 2026-08-28, the second time: the split-at-the-vertex correction in
 * `generateSplitEventFromTheEdgeItself` cured Broken Polygon in groups of five, as the decision-56
 * partition fix had cured Pentagon House in groups of three before it, and the gate below reported
 * each dead specimen exactly as it was meant to. `OFF_EDGE_JITTER_L_SEED_55433_K4` in groups of four
 * took over then, and the gate fired on it in turn.
 *
 * RE-SPECIMENED 2026-08-29, the third time, by journal decision 100's fold fix: the k=4 seed's
 * thirteen-vertex incomplete solve was a region carrying an invisible spike that canonicalisation
 * had been screening above the floor, and it solves now. Swept afresh over the WHOLE corpus at every
 * merge group from two to eight, at full depth with the residue voided, EXACTLY ONE failed cell is
 * left anywhere: `r0.0.2` of `OFF_EDGE_JITTER_PLUS_SEED_7919` in groups of two, with thirty-one
 * solved leaves tinted around it.
 *
 * ITS CHARACTER HAS CHANGED AND THE CHANGE IS WORTH READING. Every previous specimen was an
 * incomplete solve — a solver defect, journal decision 67. This one is a `Degenerate region`: a
 * five-vertex sliver enclosing 6.08e-7 against the 1e-6 degeneracy floor, which journal decision 96
 * ruled to be CORRECT behaviour rather than a defect. What this suite needs of it is unchanged, since
 * what is asserted here is about DRAWING — a cell the driver did not subdivide has to read as a hole
 * rather than as another territory, and the reason it was not subdivided does not enter into it. It
 * is also a far more durable specimen for exactly that reason: a decision-96 decline is a designed
 * outcome and no fix is coming for it, where the previous three were all defects awaiting one.
 *
 * Solved at FULL depth with the residue voided, so the only fills in the scene are territories and
 * failure patches: at `FULL_DEPTH_FRACTION` the wavefront is fully consumed and no residue ring is
 * produced at all, which keeps this suite's fill census about the failure and nothing else. A
 * specimen that only fails BELOW full depth would not do: its residue rings are dashed fills too,
 * and the census below could no longer tell a hole from a courtyard.
 *
 * RE-SPECIMENED 2026-09-24, the fifth time, by C8 dispatch 2's degeneracy bar (spec T23, O3 form (b),
 * journal decision 159(b)): the bar became "no visible width" — the root floor in caller units times
 * half the region's perimeter — and `r0.0.2` in groups of two (4.79e-7 against a bar of 4.16e-7) is one
 * of the six declines it releases; it solves clean. The same fixture in groups of ONE still declines
 * several slivers under the new bar (`r0.0.2`, `r0.0.3`, `r0.0.4` among them), which is all this suite
 * needs: every failure patch must read as a hole among the tints.
 */
describe('a failed cell among tinted ones', () => {
    const levels: LevelSpec[] = uniformLevelSpecs({
        levels: 3,
        mergeGroupSize: 1,
        depthFraction: FULL_DEPTH_FRACTION,
        residue: 'void',
    });
    const tree = subdivideRecursively(OFF_EDGE_JITTER_PLUS_SEED_7919, { levels });

    it('is a fixture that really does fail, or this proves nothing', () => {
        expect(OFF_EDGE_JITTER_PLUS_SEED_7919.length).toBeGreaterThan(0);
        expect(summariseRecursiveTree(tree, levels).totalFailures).toBeGreaterThan(0);
    });

    it('keeps the failure patch distinguishable from every territory around it', () => {
        const fills = filledShapes(recursiveTreeToScene(tree, {
            levelVisibility: [true, true, true],
            showLeafFills: true,
        }));

        const failurePatches = fills.filter((fill) => fill.stroke.dash !== undefined);
        expect(failurePatches).toHaveLength(summariseRecursiveTree(tree, levels).totalFailures);

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

/**
 * The spine layer: a SELECTION from arcs already on the canvas.
 *
 * Two things have to be true of it and are asserted here rather than left to the eye. It has to read
 * as emphasis rather than as new geometry, which is a claim about colour and weight against the
 * layers it sits over. And a spine that came apart has to be DRAWN apart — decision 11's single most
 * important thing — which means one primitive per retained arc and nothing joining them, so the gap
 * in a lobed region is visible as well as counted.
 */

/** Every line primitive drawn in the spine group for a level. */
function spineLines(scene: ScenePrimitive[], level: number): Extract<ScenePrimitive, { type: 'line' }>[] {
    const group = scene.filter(isGroup).find((g) => g.id === `group:recursive-spine-${level}`);
    return (group?.children ?? []).flatMap((child) => (child.type === 'line' ? [child] : []));
}

/** The scene's groups in draw order, which is what a layering claim is made against. */
function sceneGroupIds(scene: ScenePrimitive[]): string[] {
    return scene.filter(isGroup).map((group) => group.id);
}

describe('the spine on the canvas', () => {
    const allLevelsVisible = [true, true, true];

    it('draws nothing at all where no strategy is set for a level', () => {
        // A host that has not adopted the control is looking at the picture it always drew, not at a
        // picture with geometry missing from it.
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
        });
        expect(sceneGroupIds(scene).some((id) => id.startsWith('group:recursive-spine-'))).toBe(false);
    });

    it('draws one arc per arc the strategy retained, in the spine colour', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }],
        });
        const drawn = spineLines(scene, 0);
        const retained = regionSpine(TREE, { kind: 'diameter' })?.spine.edges ?? [];

        expect(drawn).toHaveLength(retained.length);
        expect(drawn.every((line) => line.stroke.color === SPINE_COLOUR)).toBe(true);
        // Segments, not rings: an arc runs between two nodes and closing it would invent geometry.
        expect(drawn.every((line) => line.points.length === 4)).toBe(true);
        expect(drawn.every((line) => line.closed !== true)).toBe(true);
    });

    it('reads as emphasis: heavier than the skeleton arcs it is chosen out of', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }],
        });

        // The weight channel is the half that survives the greyscale screenshot this page is most
        // often read in, where the hue below says nothing.
        expect(SPINE_WIDTH_MULTIPLIER).toBeGreaterThan(1);
        for (const line of spineLines(scene, 0)) {
            expect(line.stroke.width).toBeGreaterThan(styleForLevel(0).skeletonWidth);
        }
    });

    it('shares its colour with no other layer on the page', () => {
        const others = new Set([
            ...RECURSIVE_LEVEL_STYLES.map((style) => style.segmentColour),
            ...RECURSIVE_LEVEL_STYLES.map((style) => style.skeletonColour),
            ...RESIDUE_RING_COLOURS,
            FAILURE_COLOUR,
        ]);
        expect(others.has(SPINE_COLOUR)).toBe(false);
    });

    it('thins with depth in step with the level it belongs to', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }, { kind: 'diameter' }, { kind: 'diameter' }],
        });

        const widths = [0, 1, 2].map((level) => spineLines(scene, level)[0]?.stroke.width);
        expect(widths[0]).toBeGreaterThan(widths[1] as number);
        expect(widths[1]).toBeGreaterThan(widths[2] as number);
    });

    it('is hidden with the level whose region it is the spine of', () => {
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: [true, true, false],
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }, { kind: 'diameter' }, { kind: 'diameter' }],
        });
        const hidden = scene.filter(isGroup).filter((group) => group.visible === false).map((g) => g.id);

        expect(hidden).toContain('group:recursive-spine-2');
        expect(hidden).not.toContain('group:recursive-spine-1');
    });

    it('is drawn over the level it emphasises rather than under it', () => {
        // Drawn underneath, the layer a spine selects FROM would cover the selection.
        const scene = recursiveTreeToScene(TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }],
        });
        const ids = sceneGroupIds(scene);

        expect(ids.indexOf('group:recursive-spine-0')).toBeGreaterThan(ids.indexOf('group:recursive-level-0'));
    });

    it('draws a severed spine severed, with nothing bridging the gap', () => {
        // The lobed region at the threshold that splits it: two arcs, two components, and no third
        // primitive joining them. A bridge here would be the adapter repairing what decision 6 says
        // must be reported.
        const scene = recursiveTreeToScene(LOBED_TREE, {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [LOBED_SPLIT_STRATEGY],
        });
        const region = regionSpine(LOBED_TREE, LOBED_SPLIT_STRATEGY);
        const drawn = spineLines(scene, 0);

        expect(region?.spine.componentCount).toBe(2);
        expect(drawn).toHaveLength(region?.spine.edges.length ?? 0);

        // Every arc drawn is an arc the strategy retained: the endpoints match a retained edge's,
        // so no primitive here spans two components.
        const retained = new Set((region?.spine.edges ?? []).map((edge) => {
            const from = region?.positions.get(edge.a);
            const to = region?.positions.get(edge.b);
            return `${from?.x},${from?.y},${to?.x},${to?.y}`;
        }));
        for (const line of drawn) {
            expect(retained.has(line.points.join(','))).toBe(true);
        }
    });

    it('draws no spine for a region that did not subdivide', () => {
        const scene = recursiveTreeToScene(failedNode(0), {
            levelVisibility: allLevelsVisible,
            showLeafFills: true,
            spineStrategies: [{ kind: 'diameter' }],
        });
        expect(spineLines(scene, 0)).toEqual([]);
    });
});
