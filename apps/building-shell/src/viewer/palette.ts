// Spec decision 28: colours are fixed per kind. Each table is a `Record` over its kind union, so a kind added to the
// pipeline without a colour fails to compile; `tests/viewer-palette.test.ts` checks the same at run time against the
// pipeline's own kind lists.
import {EDGE_KINDS, EdgeKind} from '../edges.ts';
import {RETAG_RANK, ShellKind} from '../tags.ts';

/** The one colour for a defect: an `Unclassified` Edge or a surviving `Internal` face (spec decision 28). */
export const MAGENTA = 0xff00ff;

/** The ghost colour for a raw part's `Internal` faces (raw mode): not a surviving Internal, so not magenta. */
export const RAW_INTERNAL_GREY = 0x8a929c;

/** The neutral colour of Cell outlines and vertices. */
export const OUTLINE_GREY = 0xc8ced6;
export const VERTEX_WHITE = 0xffffff;

/** Every `ShellKind`, derived from the pipeline's own ranking table plus the one kind it leaves out. */
export const SHELL_KINDS: readonly ShellKind[] = [...(Object.keys(RETAG_RANK) as ShellKind[]), 'Internal'];

export { EDGE_KINDS };

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

/** One line colour per `EdgeKind`. */
export const EDGE_KIND_COLOUR: Readonly<Record<EdgeKind, number>> = {
  WallVertical: 0x8ab4f8,
  WallHorizontal: 0x1e88e5,
  FloorLine: 0x00e5ff,
  ExternalCorner: 0xffffff,
  InternalCorner: 0xffeb3b,
  RingJunction: 0xff9800,
  Eaves: 0x76ff03,
  RoofInterior: 0x607d8b,
  WallPlate: 0x00c853,
  GableHorizontal: 0xff7043,
  GableVertical: 0xffab91,
  Verge: 0x9575cd,
  Ridge: 0xff1744,
  Hip: 0x8d6e63,
  Valley: 0x00bfa5,
  GroundLine: 0xa5d6a7,
  RoofSeam: 0xf48fb1,
  GableSloped: 0xc0ca33,
  SoffitEdge: 0x3949ab,
  SoffitJunction: 0xb0bec5,
  Unclassified: MAGENTA,
};

export const GROUND_OPACITY = 0.35;
export const GHOST_OPACITY = 0.2;

/** Spec decision 28: a partial Cell is its face's colour mixed toward white by this fraction. */
export const PARTIAL_LIGHTEN = 0.5;

/** A colour mixed toward white by `t` (0 keeps it, 1 is white), per sRGB channel. */
export function lighten(hex: number, t: number): number {
  const mix = (c: number): number => Math.round(c + (255 - c) * t);
  return (mix((hex >> 16) & 255) << 16) | (mix((hex >> 8) & 255) << 8) | mix(hex & 255);
}

export const partialColour = (kind: ShellKind): number => lighten(SHELL_KIND_COLOUR[kind], PARTIAL_LIGHTEN);

export const cssColour = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
