// F76's probe (the WP-G4 delegate's scratch `measure.ts` and `classify.mjs`, brought in by WP-G4.1 with only its imports
// and its output changed): which storeys have an all-gable union wall whose algorithm B piece spans more than the wall?
// Cases are counted as the corpus lists them, duplicates included.   node run.mjs f76-extents
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {EXPORTED_FIXTURES, RING_SIDES, ring, RISE_FIXTURES, SHELL_FIXTURES, ShellFixture, storeyRings, storeysOf} from '../../src/fixture.ts';
import {loopRuns, ringSideLines, runSpan, storeyLoops, unionWallExtents} from '../../src/ring-forms.ts';
import {storeyForms} from '../../src/storey.ts';
import {solveRoofParts} from '../../src/roof/algoB.ts';
import {Building, Comp, Pt, Wall, polyArea} from '../../src/roof/model.ts';
import {GOLDEN_FIXTURES} from '../../tests/golden-fixtures.ts';
import * as RF from '../../tests/robustness-fixtures.ts';
import * as PINS from '../../tests/residue-pins.ts';

const EPS = 0.01;
const along = (w: Wall, p: Pt): number => (Math.abs(w.dir.x) > 0.5 ? p.x : p.y);
const atAlong = (w: Wall, s: number, d: number): Pt => (Math.abs(w.dir.x) > 0.5 ? {x: s, y: w.a.y + w.n.y * d} : {x: w.a.x + w.n.x * d, y: s});
const spanOf = (w: Wall): [number, number] => { const a = along(w, w.a), b = along(w, w.b); return [Math.min(a, b), Math.max(a, b)]; };
function extentOf(b: Building, comp: Comp, w: Wall): [number, number] {
  const breaks = [...new Set(comp.ring.map(p => along(w, p)))].sort((p, q) => p - q);
  let [lo, hi] = spanOf(w);
  for (;;) { const prev = breaks.filter(s => s < lo).pop(); if (prev === undefined || !b.inside(atAlong(w, (prev + lo) / 2, EPS))) break; lo = prev; }
  for (;;) { const next = breaks.find(s => s > hi); if (next === undefined || !b.inside(atAlong(w, (next + hi) / 2, EPS))) break; hi = next; }
  return [lo, hi];
}
const nOf = (n: string): Pt => ({'+x': {x: 1, y: 0}, '-x': {x: -1, y: 0}, '+y': {x: 0, y: 1}, '-y': {x: 0, y: -1}} as Record<string, Pt>)[n];

type Case = {corpus: string; key: string; f: ShellFixture};
const cases: Case[] = [];
const add = (corpus: string, fs: readonly ShellFixture[], key = (f: ShellFixture) => f.name): void => { for (const f of fs) cases.push({corpus, key: key(f), f}); };

{
  const base = [ring([0, 0, 600, 600], 0, 1, 22.5, {S: {form: 'hip'}, W: {form: 'gable'}}), ring([600, 0, 1200, 800], 0, 1, 22.5, {S: {form: 'gable'}}), ring([200, 0, 400, 200], 1, 2, 45)];
  const mk = (name: string, rings: typeof base): ShellFixture => ({name, cellSize: 50, storeyHeight: 250, rings});
  add('draft', [mk('NoWing', base), mk('WithWing', [...base, ring([0, -400, 600, 0], 0, 1, 22.5)])]);
}
add('roster', EXPORTED_FIXTURES);
add('rise', RISE_FIXTURES);
add('golden', GOLDEN_FIXTURES.map(g => g.fixture));
const HEIGHTS = [300, 250];
for (const h of HEIGHTS) add(`sweep${h}`, RF.sweepFixtures(h));
add('grid', RF.gridFixtures());
for (const s of [1, 2, 3, 4]) for (const h of HEIGHTS) add('random', RF.randomFixtures(s, 140, h), f => `s${s}h${h}/${f.name}`);
for (const s of [1, 2]) for (const h of HEIGHTS) {
  add('court', RF.randomCourtyardFixtures(s, 40, h), f => `s${s}h${h}/${f.name}`);
  add('split', RF.randomSplitCourtyardFixtures(s, 40, h), f => `s${s}h${h}/${f.name}`);
  add('u', RF.randomUFixtures(s, 40, h), f => `s${s}h${h}/${f.name}`);
}
const seeded = (gen: (s: number, c: number, h: number) => ShellFixture[], corpus: string, keys: string[]): void => {
  for (const key of keys) {
    const m = /^s(\d+)h(\d+)\/(.+)$/.exec(key)!;
    const f = gen(Number(m[1]), 40, Number(m[2])).find(x => x.name === m[3]);
    if (f) cases.push({corpus, key, f});
  }
};
seeded(RF.randomCourtyardFixtures, 'court-pin', [...Object.keys(PINS.COURTYARD_DEFECTS), ...Object.keys(PINS.GABLE_RISE_CONFLICTS),
  's4h250/Court7', 's4h263/Court7', 's4h300/Court7', 's6h250/Court23', 's6h263/Court23', 's6h300/Court23', 's11h250/Court35', 's11h300/Court35']);
seeded(RF.randomUFixtures, 'u-pin', Object.keys(PINS.U_DEFECTS));
seeded(RF.randomSplitCourtyardFixtures, 'split-pin', [...Object.keys(PINS.SPLIT_COURTYARD_DEFECTS), ...Object.keys(PINS.GABLE_RISE_SPLIT_CONFLICTS)]);
add('nudge', RF.nudgeFixtures());
add('pitchEnd', RF.pitchEndFixtures());
add('jutCut', RF.jutCutFixtures());
add('gap', [1, 3, 5, 8, 12].flatMap(k => (['Aligned', 'Offset'] as const).map(kind => RF.gapFixture(kind, k))));
add('rosterPitch', RF.rosterPitchCases(SHELL_FIXTURES).map(c => ({...c.fixture, name: c.name})));
add('named', [...RF.F2_COURTYARDS, RF.UPPER_U_EDGE_CONTACT, RF.FULL_WINGS_PROBE, RF.CUT_OVERSHOOT_PROBE,
  ...HEIGHTS.map(h => ({...RF.flushOverReflexFixture(h), name: `FlushOverReflex${h}`})),
  ...[...RF.PINCH_SEEDS, RF.CAP_CHAIN_SEED, [5, 46], [12, 17], [8, 73], [5, 89], [11, 10]].flatMap(([s, k]) => [250, 263, 300].map(h => ({...RF.seededFixture(s, k, h), name: `Seed${s}Fuzz${k}h${h}`}))),
  ...[false, true].map(u => ({...RF.sweepFixture(61.866, u, 263), name: `P61.866h263u${u}`}))]);

const pinOf = (key: string): string | undefined => {
  for (const [tn, t] of Object.entries(PINS)) {
    if (typeof t !== 'object' || t === null || Array.isArray(t)) continue;
    const p = (t as Record<string, unknown>)[key] as {cause?: string; residueClass?: string} | readonly string[] | undefined;
    if (p) return `${tn}: ${Array.isArray(p) ? `conflicts ${p.length}` : ((p as {cause?: string}).cause ?? (p as {residueClass?: string}).residueClass)}`;
  }
  return undefined;
};

export async function main(): Promise<void> {
if (process.env.ONLY_DRAFT) cases.splice(2);
const lines: string[] = [];
let storeys = 0, gableWalls = 0, wider = 0, failed = 0, whole = 0, wholeAgree = 0;
const widerCases = new Map<string, string[]>();
for (const {corpus, key, f} of cases) {
  for (const n of storeysOf(f)) {
    const rings = storeyRings(f, n);
    let forms;
    try { forms = storeyForms(rings); } catch { failed++; continue; }
    storeys++;
    const b = forms.building;
    const loops = storeyLoops(rings.map(r => r.ring.rect));
    const holeRuns = loops.filter(l => polyArea(l) < 0).flatMap(loopRuns);
    let roofPieces: {label: string; lo: number; hi: number; wall: Wall}[] | undefined;
    for (const uw of forms.walls) {
      if (uw.form !== 'gable') continue;
      gableWalls++;
      const n0 = nOf(uw.n);
      const ws = b.walls.filter(w => w.form === 'gable' && w.n.x * n0.x + w.n.y * n0.y > 0.5
        && (uw.axis === 'y' ? w.a.y === uw.at && w.b.y === uw.at : w.a.x === uw.at && w.b.x === uw.at)
        && spanOf(w)[0] >= uw.lo - 1e-9 && spanOf(w)[1] <= uw.hi + 1e-9);
      if (!ws.length) { lines.push(`NOWALL ${corpus} ${key} s${n} ${uw.axis}=${uw.at} [${uw.lo},${uw.hi}]`); continue; }
      const ext = extentOf(b, b.comps[ws[0].comp], ws[0]);
      roofPieces ??= (() => { try { return solveRoofParts(b, {far: 'plane'}).pieces.map(p => ({label: p.label, lo: p.bandLo, hi: p.bandHi, wall: p.wall})); } catch { return []; } })();
      const onLine = roofPieces.filter(p => ws.some(w => w.id === p.wall.id) || (p.wall.form !== 'cut' && (uw.axis === 'y' ? p.wall.a.y === uw.at && p.wall.b.y === uw.at : p.wall.a.x === uw.at && p.wall.b.x === uw.at) && p.wall.n.x * n0.x + p.wall.n.y * n0.y > 0.5));
      for (const p of onLine) if (p.label.includes('whole')) { whole++; if (p.lo === ext[0] && p.hi === ext[1]) wholeAgree++; else lines.push(`DISAGREE ${corpus} ${key} s${n} ${p.label} ext [${ext}]`); }
      if (ext[0] >= uw.lo - 1e-9 && ext[1] <= uw.hi + 1e-9) continue;
      wider++;
      const hole = holeRuns.some(r => r.axis === uw.axis && r.at === uw.at && r.n === uw.n && r.lo <= uw.lo && r.hi >= uw.hi);
      // What lies on the line beyond the wall: other union walls, and the Ring sides buried there.
      const others = forms.walls.filter(o => o !== uw && o.axis === uw.axis && o.at === uw.at && o.n === uw.n && o.lo >= ext[0] - 1e-9 && o.hi <= ext[1] + 1e-9)
        .map(o => `${o.form}${o.rises?.length ? '+rise' : ''}[${o.lo},${o.hi}]`);
      const winners = new Set(unionWallExtents(rings, loops).filter(e => e.line.axis === uw.axis && e.line.at === uw.at && e.line.n === uw.n && e.line.lo === uw.lo).flatMap(e => e.extents.map(x => x.ring)));
      const beyond: string[] = [];
      for (const [s0, s1] of [[ext[0], uw.lo], [uw.hi, ext[1]]] as const) {
        if (s1 - s0 <= 1e-9) continue;
        const cuts = new Set([s0, s1]);
        for (const {ring} of rings) for (const sd of RING_SIDES) {
          const l = ringSideLines(ring.rect)[sd];
          if (l.axis !== uw.axis || l.at !== uw.at || l.n !== uw.n) continue;
          for (const c of [l.lo, l.hi, ...(ring.sides?.[sd]?.runs ?? []).flatMap(r => runSpan(ring.rect, sd, r))]) if (c > s0 && c < s1) cuts.add(c);
        }
        const st = [...cuts].sort((p, q) => p - q);
        for (let k = 0; k + 1 < st.length; k++) {
          const m = (st[k] + st[k + 1]) / 2;
          let claim = 'noSide';
          for (const {index, ring} of rings) {
            const sd = RING_SIDES.find(x => { const l = ringSideLines(ring.rect)[x]; return l.axis === uw.axis && l.at === uw.at && l.n === uw.n && l.lo < m && m < l.hi; });
            if (!sd) continue;
            const s = ring.sides?.[sd];
            const run = (s?.runs ?? []).find(r => { const [a, c] = runSpan(ring.rect, sd, r); return m > a && m < c; });
            claim = `R${index}${sd}:${run?.form ?? s?.form ?? 'hip'}${winners.has(index) ? '' : 'Other'}`;
            break;
          }
          beyond.push(`[${st[k]},${st[k + 1]}]=${claim}`);
        }
      }
      const pin = pinOf(key);
      const line = `${corpus} | ${key} | s${n} | ${uw.axis}=${uw.at} ${uw.n} [${uw.lo},${uw.hi}] | ext [${ext[0]},${ext[1]}] | ${hole ? 'HOLE' : 'outer'} | beyond ${beyond.join(' ')} | others ${others.join(' ') || '-'} | B ${onLine.map(p => `${p.label}`).join('; ')} | pin ${pin ?? '-'}`;
      lines.push(line);
      const sig = `${hole ? 'HOLE' : 'outer'} beyond ${beyond.map(x => x.replace(/^\[[^\]]*\]=/, '')).join(' ')} others ${others.length ? 'yes' : 'no'}`;
      if (!widerCases.has(corpus)) widerCases.set(corpus, []);
      widerCases.get(corpus)!.push(`${key} s${n}`);
      void sig;
    }
  }
}
const head = `cases ${cases.length} storeys ${storeys} failedForms ${failed} allGableWalls ${gableWalls} wider ${wider} wholePieces ${whole} wholeAgreeWithCopy ${wholeAgree}`;
// The wider walls by what lies on the line beyond the wall (the WP-G4 delegate's classify.mjs).
const byClass = new Map<string, number>();
const pinned = new Map<string, string>();
for (const l of lines.filter(x => x.includes(' | ext '))) {
  const [, key, , , , where, beyond, , , pin] = l.split(' | ');
  const kinds = new Set(beyond.replace('beyond ', '').split(' ').map(x => x.split('=')[1]).map(c => (c === 'noSide' ? 'noSide' : c.split(':')[1])).map(k => (k === 'gable' ? 'ownGable' : k)));
  const cls = `${where} ${[...kinds].sort().join('+')}`;
  byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
  if (pin !== 'pin -') pinned.set(key, pin.replace('pin ', '').replace(/conflicts \d+/, 'conflicts'));
}
const summary = [head, ...[...widerCases].map(([c, ks]) => `  ${c}: ${ks.length}`), 'wider walls by class:', ...[...byClass].sort().map(([c, k]) => `  ${k}\t${c}`),
  `pinned keys among them: ${pinned.size}`, ...[...pinned].sort().map(([k, p]) => `  ${k}\t${p}`)];
const dir = path.join(process.env.EXPERIMENT_RESULTS ?? '.', 'claimed-band');
mkdirSync(dir, {recursive: true});
writeFileSync(path.join(dir, 'f76-extents.txt'), `${summary.join('\n')}\n\n# Every wider wall\n${lines.join('\n')}\n`);
console.log(summary.join('\n'));
}
