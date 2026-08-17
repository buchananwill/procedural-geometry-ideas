import type { FillStyle } from '../types';

/**
 * The colours the recursive subdivision page fills shapes with, and the arithmetic behind them.
 *
 * Two facts live here together because they are one fact: the colour a failed cell is drawn in, and
 * the arc of the hue wheel no territory may be given. Split apart, a later change to the failure
 * colour would leave the reservation guarding the wrong hue and the guarantee would rot silently.
 *
 * Nothing here knows about scene primitives, tree shape or draw order — it maps small integers to
 * colours. That is why it is a module of its own rather than a section of the adapter.
 */

/**
 * Reserved for cells that did not subdivide, and used for nothing else on this page.
 *
 * A failed cell is filled as well as outlined: an outline alone reads as one more cell border in a
 * picture already full of them, whereas a filled patch reads as a hole in the subdivision, which is
 * what it is.
 */
export const FAILURE_COLOUR = '#e64980';

/**
 * Hue of {@link FAILURE_COLOUR}, and the arc either side of it that no territory may be given.
 *
 * A failed cell is the one thing on this page that must never be mistaken for an ordinary cell, and
 * once leaves are tinted, "pink" alone no longer says so — with enough territories one of them would
 * eventually land on pink. Reserving the arc makes the collision impossible rather than unlikely.
 */
const FAILURE_HUE_DEGREES = 340;
const RESERVED_HUE_HALF_ARC_DEGREES = 30;

/**
 * Territory tint: strong enough in hue to group, weak enough in alpha to be drawn through.
 *
 * The lightness cycle is decision 4 — cells of one territory must stay individually countable rather
 * than merging into a single blob — and it varies lightness only, because hue is what encodes
 * ancestry and a cell whose hue drifted would read as a different territory. The cycle is not
 * monotonic so that two cells adjacent in traversal order are never merely one step apart.
 */
const LEAF_FILL_SATURATION = 0.65;
const LEAF_FILL_LIGHTNESSES = [0.5, 0.64, 0.57, 0.71];
const LEAF_FILL_OPACITY = 0.2;

/**
 * Colours are emitted as hex, not `hsl(...)`, because `SceneCanvas` applies a fill's opacity by
 * rewriting the colour string and only understands hex and `rgb()`. An `hsl()` fill would silently
 * render fully opaque and bury the skeleton under it.
 */
function hslHex(hueDegrees: number, saturation: number, lightness: number): string {
    const h = ((hueDegrees % 360) + 360) % 360;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - chroma / 2;

    let rgb: [number, number, number];
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];

    const channel = (value: number) =>
        Math.round(Math.min(255, Math.max(0, (value + m) * 255)))
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/**
 * The fill a leaf cell is given: hue from its level-0 ancestor, lightness from its place in that
 * ancestor's brood. The companion to `styleForLevel` — level says how a cell is drawn, this says
 * which territory it belongs to.
 *
 * Hues are cut evenly from the wheel by root index, so neighbouring territories land far apart in
 * hue rather than next to each other, and the cut starts clear of the arc reserved for failures.
 *
 * @param rootIndex   index of the level-0 segment the cell descends from
 * @param rootCount   how many level-0 segments there are — the wheel is cut into this many
 * @param ordinal     the cell's place among the leaves of its own territory
 */
export function ancestorTint(rootIndex: number, rootCount: number, ordinal: number): FillStyle {
    const count = Math.max(1, Math.floor(rootCount));
    const index = ((Math.floor(rootIndex) % count) + count) % count;
    const available = 360 - 2 * RESERVED_HUE_HALF_ARC_DEGREES;
    const hue = FAILURE_HUE_DEGREES + RESERVED_HUE_HALF_ARC_DEGREES + (index / count) * available;

    const steps = LEAF_FILL_LIGHTNESSES.length;
    const lightness = LEAF_FILL_LIGHTNESSES[((Math.floor(ordinal) % steps) + steps) % steps];

    return { color: hslHex(hue, LEAF_FILL_SATURATION, lightness), opacity: LEAF_FILL_OPACITY };
}
