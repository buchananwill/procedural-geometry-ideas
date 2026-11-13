// WP-G4.1: digests a claimed-band sweep file (results/claimed-band/sweep-*.txt) into the tables of the findings:
// the fixtures a rule makes worse, with the breakthrough that is today's hip roof set apart, and the pins, F76's 29
// first. Plain node, no build.   node claimed-band-digest.mjs <sweep file name> [list]
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results', 'claimed-band');
const name = process.argv[2];
const text = readFileSync(path.join(DIR, name), 'utf8').split('\n');
const f76 = readFileSync(path.join(DIR, 'f76-extents.txt'), 'utf8').split('\n');
const start = f76.findIndex(l => l.startsWith('pinned keys among them'));
const f76Keys = new Set(f76.slice(start + 1, f76.findIndex((l, i) => i > start && !l.startsWith('  '))).map(l => l.trim().split('\t')[0]));

const out = [];
const say = s => out.push(s);
const pb = s => Number(/\[piece breakthrough ([\d.]+)\]/.exec(s)?.[1] ?? 0);
const strip = s => s.replace(/ \[piece breakthrough [\d.]+\]/, '').replace(/\(-?[\d.]+, -?[\d.]+, -?[\d.]+\)/g, '(...)');

for (const rule of ['A', 'B']) {
  const rows = text.filter(l => l.startsWith(`${rule} | `)).map(l => l.split(' | '));
  if (!rows.length) continue;
  // One row per fixture: its classes, whether any storey's shape changed, its transition and both verdicts.
  const fixtures = new Map();
  for (const [, corpus, key, , cls, shape, tr, v, t] of rows) {
    if (tr === undefined) continue;
    const k = key.split(' = ')[0];
    const f = fixtures.get(k) ?? {corpus, classes: new Set(), shape: false, tr, v, t: t.replace(/^today /, '')};
    f.classes.add(cls);
    f.shape ||= shape !== 'same shape';
    fixtures.set(k, f);
  }
  const tally = new Map();
  const bad = [];
  for (const [k, f] of fixtures) {
    let tr = f.tr;
    // The suite's breakthrough measure reads rises only. Where a rule's only new fault is breakthrough and the roof
    // stood as far above the upper storey today (measured over every gable piece), it is today's, newly seen.
    const onlyBreakthrough = /^breakthrough [\d.]+( \[.*\])?$/.test(f.v);
    if (tr === 'clean>NOT' && onlyBreakthrough && pb(f.v) <= pb(f.t) + 0.05) tr = 'clean>NOT (only breakthrough, as far today)';
    // Likewise the height oracle samples rises only: where a lower storey's hip roof stands through the storey above
    // today, a gable up there that becomes a rise is sampled against it for the first time.
    const conflicts = s => Number(/conflicts (\d+)/.exec(s)?.[1] ?? 0);
    const structural = s => strip(s).split('; ').filter(x => !/^(conflicts|oracle|breakthrough)/.test(x)).map(x => x.replace(/[\d.]+/g, '#')).sort().join(';');
    if (tr === 'not>not WORSE' && /oracle|breakthrough/.test(f.v) && pb(f.t) > 0.05 && pb(f.v) <= pb(f.t) + 0.05 && conflicts(f.v) <= conflicts(f.t) && structural(f.v) === structural(f.t)) {
      tr = 'not>not (only oracle or breakthrough, where today\'s roof stands as far through)';
    }
    tally.set(tr, (tally.get(tr) ?? 0) + 1);
    if (tr === 'clean>NOT' || tr === 'not>not WORSE' || tr === 'built>THROWS') bad.push([k, f, tr]);
  }
  say(`\n## Rule ${rule}: ${fixtures.size} changed fixtures, ${[...fixtures.values()].filter(f => f.shape).length} with a changed shape`);
  for (const [k, n] of [...tally].sort()) say(`  ${k}: ${n}`);
  say(`## Rule ${rule}: worse than today, by class and what is new (fixtures)`);
  const groups = new Map();
  for (const [k, f, tr] of bad) {
    const kinds = s => new Set(strip(s).split('; ').map(x => x.replace(/ \d+(\.\d+)?$/, '').replace(/[\d.]+/g, '#').slice(0, 60)));
    const was = kinds(f.t);
    const news = [...kinds(f.v)].filter(x => !was.has(x));
    const g = `${[...f.classes].sort().join(' , ')} :: ${tr} :: ${news.length ? `new: ${news.join(' + ')}` : 'more of the same kinds'}`;
    const e = groups.get(g) ?? {n: 0, first: k, detail: `${strip(f.v).slice(0, 150)} <- today ${strip(f.t).slice(0, 80)}`};
    e.n++;
    groups.set(g, e);
  }
  for (const [g, e] of [...groups].sort()) say(`  ${e.n}: ${g} | first ${e.first} | ${e.detail}`);

  const pins = text.filter(l => l.startsWith(`PIN ${rule} | `)).map(l => l.split(' | '));
  const short = s => s.replace(/, conflicts \d+/, ', conflicts remain').replace(/\((\d+) to (\d+) lines.*\)/, '($1 to $2 lines)').replace(/\(now throws.*/, '(now throws)');
  const tables = (rowsOf) => {
    const m = new Map();
    for (const [, , , table, plan, fate] of rowsOf) { const k = `${table.replace(/_DEFECTS|GABLE_RISE_/g, '')} | ${plan} | ${short(fate)}`; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m].sort().map(([k, n]) => `  ${n}: ${k}`);
  };
  const isF76 = r => f76Keys.has(r[2].split(' = ')[0]);
  say(`## Rule ${rule}: F76's ${f76Keys.size} pinned keys (${pins.filter(isF76).length} pin rows found)`);
  tables(pins.filter(isF76)).forEach(say);
  if (process.argv[3] === 'list') for (const r of pins.filter(isF76)) say(`    ${r[2].split(' = ')[0]} | ${r[3]} | ${r[5]}`);
  say(`## Rule ${rule}: the other pins (${pins.filter(r => !isF76(r)).length} rows)`);
  tables(pins.filter(r => !isF76(r))).forEach(say);
}
writeFileSync(path.join(DIR, name.replace(/^sweep/, 'digest')), `${out.join('\n')}\n`);
console.log(out.join('\n'));
