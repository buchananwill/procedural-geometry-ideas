// The scene's lights, in one place (journal decisions 105 M1 and 114 L-a): `sceneLights()` is the one function that builds
// them, the renderer adds exactly what it returns, and the palette's floors are measured from the same objects, so the
// test and the screen cannot drift apart.
//
// three.js (r155 and later, no legacy lights) lights a MeshLambertMaterial as
//   outgoing = diffuse * (ambient + sum over directional lights of colour * intensity * max(0, n . l)) / pi
// per channel in linear light, where `l` is the unit vector from the origin to the light's position and `n` the unit face
// normal. A colour channel then clips at 1. This file computes exactly that, reading each light's own colour.
import {AmbientLight, DirectionalLight} from 'three';
import type {ShellKind, Vec3} from '../tags.ts';
import type {RGB} from './colour-metrics.ts';
import {hexToRgb, linearToSrgb, rgbToHex, srgbToLinear} from './colour-metrics.ts';

export interface AmbientSpec { color: number; intensity: number }
export interface DirectionalSpec extends AmbientSpec { position: Readonly<Vec3> }

export const AMBIENT_LIGHT: AmbientSpec = {color: 0xffffff, intensity: 1.5};

/** The key light from above and in front, the fill from the side. */
export const DIRECTIONAL_LIGHTS: readonly DirectionalSpec[] = [
  {color: 0xffffff, intensity: 2.2, position: [-1, -2, 3]},
  {color: 0xffffff, intensity: 0.9, position: [2, 1, 1]},
];

/** What `sceneLights` returns: every light the scene is lit by. */
export interface SceneLights { ambient: AmbientLight; directional: readonly DirectionalLight[] }

/** Lights built from the given specs; each directional light shines from its position at the origin. */
export function buildLights(ambient: AmbientSpec, directional: readonly DirectionalSpec[]): SceneLights {
  return {
    ambient: new AmbientLight(ambient.color, ambient.intensity),
    directional: directional.map(spec => {
      const light = new DirectionalLight(spec.color, spec.intensity);
      light.position.set(spec.position[0], spec.position[1], spec.position[2]);
      return light;
    }),
  };
}

/** The scene's lights: the only place the renderer gets them from. */
export const sceneLights = (): SceneLights => buildLights(AMBIENT_LIGHT, DIRECTIONAL_LIGHTS);

const SCENE_LIGHTS = sceneLights();

/**
 * The factor a Lambert surface with unit normal `n` multiplies each linear channel of its diffuse colour by under
 * `lights`: the ambient light plus every directional light's colour and intensity along `n . l`, over pi.
 */
export function lambertFactor(n: Readonly<Vec3>, lights: SceneLights = SCENE_LIGHTS): RGB {
  const a = lights.ambient;
  const sum = [a.color.r * a.intensity, a.color.g * a.intensity, a.color.b * a.intensity];
  for (const light of lights.directional) {
    const {x, y, z} = light.position;
    const len = Math.hypot(x, y, z);
    const dot = Math.max(0, (n[0] * x + n[1] * y + n[2] * z) / len);
    sum[0] += light.color.r * light.intensity * dot;
    sum[1] += light.color.g * light.intensity * dot;
    sum[2] += light.color.b * light.intensity * dot;
  }
  return [sum[0] / Math.PI, sum[1] / Math.PI, sum[2] / Math.PI];
}

/** `hex` (sRGB) as a Lambert surface with normal `n` shows it: linear channels scaled and clipped at 1. */
export function litShade(hex: number, n: Readonly<Vec3>, lights: SceneLights = SCENE_LIGHTS): number {
  const f = lambertFactor(n, lights);
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([linearToSrgb(srgbToLinear(r) * f[0]), linearToSrgb(srgbToLinear(g) * f[1]), linearToSrgb(srgbToLinear(b) * f[2])]);
}

const AZIMUTHS = 72;
const RINGS = 10;
const ring = (z: number): Vec3[] => Array.from({length: AZIMUTHS}, (_, i) => {
  const a = (2 * Math.PI * i) / AZIMUTHS;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
});
/** Rings of normals from vertical (`z` 0) to straight up (`sign` 1) or straight down (`sign` -1), at every heading. */
const rings = (sign: 1 | -1): Vec3[] => Array.from({length: RINGS + 1}, (_, i) => i).flatMap(i => ring(sign * Math.sin((i * Math.PI) / (2 * RINGS))));

/**
 * The normals a face of each kind can have, as the renderer shades it (journal decision 114, L-c).
 * - Wall and Gable faces are vertical, at any heading.
 * - A Cheek face is vertical or tilts downward, at any heading and any tilt down to straight down.
 * - A Roof face faces up, at any pitch from flat to vertical and any heading.
 * - Underside faces straight down, where neither directional light reaches, so it shows ambient light alone.
 * - Ground faces down, but is drawn double-sided: seen from above, three.js flips its normal toward the camera, so it
 *   also takes the shade of a face pointing straight up.
 */
export const LIT_NORMALS: Readonly<Record<ShellKind, readonly Vec3[]>> = {
  Wall: ring(0),
  Gable: ring(0),
  Cheek: rings(-1),
  Roof: rings(1),
  Underside: [[0, 0, -1]],
  Ground: [[0, 0, -1], [0, 0, 1]],
  Internal: ring(0),
  // Journal decision 272: a tuck lies on the plane of the faces it was tucked from, of any orientation.
  Tuck: [...rings(1), ...rings(-1)],
};

/** Every shade `hex` takes on a face of `kind`, darkest and lightest and between, as sRGB integers without repeats. */
export function litShades(kind: ShellKind, hex: number, lights: SceneLights = SCENE_LIGHTS): number[] {
  return [...new Set(LIT_NORMALS[kind].map(n => litShade(hex, n, lights)))];
}
