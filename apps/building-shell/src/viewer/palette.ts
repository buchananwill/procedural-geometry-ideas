// Spec decision 28: colours are fixed per kind. Each table is a `Record` over its kind union, so a kind added to the
// pipeline without a colour fails to compile; `tests/viewer-palette.test.ts` checks the same at run time against the
// spec's own kind lists, and measures the floors below (journal decision 98, F4).
import type {EdgeKind} from '../edges.ts';
import {SHELL_KINDS, ShellKind} from '../tags.ts';
import {over} from './colour-metrics.ts';
import {litShades} from './lighting.ts';

/** The one colour for a defect: an `Unclassified` Edge or a surviving `Internal` face (spec decision 28). */
export const MAGENTA = 0xff00ff;

export const BACKGROUND = 0x14181f;

/** The ghost colour for a raw part's `Internal` faces (raw mode): not a surviving Internal, so not magenta. */
export const RAW_INTERNAL_GREY = 0x8a929c;

/** Cell outlines when they are not coloured by NetEdge kind: a dark neutral, readable on every fill. */
export const OUTLINE_COLOUR = 0x1e0f2d;
/** The thin outlines of the raw ghost parts. */
export const GHOST_LINE_COLOUR = 0xc8ced6;
/** Vertex dots. */
export const VERTEX_COLOUR = 0x00001e;
/** The overlay under the cursor, and the overlay on a pinned item. */
export const HOVER_COLOUR = 0xffff96;
export const PIN_COLOUR = 0xffd21e;

/** The orientation gizmo's axes: X, Y and Z (up). */
export const AXIS_COLOURS = {x: 0xff0000, y: 0x00ff00, z: 0x3b73ff} as const;

/** One fill colour per `ShellKind`. `Ground` is drawn translucent (see `GROUND_OPACITY`). */
export const SHELL_KIND_COLOUR: Readonly<Record<ShellKind, number>> = {
  Wall: 0xd9cba3,
  Gable: 0xf2a33a,
  Roof: 0xb5483a,
  Underside: 0x5b8fb9,
  Ground: 0x3f8f4f,
  Cheek: 0x8e5bc2,
  Internal: MAGENTA,
};

/** Every `ShellKind`: `tags.ts`'s one list (journal decision 147, N7), re-exported for the legend. */
export {SHELL_KINDS};

/** One line colour per `EdgeKind`. */
export const EDGE_KIND_COLOUR: Readonly<Record<EdgeKind, number>> = {
  WallVertical: 0xa5c3ff,
  WallHorizontal: 0x0f96ff,
  FloorLine: 0x00e1ff,
  ExternalCorner: 0x008291,
  InternalCorner: 0xf0ff00,
  RingJunction: 0x2d873c,
  Eaves: 0x78ff0f,
  RoofInterior: 0x87b400,
  WallPlate: 0x00c34b,
  GableHorizontal: 0xf05a2d,
  GableVertical: 0xff8787,
  Verge: 0x695aff,
  Ridge: 0xff005a,
  Hip: 0x78691e,
  Valley: 0x00c3a5,
  GroundLine: 0xa5f0a5,
  RoofSeam: 0xf078b4,
  GableSloped: 0xa5c32d,
  SoffitEdge: 0x735fc3,
  SoffitJunction: 0xffc3f0,
  Unclassified: MAGENTA,
};

export const GROUND_OPACITY = 0.35;
export const GHOST_OPACITY = 0.2;
/** In raw mode the shell's own faces turn translucent, so the parts the union removed show through them. */
export const RAW_SHELL_OPACITY = 0.3;

/** Spec decision 28 as amended: the opt-in partial-Cell tint is its face's colour mixed toward white by this fraction. */
export const PARTIAL_LIGHTEN = 0.5;

/** A colour mixed toward white by `t` (0 keeps it, 1 is white), per sRGB channel. */
export function lighten(hex: number, t: number): number {
  return over(0xffffff, hex, t);
}

export const partialColour = (kind: ShellKind): number => lighten(SHELL_KIND_COLOUR[kind], PARTIAL_LIGHTEN);

export const cssColour = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * Every shade a fill of `kind` shows on the page: its colour under the scene's lights, over every normal a face of that
 * kind can have (see `lighting.ts`). Ground is translucent, so each shade is laid over the background.
 */
export function fillShades(kind: ShellKind): number[] {
  const shades = litShades(kind, SHELL_KIND_COLOUR[kind]);
  return kind === 'Ground' ? shades.map(h => over(h, BACKGROUND, GROUND_OPACITY)) : shades;
}

/** Every shade the opt-in partial tint of `kind` shows. Ground and Internal faces have no Cells, so no tint. */
export const tintShades = (kind: ShellKind): number[] => (kind === 'Ground' || kind === 'Internal' ? [] : litShades(kind, partialColour(kind)));

/**
 * The face kinds a table row stands for: `kinds`, and Cheek wherever it names Gable, because Cheek reads as Gable (spec
 * decision 21, journal decision 77). Every row of `EDGE_KIND_LIES_ON` goes through it, so the rule holds by construction.
 */
export const readsAsGable = (kinds: readonly ShellKind[]): ShellKind[] =>
  kinds.includes('Gable') && !kinds.includes('Cheek') ? [...kinds, 'Cheek'] : [...kinds];

/**
 * The face kinds an Edge kind can lie on: its two faces under spec decision 21's table (where the table names Gable,
 * Cheek reads as Gable: see `readsAsGable`), and the face a Cell side lies on under decision 25. `Unclassified` can
 * lie on any drawn kind. `Internal` is left out: it is magenta by decision 28.
 */
export const EDGE_KIND_LIES_ON: Readonly<Record<EdgeKind, readonly ShellKind[]>> = {
  WallVertical: readsAsGable(['Wall']),
  WallHorizontal: readsAsGable(['Wall']),
  FloorLine: readsAsGable(['Wall']),
  ExternalCorner: readsAsGable(['Wall', 'Gable']),
  InternalCorner: readsAsGable(['Wall', 'Gable']),
  RingJunction: readsAsGable(['Roof', 'Wall', 'Gable']),
  Eaves: readsAsGable(['Roof', 'Wall']),
  RoofInterior: readsAsGable(['Roof', 'Underside']),
  WallPlate: readsAsGable(['Wall', 'Gable']),
  GableHorizontal: readsAsGable(['Wall', 'Gable']),
  GableVertical: readsAsGable(['Wall', 'Gable']),
  Verge: readsAsGable(['Roof', 'Gable']),
  Ridge: readsAsGable(['Roof']),
  Hip: readsAsGable(['Roof']),
  Valley: readsAsGable(['Roof']),
  GroundLine: readsAsGable(['Wall', 'Gable', 'Ground']),
  RoofSeam: readsAsGable(['Roof']),
  GableSloped: readsAsGable(['Wall', 'Gable']),
  SoffitEdge: readsAsGable(['Wall', 'Underside']),
  SoffitJunction: readsAsGable(['Wall', 'Underside']),
  Unclassified: readsAsGable(['Wall', 'Gable', 'Roof', 'Underside', 'Ground']),
};

/** Two Edge kinds can meet at one vertex when some face kind holds both. */
export const edgeKindsCanMeet = (a: EdgeKind, b: EdgeKind): boolean =>
  EDGE_KIND_LIES_ON[a].some(k => EDGE_KIND_LIES_ON[b].includes(k));

/** The measured floors, in ΔE76 (journal decision 98, F4). */
export const FLOOR_EDGE_ON_FILL = 30;
export const FLOOR_EDGE_PAIR = 25;
export const FLOOR_INTERACTION = 25;
/**
 * The luminance-contrast floor (WCAG ratio, journal decision 114): every Edge colour and every gizmo label against the
 * background. ΔE76 overstates the contrast of a dark blue, which ratio reads plainly. The ratio is cleared by at least
 * `CONTRAST_MARGIN` for the same reason `FLOOR_MARGIN` exists.
 */
export const FLOOR_LUMINANCE_CONTRAST = 3;
export const CONTRAST_MARGIN = 0.25;
/** Each floor is cleared by at least this much, so a light or rounding change does not flip a pass (journal decision 105, M1). */
export const FLOOR_MARGIN = 3;
