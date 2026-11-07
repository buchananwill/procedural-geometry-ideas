// Spec decision 29: the toggle state, as pure transitions.
import {describe, expect, it} from 'vitest';
import {
  LAYER_KEYS, makeToggles, setLayer, setNetKindOutlines, setRaw, setStorey, visibleStoreys, withStoreys,
} from '../src/viewer/toggles.ts';

describe('toggle state', () => {
  it('starts with faces and Edges on, vertices, Cell outlines and raw off, every storey shown', () => {
    const t = makeToggles([0, 1, 2]);
    expect(t.layers).toEqual({faces: true, edges: true, vertices: false, cellOutlines: false});
    expect(t.raw).toBe(false);
    expect([...visibleStoreys(t)].sort()).toEqual([0, 1, 2]);
  });

  it('has a switch for each of faces, Edges, vertices and Cell outlines', () => {
    expect([...LAYER_KEYS].sort()).toEqual(['cellOutlines', 'edges', 'faces', 'vertices']);
  });

  it('sets each layer on its own and leaves the others', () => {
    for (const key of LAYER_KEYS) {
      const t = makeToggles([0]);
      const flipped = setLayer(t, key, !t.layers[key]);
      expect(flipped.layers[key]).toBe(!t.layers[key]);
      for (const other of LAYER_KEYS.filter(k => k !== key)) expect(flipped.layers[other]).toBe(t.layers[other]);
    }
  });

  it('does not mutate the state it is given', () => {
    const t = makeToggles([0, 1]);
    const before = JSON.stringify(t);
    setLayer(t, 'faces', false);
    setStorey(t, 1, false);
    setRaw(t, true);
    expect(JSON.stringify(t)).toBe(before);
  });

  it('hides and shows one storey', () => {
    const t = setStorey(makeToggles([0, 1]), 1, false);
    expect([...visibleStoreys(t)]).toEqual([0]);
    expect([...visibleStoreys(setStorey(t, 1, true))].sort()).toEqual([0, 1]);
  });

  it('ignores a storey the fixture does not hold', () => {
    const t = makeToggles([0, 1]);
    expect(setStorey(t, 5, false)).toBe(t);
  });

  it('switches raw mode and the outline colouring', () => {
    const t = makeToggles([0]);
    expect(setRaw(t, true).raw).toBe(true);
    expect(setNetKindOutlines(t, true).netKindOutlines).toBe(true);
  });

  it('a new fixture keeps the layer choices and shows every one of its storeys', () => {
    const t = setStorey(setRaw(setLayer(makeToggles([0, 1]), 'vertices', true), true), 1, false);
    const next = withStoreys(t, [0, 1, 2]);
    expect(next.layers.vertices).toBe(true);
    expect(next.raw).toBe(true);
    expect([...visibleStoreys(next)].sort()).toEqual([0, 1, 2]);
  });
});
