// The scene's lights, in one place: the renderer builds its lights from these constants, and the palette's floors are
// measured from the same constants (journal decision 105, M1), so the test and the screen cannot drift apart.
//
// three.js (r155 and later, no legacy lights) lights a MeshLambertMaterial as
//   outgoing = diffuse * (ambient + sum over directional lights of intensity * max(0, n . l)) / pi
// in linear light, where `l` is the unit vector from the origin to the light's position and `n` the unit face normal.
// A colour channel then clips at 1. This file computes exactly that.
import type {ShellKind, Vec3} from '../tags.ts';
import {hexToRgb, linearToSrgb, rgbToHex, srgbToLinear} from './colour-metrics.ts';

export interface DirectionalSpec { intensity: number; position: Readonly<Vec3> }

export const AMBIENT_LIGHT = {color: 0xffffff, intensity: 1.5} as const;

/** The key light from above and in front, the fill from the side. */
export const DIRECTIONAL_LIGHTS: readonly DirectionalSpec[] = [
  {intensity: 2.2, position: [-1, -2, 3]},
  {intensity: 0.9, position: [2, 1, 1]},
];

const unit = (v: Readonly<Vec3>): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / L, v[1] / L, v[2] / L];
};

/** The factor a Lambert surface with unit normal `n` multiplies its diffuse colour by, in linear light. */
export function lambertFactor(n: Readonly<Vec3>): number {
  let sum: number = AMBIENT_LIGHT.intensity;
  for (const light of DIRECTIONAL_LIGHTS) {
    const l = unit(light.position);
    sum += light.intensity * Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
  }
  return sum / Math.PI;
}

/** `hex` (sRGB) as a Lambert surface with normal `n` shows it: linear channels scaled and clipped at 1. */
export function litShade(hex: number, n: Readonly<Vec3>): number {
  const f = lambertFactor(n);
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([linearToSrgb(srgbToLinear(r) * f), linearToSrgb(srgbToLinear(g) * f), linearToSrgb(srgbToLinear(b) * f)]);
}

const AZIMUTHS = 72;
const ring = (z: number): Vec3[] => Array.from({length: AZIMUTHS}, (_, i) => {
  const a = (2 * Math.PI * i) / AZIMUTHS;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
});

/**
 * The normals a face of each kind can have. Wall, Gable and Cheek faces are vertical, at any heading. A Roof face
 * faces up, at any pitch from flat to vertical and any heading. Underside and Ground face straight down, where neither
 * directional light reaches, so they show their ambient light alone.
 */
export const LIT_NORMALS: Readonly<Record<ShellKind, readonly Vec3[]>> = {
  Wall: ring(0),
  Gable: ring(0),
  Cheek: ring(0),
  Roof: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(i => ring(Math.sin((i * Math.PI) / 20))),
  Underside: [[0, 0, -1]],
  Ground: [[0, 0, -1]],
  Internal: ring(0),
};

/** Every shade `hex` takes on a face of `kind`, darkest and lightest and between, as sRGB integers without repeats. */
export function litShades(kind: ShellKind, hex: number): number[] {
  return [...new Set(LIT_NORMALS[kind].map(n => litShade(hex, n)))];
}
