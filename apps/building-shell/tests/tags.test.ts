// Plane keys (journal decision 101): oriented planes are keyed by `samePlane` clustering, never by rounding alone.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {Plane3, makePlaneClusters, planeKey} from '../src/tags.ts';
import {SNAP_STEPS_PER_CM, snapCm} from '../src/weld.ts';

describe('planeKey (journal decision 101)', () => {
  it('keys two near-equal planes straddling a 1/1024 cm rounding boundary alike', () => {
    const half = 0.5 / SNAP_STEPS_PER_CM;
    const p: Plane3 = {n: [0, -1, 0], d: 300 + half - 1e-6};
    const q: Plane3 = {n: [0, -1, 0], d: 300 + half + 1e-6};
    // Rounding parts them ...
    expect(snapCm(p.d)).not.toBe(snapCm(q.d));
    // ... clustering does not, in either order.
    const one = makePlaneClusters();
    expect(planeKey(q, one)).toBe(planeKey(p, one));
    const two = makePlaneClusters();
    expect(planeKey(p, two)).toBe(planeKey(q, two));
  });

  it('keys two normals straddling a rounding boundary alike', () => {
    const c = makePlaneClusters();
    const half = 0.5 / SNAP_STEPS_PER_CM;
    const p: Plane3 = {n: [half - 1e-7, -1, 0], d: 0};
    const q: Plane3 = {n: [half + 1e-7, -1, 0], d: 0};
    expect(snapCm(p.n[0])).not.toBe(snapCm(q.n[0]));
    expect(planeKey(p, c)).toBe(planeKey(q, c));
  });

  it('parts planes further apart than SHELL_TOLERANCE_CM, or of opposite orientation', () => {
    const c = makePlaneClusters();
    const k = planeKey({n: [0, -1, 0], d: 0}, c);
    expect(planeKey({n: [0, -1, 0], d: 2 * SHELL_TOLERANCE_CM}, c)).not.toBe(k);
    expect(planeKey({n: [0, 1, 0], d: 0}, c)).not.toBe(k);
    expect(planeKey({n: [0, -1, 0], d: 0}, c)).toBe(k);
  });

  it('never gives two clusters one key, even where their rounded text agrees', () => {
    const c = makePlaneClusters();
    // Normals 1e-4 apart: not samePlane (PLANE_NORMAL_TOL is 1e-5), yet both round to the same 1/1024 grid text.
    const p: Plane3 = {n: [0, -1, 0], d: 0};
    const q: Plane3 = {n: [1e-4, -1, 0], d: 0};
    expect(planeKey(p, c)).not.toBe(planeKey(q, c));
  });
});
