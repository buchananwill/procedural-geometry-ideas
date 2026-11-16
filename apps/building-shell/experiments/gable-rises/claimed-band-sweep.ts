// WP-G4.1 (journal decision 219): Rule A and Rule B over the corpus WP-G4 measured (F76): the roster, RISE_FIXTURES, the
// golden set, the robustness generators the default run gates, and every pinned seeded key. Each fixture is deduplicated
// by its geometry and built today, then under each rule that changes it. Writes results/claimed-band/sweep-*.txt (one
// line per changed storey and per pin) and prints the tables; claimed-band-digest.mjs reads that file.
//   node run.mjs claimed-band-sweep [stride]   (stride n keeps every n-th case of the sweep, grid and random
//                                              generators; default 1, every case)
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {EXPORTED_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES, storeysOf, type ShellFixture} from '../../src/fixture.ts';
import {errorMessage} from '../../src/errors.ts';
import type {ShellBuild} from '../../src/shell.ts';
import {GOLDEN_FIXTURES} from '../../tests/golden-fixtures.ts';
import * as RF from '../../tests/robustness-fixtures.ts';
import * as PINS from '../../tests/residue-pins.ts';
import {rosterGenus} from '../../tests/roster-genus.ts';
import {invariantViolations, roofUndersideLines} from '../../tests/shell-invariants.ts';
import {SUB_DEFAULT, buildToday, buildUnder, compareVerdicts, ruleChanges, sameShape, verdictOf, type RulePlan, type RuleName, type SubRules, type Verdict} from './claimed-band.ts';

type Genus = number | readonly number[];
interface Pin { table: string; outcome?: readonly string[]; conflicts?: number; located: boolean }
interface Entry { corpus: string; key: string; f: ShellFixture; genus: Genus; pins: Pin[]; located: boolean }

const STRIDE = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 1);

function corpus(stride: number): Entry[] {
  const out: Entry[] = [];
  const pinsOf = (key: string, located: boolean): Pin[] => {
    const ps: Pin[] = [];
    for (const [table, t] of Object.entries(PINS)) {
      if (typeof t !== 'object' || t === null) continue;
      const p = (t as Record<string, unknown>)[key];
      if (!p) continue;
      if (Array.isArray(p)) ps.push({table, conflicts: p.length, located});
      else if (typeof p === 'object' && 'outcome' in p) ps.push({table, outcome: (p as {outcome: string[]}).outcome, located});
    }
    return ps;
  };
  const add = (c: string, fs: readonly ShellFixture[], genus: (f: ShellFixture) => Genus, key = (f: ShellFixture) => f.name, every = 1, located = false): void => {
    fs.forEach((f, i) => { if (i % every === 0) out.push({corpus: c, key: key(f), f, genus: genus(f), pins: pinsOf(key(f), located), located}); });
  };
  const H = [300, 250];
  const zero = (): Genus => [0], one = (): Genus => [1];
  for (const h of H) add(`sweep${h}`, RF.sweepFixtures(h), zero, undefined, stride);
  add('grid', RF.gridFixtures(), zero, undefined, stride);
  for (const s of [1, 2, 3, 4]) for (const h of H) add('random', RF.randomFixtures(s, 140, h), zero, f => `s${s}h${h}/${f.name}`, stride);
  const seededKeys = new Set<string>();
  for (const s of [1, 2]) for (const h of H) {
    add('court', RF.randomCourtyardFixtures(s, 40, h), one, f => `s${s}h${h}/${f.name}`);
    add('split', RF.randomSplitCourtyardFixtures(s, 40, h), one, f => `s${s}h${h}/${f.name}`);
    add('u', RF.randomUFixtures(s, 40, h), zero, f => `s${s}h${h}/${f.name}`);
    for (const f of RF.randomCourtyardFixtures(s, 40, h)) seededKeys.add(`court s${s}h${h}/${f.name}`);
  }
  const seeded = (gen: (s: number, c: number, h: number) => ShellFixture[], c: string, genus: () => Genus, keys: string[]): void => {
    for (const key of keys) {
      const m = /^s(\d+)h(\d+)\/(.+)$/.exec(key)!;
      if ([1, 2].includes(Number(m[1])) && [250, 300].includes(Number(m[2]))) continue;
      const f = gen(Number(m[1]), 40, Number(m[2])).find(x => x.name === m[3]);
      if (f) out.push({corpus: c, key, f, genus: genus(), pins: pinsOf(key, false), located: false});
    }
  };
  seeded(RF.randomCourtyardFixtures, 'court', one, [...new Set([...Object.keys(PINS.COURTYARD_DEFECTS), ...Object.keys(PINS.GABLE_RISE_CONFLICTS),
    's4h250/Court7', 's4h263/Court7', 's4h300/Court7', 's6h250/Court23', 's6h263/Court23', 's6h300/Court23', 's11h250/Court35', 's11h300/Court35'])]);
  seeded(RF.randomUFixtures, 'u', zero, Object.keys(PINS.U_DEFECTS));
  seeded(RF.randomSplitCourtyardFixtures, 'split', one, [...new Set([...Object.keys(PINS.SPLIT_COURTYARD_DEFECTS), ...Object.keys(PINS.GABLE_RISE_SPLIT_CONFLICTS)])]);
  add('nudge', RF.nudgeFixtures(), zero);
  add('pitchEnd', RF.pitchEndFixtures(), zero);
  add('jutCut', RF.jutCutFixtures(), one);
  add('gap', [1, 3, 5, 8, 12].flatMap(k => (['Aligned', 'Offset'] as const).map(kind => RF.gapFixture(kind, k))), () => [0, 0]);
  const rp = RF.rosterPitchCases(SHELL_FIXTURES);
  rp.forEach(c => { out.push({corpus: 'rosterPitch', key: c.name, f: c.fixture, genus: rosterGenus(c.roster), pins: pinsOf(c.name, true), located: true}); });
  add('named', [...RF.F2_COURTYARDS, RF.FULL_WINGS_PROBE], one);
  out.push({corpus: 'named', key: RF.CUT_OVERSHOOT_PROBE.name, f: RF.CUT_OVERSHOOT_PROBE, genus: [1], pins: [{table: 'CUT_OVERSHOOT_DEFECTS', outcome: PINS.CUT_OVERSHOOT_DEFECTS.outcome, located: false}], located: false});
  add('named', [RF.UPPER_U_EDGE_CONTACT, ...H.map(h => ({...RF.flushOverReflexFixture(h), name: `FlushOverReflex${h}`})),
    ...[...RF.PINCH_SEEDS, RF.CAP_CHAIN_SEED, [5, 46], [12, 17], [8, 73], [5, 89], [11, 10]].flatMap(([s, k]) => [250, 263, 300].map(h => ({...RF.seededFixture(s, k, h), name: `Seed${s}Fuzz${k}h${h}`})))], zero);
  add('roster', EXPORTED_FIXTURES, f => rosterGenus(f.name));
  add('rise', RISE_FIXTURES, f => (f.name.startsWith('Courtyard') ? [1] : [0]));
  for (const g of GOLDEN_FIXTURES) out.push({corpus: 'golden', key: g.fixture.name, f: g.fixture, genus: g.expectedGenus, pins: [], located: !g.clean && g.located});
  // One entry per geometry, keeping the first's corpus and every pin.
  const seen = new Map<string, Entry>();
  for (const e of out) {
    const id = JSON.stringify([e.f.storeyHeight, e.f.rings]);
    const prev = seen.get(id);
    if (prev) { prev.pins.push(...e.pins.filter(p => !prev.pins.some(q => q.table === p.table))); prev.key += ` = ${e.corpus}:${e.key}`; continue; }
    seen.set(id, {...e, pins: [...e.pins]});
  }
  return [...seen.values()];
}

/** A pinned case's measured outcome, as the robustness sweeps measure it. */
function outcomeOf(b: ShellBuild | Error, e: Entry): string[] {
  if (b instanceof Error) return [`throws: ${errorMessage(b)}`];
  return [...invariantViolations(b, {genus: e.genus, cheeks: 0}), ...(e.located ? roofUndersideLines(b) : [])];
}

/** How a pin fares under a rule: cured, the same, changed, or worse. */
function pinFate(p: Pin, b: ShellBuild | Error, e: Entry): string {
  if (p.conflicts !== undefined) {
    if (b instanceof Error) return 'worse (throws)';
    const c = b.shell.report.conflicts.length, v = outcomeOf(b, e).length;
    if (v) return `worse (${v} violations)`;
    return c === 0 ? 'cured' : c === p.conflicts ? 'same' : c > p.conflicts ? `worse (conflicts ${p.conflicts} to ${c})` : `changed (conflicts ${p.conflicts} to ${c})`;
  }
  const o = outcomeOf(b, e), pin = [...(p.outcome ?? [])];
  if (JSON.stringify(o) === JSON.stringify(pin)) return 'same';
  if (!o.length) return b instanceof Error || b.shell.report.conflicts.length ? `cured, conflicts ${b instanceof Error ? '?' : b.shell.report.conflicts.length}` : 'cured';
  const thrown = o.some(x => x.startsWith('throws')), wasThrown = pin.some(x => x.startsWith('throws'));
  if (thrown && !wasThrown) return `worse (now throws: ${o[0].slice(8, 90)})`;
  return `changed (${pin.length} to ${o.length} lines: ${o.map(x => x.split(' ')[0]).join(',')})`;
}

/** A not-clean verdict's kinds, coarsely: what a class of failure is named by. */
function failKinds(v: Verdict | Error): string {
  if (v instanceof Error) return `throws: ${errorMessage(v).replace(/^.*?storey \d+: /, '').replace(/[\d.]+/g, '#').slice(0, 70)}`;
  const k = new Set<string>(v.violations.map(x => x.split(/[ :]/)[0]));
  if (v.conflicts) k.add('conflicts');
  if (v.oracle > 0.05) k.add('oracle');
  if (v.breakthrough > 0.05) k.add('breakthrough');
  return [...k].sort().join('+');
}

const size = (f: ShellFixture): number => f.rings.length * 1e7 + f.rings.reduce((s, r) => s + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0);

/** The planes of a piece, by equation, for comparing today's algorithm B piece with a rise. */
const eq = (pl: {gx: number; gy: number; c: number}): string => `${pl.gx.toFixed(6)},${pl.gy.toFixed(6)},${pl.c.toFixed(4)}`;

/** Rule B against today on a not-wider wall: how its rise differs from today's algorithm B piece. */
function notWiderReason(today: ShellBuild, rp: RulePlan, n: number): string[] {
  const reasons: string[] = [];
  const tp = today.union.plans.find(p => p.storey === n);
  if (!tp) return ['no today plan'];
  for (const fate of rp.fates) {
    if (fate.f76 !== 'notWider' || fate.fate !== 'toRise') continue;
    for (const bp of rp.pieces.filter(p => fate.bands.includes(p.band))) {
      const w = fate.wall;
      const old = tp.roof.pieces.find(p => (w.axis === 'y' ? p.wall.a.y === w.at && p.wall.b.y === w.at : p.wall.a.x === w.at && p.wall.b.x === w.at)
        && Math.min(p.bandHi, bp.band.hi) - Math.max(p.bandLo, bp.band.lo) > 1e-9);
      if (!old) { reasons.push('no algorithm B piece today'); continue; }
      const oldEq = new Set(old.planes.map(id => eq(tp.building.planes[id]))), pl = rp.plan.building.planes;
      const limitEq = eq(pl[bp.limitPlane]);
      const rakes = bp.piece.planes.slice(0, 2).map(id => eq(pl[id]));
      const oldFar = [...oldEq].filter(x => !rakes.includes(x));
      const parts: string[] = [];
      if (!rakes.every(r => oldEq.has(r))) parts.push('rakes differ');
      if (old.bandLo !== bp.band.lo || old.bandHi !== bp.band.hi) parts.push('band differs');
      if (!oldFar.length) parts.push(oldEq.has(limitEq) ? 'B had no far plane; walk gives a rake' : 'B had no far plane; walk adds one');
      else parts.push(oldFar.includes(limitEq) ? 'limit = B far plane' : 'limit differs from B far plane');
      if (bp.cap) parts.push(`cap ${bp.cap}`);
      if (old.farDist !== bp.piece.farDist) parts.push('farDist differs');
      reasons.push(parts.join(', '));
    }
  }
  return reasons;
}

/**
 * A changed storey's class: the F76 atoms of the walls a rule turned into rises (`notWider`, `ownGable`, `gableOther`,
 * `hipOther`, `noSide`), with hole and outer walls together. Under Rule A a not-wider wall is converted only where its
 * band is not algorithm B's piece: `twoBands` (two gable pitches on the wall) or `bandNotPiece`. `mixedBand` marks a
 * mixed wall whose band is not one of today's rises.
 */
function classOf(rp: RulePlan, rule: RuleName): string {
  const atoms = new Set<string>();
  for (const x of rp.fates) {
    if (x.fate === 'toRise') {
      if (x.f76 === 'notWider') atoms.add(rule === 'A' ? (x.bands.length > 1 ? 'twoBands' : 'bandNotPiece') : 'notWider');
      else x.f76.replace(/^(HOLE|outer) /, '').split('+').forEach(a => atoms.add(a));
    }
    if (x.fate === 'mixedToday' && x.bands.some(bd => !rp.todayRises.some(r => r.lo === bd.lo && r.hi === bd.hi))) atoms.add('mixedBand');
  }
  return [...atoms].sort().join('+') || 'other';
}

type Transition = 'clean>clean' | 'clean>NOT' | 'not>clean' | 'not>not same' | 'not>not better' | 'not>not WORSE' | 'throws>clean' | 'throws>not' | 'throws>throws' | 'built>THROWS';
const TRANSITIONS: Transition[] = ['clean>clean', 'clean>NOT', 'not>clean', 'not>not same', 'not>not better', 'not>not WORSE', 'throws>clean', 'throws>not', 'throws>throws', 'built>THROWS'];

function transitionOf(today: Verdict | Error, rule: Verdict | Error): Transition {
  if (rule instanceof Error) return today instanceof Error ? 'throws>throws' : 'built>THROWS';
  if (today instanceof Error) return rule.clean ? 'throws>clean' : 'throws>not';
  if (today.clean) return rule.clean ? 'clean>clean' : 'clean>NOT';
  if (rule.clean) return 'not>clean';
  return `not>not ${compareVerdicts(today, rule) === 'worse' ? 'WORSE' : compareVerdicts(today, rule)}` as Transition;
}

const BAD = new Set<Transition>(['clean>NOT', 'not>not WORSE', 'built>THROWS']);

/**
 * Item 4, the mechanics the principle strains, over the corpus under Rule B: how each band's ends were raked, how many
 * bands have a buried middle, a buried end, a gabled far wall or a cap; and, for each sub-rule candidate, the storeys it
 * plans differently from the default, each built both ways.   node run.mjs claimed-band-sweep mechanics [stride]
 */
async function mechanics(): Promise<void> {
  const entries = corpus(STRIDE);
  const count = new Map<string, number>();
  const bump = (k: string): void => { count.set(k, (count.get(k) ?? 0) + 1); };
  const lines: string[] = [];
  const variants: [string, SubRules][] = [['end=adjacentPitch', {...SUB_DEFAULT, buriedEnd: 'adjacentPitch'}], ['walk=exposedMiddle', {...SUB_DEFAULT, walkStart: 'exposedMiddle'}]];
  const pieceSig = (rp: RulePlan): string => rp.pieces.map(p => `${p.band.line.axis}=${p.band.line.at}[${p.band.lo},${p.band.hi}]:${p.piece.planes.map(id => eq(rp.plan.building.planes[id])).sort().join(';')}`).sort().join('|');
  const differing: Record<string, Entry[]> = {};
  for (const e of entries) {
    let base: RulePlan[];
    try { base = ruleChanges(e.f, 'B').plans; } catch { bump('plan throws'); continue; }
    for (const rp of base) for (const p of rp.pieces) {
      bump('bands built');
      bump(`ends ${[...p.ends].sort().join('/')}`);
      const len = p.exposed.reduce((s, [a, b]) => s + b - a, 0);
      if (len < p.band.hi - p.band.lo - 1e-9) bump('band wider than its exposed walls');
      if (p.buriedMiddle) bump('middle buried');
      if (p.exposed.length > 1) bump('exposed in two or more stretches');
      if (p.farGabled) bump('limit is a gabled wall\'s plane');
      if (p.cap) bump(`cap ${p.cap}`);
    }
    for (const [name, sub] of variants) {
      let other: RulePlan[];
      try { other = ruleChanges(e.f, 'B', sub).plans; } catch { bump(`${name}: plan throws`); continue; }
      if (other.some((rp, k) => pieceSig(rp) !== pieceSig(base[k]))) (differing[name] ??= []).push(e);
    }
  }
  const summary: string[] = [`corpus: ${entries.length} distinct fixtures, stride ${STRIDE} on sweep, grid and random`, '## Rule B, default sub-rules: bands by mechanics'];
  for (const [k, n] of [...count].sort()) summary.push(`  ${k}: ${n}`);
  for (const [name, sub] of variants) {
    const list = differing[name] ?? [];
    summary.push(`## ${name}: ${list.length} fixtures plan differently from the default`);
    const tally = new Map<string, number>();
    for (const e of list) {
      let tv: Verdict | Error, dv: Verdict | Error, vv: Verdict | Error, shape = 'n/a';
      try { tv = verdictOf(await buildToday(e.f), e.genus); } catch (err) { tv = err as Error; }
      let d: ShellBuild | undefined, v: ShellBuild | undefined;
      try { d = await buildUnder(e.f, ruleChanges(e.f, 'B').plans); dv = verdictOf(d, e.genus); } catch (err) { dv = err as Error; }
      try { v = await buildUnder(e.f, ruleChanges(e.f, 'B', sub).plans); vv = verdictOf(v, e.genus); } catch (err) { vv = err as Error; }
      if (d && v) shape = sameShape(d, v).same ? 'same shape as default' : 'SHAPE DIFFERS from default';
      const k = `default ${transitionOf(tv, dv)}; ${name} ${transitionOf(tv, vv)}; ${shape}`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
      lines.push(`${name} | ${e.corpus} | ${e.key.split(' = ')[0]} | ${k} | default: ${dv instanceof Error ? `THROWS ${errorMessage(dv).slice(0, 120)}` : dv.text} | variant: ${vv instanceof Error ? `THROWS ${errorMessage(vv).slice(0, 120)}` : vv.text}`);
    }
    for (const [k, n] of [...tally].sort()) summary.push(`  ${n}: ${k}`);
  }
  const dir = path.join(process.env.EXPERIMENT_RESULTS ?? '.', 'claimed-band');
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, `mechanics-stride${STRIDE}.txt`), `${summary.join('\n')}\n\n# Every fixture a sub-rule plans differently\n${lines.join('\n')}\n`);
  console.log(summary.join('\n'));
}

/**
 *   node run.mjs claimed-band-sweep [stride] [rules=B] [far=none|farRakes] [caps=uncapped] [end=adjacentPitch] [walk=exposedMiddle]
 *   node run.mjs claimed-band-sweep mechanics [stride]
 */
export async function main(args: string[] = []): Promise<void> {
  if (args.includes('mechanics')) return mechanics();
  const arg = (k: string): string | undefined => args.find(a => a.startsWith(`${k}=`))?.split('=')[1];
  const SUB: SubRules = {
    buriedEnd: (arg('end') ?? SUB_DEFAULT.buriedEnd) as SubRules['buriedEnd'], walkStart: (arg('walk') ?? SUB_DEFAULT.walkStart) as SubRules['walkStart'],
    gabledFar: (arg('far') ?? SUB_DEFAULT.gabledFar) as SubRules['gabledFar'], pieceCaps: (arg('caps') ?? SUB_DEFAULT.pieceCaps) as SubRules['pieceCaps'],
    reach: (arg('reach') ?? SUB_DEFAULT.reach) as SubRules['reach'], twoPitch: (arg('two') ?? SUB_DEFAULT.twoPitch) as SubRules['twoPitch'],
  };
  const RULES = (arg('rules') ?? 'AB').split('') as ('A' | 'B')[];
  const suffix = ['rules', 'far', 'caps', 'reach', 'two', 'end', 'walk'].filter(k => arg(k)).map(k => `-${k}-${arg(k)}`).join('') + (args.includes('changedOnly') ? '-changedOnly' : '');
  const entries = corpus(STRIDE);
  const perCorpus = new Map<string, number>();
  for (const e of entries) perCorpus.set(e.corpus, (perCorpus.get(e.corpus) ?? 0) + 1);
  console.log(`corpus: ${[...perCorpus].map(([c, k]) => `${c} ${k}`).join(', ')}`);
  const lines: string[] = [];
  const t0 = Date.now();
  type Tally = {storeys: number; shape: number; fixtures: number; by: Map<Transition, number>};
  const fresh = (): Tally => ({storeys: 0, shape: 0, fixtures: 0, by: new Map()});
  const tallies: Record<'A' | 'B', Map<string, Tally>> = {A: new Map(), B: new Map()};
  const totals: Record<'A' | 'B', Tally> = {A: fresh(), B: fresh()};
  const smallest: Record<'A' | 'B', Map<string, Entry>> = {A: new Map(), B: new Map()};
  const pinTable: Record<'A' | 'B', Map<string, number>> = {A: new Map(), B: new Map()};
  const notWider = new Map<string, {same: number; differs: number; example?: string}>();
  for (const [i, e] of entries.entries()) {
    // `changedOnly`: skip a fixture no rule plans differently (its pins are then not listed).
    if (args.includes('changedOnly') && !RULES.some(r => { try { return ruleChanges(e.f, r, SUB).changed; } catch { return true; } })) continue;
    let today: ShellBuild | Error;
    try { today = await buildToday(e.f); } catch (err) { today = err as Error; }
    const tv: Verdict | Error = today instanceof Error ? today : verdictOf(today, e.genus);
    for (const rule of RULES) {
      let rc: {changed: boolean; plans: RulePlan[]};
      try { rc = ruleChanges(e.f, rule, SUB); } catch (err) { lines.push(`${rule} | ${e.corpus} | ${e.key} | PLAN THROWS ${errorMessage(err).slice(0, 200)}`); totals[rule].by.set('built>THROWS', (totals[rule].by.get('built>THROWS') ?? 0) + 1); continue; }
      let built: ShellBuild | Error | undefined;
      if (rc.changed) { try { built = await buildUnder(e.f, rc.plans); } catch (err) { built = err as Error; } }
      const result = built ?? today;
      for (const p of e.pins) {
        const fate = pinFate(p, result, e);
        lines.push(`PIN ${rule} | ${e.corpus} | ${e.key} | ${p.table} | ${rc.changed ? 'plan changed' : 'plan as today'} | ${fate}`);
        const k = `${p.table.replace(/_DEFECTS|GABLE_RISE_/g, '')}: ${fate.replace(/ \(.*/, '').replace(/, conflicts \d+/, ', conflicts remain')}`;
        pinTable[rule].set(k, (pinTable[rule].get(k) ?? 0) + 1);
      }
      if (!rc.changed || !built) continue;
      const rv: Verdict | Error = built instanceof Error ? built : verdictOf(built, e.genus);
      const tr = transitionOf(tv, rv);
      const vText = rv instanceof Error ? `THROWS ${errorMessage(rv).slice(0, 160)}` : `${rv.text}${rv.pieceBreakthrough > 0.05 ? ` [piece breakthrough ${rv.pieceBreakthrough.toFixed(1)}]` : ''}`;
      const tText = tv instanceof Error ? `THROWS ${errorMessage(tv).slice(0, 100)}` : `${tv.text}${tv.pieceBreakthrough > 0.05 ? ` [piece breakthrough ${tv.pieceBreakthrough.toFixed(1)}]` : ''}`;
      let anyShape = false;
      const classesHere = new Set<string>();
      for (const rp of rc.plans) {
        if (rp.unchanged) continue;
        const n = rp.plan.storey;
        const cls = classOf(rp, rule);
        classesHere.add(cls);
        const shape = built instanceof Error || today instanceof Error ? {same: false, why: 'a build throws'} : sameShape(today, built, 1, n);
        anyShape ||= !shape.same;
        for (const t of [tallies[rule].get(cls) ?? fresh(), totals[rule]]) {
          t.storeys++;
          if (!shape.same) t.shape++;
          t.by.set(tr, (t.by.get(tr) ?? 0) + 1);
          tallies[rule].set(cls, t === totals[rule] ? tallies[rule].get(cls)! : t);
        }
        lines.push(`${rule} | ${e.corpus} | ${e.key} | s${n} | ${cls} | ${shape.same ? 'same shape' : `SHAPE ${shape.why}`} | ${tr} | ${vText} | today ${tText}`);
        if (rule === 'B' && cls === 'notWider' && !(today instanceof Error)) {
          for (const r of notWiderReason(today, rp, n)) {
            const nw = notWider.get(r) ?? {same: 0, differs: 0};
            if (shape.same) nw.same++; else { nw.differs++; nw.example ??= `${e.key.split(' = ')[0]} s${n}`; }
            notWider.set(r, nw);
          }
        }
        if (BAD.has(tr)) {
          const fk = `${cls} :: ${tr} :: ${failKinds(rv)}`;
          const prev = smallest[rule].get(fk);
          if (!prev || size(e.f) < size(prev.f)) smallest[rule].set(fk, e);
        }
      }
      for (const cls of classesHere) tallies[rule].get(cls)!.fixtures++;
      totals[rule].fixtures++;
      void anyShape;
    }
    if (i % 200 === 0) console.log(`${i} / ${entries.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const row = (c: string, t: Tally): string => `  ${c}: ${t.storeys} | ${t.shape} | ${t.fixtures} | ${TRANSITIONS.map(k => t.by.get(k) ?? 0).join(' | ')}`;
  const summary: string[] = [`corpus: ${entries.length} distinct fixtures (${[...perCorpus].map(([c, k]) => `${c} ${k}`).join(', ')}); stride ${STRIDE} on sweep, grid and random only; rules ${RULES.join(', ')}; sub-rules ${JSON.stringify(SUB)}; ${((Date.now() - t0) / 1000).toFixed(0)} s`];
  for (const rule of RULES) {
    summary.push(`\n## Rule ${rule}: changed storeys by class`);
    summary.push(`  class: storeys | shape changed | fixtures | ${TRANSITIONS.join(' | ')}   (transitions are the fixture's verdict, today > rule, counted per storey)`);
    for (const [c, t] of [...tallies[rule]].sort()) summary.push(row(c, t));
    summary.push(row('ALL', totals[rule]));
    summary.push(`## Rule ${rule}: worse than today, smallest input per class, transition and failure`);
    for (const [k, e] of [...smallest[rule]].sort()) summary.push(`  ${k}: ${e.corpus} ${e.key.split(' = ')[0]} (${e.f.rings.length} Rings)`);
    summary.push(`## Rule ${rule}: pins`);
    for (const [k, n] of [...pinTable[rule]].sort()) summary.push(`  ${k}: ${n}`);
  }
  summary.push('\n## Rule B on not-wider walls: how the rise differs from algorithm B\'s piece (storey same shape | shape differs | first differing)');
  for (const [r, v] of [...notWider].sort()) summary.push(`  ${r}: ${v.same} | ${v.differs}${v.example ? ` | ${v.example}` : ''}`);
  const dir = path.join(process.env.EXPERIMENT_RESULTS ?? '.', 'claimed-band');
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, `sweep-stride${STRIDE}${suffix}.txt`), `${summary.join('\n')}\n\n# Every changed storey and every pin\n${lines.join('\n')}\n`);
  console.log(summary.join('\n'));
  void storeysOf;
  void invariantViolations;
}

