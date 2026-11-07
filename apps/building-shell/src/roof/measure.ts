// The measurements. Nothing here reads an algorithm's internals: it samples the surface and the walls.
import {Building, Pt, Wall, add, dist, dot, mul, norm, planeAt, pt, sub, wallLabel} from './model.ts';
import {Case} from './cases.ts';
import {Surface} from './surface.ts';

export type LineKind = 'ridge' | 'hip' | 'valley' | 'step';
export interface PlanLine { kind: LineKind; a: Pt; b: Pt; jump: number; forced?: boolean }

export interface CheckResult { n: number; fails: number; worst: number; where?: Pt }
export interface WorkedResult { label: string; p: Pt; want: number; got: number | null; ok: boolean }
export interface CheekResult { a: Pt; b: Pt; jump: number; onSpec: boolean }

export type Verdict = 'PASS' | 'FAIL' | 'CHEEK' | 'BLOCKED' | 'NO ANSWER';

export interface Measurement {
  answered: boolean;
  verdict: Verdict;
  reasons: string[];
  gaps: CheckResult;
  eaves: CheckResult;
  deflection: CheckResult;
  rake: CheckResult;
  expected: CheckResult | null;
  trench: CheckResult;
  negative: CheckResult;
  worked: WorkedResult[];
  unforcedSteps: number;
  forcedSteps: number;
  cheeks: CheekResult[];
  planesUsed: string[];
  /** Each promoted wall's highest point: the rake's apex, algorithm by algorithm. */
  apexes: {wall: string; h: number; at: Pt}[];
  planesUndefined: string[];
  lines: PlanLine[];
  /** Grid for drawing. */
  grid: {x0: number; y0: number; step: number; w: number; h: number; heights: Float32Array; fails: Uint8Array; top: number};
  failSamples: Pt[];
}

const TOL = 0.05;
const INSET = 0.005;

function checkOf(): CheckResult { return {n: 0, fails: 0, worst: 0}; }
function record(c: CheckResult, err: number, tol: number, where: Pt): boolean {
  c.n++;
  if (Math.abs(err) > Math.abs(c.worst)) { c.worst = err; c.where = where; }
  if (Math.abs(err) > tol) { c.fails++; return true; }
  return false;
}

const samplesAlong = (w: Wall, spacing = 2): Pt[] => {
  const out: Pt[] = [];
  const count = Math.max(2, Math.round(w.len / spacing));
  for (let i = 0; i <= count; i++) {
    const s = 0.02 + (w.len - 0.04) * (i / count);
    out.push(add(add(w.a, mul(w.dir, s)), mul(w.n, INSET)));
  }
  return out;
};

const walkSteps = [0.005, 0.02, 0.1, 0.5, 1, 2, 4, 8, 16];

export function measure(c: Case, b: Building, s: Surface, gridStep = 5): Measurement {
  const pad = gridStep;
  const x0 = b.bbox.x0 - pad, y0 = b.bbox.y0 - pad;
  const w = Math.ceil((b.bbox.x1 - b.bbox.x0 + 2 * pad) / gridStep);
  const h = Math.ceil((b.bbox.y1 - b.bbox.y0 + 2 * pad) / gridStep);
  const heights = new Float32Array(w * h).fill(NaN);
  const fails = new Uint8Array(w * h);
  const planeIds = new Int32Array(w * h).fill(-1);
  const insideGrid = new Uint8Array(w * h);
  const m: Measurement = {
    answered: !s.info.blocked && !s.info.noAnswer,
    verdict: 'PASS', reasons: [],
    gaps: checkOf(), eaves: checkOf(), deflection: checkOf(), rake: checkOf(),
    expected: c.expected ? checkOf() : null, trench: checkOf(), negative: checkOf(),
    worked: [], unforcedSteps: 0, forcedSteps: 0, cheeks: [],
    planesUsed: [], planesUndefined: [], lines: [], apexes: [],
    grid: {x0, y0, step: gridStep, w, h, heights, fails, top: 0},
    failSamples: [],
  };
  const inMask = (p: Pt): boolean => !!c.mask && c.mask(p);
  const gridPoint = (i: number, j: number): Pt => pt(x0 + (i + 0.5) * gridStep + 0.137, y0 + (j + 0.5) * gridStep + 0.211);
  const markFail = (p: Pt): void => {
    m.failSamples.push(p);
    const i = Math.floor((p.x - x0) / gridStep), j = Math.floor((p.y - y0) / gridStep);
    if (i >= 0 && j >= 0 && i < w && j < h) fails[j * w + i] = 1;
  };

  // The plane grid.
  const used = new Set<number>();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = gridPoint(i, j);
      if (!b.inside(p)) continue;
      insideGrid[j * w + i] = 1;
      if (!m.answered) continue;
      const sample = s.eval(p);
      if (inMask(p)) {
        if (sample) heights[j * w + i] = sample.h;
        continue;
      }
      if (!sample) {
        if (record(m.gaps, 1, 0.5, p)) markFail(p);
        continue;
      }
      m.gaps.n++;
      heights[j * w + i] = sample.h;
      planeIds[j * w + i] = sample.plane;
      m.grid.top = Math.max(m.grid.top, sample.h);
      used.add(sample.plane);
      if (sample.h < -TOL && record(m.negative, sample.h, TOL, p)) markFail(p);
      if (c.expected && record(m.expected!, sample.h - c.expected(p), TOL, p)) markFail(p);
    }
  }
  if (!m.answered) {
    m.verdict = s.info.blocked ? 'BLOCKED' : 'NO ANSWER';
    m.reasons.push(s.info.blocked ? `${s.info.blocked.stage}: ${s.info.blocked.kind}` : s.info.noAnswer!);
    return m;
  }

  // Eaves, deflection and rake, wall by wall.
  for (const wall of b.walls) {
    if (inMask(add(wall.a, mul(wall.dir, wall.len / 2)))) continue;
    if (wall.form === 'hip' && !wall.dead) {
      for (const p of samplesAlong(wall)) {
        if (!b.inside(p) || inMask(p)) continue;
        const sample = s.eval(p);
        const hh = sample ? sample.h : 0;
        if (record(m.eaves, hh, TOL + wall.tan * INSET, p)) markFail(p);
      }
      continue;
    }
    if (wall.form === 'cut') continue;
    let apex: {wall: string; h: number; at: Pt} | null = null;
    for (const p of samplesAlong(wall)) {
      if (!b.inside(p)) continue;
      const top = s.eval(p);
      if (top && (!apex || top.h > apex.h)) apex = {wall: wallLabel(wall), h: top.h, at: p};
      // Deflection: how far in from the wall's own plane the first sloped surface begins.
      let reach = Infinity;
      for (const d of walkSteps) {
        if (s.eval(add(p, mul(wall.n, d - INSET)))) { reach = d - INSET; break; }
      }
      if (record(m.deflection, reach === Infinity ? 16 : reach, 0.001, p)) markFail(p);
      const sample = s.eval(p);
      const want = c.expected ? c.expected(p) : c.rake ? c.rake(p) : undefined;
      if (want !== undefined) {
        const steep = Math.max(...b.walls.map(o => o.tan));
        if (record(m.rake, (sample ? sample.h : -want) - want, TOL + steep * INSET * 2, p)) markFail(p);
      }
    }
    if (apex) m.apexes.push(apex);
  }

  // Worked numbers: the highest surface at a hair around the point, since many sit on a wall or a step.
  for (const wk of c.worked ?? []) {
    const p = pt(wk.p[0], wk.p[1]);
    let got: number | null = null;
    for (const off of [[0, 0], [0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01], [0.01, 0.01], [-0.01, -0.01], [0.01, -0.01], [-0.01, 0.01]]) {
      const q = pt(p.x + off[0], p.y + off[1]);
      if (!b.inside(q)) continue;
      const smp = s.eval(q);
      if (smp && (got === null || smp.h > got)) got = smp.h;
    }
    const ok = got !== null && Math.abs(got - wk.h) <= 0.2;
    m.worked.push({label: wk.label, p, want: wk.h, got, ok});
    if (!ok) markFail(p);
  }

  // Trench: no point on an expected ridge line lower than expected.
  for (const r of c.ridges ?? []) {
    const a = pt(r.a[0], r.a[1]), bb = pt(r.b[0], r.b[1]);
    const count = Math.max(2, Math.round(dist(a, bb) / 2));
    for (let i = 0; i <= count; i++) {
      const p = add(a, mul(sub(bb, a), i / count));
      if (!b.inside(p) && !b.inside(add(p, pt(0.01, 0.01))) && !b.inside(add(p, pt(-0.01, -0.01)))) continue;
      let hh = -Infinity;
      for (const q of [p, add(p, pt(0.01, 0.01)), add(p, pt(-0.01, -0.01)), add(p, pt(0.01, -0.01)), add(p, pt(-0.01, 0.01))]) {
        if (!b.inside(q)) continue;
        const smp = s.eval(q);
        if (smp) hh = Math.max(hh, smp.h);
      }
      const deficit = hh === -Infinity ? r.h : Math.max(0, r.h - hh);
      if (record(m.trench, deficit, 0.2, p)) markFail(p);
    }
  }

  // Boundaries between planes: creases and steps, each located by bisection between two neighbouring samples.
  interface Crossing { q: Pt; lo: number; hi: number; jump: number; forced: boolean }
  const crossings = new Map<string, Crossing[]>();
  const bisect = (pa: Pt, pb: Pt, a: number, bb: number): void => {
    let lo = pa, hi = pb;
    let sa = s.eval(lo), sb = s.eval(hi);
    if (!sa || !sb) return;
    for (let k = 0; k < 24; k++) {
      const mid = mul(add(lo, hi), 0.5);
      if (!b.inside(mid)) return;
      const smid = s.eval(mid);
      if (!smid) return;
      if (smid.plane === sa.plane) { lo = mid; sa = smid; } else { hi = mid; sb = smid; }
      if (sa.plane !== a && sb.plane !== bb) break;
    }
    const q = mul(add(lo, hi), 0.5);
    const jump = Math.abs(planeAt(b.planes[sa.plane], q) - planeAt(b.planes[sb.plane], q));
    let forced = false;
    if (c.expected) {
      const dir = norm(sub(pb, pa));
      const ea = c.expected(sub(q, mul(dir, 0.05))), eb = c.expected(add(q, mul(dir, 0.05)));
      forced = Math.abs(ea - eb) > 0.5;
    }
    const key = `${Math.min(sa.plane, sb.plane)}:${Math.max(sa.plane, sb.plane)}`;
    if (!crossings.has(key)) crossings.set(key, []);
    crossings.get(key)!.push({q, lo: sa.plane, hi: sb.plane, jump, forced});
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const id = planeIds[j * w + i];
      if (id < 0) continue;
      const p = gridPoint(i, j);
      for (const [ni, nj] of [[i + 1, j], [i, j + 1]]) {
        if (ni >= w || nj >= h) continue;
        const other = planeIds[nj * w + ni];
        if (other < 0 || other === id) continue;
        const q = gridPoint(ni, nj);
        if (!b.inside(mul(add(p, q), 0.5))) continue;
        bisect(p, q, id, other);
      }
    }
  }

  // Steps inside one plane id cannot exist; everything left is a boundary. Turn crossings into straight lines.
  const lines: PlanLine[] = [];
  for (const [, list] of crossings) {
    const steps = list.filter(x => x.jump > TOL);
    const creases = list.filter(x => x.jump <= TOL);
    if (creases.length) {
      const a = b.planes[creases[0].lo], d = b.planes[creases[0].hi];
      const nrm = pt(a.gx - d.gx, a.gy - d.gy);
      const along = norm(pt(-nrm.y, nrm.x));
      for (const run of splitRuns(creases.map(x => x.q), along, gridStep)) {
        const mid = mul(add(run.a, run.b), 0.5);
        const horizontal = Math.abs(a.gx * along.x + a.gy * along.y) < 1e-6;
        // Convex when each plane is the lower one on its own side.
        const sideA = sub(mid, mul(nrm, 1e-2 / (Math.hypot(nrm.x, nrm.y) || 1)));
        const smp = s.eval(sideA);
        const convex = smp ? planeAt(a, sideA) <= planeAt(d, sideA) + 1e-9 === (smp.plane === a.id) : true;
        lines.push({kind: convex ? (horizontal ? 'ridge' : 'hip') : 'valley', a: run.a, b: run.b, jump: 0});
      }
    }
    if (steps.length) {
      for (const forcedFlag of [true, false]) {
        const group = steps.filter(x => x.forced === forcedFlag);
        if (!group.length) continue;
        const dir = principal(group.map(x => x.q));
        for (const run of splitRuns(group.map(x => x.q), dir, gridStep)) {
          const inRun = group.filter(x => {
            const t = dot(sub(x.q, run.a), dir);
            return t >= -gridStep && t <= dist(run.a, run.b) + gridStep;
          });
          const jump = Math.max(...inRun.map(x => x.jump));
          lines.push({kind: 'step', a: run.a, b: run.b, jump, forced: forcedFlag});
          if (forcedFlag) {
            m.forcedSteps += inRun.length;
          } else {
            m.unforcedSteps += inRun.length;
            inRun.forEach(x => markFail(x.q));
            const onSpec = (c.specCheeks ?? []).some(sc => {
              const A = pt(sc.a[0], sc.a[1]), B = pt(sc.b[0], sc.b[1]);
              return segDist(run.a, A, B) < gridStep * 2 && segDist(run.b, A, B) < gridStep * 2;
            });
            m.cheeks.push({a: run.a, b: run.b, jump, onSpec});
          }
        }
      }
    }
  }
  m.lines = lines;

  // Every plane used is one the walls define, and not one the rules took away.
  for (const id of used) {
    const pl = b.planes[id];
    m.planesUsed.push(pl.label);
    const walls = pl.walls.map(k => b.walls[k]);
    if (walls.every(k => k.form === 'cut')) m.planesUndefined.push(`${pl.label} (a cut is not a wall)`);
    if (walls.every(k => k.dead)) m.planesUndefined.push(`${pl.label} (dead wall)`);
  }

  // The verdict.
  const reasons = m.reasons;
  if (m.gaps.fails) reasons.push(`${m.gaps.fails} samples with no surface`);
  if (m.eaves.fails) reasons.push(`eaves off 0 by ${m.eaves.worst.toFixed(1)} cm`);
  if (m.deflection.fails) reasons.push(`wall deflects ${m.deflection.worst.toFixed(3)} cm`);
  if (m.rake.fails) reasons.push(`rake off by ${m.rake.worst.toFixed(1)} cm`);
  if (m.expected?.fails) reasons.push(`height off by ${m.expected.worst.toFixed(1)} cm at ${m.expected.fails} of ${m.expected.n} samples`);
  if (m.trench.fails) reasons.push(`trench ${m.trench.worst.toFixed(1)} cm`);
  if (m.negative.fails) reasons.push(`plane below plate by ${m.negative.worst.toFixed(1)} cm`);
  const badWorked = m.worked.filter(x => !x.ok);
  if (badWorked.length) reasons.push(`worked number off: ${badWorked.map(x => `${x.label} got ${x.got === null ? 'none' : x.got.toFixed(1)} want ${x.want}`).join('; ')}`);
  if (m.planesUndefined.length) reasons.push(`plane not defined: ${m.planesUndefined.join(', ')}`);
  const hard = reasons.length > 0;
  if (m.unforcedSteps && c.expected) reasons.push(`unforced step, largest ${Math.max(...m.cheeks.map(x => x.jump)).toFixed(1)} cm`);
  if (hard || (m.unforcedSteps && c.expected)) {
    m.verdict = 'FAIL';
  } else if (m.unforcedSteps) {
    m.verdict = 'CHEEK';
    reasons.push(`cheek, largest ${Math.max(...m.cheeks.map(x => x.jump)).toFixed(1)} cm`);
  }
  return m;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return dist(p, add(a, mul(ab, t)));
}

function principal(points: Pt[]): Pt {
  const n = points.length;
  const mean = points.reduce((acc, p) => add(acc, mul(p, 1 / n)), pt(0, 0));
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const d = sub(p, mean);
    xx += d.x * d.x; xy += d.x * d.y; yy += d.y * d.y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return pt(Math.cos(angle), Math.sin(angle));
}

/** Points along a direction, split wherever the gap is over a few grid steps; ends extended half a step. */
function splitRuns(points: Pt[], dir: Pt, gridStep: number): {a: Pt; b: Pt}[] {
  if (!points.length) return [];
  const base = points[0];
  const sorted = points.map(p => ({p, t: dot(sub(p, base), dir)})).sort((u, v) => u.t - v.t);
  const runs: {a: Pt; b: Pt}[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (!cur || cur.t - prev.t > gridStep * 3) {
      runs.push({a: add(start.p, mul(dir, -gridStep / 2)), b: add(prev.p, mul(dir, gridStep / 2))});
      if (cur) start = cur;
    }
    if (cur) prev = cur;
  }
  return runs;
}

/** Largest height difference between two surfaces over the footprint. */
export function compareSurfaces(b: Building, s1: Surface, s2: Surface, c: Case, gridStep = 5): {maxDiff: number; where: Pt | null; samples: number} {
  let maxDiff = 0;
  let where: Pt | null = null;
  let samples = 0;
  for (let y = b.bbox.y0 + 0.211; y < b.bbox.y1; y += gridStep) {
    for (let x = b.bbox.x0 + 0.137; x < b.bbox.x1; x += gridStep) {
      const p = pt(x, y);
      if (!b.inside(p) || (c.mask && c.mask(p))) continue;
      const a = s1.eval(p), d = s2.eval(p);
      if (!a || !d) continue;
      samples++;
      const diff = Math.abs(a.h - d.h);
      if (diff > maxDiff) { maxDiff = diff; where = p; }
    }
  }
  return {maxDiff, where, samples};
}
