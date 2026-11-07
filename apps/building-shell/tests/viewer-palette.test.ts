// Spec decision 28 as amended (journal decision 98, F4): one fixed colour per ShellKind and per EdgeKind, magenta reserved
// for the two defects, and measured ΔE76 floors between Edge colours, the fills they lie on, each other, and the
// interaction colours.
import {describe, expect, it} from 'vitest';
import {EDGE_KINDS, EdgeKind} from '../src/edges.ts';
import {deltaE76} from '../src/viewer/colour-metrics.ts';
import {
  BACKGROUND, EDGE_KIND_COLOUR, EDGE_KIND_LIES_ON, FLOOR_EDGE_ON_FILL, FLOOR_EDGE_PAIR, FLOOR_INTERACTION, HOVER_COLOUR, MAGENTA, OUTLINE_COLOUR,
  PIN_COLOUR, SHELL_KIND_COLOUR, SHELL_KINDS, VERTEX_COLOUR, edgeKindsCanMeet, fillAppearance, lighten, partialColour,
} from '../src/viewer/palette.ts';

/** The spec's decision 10 list, written out so the palette is not checked against a list derived from itself. */
const SPEC_SHELL_KINDS = ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek', 'Internal'];

type EdgeColours = Readonly<Record<EdgeKind, number>>;

/** Every way an Edge palette breaks the floors, as readable strings. Empty when the palette passes. */
function floorViolations(edges: EdgeColours): string[] {
  const out: string[] = [];
  for (const k of EDGE_KINDS) {
    for (const fill of EDGE_KIND_LIES_ON[k]) {
      const d = deltaE76(edges[k], fillAppearance(fill));
      if (d < FLOOR_EDGE_ON_FILL) out.push(`${k} on ${fill}: ${d.toFixed(1)} < ${FLOOR_EDGE_ON_FILL}`);
    }
    const bg = deltaE76(edges[k], BACKGROUND);
    if (bg < FLOOR_EDGE_ON_FILL) out.push(`${k} on the background: ${bg.toFixed(1)} < ${FLOOR_EDGE_ON_FILL}`);
  }
  for (const a of EDGE_KINDS) {
    for (const b of EDGE_KINDS) {
      if (a >= b || !edgeKindsCanMeet(a, b)) continue;
      const d = deltaE76(edges[a], edges[b]);
      if (d < FLOOR_EDGE_PAIR) out.push(`${a} against ${b}: ${d.toFixed(1)} < ${FLOOR_EDGE_PAIR}`);
    }
  }
  return out;
}

describe('colour mapping completeness', () => {
  it('SHELL_KINDS is the spec decision 10 list', () => {
    expect([...SHELL_KINDS].sort()).toEqual([...SPEC_SHELL_KINDS].sort());
  });

  it('every ShellKind has a fill colour', () => {
    for (const k of SPEC_SHELL_KINDS) expect(SHELL_KIND_COLOUR[k as keyof typeof SHELL_KIND_COLOUR], k).toBeTypeOf('number');
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
    for (const k of SHELL_KINDS.filter(x => x !== 'Internal')) {
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

describe('the ΔE76 floors (journal decision 98, F4)', () => {
  it('the metric reads known pairs: black and white are 100 apart, identical colours 0', () => {
    expect(deltaE76(0x000000, 0xffffff)).toBeCloseTo(100, 0);
    expect(deltaE76(0x336699, 0x336699)).toBe(0);
  });

  it(`every Edge colour is at least ${FLOOR_EDGE_ON_FILL} from every fill it can lie on, and the background`, () => {
    expect(floorViolations(EDGE_KIND_COLOUR)).toEqual([]);
  });

  it(`Edge kinds that can meet at a vertex are at least ${FLOOR_EDGE_PAIR} apart`, () => {
    const pairs = EDGE_KINDS.flatMap(a => EDGE_KINDS.filter(b => a < b && edgeKindsCanMeet(a, b)).map(b => [a, b] as const));
    expect(pairs.length).toBeGreaterThan(100);
    for (const [a, b] of pairs) expect(deltaE76(EDGE_KIND_COLOUR[a], EDGE_KIND_COLOUR[b]), `${a} against ${b}`).toBeGreaterThanOrEqual(FLOOR_EDGE_PAIR);
  });

  it('the hover and pin colours are distinct from every fill, every Edge colour and each other', () => {
    for (const [name, c] of [['hover', HOVER_COLOUR], ['pin', PIN_COLOUR]] as const) {
      for (const k of SHELL_KINDS.filter(x => x !== 'Internal')) expect(deltaE76(c, fillAppearance(k)), `${name} against ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION);
      for (const k of EDGE_KINDS) expect(deltaE76(c, EDGE_KIND_COLOUR[k]), `${name} against ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION);
    }
    expect(deltaE76(HOVER_COLOUR, PIN_COLOUR)).toBeGreaterThanOrEqual(FLOOR_INTERACTION);
  });

  it('the neutral Cell outline and the vertex dot read on every fill', () => {
    for (const k of SHELL_KINDS.filter(x => x !== 'Internal')) {
      expect(deltaE76(OUTLINE_COLOUR, fillAppearance(k)), `outline on ${k}`).toBeGreaterThanOrEqual(FLOOR_EDGE_ON_FILL);
      expect(deltaE76(VERTEX_COLOUR, fillAppearance(k)), `vertex on ${k}`).toBeGreaterThanOrEqual(FLOOR_INTERACTION);
    }
  });

  it('convicts the colours the reviewer found failing: the old RingJunction orange and the old ExternalCorner white', () => {
    const oldRing = floorViolations({...EDGE_KIND_COLOUR, RingJunction: 0xff9800});
    expect(oldRing.some(v => v.startsWith('RingJunction on Gable')), oldRing.join('; ')).toBe(true);
    const oldCorner = floorViolations({...EDGE_KIND_COLOUR, ExternalCorner: 0xffffff});
    expect(oldCorner.some(v => v.startsWith('ExternalCorner on Wall')), oldCorner.join('; ')).toBe(true);
  });

  it('convicts two Edge colours that are too close', () => {
    expect(floorViolations({...EDGE_KIND_COLOUR, Hip: EDGE_KIND_COLOUR.Ridge}).some(v => v.includes('Hip against Ridge'))).toBe(true);
  });
});
