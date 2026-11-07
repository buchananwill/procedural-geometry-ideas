// The hover and pin outlines keep a correct depth bias and resolution across layer rebuilds, zoom and resize (journal
// decision 114, L-b). A pin outlives a storey toggle, which rebuilds the layers; the rig must not forget its material then.
import {describe, expect, it} from 'vitest';
import {BiasedLine, LineBiasRig} from '../src/viewer/line-bias.ts';

interface FakeLine extends BiasedLine { size: [number, number]; readonly uBias: number }
const fake = (): FakeLine => {
  const uniform = {value: 0};
  const m: FakeLine = {uniforms: {uBias: uniform}, size: [0, 0], resolution: {set: (w, h) => { m.size = [w, h]; }}, get uBias() { return uniform.value; }};
  return m;
};

describe('LineBiasRig', () => {
  it('pulls every tracked material by its fraction of the camera distance, layers and highlights alike', () => {
    const rig = new LineBiasRig<FakeLine>();
    const edges = fake(), pin = fake();
    rig.trackLayer(edges, 0.006);
    rig.trackHighlight(pin, 0.006);
    rig.update(500);
    expect(edges.uBias).toBeCloseTo(3, 10);
    expect(pin.uBias).toBeCloseTo(3, 10);
  });

  it('a pin built before a layer rebuild keeps tracking: a zoom after the rebuild still moves its bias', () => {
    const rig = new LineBiasRig<FakeLine>();
    const pin = fake();
    rig.update(500);
    rig.trackHighlight(pin, 0.006);
    expect(pin.uBias).toBeCloseTo(3, 10);
    // A storey toggle: the drawn layers are cleared and rebuilt; the pin is not.
    rig.clearLayers();
    const edges = fake();
    rig.trackLayer(edges, 0.006);
    expect(rig.tracks(pin)).toBe(true);
    // Then a zoom.
    rig.update(200);
    expect(pin.uBias).toBeCloseTo(1.2, 10);
    expect(edges.uBias).toBeCloseTo(1.2, 10);
  });

  it('a pin built before a layer rebuild keeps tracking resizes too', () => {
    const rig = new LineBiasRig<FakeLine>();
    const pin = fake();
    rig.resize(800, 600);
    rig.trackHighlight(pin, 0.006);
    rig.clearLayers();
    rig.resize(1024, 768);
    expect(pin.size).toEqual([1024, 768]);
  });

  it('a material is given the current bias and size the moment it is tracked, not at the next frame', () => {
    const rig = new LineBiasRig<FakeLine>();
    rig.update(250);
    rig.resize(640, 480);
    const layer = fake(), highlight = fake();
    rig.trackLayer(layer, 0.003);
    rig.trackHighlight(highlight, 0.006);
    expect(layer.uBias).toBeCloseTo(0.75, 10);
    expect(highlight.uBias).toBeCloseTo(1.5, 10);
    expect(layer.size).toEqual([640, 480]);
    expect(highlight.size).toEqual([640, 480]);
  });

  it('rebuilding the highlights drops the old highlight materials and leaves the layers', () => {
    const rig = new LineBiasRig<FakeLine>();
    const edges = fake(), oldPin = fake();
    rig.trackLayer(edges, 0.006);
    rig.trackHighlight(oldPin, 0.006);
    rig.clearHighlights();
    expect(rig.tracks(oldPin)).toBe(false);
    expect(rig.tracks(edges)).toBe(true);
    rig.update(100);
    expect(oldPin.uBias).toBe(0);
    expect(edges.uBias).toBeCloseTo(0.6, 10);
  });
});
