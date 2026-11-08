// The scene's lights (journal decision 114, L-a): one pure function builds them, the renderer adds what it returns, and the
// palette's lit shades are measured from the same objects. So the lights are pinned here, and the renderer is held to
// asking for them rather than building its own.
import {readFileSync} from 'node:fs';
import {AmbientLight, DirectionalLight} from 'three';
import {describe, expect, it} from 'vitest';
import {deltaE76} from '../src/viewer/colour-metrics.ts';
import {
  AMBIENT_LIGHT, DIRECTIONAL_LIGHTS, LIT_NORMALS, buildLights, lambertFactor, litShade, litShades, sceneLights,
} from '../src/viewer/lighting.ts';
import {SHELL_KIND_COLOUR, fillShades} from '../src/viewer/palette.ts';
import type {ShellKind} from '../src/tags.ts';

describe('sceneLights pins the lights the scene is lit by', () => {
  it('is one ambient light and two directional lights, with these colours, intensities and positions', () => {
    const lights = sceneLights();
    expect(lights.ambient).toBeInstanceOf(AmbientLight);
    expect(lights.ambient.color.getHex()).toBe(0xffffff);
    expect(lights.ambient.intensity).toBe(1.5);
    expect(lights.directional).toHaveLength(2);
    for (const l of lights.directional) expect(l).toBeInstanceOf(DirectionalLight);
    const seen = lights.directional.map(l => ({hex: l.color.getHex(), intensity: l.intensity, position: l.position.toArray()}));
    expect(seen).toEqual([
      {hex: 0xffffff, intensity: 2.2, position: [-1, -2, 3]},
      {hex: 0xffffff, intensity: 0.9, position: [2, 1, 1]},
    ]);
  });

  it('is built fresh from the specs each call, and the specs are the ones the palette is measured against', () => {
    const a = sceneLights(), b = sceneLights();
    expect(a.ambient).not.toBe(b.ambient);
    expect(a.ambient.intensity).toBe(AMBIENT_LIGHT.intensity);
    expect(a.directional.map(l => l.intensity)).toEqual(DIRECTIONAL_LIGHTS.map(l => l.intensity));
    expect(DIRECTIONAL_LIGHTS.every(l => typeof l.color === 'number')).toBe(true);
  });

  it('is the only place the renderer gets lights: scene.ts asks for sceneLights() and builds none of its own', () => {
    const source = readFileSync(new URL('../src/viewer/scene.ts', import.meta.url), 'utf8');
    expect(source).toContain('sceneLights()');
    expect(source).not.toMatch(/new\s+(Ambient|Directional|Hemisphere|Point|Spot|RectArea)Light\b/);
  });
});

describe('the lit shades follow the lights', () => {
  it('a Lambert factor is (colour * (ambient + sum of intensity * n.l)) / pi, per channel', () => {
    // A surface facing straight down gets no directional light from above: ambient alone.
    for (const c of lambertFactor([0, 0, -1])) expect(c).toBeCloseTo(AMBIENT_LIGHT.intensity / Math.PI, 10);
    // A wall facing -y: the key light (-1, -2, 3) reaches it, the fill (2, 1, 1) does not.
    const key = DIRECTIONAL_LIGHTS[0];
    const keyDot = 2 / Math.hypot(...key.position);
    for (const c of lambertFactor([0, -1, 0])) expect(c).toBeCloseTo((AMBIENT_LIGHT.intensity + key.intensity * keyDot) / Math.PI, 10);
  });

  it('uses the light colours: a red key light over a white ambient brightens only the red channel', () => {
    const red = buildLights({color: 0xffffff, intensity: 1}, [{color: 0xff0000, intensity: 2, position: [0, 0, 1]}]);
    const [r, g, b] = lambertFactor([0, 0, 1], red);
    expect(r).toBeCloseTo(3 / Math.PI, 10);
    expect(g).toBeCloseTo(1 / Math.PI, 10);
    expect(b).toBeCloseTo(1 / Math.PI, 10);
    // And the ambient colour counts too: a blue-tinted ambient light with no directional light.
    const blue = buildLights({color: 0x0000ff, intensity: 1}, []);
    expect(lambertFactor([0, 0, 1], blue)).toEqual([0, 0, 1 / Math.PI]);
  });

  it('lit shades are linear light scaled and clipped, so a factor over 1 brightens', () => {
    expect(litShade(0x808080, [0, 0, -1])).toBeLessThan(0x808080);
    expect(litShade(0x808080, [0, 0, 1])).toBeGreaterThan(0x808080);
  });

  it('a different ambient intensity moves the shades (the palette is measured from the lights, not from a copy)', () => {
    const dim = buildLights({...AMBIENT_LIGHT, intensity: 0.5}, DIRECTIONAL_LIGHTS);
    expect(litShade(0x808080, [0, 0, -1], dim)).toBeLessThan(litShade(0x808080, [0, 0, -1]));
  });

  it('every kind but Internal has a lit range that spans more than one shade, except Underside, which has one', () => {
    for (const k of ['Wall', 'Gable', 'Cheek', 'Roof'] as const) expect(litShades(k, SHELL_KIND_COLOUR[k]).length, k).toBeGreaterThan(3);
    expect(LIT_NORMALS.Underside).toEqual([[0, 0, -1]]);
    expect(litShades('Underside', SHELL_KIND_COLOUR.Underside)).toHaveLength(1);
  });

  it('Underside is ambient-only, so it is the darkest it can be', () => {
    const base = SHELL_KIND_COLOUR.Underside;
    for (const k of ['Wall', 'Roof'] as const) {
      const darkest = Math.min(...litShades(k, base));
      expect(litShade(base, [0, 0, -1]), k).toBeLessThanOrEqual(darkest);
    }
  });

  it('a Roof face spans a wider range of light than a Wall', () => {
    const range = (k: ShellKind): number => {
      const shades = litShades(k, SHELL_KIND_COLOUR[k]);
      return deltaE76(Math.min(...shades), Math.max(...shades));
    };
    expect(range('Roof')).toBeGreaterThan(range('Wall'));
  });
});

describe('the lit-normal model covers what the renderer can show (journal decision 114, L-c)', () => {
  const hasNormal = (kind: ShellKind, test: (n: readonly number[]) => boolean): boolean => LIT_NORMALS[kind].some(test);

  it('Ground is double-sided, so seen from above it takes the shade of a face pointing up as well as straight down', () => {
    expect(hasNormal('Ground', n => n[2] === 1)).toBe(true);
    expect(hasNormal('Ground', n => n[2] === -1)).toBe(true);
    const base = SHELL_KIND_COLOUR.Ground;
    const shades = litShades('Ground', base);
    expect(shades).toContain(litShade(base, [0, 0, 1]));
    expect(shades).toContain(litShade(base, [0, 0, -1]));
    expect(litShade(base, [0, 0, 1])).not.toBe(litShade(base, [0, 0, -1]));
    // The shades the page shows are those, laid over the background.
    expect(fillShades('Ground')).toHaveLength(2);
  });

  it('Cheek may face downward, down to straight down, as well as stand vertical', () => {
    expect(hasNormal('Cheek', n => n[2] === 0)).toBe(true);
    expect(hasNormal('Cheek', n => n[2] < -0.5)).toBe(true);
    expect(hasNormal('Cheek', n => n[2] === -1)).toBe(true);
    expect(hasNormal('Cheek', n => n[2] > 0)).toBe(false);
    const base = SHELL_KIND_COLOUR.Cheek;
    expect(litShades('Cheek', base)).toContain(litShade(base, [0, 0, -1]));
  });

  it('every normal is a unit vector', () => {
    for (const kind of Object.keys(LIT_NORMALS) as ShellKind[]) {
      for (const n of LIT_NORMALS[kind]) expect(Math.hypot(n[0], n[1], n[2]), kind).toBeCloseTo(1, 10);
    }
  });
});
