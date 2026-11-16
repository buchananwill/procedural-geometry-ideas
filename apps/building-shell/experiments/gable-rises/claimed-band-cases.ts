// WP-G4.1's named cases (journal decision 219): the self-check of the probe's re-stated rise, SingleStoreyT and the user's
// two drafts (F75) under today, Rule A and Rule B, plain gable-ended rectangles, and the rise fixtures under Rule B.
//   node run.mjs claimed-band-cases [section]   (section: self | drafts | ends | rises | buried; default all)
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {EXPORTED_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES, fixtureByName, ring, type FixtureRing, type RingSides, type ShellFixture} from '../../src/fixture.ts';
import * as RF from '../../tests/robustness-fixtures.ts';
import {intervalTop} from '../../tests/rise-oracle.ts';
import {rosterGenus} from '../../tests/roster-genus.ts';
import type {ShellBuild} from '../../src/shell.ts';
import {
  SUB_DEFAULT, buildToday, buildUnder, gableApexes, ruleChanges, sameShape, verdictOf, type RuleName, type SubRules,
} from './claimed-band.ts';

const out: string[] = [];
const say = (s: string): void => { out.push(s); console.log(s); };
const fx = (name: string, rings: FixtureRing[], storeyHeight = 250): ShellFixture => ({name, cellSize: 50, storeyHeight, rings});

/** The genus a fixture's tests expect: the roster's measured one, else 1 for a courtyard and 0 otherwise. */
const genusOf = (f: ShellFixture): number | readonly number[] => {
  try { return rosterGenus(f.name); } catch { return f.name.startsWith('Courtyard') ? [1] : [0]; }
};

async function under(f: ShellFixture, rule: RuleName | 'today', sub: SubRules = SUB_DEFAULT): Promise<ShellBuild> {
  if (rule === 'today') return buildToday(f);
  return buildUnder(f, ruleChanges(f, rule, sub).plans);
}

async function describe(f: ShellFixture, rules: readonly (RuleName | 'today')[], sub: SubRules = SUB_DEFAULT): Promise<void> {
  say(`\n== ${f.name}`);
  let todayBuild: ShellBuild | undefined;
  for (const rule of rules) {
    let b: ShellBuild;
    try { b = await under(f, rule, sub); } catch (e) { say(`  ${rule}: THROWS ${(e as Error).message.slice(0, 240)}`); continue; }
    if (rule === 'today') todayBuild = b;
    const v = verdictOf(b, genusOf(f));
    const shape = todayBuild && rule !== 'today' ? (sameShape(todayBuild, b).same ? 'same shape as today' : `SHAPE DIFFERS (${sameShape(todayBuild, b).why})`) : '';
    say(`  ${rule}: ${v.clean ? 'CLEAN' : `NOT CLEAN: ${v.text}`} ${shape}`);
    if (rule !== 'today') {
      for (const p of ruleChanges(f, rule, sub).plans) {
        for (const w of p.fates) say(`    storey ${w.storey} ${w.wall.axis}=${w.wall.at} [${w.wall.lo},${w.wall.hi}] ${w.f76}: ${w.fate}${w.bands.length ? `, bands ${w.bands.map(bd => `[${bd.lo},${bd.hi}]@${bd.deg}`).join(' ')}` : ''}`);
        for (const bp of p.pieces) {
          const pl = p.plan.building.planes;
          say(`    rise [${bp.band.lo},${bp.band.hi}] on ${bp.band.line.axis}=${bp.band.line.at}: ends ${bp.ends.join('/')}${bp.buriedMiddle ? ', middle buried' : ''}; planes ${bp.piece.planes.map(id => pl[id].label).join(' & ')}; limit ${pl[bp.limitPlane].label}${bp.cap ? `; cap ${bp.cap} ${bp.capCm}` : ''}`);
        }
      }
    }
    for (const g of gableApexes(b, f.storeyHeight)) say(`    ${g}`);
  }
}

/** The roof's top height above the plate along a line, today against a rule, sampled every 5 cm. */
function ridgeDiff(a: ShellBuild, b: ShellBuild, plate: number, pts: [number, number][]): string {
  let worst = 0, at = '', maxA = 0, maxB = 0;
  for (const [x, y] of pts) {
    const za = intervalTop(a.union, x, y, plate + 0.5), zb = intervalTop(b.union, x, y, plate + 0.5);
    if (za === null || zb === null) continue;
    maxA = Math.max(maxA, za - plate); maxB = Math.max(maxB, zb - plate);
    if (Math.abs(za - zb) > worst) { worst = Math.abs(za - zb); at = `(${x}, ${y}): today ${(za - plate).toFixed(1)}, rule ${(zb - plate).toFixed(1)}`; }
  }
  return `along both centrelines: highest today ${maxA.toFixed(1)}, under the rule ${maxB.toFixed(1)}; worst difference ${worst.toFixed(2)}${at ? ` at ${at}` : ''}`;
}

const SECTIONS: Record<string, () => Promise<void>> = {
  /** The probe's `T` (today re-stated) against production on every exported and rise fixture: same shape, same verdict. */
  async self() {
    say('\n# Self-check: the probe re-stating today (rule T) against production');
    let same = 0;
    for (const f of [...EXPORTED_FIXTURES, ...RISE_FIXTURES]) {
      const a = await buildToday(f), b = await under(f, 'T');
      const s = sameShape(a, b), va = verdictOf(a, genusOf(f)), vb = verdictOf(b, genusOf(f));
      if (s.same && va.text === vb.text) same++;
      else say(`  ${f.name}: ${s.same ? 'same shape' : s.why}; production ${va.text}; probe ${vb.text}`);
    }
    say(`  ${same} of ${EXPORTED_FIXTURES.length + RISE_FIXTURES.length} agree in shape and verdict`);
  },

  /** Item 6: SingleStoreyT and the user's two drafts. */
  async drafts() {
    say('\n# SingleStoreyT and the user\'s drafts (F75) under today, Rule A and Rule B');
    const base = [ring([0, 0, 600, 600], 0, 1, 22.5, {S: {form: 'hip'}, W: {form: 'gable'}}), ring([600, 0, 1200, 800], 0, 1, 22.5, {S: {form: 'gable'}}), ring([200, 0, 400, 200], 1, 2, 45)];
    for (const f of [fixtureByName('SingleStoreyT'), fx('DraftNoWing', base), fx('DraftWithWing', [...base, ring([0, -400, 600, 0], 0, 1, 22.5)])]) {
      await describe(f, ['today', 'A', 'B']);
    }
  },

  /** Item 1: plain gable-ended rectangles, short ends, long ends and all four, at three aspects and three pitch pairs. */
  async ends() {
    say('\n# Gable-ended rectangles: today against Rule B (Rule A builds today\'s shell on a convex rectangle)');
    const dims: [number, number][] = [[1000, 1000], [1000, 500], [1200, 400]];
    const pitches: [number, number][] = [[45, 45], [22.5, 22.5], [30, 60]];
    const configs: Record<string, (long: 'x' | 'y', g: number) => RingSides> = {
      shortEnds: (_, g) => ({W: {form: 'gable', deg: g}, E: {form: 'gable', deg: g}}),
      longEnds: (_, g) => ({S: {form: 'gable', deg: g}, N: {form: 'gable', deg: g}}),
      allFour: (_, g) => ({S: {form: 'gable', deg: g}, E: {form: 'gable', deg: g}, N: {form: 'gable', deg: g}, W: {form: 'gable', deg: g}}),
      oneEnd: (_, g) => ({W: {form: 'gable', deg: g}}),
    };
    const subs: SubRules[] = [SUB_DEFAULT, {...SUB_DEFAULT, gabledFar: 'none'}, {...SUB_DEFAULT, gabledFar: 'farRakes'}];
    const list: [ShellFixture, number, number][] = [];
    for (const [L, D] of dims) for (const [hip, g] of pitches) for (const [name, sides] of Object.entries(configs)) {
      list.push([fx(`Rect${L}x${D}-${name}-hip${hip}-gable${g}`, [ring([0, 0, L, D], 0, 1, hip, sides('x', g))]), L, D]);
    }
    // F66's case, a steep mid-wall rise facing a wall gabled along its whole length; and long sides gabled at two pitches.
    list.push([fx('RiseFacingWholeGable', [ring([0, 0, 1000, 500], 0, 1, 45, {N: {form: 'gable'}, S: {form: 'hip', runs: [{from: 400, to: 600, form: 'gable', deg: 75}]}})]), 1000, 500]);
    list.push([fx('UnequalLongGables', [ring([0, 0, 1000, 500], 0, 1, 30, {N: {form: 'gable', deg: 45}, S: {form: 'gable', deg: 60}})]), 1000, 500]);
    for (const [f, L, D] of list) {
      let a: ShellBuild;
      try { a = await buildToday(f); } catch (e) { say(`  ${f.name}: today THROWS ${(e as Error).message.slice(0, 160)}`); continue; }
      const both: [number, number][] = [
        ...Array.from({length: Math.floor(L / 5) - 1}, (_, i): [number, number] => [5 + 5 * i + 0.13, D / 2 + 0.07]),
        ...Array.from({length: Math.floor(D / 5) - 1}, (_, i): [number, number] => [L / 2 + 0.07, 5 + 5 * i + 0.13])];
      say(`  ${f.name}: today ${verdictOf(a, [0]).text}`);
      for (const sub of subs) {
        let b: ShellBuild;
        try { b = await under(f, 'B', sub); } catch (e) { say(`    B gabledFar=${sub.gabledFar}: THROWS ${(e as Error).message.slice(0, 160)}`); continue; }
        const s = sameShape(a, b), vb = verdictOf(b, [0]);
        const rp = ruleChanges(f, 'B', sub).plans[0];
        const far = rp.pieces.filter(p => p.farGabled).length;
        say(`    B gabledFar=${sub.gabledFar}: ${vb.text}; ${s.same ? 'SAME SHAPE' : 'SHAPE DIFFERS'}; ${far} of ${rp.pieces.length} rises limited by a gabled wall's plane; ${ridgeDiff(a, b, 250, both)}`);
      }
    }
  },

  /** Item 5: the rise fixtures under Rule B: does band-by-claim change any? */
  async rises() {
    say('\n# RISE_FIXTURES under Rule B');
    for (const f of RISE_FIXTURES) {
      const {changed, plans} = ruleChanges(f, 'B');
      if (!changed) { say(`  ${f.name}: unchanged (every band is today's rise)`); continue; }
      await describe(f, ['today', 'B']);
      void plans;
    }
  },

  /** Hand reductions of the classes the sweep found worse than today. */
  async strain() {
    say('\n# Hand reductions of the classes the sweep found worse than today');
    const cases = [
      // The burying Ring is taller than the band's storey: the band's front stands in the plane of that Ring's upper wall.
      fx('TallStemBuriesMiddle', [ring([0, 0, 1000, 500], 0, 1, 45, {E: {form: 'gable'}}), ring([1000, 150, 1400, 350], 0, 2, 45)]),
      fx('TallWingBuriesEnd', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}}), ring([0, -400, 300, 0], 0, 2, 30)]),
      // The same with the taller Ring crossing the line, so the stretch it buries is no Ring side (F76's noSide).
      fx('TallCrossingBuriesEnd', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}}), ring([0, -400, 300, 200], 0, 2, 30)]),
      // One wall gabled along its whole length at two pitches: today one gable at the lower index's pitch.
      fx('TwoPitchWall', [ring([0, 0, 300, 400], 0, 1, 45, {W: {form: 'gable', deg: 52.5}}), ring([0, 400, 300, 900], 0, 1, 45, {W: {form: 'gable', deg: 30}})]),
      fx('TwoPitchWallUnequalDepth', [ring([0, 0, 300, 400], 0, 1, 45, {W: {form: 'gable', deg: 52.5}}), ring([0, 400, 600, 900], 0, 1, 45, {W: {form: 'gable', deg: 30}})]),
      // s10h263/Court18 without its Ring 1, then with the tall Rings one storey shorter: a gabled side whose low end a
      // taller Ring buries and whose high end meets a Ring that crosses the line.
      fx('Court18Less1', [ring([50, 250, 200, 400], 0, 3, 45, {N: {form: 'gable'}, E: {form: 'hip', deg: 52.5}}), ring([50, 400, 450, 500], 0, 1, 37, {S: {form: 'gable'}}), ring([450, 250, 600, 500], 0, 3, 37)], 263),
      fx('Court18Less1Lower', [ring([50, 250, 200, 400], 0, 2, 45, {E: {form: 'hip', deg: 52.5}}), ring([50, 400, 450, 500], 0, 1, 37, {S: {form: 'gable'}}), ring([450, 250, 600, 500], 0, 1, 37)], 263),
      // A wall gabled along its whole length under a narrow storey directly above (the roster's NarrowUpperStoreyGabled shape).
      fx('GableUnderNarrowUpper', [ring([0, 0, 1000, 500], 0, 1, 55, {W: {form: 'gable'}}), ring([300, 100, 700, 400], 1, 1, 45)]),
    ];
    for (const f of cases) await describe(f, ['today', 'A', 'B']);
  },

  /** Item 4: bands with a buried middle or a buried end, under each sub-rule pair. */
  async buried() {
    say('\n# Buried middles and ends: sub-rule candidates');
    const cases = [
      fixtureByName('SingleStoreyT'),
      // A gable side whose middle a wing buries, the wing hipped and lower-index: today two whole-wall gables.
      fx('WingBuriesGableMiddle', [ring([1000, 150, 1400, 350], 0, 1, 45), ring([0, 0, 1000, 500], 0, 1, 45, {E: {form: 'gable', deg: 60}})]),
      // A hip side with a gable run whose middle a wing buries: today two rises.
      fx('WingBuriesRiseMiddle', [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'hip', runs: [{from: 300, to: 700, form: 'gable', deg: 45}]}}), ring([450, -300, 550, 0], 0, 1, 30)]),
      // A gabled side whose end a wing buries (an L): the band's end is inside the footprint.
      fx('WingBuriesGableEnd', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}}), ring([0, -400, 300, 0], 0, 1, 30)]),
      fx('WingBuriesGableEndSteepAdj', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}, W: {form: 'hip', deg: 60}}), ring([0, -400, 300, 0], 0, 1, 30)]),
      // The wing covers the gabled side's own corner, so the band's low end stands inside the footprint with no end
      // wall: the main Ring's W side is hip at the default 30, then at 60.
      fx('WingBuriesGableCorner', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}}), ring([-200, -400, 300, 200], 0, 1, 30)]),
      fx('WingBuriesGableCornerSteepAdj', [ring([0, 0, 1000, 400], 0, 1, 30, {S: {form: 'gable', deg: 45}, W: {form: 'hip', deg: 60}}), ring([-200, -400, 300, 200], 0, 1, 30)]),
      // A gable run whose high end a wing buries: the band's end is at no Ring corner.
      fx('WingBuriesRunEnd', [ring([0, 0, 1000, 500], 0, 1, 30, {S: {form: 'hip', runs: [{from: 100, to: 600, form: 'gable', deg: 45}]}}), ring([400, -300, 700, 0], 0, 1, 30)]),
      // SingleStoreyT with the stem off-centre and wide, so the band's middle is buried and its longest exposed stretch is at one end.
      fx('OffCentreStemBuriesMiddle', [ring([0, 0, 1000, 600], 0, 1, 45, {E: {form: 'gable'}}), ring([1000, 100, 1400, 500], 0, 1, 45)]),
    ];
    const subs: SubRules[] = [SUB_DEFAULT, {...SUB_DEFAULT, buriedEnd: 'adjacentPitch'}, {...SUB_DEFAULT, walkStart: 'exposedMiddle'}];
    for (const f of cases) {
      let first: string | undefined;
      for (const sub of subs) {
        const mark = out.length;
        say(`\n-- sub-rules ${sub.buriedEnd} / ${sub.walkStart}`);
        await describe(f, sub === subs[0] ? ['today', 'A', 'B'] : ['today', 'B'], sub);
        // A sub-rule that builds what the default built is said in one line.
        const tail = out.slice(mark);
        const bText = tail.slice(tail.findIndex(l => l.startsWith('  B:'))).join('\n');
        if (first === undefined) first = bText;
        else if (bText === first) { out.length = mark; say(`-- sub-rules ${sub.buriedEnd} / ${sub.walkStart}: as the default`); }
      }
    }
  },
};

/** A seeded robustness case by its pin key, `s<seed>h<height>/<name>`, or a roster-pitch case by its name. */
function seededCase(key: string): ShellFixture {
  const m = /^s(\d+)h(\d+)\/(.+)$/.exec(key);
  if (!m) {
    const c = RF.rosterPitchCases(SHELL_FIXTURES).find(x => x.name === key);
    if (!c) throw new Error(`no case ${key}`);
    return {...c.fixture, name: key};
  }
  const [s, h, name] = [Number(m[1]), Number(m[2]), m[3]];
  const gen = name.startsWith('SplitCourt') ? RF.randomSplitCourtyardFixtures(s, 40, h) : name.startsWith('Court') ? RF.randomCourtyardFixtures(s, 40, h)
    : name.startsWith('U') ? RF.randomUFixtures(s, 40, h) : RF.randomFixtures(s, 140, h);
  const f = gen.find(x => x.name === name);
  if (!f) throw new Error(`no case ${key}`);
  return {...f, name: key};
}

/**
 *   node run.mjs claimed-band-cases [section]
 *   node run.mjs claimed-band-cases one <key> [<key> ...]   (a corpus case by key, with its Rings, under today, A and B)
 */
export async function main(args: string[]): Promise<void> {
  if (args[0] === 'one') {
    // `far=none`, `caps=uncapped`, `reach=bbox`, `end=adjacentPitch`, `walk=exposedMiddle` choose sub-rules.
    const names: Record<string, keyof SubRules> = {far: 'gabledFar', caps: 'pieceCaps', reach: 'reach', end: 'buriedEnd', walk: 'walkStart'};
    const sub = {...SUB_DEFAULT} as Record<string, string>;
    for (const a of args.slice(1).filter(x => x.includes('=') && !x.includes('/'))) sub[names[a.split('=')[0]]] = a.split('=')[1];
    for (const key of args.slice(1).filter(x => !x.includes('=') || x.includes('/'))) {
      const f = seededCase(key);
      say(`\n${key}: storey height ${f.storeyHeight}; sub-rules ${JSON.stringify(sub)}\n${f.rings.map((r, i) => `  R${i} [${r.rect}] base ${r.baseStorey} storeys ${r.storeys} default ${r.defaultDeg} ${JSON.stringify(r.sides ?? {})}`).join('\n')}`);
      await describe(f, ['today', 'A', 'B'], sub as unknown as SubRules);
    }
    return;
  }
  const which = args[0] ? [args[0]] : Object.keys(SECTIONS);
  for (const k of which) await SECTIONS[k]();
  const dir = path.join(process.env.EXPERIMENT_RESULTS ?? '.', 'claimed-band');
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, `cases-${which.join('-')}.txt`), `${out.join('\n')}\n`);
}
