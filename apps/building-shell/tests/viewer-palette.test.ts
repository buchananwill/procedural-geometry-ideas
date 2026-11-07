// Spec decision 28: one fixed colour per ShellKind and per EdgeKind, magenta reserved for the two defects.
import {describe, expect, it} from 'vitest';
import {EDGE_KINDS} from '../src/edges.ts';
import {EDGE_KIND_COLOUR, MAGENTA, SHELL_KIND_COLOUR, SHELL_KINDS, lighten, partialColour} from '../src/viewer/palette.ts';

/** The spec's decision 10 list, written out so the palette is not checked against a list derived from itself. */
const SPEC_SHELL_KINDS = ['Wall', 'Gable', 'Roof', 'Underside', 'Ground', 'Cheek', 'Internal'];

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
});

describe('colours are fixed and distinguishable', () => {
  it('magenta belongs to Unclassified and Internal alone', () => {
    const magentaShell = SHELL_KINDS.filter(k => SHELL_KIND_COLOUR[k] === MAGENTA);
    const magentaEdge = EDGE_KINDS.filter(k => EDGE_KIND_COLOUR[k] === MAGENTA);
    expect(magentaShell).toEqual(['Internal']);
    expect(magentaEdge).toEqual(['Unclassified']);
  });

  it('no two ShellKinds share a colour', () => {
    expect(new Set(SHELL_KINDS.map(k => SHELL_KIND_COLOUR[k])).size).toBe(SHELL_KINDS.length);
  });

  it('no two EdgeKinds share a colour', () => {
    expect(new Set(EDGE_KINDS.map(k => EDGE_KIND_COLOUR[k])).size).toBe(EDGE_KINDS.length);
  });

  it('a partial Cell is a lighter shade of its face colour, never equal to it', () => {
    for (const k of SHELL_KINDS) {
      const base = SHELL_KIND_COLOUR[k];
      const light = partialColour(k);
      if (k === 'Internal') continue;
      expect(light, k).not.toBe(base);
      for (const shift of [16, 8, 0]) expect((light >> shift) & 255, `${k} channel ${shift}`).toBeGreaterThanOrEqual((base >> shift) & 255);
    }
  });

  it('lighten keeps 0 and reaches white at 1', () => {
    expect(lighten(0x336699, 0)).toBe(0x336699);
    expect(lighten(0x336699, 1)).toBe(0xffffff);
  });
});
