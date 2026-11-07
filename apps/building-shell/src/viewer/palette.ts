// Spec decision 28: colours are fixed per kind. Each table is a `Record` over its kind union, so a kind added to the
// pipeline without a colour fails to compile; `tests/viewer-palette.test.ts` checks the same at run time against the
// spec's own kind lists, and measures the floors below (journal decision 98, F4).
import type {EdgeKind} from '../edges.ts';
import type {ShellKind} from '../tags.ts';
import {over} from './colour-metrics.ts';

/** The one colour for a defect: an `Unclassified` Edge or a surviving `Internal` face (spec decision 28). */
export const MAGENTA = 0xff00ff;

export const BACKGROUND = 0x14181f;

/** The ghost colour for a raw part's `Internal` faces (raw mode): not a surviving Internal, so not magenta. */
export const RAW_INTERNAL_GREY = 0x8a929c;

/** Cell outlines when they are not coloured by NetEdge kind: a dark neutral, readable on every fill. */
export const OUTLINE_COLOUR = 0x212236;
/** The thin outlines of the raw ghost parts. */
export const GHOST_LINE_COLOUR = 0xc8ced6;
/** Vertex dots. */
export const VERTEX_COLOUR = 0x000000;
/** The overlay under the cursor, and the overlay on a pinned item. */
export const HOVER_COLOUR = 0xffffff;
export const PIN_COLOUR = 0xffd740;

/** The orientation gizmo's axes: X, Y and Z (up). */
export const AXIS_COLOURS = {x: 0xff0000, y: 0x00ff00, z: 0x0000ff} as const;

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

/** Every `ShellKind`, read from the colour table whose completeness the compiler enforces. */
export const SHELL_KINDS = Object.keys(SHELL_KIND_COLOUR) as ShellKind[];

/** One line colour per `EdgeKind`. */
export const EDGE_KIND_COLOUR: Readonly<Record<EdgeKind, number>> = {
  WallVertical: 0x92b8f9,
  WallHorizontal: 0x1587e4,
  FloorLine: 0x00e5ff,
  ExternalCorner: 0x14188c,
  InternalCorner: 0xfbfe2e,
  RingJunction: 0x2e7d32,
  Eaves: 0x76ff03,
  RoofInterior: 0x517269,
  WallPlate: 0x00c853,
  GableHorizontal: 0xff7043,
  GableVertical: 0xfda58c,
  Verge: 0x9575cd,
  Ridge: 0xff1744,
  Hip: 0x8e6e63,
  Valley: 0x00bfa5,
  GroundLine: 0x91daa8,
  RoofSeam: 0xf48fb1,
  GableSloped: 0xb4c62f,
  SoffitEdge: 0x434fae,
  SoffitJunction: 0xcbb6ca,
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

/** What a fill looks like on the page: Ground is translucent over the background, the rest are opaque. */
export const fillAppearance = (kind: ShellKind): number =>
  kind === 'Ground' ? over(SHELL_KIND_COLOUR.Ground, BACKGROUND, GROUND_OPACITY) : SHELL_KIND_COLOUR[kind];

/**
 * The face kinds an Edge kind can lie on: its two faces under spec decision 21's table, and the face a Cell side lies
 * on under decision 25. `Unclassified` can lie on any drawn kind. `Internal` is left out: it is magenta by decision 28.
 */
export const EDGE_KIND_LIES_ON: Readonly<Record<EdgeKind, readonly ShellKind[]>> = {
  WallVertical: ['Wall'],
  WallHorizontal: ['Wall'],
  FloorLine: ['Wall'],
  ExternalCorner: ['Wall', 'Gable', 'Cheek'],
  InternalCorner: ['Wall', 'Gable', 'Cheek'],
  RingJunction: ['Roof', 'Wall', 'Gable'],
  Eaves: ['Roof', 'Wall'],
  RoofInterior: ['Roof', 'Underside'],
  WallPlate: ['Wall', 'Gable'],
  GableHorizontal: ['Wall', 'Gable', 'Cheek'],
  GableVertical: ['Wall', 'Gable', 'Cheek'],
  Verge: ['Roof', 'Gable'],
  Ridge: ['Roof'],
  Hip: ['Roof'],
  Valley: ['Roof'],
  GroundLine: ['Wall', 'Gable', 'Ground'],
  RoofSeam: ['Roof'],
  GableSloped: ['Wall', 'Gable', 'Cheek'],
  SoffitEdge: ['Wall', 'Underside'],
  SoffitJunction: ['Wall', 'Underside'],
  Unclassified: ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek'],
};

/** Two Edge kinds can meet at one vertex when some face kind holds both. */
export const edgeKindsCanMeet = (a: EdgeKind, b: EdgeKind): boolean =>
  EDGE_KIND_LIES_ON[a].some(k => EDGE_KIND_LIES_ON[b].includes(k));

/** The measured floors, in ΔE76 (journal decision 98, F4). */
export const FLOOR_EDGE_ON_FILL = 30;
export const FLOOR_EDGE_PAIR = 25;
export const FLOOR_INTERACTION = 25;
