// Plane keys (journal decisions 101 and 110): oriented planes are keyed by `samePlane` clustering, never by rounding
// alone, and the clusters are the `samePlane` graph's connected components, whatever the order (C6).
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {Plane3, PlaneClusters, addFace, addPlane, clusterKeyOf, makePlaneClusters, makeShellTags} from '../src/tags.ts';
import {SNAP_STEPS_PER_CM, snapCm} from '../src/weld.ts';

/** Fresh clusters with `planes` registered in that order. */
function registered(planes: Plane3[]): PlaneClusters {
  const c = makePlaneClusters();
  for (const p of planes) addPlane(c, p);
  return c;
}

describe('clusterKeyOf (journal decision 101)', () => {
  it('keys two near-equal planes straddling a 1/1024 cm rounding boundary alike', () => {
    const half = 0.5 / SNAP_STEPS_PER_CM;
    const p: Plane3 = {n: [0, -1, 0], d: 300 + half - 1e-6};
    const q: Plane3 = {n: [0, -1, 0], d: 300 + half + 1e-6};
    // Rounding parts them ...
    expect(snapCm(p.d)).not.toBe(snapCm(q.d));
    // ... clustering does not, in either order. Keys are read once both planes are registered, as a build's are.
    const one = registered([q, p]);
    expect(clusterKeyOf(q, one)).toBe(clusterKeyOf(p, one));
    const two = registered([p, q]);
    expect(clusterKeyOf(p, two)).toBe(clusterKeyOf(q, two));
  });

  it('keys two normals straddling a rounding boundary alike', () => {
    const c = makePlaneClusters();
    const half = 0.5 / SNAP_STEPS_PER_CM;
    const p: Plane3 = {n: [half - 1e-7, -1, 0], d: 0};
    const q: Plane3 = {n: [half + 1e-7, -1, 0], d: 0};
    expect(snapCm(p.n[0])).not.toBe(snapCm(q.n[0]));
    expect(clusterKeyOf(p, c)).toBe(clusterKeyOf(q, c));
  });

  it('parts planes further apart than SHELL_TOLERANCE_CM, or of opposite orientation', () => {
    const c = makePlaneClusters();
    const k = clusterKeyOf({n: [0, -1, 0], d: 0}, c);
    expect(clusterKeyOf({n: [0, -1, 0], d: 2 * SHELL_TOLERANCE_CM}, c)).not.toBe(k);
    expect(clusterKeyOf({n: [0, 1, 0], d: 0}, c)).not.toBe(k);
    expect(clusterKeyOf({n: [0, -1, 0], d: 0}, c)).toBe(k);
  });

  it('never gives two clusters one key, even where their rounded text agrees', () => {
    const c = makePlaneClusters();
    // Normals 1e-4 apart: not samePlane (PLANE_NORMAL_TOL is 1e-5), yet both round to the same 1/1024 grid text.
    const p: Plane3 = {n: [0, -1, 0], d: 0};
    const q: Plane3 = {n: [1e-4, -1, 0], d: 0};
    expect(clusterKeyOf(p, c)).not.toBe(clusterKeyOf(q, c));
  });
});

describe('plane clusters are connected components (journal decision 110, C6)', () => {
  // p1 ~ p2 and p2 ~ p3, but p1 and p3 lie 1.6 SHELL_TOLERANCE_CM apart: samePlane is not transitive.
  const p1: Plane3 = {n: [0, -1, 0], d: 0};
  const p2: Plane3 = {n: [0, -1, 0], d: 0.8 * SHELL_TOLERANCE_CM};
  const p3: Plane3 = {n: [0, -1, 0], d: 1.6 * SHELL_TOLERANCE_CM};
  const orders: Plane3[][] = [[p1, p3, p2], [p2, p1, p3], [p3, p1, p2]];

  it('puts three planes chained by samePlane in one cluster, registered and queried in any order', () => {
    const keys = orders.map(order => {
      const c = registered(order);
      return order.map(p => clusterKeyOf(p, c));
    });
    for (const k of keys) expect(new Set(k).size).toBe(1);
    expect(new Set(keys.map(k => k[0])).size).toBe(1);
  });

  it('keys the chain by its least grid text, whatever the order', () => {
    for (const order of orders) expect(clusterKeyOf(p3, registered(order))).toBe('0,-1,0|0');
  });

  it('re-keys once a plane joining two clusters is registered, as addFace does for its face', () => {
    const tags = makeShellTags();
    const wall = (plane: Plane3): number => addFace(tags, {kind: 'Wall', storey: 0, wall: 0, plane: -1, part: 0}, plane);
    wall(p1);
    wall(p3);
    expect(clusterKeyOf(p1, tags.clusters)).not.toBe(clusterKeyOf(p3, tags.clusters));
    wall(p2);
    expect(clusterKeyOf(p1, tags.clusters)).toBe(clusterKeyOf(p3, tags.clusters));
  });
});
