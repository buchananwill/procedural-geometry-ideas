// The holed grid fuzz (skeleton flat-ring and third-front spec, decision 54): two-courtyard islands on the 50 cm lattice,
// every Ring hipped at 30°, drawn by the measurement's own law (BSA.F111 to F113, mulberry32). Each draw's islands are
// solved through the roof stage's own call to core, with the probe of decision 47 counting the two rules' firings.
//
// - Grid 1, seed 1, 2,000 islands of two holes anywhere: no draw is refused under decision 28 (a flat-by-area ring
//   that is not a flat termination) or decision 44 (a third front that cannot be resolved); every draw on which a rule
//   fires is complete and sound; and no complete draw fails the roof checker or the L-infinity oracle.
// - Grid 2, seed 2, 1,000 islands of two holes side by side, every gap equal (E′'s shape): every draw is complete and
//   sound.
// - Grid draw `uniform-1-129`, a step failure before the rules and after, RED BY DESIGN with its issue note (§6 item 8).
//
// "Sound" is the measurement's bar: the roof checker clean, the oracle `plate + tan 30 · d∞` within SHELL_TOLERANCE_CM
// over a 10 cm grid, and spec decision 32's invariants at the island's genus.
//
// WHAT RUNS BY DEFAULT, AND WHAT IS OPT-IN. Every draw of both grids is solved, and every draw on which a rule fires is
// built and checked, by default. Building every other complete draw of grid 1 costs about half an hour, so by default
// every twentieth is built; `SHELL_GRID_FUZZ=full` builds them all, the whole of decision 54's statement.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {ShellFixture, storeyRects} from '../src/fixture.ts';
import {Pt, Rect, unionLoops} from '../src/roof/model.ts';
import {loopWeights} from '../src/roof/skeleton.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import {storeyForms} from '../src/storey.ts';
import {ring, storeyRings} from '../src/fixture.ts';
import {solveSkeleton} from '@proc-geo/core';
import {setWavefrontProbe} from '../../../packages/core/src/straight-skeleton/wavefront-check.ts';
import {roofViolations} from './roof-coverage.ts';
import {invariantViolations, planHolds} from './shell-invariants.ts';
import {shellFixture} from './test-builds.ts';

const t30 = Math.tan(Math.PI / 6);
const PLATE = 250;
const FULL = process.env.SHELL_GRID_FUZZ === 'full';

/** The measurement's generator (BSA.F111, `grid.ts`): mulberry32. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The region (outer ∪ wing) minus the holes, as disjoint row-run rectangles on its coordinate grid. */
function decompose(outer: Rect, wing: Rect | undefined, holes: Rect[]): Rect[] {
  const all = [outer, ...(wing ? [wing] : []), ...holes];
  const xs = [...new Set(all.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(all.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
  const inside = (r: Rect, x: number, y: number) => x > r[0] && x < r[2] && y > r[1] && y < r[3];
  const out: Rect[] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    const cy = (ys[j] + ys[j + 1]) / 2;
    let start: number | undefined;
    for (let i = 0; i + 1 <= xs.length; i++) {
      const filled = i + 1 < xs.length && (() => {
        const cx = (xs[i] + xs[i + 1]) / 2;
        return (inside(outer, cx, cy) || (wing !== undefined && inside(wing, cx, cy))) && !holes.some(h => inside(h, cx, cy));
      })();
      if (filled && start === undefined) start = xs[i];
      if (!filled && start !== undefined) { out.push([start, ys[j], xs[i], ys[j + 1]]); start = undefined; }
    }
  }
  return out;
}

/** One draw: its name, as the measurement named it, and its Rings. */
interface Draw { name: string; rects: Rect[] }

/**
 * The measurement's draw law, verbatim: an outer block 600 to 1800 by 500 to 1300 on the 50 cm lattice, two holes 2 to
 * 10 cells a side at least 2 cells from the outline and from each other ('uniform'), or two holes side by side with every
 * gap one width g of 2 to 6 cells ('equal'); half the draws carry a wing on the E side, flush with the S wall a third of
 * the time.
 */
function draws(seed: number, count: number, mode: 'uniform' | 'equal'): Draw[] {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const C = 50;
  const out: Draw[] = [];
  while (out.length < count) {
    const W = C * int(12, 36), H = C * int(10, 26);
    const g = C * int(2, 6);
    const hole = (): Rect => {
      const hw = C * int(2, 10), hh = C * int(2, 10);
      const x0 = C * int(2, Math.max(2, (W - hw) / C - 2)), y0 = C * int(2, Math.max(2, (H - hh) / C - 2));
      return [x0, y0, x0 + hw, y0 + hh];
    };
    let holes: Rect[];
    if (mode === 'equal') {
      const hh = H - 2 * g;
      const w1 = C * int(2, 12), w2 = C * int(2, 12);
      if (hh < 2 * C) continue;
      holes = [[g, g, g + w1, g + hh], [2 * g + w1, g, 2 * g + w1 + w2, g + hh]];
    } else {
      holes = [hole(), hole()];
    }
    const width = mode === 'equal' ? 3 * g + (holes[0][2] - holes[0][0]) + (holes[1][2] - holes[1][0]) : W;
    const outer: Rect = [0, 0, width, H];
    const ok = holes.every(h => h[0] >= outer[0] + 2 * C && h[2] <= outer[2] - 2 * C && h[1] >= 2 * C && h[3] <= H - 2 * C)
      && (holes[0][2] + 2 * C <= holes[1][0] || holes[1][2] + 2 * C <= holes[0][0] || holes[0][3] + 2 * C <= holes[1][1] || holes[1][3] + 2 * C <= holes[0][1]);
    if (!ok) continue;
    let wing: Rect | undefined;
    if (rnd() < 0.5) {
      const ww = C * int(2, 10);
      const y0 = rnd() < 1 / 3 ? 0 : C * int(0, H / C - 2);
      const y1 = Math.min(H, y0 + C * int(2, 10));
      wing = [width, y0, width + ww, y1];
    }
    out.push({name: `${mode}-${seed}-${out.length}`, rects: decompose(outer, wing, holes)});
  }
  return out;
}

const fixtureOf = (d: Draw): ShellFixture => shellFixture(d.name, d.rects.map(r => ring(r, 0, 1, 30)));

/** What one draw's islands came to in the roof stage's call to core, and how often each rule fired. */
interface Solved { verdicts: string[]; complete: boolean; fired: number }

function solveDraw(d: Draw): Solved {
  let fired = 0;
  setWavefrontProbe({flatRingClosed: () => { fired++; }, thirdFrontResolved: () => { fired++; }});
  try {
    const {building} = storeyForms(storeyRings(fixtureOf(d), 0));
    const verdicts = building.comps.map(comp => {
      const weights = loopWeights(comp);
      const result = solveSkeleton(comp.outer, {weights: weights[0], holes: comp.holes.map((h, k) => ({vertices: h, weights: weights[k + 1]}))});
      if (result.complete) return 'complete';
      return result.diagnostics.filter(x => x.kind !== 'winding-normalised' && x.kind !== 'vertices-canonicalised')
        .map(x => `${x.kind}: ${x.detail}`).join(' | ');
    });
    return {verdicts, complete: verdicts.every(v => v === 'complete'), fired};
  } finally {
    setWavefrontProbe(null);
  }
}

/** The L-infinity distance from (x, y) to the nearest wall of storey 0's union loops. */
function dInf(f: ShellFixture, x: number, y: number): number {
  let d = Infinity;
  for (const loop of unionLoops(storeyRects(f, 0))) {
    loop.forEach((a: Pt, i) => {
      const b = loop[(i + 1) % loop.length];
      const [lo, hi, along, at, across] = a.y === b.y
        ? [Math.min(a.x, b.x), Math.max(a.x, b.x), x, a.y, y]
        : [Math.min(a.y, b.y), Math.max(a.y, b.y), y, a.x, x];
      d = Math.min(d, Math.max(Math.max(lo - along, 0, along - hi), Math.abs(across - at)));
    });
  }
  return d;
}

function roofTop(b: ShellBuild, x: number, y: number): number {
  const zs = b.shell.faces.filter(fc => fc.tag.kind === 'Roof' && planHolds(fc, x, y)).map(fc => (fc.offset - fc.normal[0] * x - fc.normal[1] * y) / fc.normal[2]);
  return zs.length ? Math.max(...zs) : NaN;
}

/** A draw's build held to the bar: the roof checker, the oracle over a 10 cm grid, and the invariants at genus 2. */
async function unsound(d: Draw): Promise<string[]> {
  const f = fixtureOf(d);
  const b = await buildShellDetailed(f);
  const rects = f.rings.map(r => r.rect);
  const failures = roofViolations(b.union, rects).map(v => `roof checker: ${v}`);
  const xs = rects.flatMap(r => [r[0], r[2]]), ys = rects.flatMap(r => [r[1], r[3]]);
  let worst = 0, at = '-';
  for (let x = Math.min(...xs) + 3.7; x < Math.max(...xs); x += 10) {
    for (let y = Math.min(...ys) + 2.9; y < Math.max(...ys); y += 10) {
      if (!rects.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
      const z = roofTop(b, x, y);
      const error = Number.isNaN(z) ? Infinity : Math.abs(z - (PLATE + t30 * dInf(f, x, y)));
      if (error > worst) { worst = error; at = `(${x.toFixed(1)}, ${y.toFixed(1)})`; }
    }
  }
  if (!(worst <= SHELL_TOLERANCE_CM)) failures.push(`oracle: ${worst} cm at ${at}`);
  failures.push(...invariantViolations(b, {genus: [2], cheeks: 0}).map(v => `invariant: ${v}`));
  return failures;
}

/**
 * Is this refusal one of decision 28's (a flat-by-area ring that fails the test) or decision 44's (a third front that
 * cannot be resolved)? Each is read by text the other refusals do not share: a decision-31 refusal also says "meets a
 * third front", but cites simultaneous-rings decision 22, never "third-front spec, decision 44" (BSA.D351).
 */
const refusedByTheRules = (verdict: string) =>
  verdict.includes('is not a flat termination') || verdict.includes('third-front spec, decision 44)');

describe('grid 1: 2,000 two-courtyard islands, seed 1 (decision 54)', () => {
  const grid = draws(1, 2000, 'uniform');
  const solved = grid.map(solveDraw);

  it('draws as the measurement drew, by name', () => {
    expect(grid.map(d => d.name)).toEqual(Array.from({length: 2000}, (_unused, k) => `uniform-1-${k}`));
  });

  it('refuses no draw under decision 28 or 44', () => {
    expect(grid.filter((_d, k) => solved[k].verdicts.some(refusedByTheRules)).map(d => d.name)).toEqual([]);
  });

  // A FLOOR, NOT A PIN (BSA.D351): a later cure may make a rule fire on more draws, and must not turn this red; the
  // rules ceasing to fire still does.
  it('completes every draw on which a rule fires, at least the measured 79 of them', () => {
    const fired = grid.filter((_d, k) => solved[k].fired > 0);
    expect(fired.length).toBeGreaterThanOrEqual(79);
    expect(fired.filter(d => !solved[grid.indexOf(d)].complete).map(d => d.name)).toEqual([]);
  });

  // uniform-1-129 is carried by its own red test below and is left out here, so no green test counts it incomplete
  // (BSA.D351, BSA.D336).
  it('leaves no draw incomplete but uniform-1-129 and the two refused under simultaneous-rings decision 21', () => {
    const incomplete = grid.filter((d, k) => !solved[k].complete && d.name !== 'uniform-1-129');
    expect(incomplete.map(d => d.name)).toEqual(['uniform-1-523', 'uniform-1-1977']);
    expect(['uniform-1-523', 'uniform-1-1977'].map(name => solved[grid.findIndex(d => d.name === name)].verdicts.join(' + ')))
      .toEqual([expect.stringContaining('(decision 21)'), expect.stringContaining('(decision 21)')]);
  });

  it('builds every draw on which a rule fires sound', async () => {
    const fired = grid.filter((_d, k) => solved[k].fired > 0);
    const failures: string[] = [];
    for (const d of fired) failures.push(...(await unsound(d)).map(v => `${d.name}: ${v}`));
    expect(failures).toEqual([]);
  }, 30 * 60 * 1000);

  it(`builds ${FULL ? 'every' : 'every twentieth'} other complete draw sound`, async () => {
    const others = grid.filter((_d, k) => solved[k].complete && solved[k].fired === 0).filter((_d, k) => FULL || k % 20 === 0);
    const failures: string[] = [];
    for (const d of others) failures.push(...(await unsound(d)).map(v => `${d.name}: ${v}`));
    expect(failures).toEqual([]);
  }, 60 * 60 * 1000);
});

describe('grid 2: 1,000 equal-gap islands, seed 2 (decision 54)', () => {
  const grid = draws(2, 1000, 'equal');
  const solved = grid.map(solveDraw);

  it('completes every draw', () => {
    expect(grid.filter((_d, k) => !solved[k].complete).map(d => d.name)).toEqual([]);
  });

  it('builds every draw sound', async () => {
    const failures: string[] = [];
    for (const d of grid) failures.push(...(await unsound(d)).map(v => `${d.name}: ${v}`));
    expect(failures).toEqual([]);
  }, 60 * 60 * 1000);
});

/*
 * RED BY DESIGN (BSA.D266; §6 item 8): grid draw uniform-1-129, a 900 by 1300 block with a wing [900, 1100] × [200,
 * 500] on its E side, round the holes [100, 600] × [200, 500] and [350, 600] × [650, 750]. The outline's walls x = 900
 * either side of the wing are collinear and face the same way, and the solve ends on a ring of two straight bisectors
 * between them, both heading west, which the pair handler cannot close: a step failure before the flat-ring and
 * third-front rules and after, neither firing. ISSUE-skeleton-grid-draw-straight-bisector-pair.md. This asserts its sound
 * roof, and is red until a cure lands.
 */
describe('red by design: grid draw uniform-1-129, a ring of two straight bisectors', () => {
  const d = draws(1, 130, 'uniform')[129];

  it('is the draw the measurement named', () => {
    expect(d.name).toBe('uniform-1-129');
  });

  it('solves complete, with a sound roof', async () => {
    expect(solveDraw(d).verdicts).toEqual(['complete']);
    expect(await unsound(d)).toEqual([]);
  });
});
