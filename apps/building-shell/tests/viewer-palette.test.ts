// Spec decision 28 as amended (journal decisions 98 and 105): one fixed colour per ShellKind and per EdgeKind, magenta
// reserved for the two defects, and measured ΔE76 floors between Edge colours and the fills they lie on (over each
// fill's whole lit range and its partial tint), each other, and the interaction colours.
import {beforeAll, describe, expect, it} from 'vitest';
import {EDGE_KINDS, EdgeKind} from '../src/edges.ts';
import {SHELL_FIXTURES} from '../src/fixture.ts';
import {buildShell} from '../src/shell.ts';
import type {ShellKind} from '../src/tags.ts';
import {deltaE76} from '../src/viewer/colour-metrics.ts';
import {AMBIENT_LIGHT, DIRECTIONAL_LIGHTS, LIT_NORMALS, lambertFactor, litShade, litShades} from '../src/viewer/lighting.ts';
import {
  BACKGROUND, EDGE_KIND_COLOUR, EDGE_KIND_LIES_ON, FLOOR_EDGE_ON_FILL, FLOOR_EDGE_PAIR, FLOOR_INTERACTION, FLOOR_MARGIN, HOVER_COLOUR, MAGENTA,
  OUTLINE_COLOUR, PIN_COLOUR, SHELL_KIND_COLOUR, SHELL_KINDS, VERTEX_COLOUR, edgeKindsCanMeet, fillShades, lighten, partialColour, tintShades,
} from '../src/viewer/palette.ts';

/** The spec's decision 10 list, written out so the palette is not checked against a list derived from itself. */
const SPEC_SHELL_KINDS: readonly ShellKind[] = ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek', 'Internal'];
const DRAWN_KINDS = SPEC_SHELL_KINDS.filter(k => k !== 'Internal');

type EdgeColours = Readonly<Record<EdgeKind, number>>;
type ShadesOf = (kind: ShellKind) => number[];

/** Every shade a fill and its partial tint can show: what an Edge on that kind must stand out from. */
const realShades: ShadesOf = kind => [...fillShades(kind), ...tintShades(kind)];

const minDistance = (colour: number, shades: readonly number[]): number => Math.min(...shades.map(s => deltaE76(colour, s)));

/** Every way an Edge palette breaks the Edge-on-fill floor, as readable strings. Empty when the palette passes. */
function onFillViolations(edges: EdgeColours, shadesOf: ShadesOf, margin = 0): string[] {
  const out: string[] = [];
  const floor = FLOOR_EDGE_ON_FILL + margin;
  for (const k of EDGE_KINDS) {
    for (const fill of EDGE_KIND_LIES_ON[k]) {
      const d = minDistance(edges[k], shadesOf(fill));
      if (d < floor) out.push(`${k} on ${fill}: ${d.toFixed(1)} < ${floor}`);
    }
    const bg = deltaE76(edges[k], BACKGROUND);
    if (bg < floor) out.push(`${k} on the background: ${bg.toFixed(1)} < ${floor}`);
  }
  return out;
}

/** Every pair among `pairs` whose Edge colours are closer than the floor (plus `margin`), as readable strings. */
function pairViolations(edges: EdgeColours, pairs: readonly (readonly [EdgeKind, EdgeKind])[], margin = 0): string[] {
  const floor = FLOOR_EDGE_PAIR + margin;
  return pairs.flatMap(([a, b]) => { const d = deltaE76(edges[a], edges[b]); return d < floor ? [`${a} against ${b}: ${d.toFixed(1)} < ${floor}`] : []; });
}

/** Edge-kind pairs that actually meet at a vertex, across every fixture's shell (journal decision 105, L2). */
let meeting: [EdgeKind, EdgeKind][] = [];
beforeAll(async () => {
  const seen = new Set<string>();
  for (const fixture of SHELL_FIXTURES) {
    const shell = await buildShell(fixture);
    for (const v of shell.vertices) {
      const kinds = [...new Set(v.edges.map(n => shell.netEdges[n].kind))].sort();
      for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) seen.add(`${kinds[i]}|${kinds[j]}`);
    }
  }
  meeting = [...seen].map(p => { const [a, b] = p.split('|'); return [a as EdgeKind, b as EdgeKind]; });
}, 120_000);

describe('colour mapping completeness', () => {
  it('SHELL_KINDS is the spec decision 10 list', () => {
    expect([...SHELL_KINDS].sort()).toEqual([...SPEC_SHELL_KINDS].sort());
  });

  it('every ShellKind has a fill colour', () => {
    for (const k of SPEC_SHELL_KINDS) expect(SHELL_KIND_COLOUR[k], k).toBeTypeOf('number');
    expect(Object.keys(SHELL_KIND_COLOUR).sort()).toEqual([...SPEC_SHELL_KINDS].sort());
  });

  it('every EdgeKind has a line colour, and the pipeline lists exactly 21', () => {
    expect(EDGE_KINDS).toHaveLength(21);
    for (const k of EDGE_KINDS) expect(EDGE_KIND_COLOUR[k], k).toBeTypeOf('number');
    expect(Object.keys(EDGE_KIND_COLOUR).sort()).toEqual([...EDGE_KINDS].sort());
  });

  it('every EdgeKind says which face kinds it can lie on', () => {
    expect(Object.keys(EDGE_KIND_LIES_ON).sort()).toEqual([...EDGE_KINDS].sort());
    for (const k of EDGE_KINDS) expect(EDGE_KIND_LIES_ON[k].length, k).toBeGreaterThan(0);
  });

  it('wherever an Edge kind can lie on Gable it can lie on Cheek, which reads as Gable (spec 21, journal 77)', () => {
    for (const k of EDGE_KINDS) {
      if (EDGE_KIND_LIES_ON[k].includes('Gable')) expect(EDGE_KIND_LIES_ON[k], `${k} lies on Gable`).toContain('Cheek');
    }
    expect(EDGE_KIND_LIES_ON.Verge).toContain('Cheek');
  });
});

describe('colours are fixed and distinguishable', () => {
  it('magenta belongs to Unclassified and Internal alone', () => {
    expect(SHELL_KINDS.filter(k => SHELL_KIND_COLOUR[k] === MAGENTA)).toEqual(['Internal']);
    expect(EDGE_KINDS.filter(k => EDGE_KIND_COLOUR[k] === MAGENTA)).toEqual(['Unclassified']);
  });

  it('no two ShellKinds share a colour, and no two EdgeKinds', () => {
    expect(new Set(SHELL_KINDS.map(k => SHELL_KIND_COLOUR[k])).size).toBe(SHELL_KINDS.length);
    expect(new Set(EDGE_KINDS.map(k => EDGE_KIND_COLOUR[k])).size).toBe(EDGE_KINDS.length);
  });

  it('a partial Cell is a lighter shade of its face colour, never equal to it', () => {
    for (const k of DRAWN_KINDS) {
      const base = SHELL_KIND_COLOUR[k];
      const light = partialColour(k);
      expect(light, k).not.toBe(base);
      for (const shift of [16, 8, 0]) expect((light >> shift) & 255, `${k} channel ${shift}`).toBeGreaterThanOrEqual((base >> shift) & 255);
    }
  });

  it('lighten keeps 0 and reaches white at 1', () => {
    expect(lighten(0x336699, 0)).toBe(0x336699);
    expect(lighten(0x336699, 1)).toBe(0xffffff);
  });
});

describe('the scene\'s lighting, as the palette sees it', () => {
  it('has the two directional lights and the ambient light the scene builds', () => {
    expect(AMBIENT_LIGHT.intensity).toBeGreaterThan(0);
    expect(DIRECTIONAL_LIGHTS).toHaveLength(2);
  });

  it('a Lambert factor is (ambient + sum of intensity * n.l) / pi', () => {
    // A surface facing straight down gets no directional light from above: ambient alone.
    expect(lambertFactor([0, 0, -1])).toBeCloseTo(AMBIENT_LIGHT.intensity / Math.PI, 10);
    // A wall facing -y: the key light (-1, -2, 3) reaches it, the fill (2, 1, 1) does not.
    const key = DIRECTIONAL_LIGHTS[0];
    const keyDot = 2 / Math.hypot(...key.position);
    expect(lambertFactor([0, -1, 0])).toBeCloseTo((AMBIENT_LIGHT.intensity + key.intensity * keyDot) / Math.PI, 10);
  });

  it('lit shades are linear light scaled and clipped, so a factor over 1 brightens', () => {
    expect(litShade(0x808080, [0, 0, -1])).toBeLessThan(0x808080);
    expect(litShade(0x808080, [0, 0, 1])).toBeGreaterThan(0x808080);
  });

  it('every kind but Internal has a lit range that spans more than one shade, except the ambient-only ones', () => {
    for (const k of ['Wall', 'Gable', 'Cheek', 'Roof'] as const) expect(litShades(k, SHELL_KIND_COLOUR[k]).length, k).toBeGreaterThan(3);
    for (const k of ['Underside', 'Ground'] as const) expect(LIT_NORMALS[k], k).toEqual([[0, 0, -1]]);
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

describe(`the ΔE76 floors (journal decisions 98 and 105), each cleared by at least ${FLOOR_MARGIN}`, () => {
  it('the metric reads known pairs: black and white are 100 apart, identical colours 0', () => {
    expect(deltaE76(0x000000, 0xffffff)).toBeCloseTo(100, 0);
    expect(deltaE76(0x336699, 0x336699)).toBe(0);
  });

  it(`every Edge colour is at least ${FLOOR_EDGE_ON_FILL} from every shade of every fill it can lie on, its partial tint, and the background`, () => {
    expect(onFillViolations(EDGE_KIND_COLOUR, realShades, FLOOR_MARGIN)).toEqual([]);
  });

  it(`Edge kinds that can meet at a vertex are at least ${FLOOR_EDGE_PAIR} apart: by shared face kind, and as actually met across every fixture`, () => {
    const byRule: [EdgeKind, EdgeKind][] = EDGE_KINDS.flatMap(a => EDGE_KINDS.filter(b => a < b && edgeKindsCanMeet(a, b)).map((b): [EdgeKind, EdgeKind] => [a, b]));
    expect(byRule.length).toBeGreaterThan(100);
    expect(meeting.length).toBeGreaterThan(40);
    expect(pairViolations(EDGE_KIND_COLOUR, byRule, FLOOR_MARGIN)).toEqual([]);
    expect(pairViolations(EDGE_KIND_COLOUR, meeting, FLOOR_MARGIN)).toEqual([]);
  });

  it('the hover and pin colours are distinct from every shade of every fill and tint, every Edge colour and each other', () => {
    for (const [name, c] of [['hover', HOVER_COLOUR], ['pin', PIN_COLOUR]] as const) {
      for (const k of DRAWN_KINDS) expect(minDistance(c, realShades(k)), `${name} against ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION + FLOOR_MARGIN);
      for (const k of EDGE_KINDS) expect(deltaE76(c, EDGE_KIND_COLOUR[k]), `${name} against ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION + FLOOR_MARGIN);
    }
    expect(deltaE76(HOVER_COLOUR, PIN_COLOUR)).toBeGreaterThanOrEqual(FLOOR_INTERACTION + FLOOR_MARGIN);
  });

  it('the neutral Cell outline and the vertex dot read on every shade of every fill and tint', () => {
    for (const k of DRAWN_KINDS) {
      expect(minDistance(OUTLINE_COLOUR, realShades(k)), `outline on ${k}`).toBeGreaterThanOrEqual(FLOOR_EDGE_ON_FILL);
      expect(minDistance(VERTEX_COLOUR, realShades(k)), `vertex on ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION);
    }
  });

  it('convicts the colours earlier reviews found failing: the old RingJunction orange and the old ExternalCorner white', () => {
    const oldRing = onFillViolations({...EDGE_KIND_COLOUR, RingJunction: 0xff9800}, realShades);
    expect(oldRing.some(v => v.startsWith('RingJunction on Gable')), oldRing.join('; ')).toBe(true);
    const oldCorner = onFillViolations({...EDGE_KIND_COLOUR, ExternalCorner: 0xffffff}, realShades);
    expect(oldCorner.some(v => v.startsWith('ExternalCorner on Wall')), oldCorner.join('; ')).toBe(true);
  });

  it('convicts the old SoffitJunction on a lit Wall, which an unlit Wall hides (M1)', () => {
    const old = {...EDGE_KIND_COLOUR, SoffitJunction: 0xcbb6ca};
    // Against Wall's flat table colour alone the old colour clears the floor...
    const flat: ShadesOf = k => [SHELL_KIND_COLOUR[k]];
    expect(onFillViolations(old, flat).filter(v => v.startsWith('SoffitJunction on Wall'))).toEqual([]);
    // ...against its real lit range (the fill alone, before any tint) it does not.
    const lit = onFillViolations(old, fillShades);
    expect(lit.some(v => v.startsWith('SoffitJunction on Wall')), lit.join('; ')).toBe(true);
  });

  it('a fill shades are its lit range, not its table colour: Ground over the background, Wall across the light', () => {
    expect(fillShades('Wall').length).toBeGreaterThan(3);
    expect(fillShades('Wall')).toEqual(litShades('Wall', SHELL_KIND_COLOUR.Wall));
    expect(fillShades('Ground')).not.toContain(SHELL_KIND_COLOUR.Ground);
    expect(fillShades('Underside')).toEqual([litShade(SHELL_KIND_COLOUR.Underside, [0, 0, -1])]);
  });

  it('convicts the old Verge on Cheek (M2)', () => {
    const verge = onFillViolations({...EDGE_KIND_COLOUR, Verge: 0x9575cd}, realShades);
    expect(verge.some(v => v.startsWith('Verge on Cheek')), verge.join('; ')).toBe(true);
  });

  it('convicts two Edge kinds that meet and share a colour', () => {
    const clash = {...EDGE_KIND_COLOUR, Hip: EDGE_KIND_COLOUR.Ridge};
    expect(pairViolations(clash, [['Hip', 'Ridge']]).length).toBe(1);
  });
});
