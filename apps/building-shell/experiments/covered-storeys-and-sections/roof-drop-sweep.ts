// Does dropping a wholly covered island's roof expose anything? The same fixture through HEAD and through a patched
// tree, three-storey stacks: a lower roof, a covered middle island, a top storey over it.
// Families: `buried` (the covered roof never rises above the storey over it, so the drop is expected to change nothing)
// and `proud` (wide covered islands whose roof stands above the storey over it, with steep lower roofs driving through).
import {appendFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {buildShellDetailed as atHead} from '../../src/shell.ts';
import {buildShellDetailed as withRule} from '@candidate/src/shell.ts';
import type {RingSides, ShellFixture} from '../../src/fixture.ts';
import {Rect, gable as g, ring} from './helpers.ts';

interface Out { ok: boolean; err?: string; cheeks: number; cheekArea: number; unclassified: number; internal: number; maxZ: number; parts: number; closed: boolean; keys: string[] }

async function run(build: typeof atHead, f: ShellFixture): Promise<Out> {
  try {
    const {shell, union} = await build(f);
    const keys = shell.faces.map(x => `${x.tag.kind} s${x.tag.storey} A=${Math.round(x.area)} n=${x.normal.map(v => v.toFixed(2)).join(',')}`).sort();
    const cheekArea = shell.faces.filter(x => x.tag.kind === 'Cheek').reduce((s, x) => s + x.area, 0);
    return {ok: true, cheeks: shell.report.cheeks, cheekArea, unclassified: shell.report.unclassifiedEdges, internal: shell.report.survivingInternal, maxZ: Math.max(...shell.vertices.map(v => v.p[2])), parts: union.parts.length, closed: union.closed, keys};
  } catch (e) {
    return {ok: false, err: (e as Error).message.slice(0, 160), cheeks: 0, cheekArea: 0, unclassified: 0, internal: 0, maxZ: 0, parts: 0, closed: false, keys: []};
  }
}

function diff(a: string[], b: string[]): string[] {
  const m = new Map<string, number>();
  for (const k of a) m.set(k, (m.get(k) ?? 0) - 1);
  for (const k of b) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].filter(([, n]) => n).map(([k, n]) => `${n > 0 ? '+' : ''}${n} ${k}`);
}

const sideForms: Array<[string, RingSides]> = [['hip', {}], ['Wg', {W: g}]];
const top = (mr: Rect, grow: number): Rect => [mr[0] - grow, mr[1] - grow, mr[2] + grow, mr[3] + grow];
const stack = (name: string, lr: Rect, lowDeg: number, ls: RingSides, mr: Rect, midDeg: number, ms: RingSides, topDeg: number, ts: RingSides, grow: number): ShellFixture =>
  ({name, cellSize: 50, storeyHeight: 250, rings: [ring(lr, 0, 1, lowDeg, ls), ring(mr, 1, 1, midDeg, ms), ring(top(mr, grow), 2, 1, topDeg, ts)]});

function* buried(): Generator<ShellFixture> {
  const lowerForms: Array<[string, RingSides]> = [['hip', {}], ['Wg', {W: g}], ['WEg', {W: g, E: g}]];
  const mids: Array<[string, Rect]> = [['inset200', [200, 200, 800, 800]], ['inset300', [300, 300, 700, 700]], ['flushW', [0, 200, 500, 800]], ['flushSW', [0, 0, 500, 500]]];
  for (const lowDeg of [45, 60, 75]) for (const [lf, ls] of lowerForms) for (const [mn, mr] of mids)
    for (const midDeg of [15, 22.5, 30]) for (const [msn, ms] of sideForms)
      for (const topDeg of [22.5, 45]) for (const [tsn, ts] of sideForms)
        for (const grow of [0, 50]) yield stack(`low${lowDeg}${lf}_${mn}_mid${midDeg}${msn}_top${topDeg}${tsn}_grow${grow}`, [0, 0, 1000, 1000], lowDeg, ls, mr, midDeg, ms, topDeg, ts, grow);
}

function* proud(): Generator<ShellFixture> {
  const lowers: Array<[string, Rect]> = [['whole', [0, 0, 2000, 2000]], ['core', [700, 700, 1300, 1300]], ['band', [0, 700, 2000, 1300]]];
  const lowerForms: Array<[string, RingSides]> = [['hip', {}], ['WEg', {W: g, E: g}]];
  const mids: Array<[string, Rect]> = [['inset100', [100, 100, 1900, 1900]], ['flushSW', [0, 0, 1900, 1900]]];
  for (const lowDeg of [22.5, 60, 75]) for (const [ln, lr] of lowers) for (const [lf, ls] of lowerForms) for (const [mn, mr] of mids)
    for (const midDeg of [30, 40]) for (const [msn, ms] of sideForms)
      for (const topDeg of [7.5, 15]) for (const [tsn, ts] of sideForms)
        for (const grow of [0, 50]) yield stack(`low${lowDeg}${ln}${lf}_${mn}_mid${midDeg}${msn}_top${topDeg}${tsn}_grow${grow}`, lr, lowDeg, ls, mr, midDeg, ms, topDeg, ts, grow);
}

export async function main([family]: string[]): Promise<void> {
  const cases = family === 'buried' ? buried() : family === 'proud' ? proud() : null;
  if (!cases) throw new Error('name a family: buried or proud');
  const LOG = path.join(process.env.EXPERIMENT_RESULTS as string, `roof-drop-sweep-${family}.log`);
  writeFileSync(LOG, '');
  const t = {total: 0, bothThrow: 0, headThrowsOnly: 0, ruleThrowsOnly: 0, same: 0, geomChanged: 0, cheeksUp: 0, cheeksDown: 0, unclUp: 0, unclDown: 0, internalUp: 0, notClosed: 0, ruleDidNotFire: 0, maxZUp: 0, maxZDown: 0, casesWithHeadCheeks: 0, casesWithRuleCheeks: 0};
  for (const f of cases) {
    t.total++;
    const h = await run(atHead, f), r = await run(withRule, f);
    if (!h.ok && !r.ok) { t.bothThrow++; continue; }
    if (!h.ok) { t.headThrowsOnly++; appendFileSync(LOG, `HEADTHROW ${f.name} ${h.err}\n`); continue; }
    if (!r.ok) { t.ruleThrowsOnly++; appendFileSync(LOG, `RULETHROW ${f.name} ${r.err}\n`); continue; }
    if (h.parts === r.parts) t.ruleDidNotFire++;
    if (h.cheeks) t.casesWithHeadCheeks++;
    if (r.cheeks) t.casesWithRuleCheeks++;
    const d = diff(h.keys, r.keys);
    if (!r.closed) t.notClosed++;
    if (d.length) t.geomChanged++; else t.same++;
    if (r.cheeks > h.cheeks) t.cheeksUp++;
    if (r.cheeks < h.cheeks) t.cheeksDown++;
    if (r.unclassified > h.unclassified) t.unclUp++;
    if (r.unclassified < h.unclassified) t.unclDown++;
    if (r.internal > h.internal) t.internalUp++;
    if (r.maxZ > h.maxZ + 1e-6) t.maxZUp++;
    if (r.maxZ < h.maxZ - 1e-6) t.maxZDown++;
    if (d.length) appendFileSync(LOG, `DIFF ${f.name} cheeks ${h.cheeks}->${r.cheeks} uncl ${h.unclassified}->${r.unclassified} maxZ ${h.maxZ.toFixed(1)}->${r.maxZ.toFixed(1)} :: ${d.slice(0, 14).join(' | ')}\n`);
  }
  appendFileSync(LOG, `FINAL ${JSON.stringify(t)}\n`);
  console.log(JSON.stringify(t));
}
