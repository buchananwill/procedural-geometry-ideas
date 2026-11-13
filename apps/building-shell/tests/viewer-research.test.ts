// WP-V1: the roof-gable research cases (`src/roof/cases.ts`) as single-storey shell fixtures for the viewer's selector.
// The conversion is exact for every case it converts (each wall keeps its form and pitch at every point), and a case
// Rings and runs cannot express is left out with its reason. The research verdicts (pass / cheek / fail) are not asserted.
import {describe, expect, it} from 'vitest';
import {EXPORTED_FIXTURES, RISE_FIXTURES} from '../src/fixture.ts';
import type {ShellFixture} from '../src/fixture.ts';
import {CASES} from '../src/roof/cases.ts';
import {bboxOf, buildFromRects, unionLoops} from '../src/roof/model.ts';
import type {Building, Pt, Rect} from '../src/roof/model.ts';
import {tanDeg} from '../src/ring-forms.ts';
import {buildShell} from '../src/shell.ts';
import {validate} from '../src/viewer/draft.ts';
import {
  RESEARCH_DEFAULT_DEG, RESEARCH_ENTRIES, RESEARCH_FIXTURES, RESEARCH_FOOTPRINTS, convertResearchCase, courtyardRects, degOfTan,
  researchMismatches, researchName, researchNote,
} from '../src/viewer/research-cases.ts';
import type {ResearchEntry} from '../src/viewer/research-cases.ts';

const caseOf = (id: string) => {
  const c = CASES.find(x => x.id === id);
  if (!c) throw new Error(`no research case ${id}`);
  return c;
};

const entryOf = (id: string): ResearchEntry => {
  const e = RESEARCH_ENTRIES.find(x => x.id === id);
  if (!e) throw new Error(`no research entry ${id}`);
  return e;
};

const fixtureOf = (id: string): ShellFixture => {
  const c = entryOf(id).conversion;
  if (!c.ok) throw new Error(`research case ${id} is left out: ${c.reason}`);
  return c.fixture;
};

const ends = (b: Building): string[] => b.walls.map(w => `${w.a.x},${w.a.y}>${w.b.x},${w.b.y}`);
const pointSet = (loop: Pt[]): string[] => loop.map(p => `${p.x},${p.y}`).sort();
const corners = (r: Rect): string[] => pointSet([{x: r[0], y: r[1]}, {x: r[2], y: r[1]}, {x: r[2], y: r[3]}, {x: r[0], y: r[3]}]);

/** The cases left out, and why: monopitch walls, two hip pitches on one Ring side, and an authored corner cut. */
const LEFT_OUT: Readonly<Record<string, RegExp>> = {
  '4g': /Ring 0 side S's union walls are hips at 45 and 30 degrees/,
  '5a': /monopitch/, '5b': /monopitch/, '5c': /monopitch/, '5d': /monopitch/, '5e': /monopitch/,
  '9b': /cut it forces at a corner/,
};

/** The converted cases whose fixture the wire refuses for a pitch outside [7, 75] degrees: built in memory, refused as a draft. */
const WIRE_PITCH_REFUSED = ['7e', '7f'];

describe('the research footprints, restated from cases.ts', () => {
  it('name every research case, and only those', () => {
    expect(CASES).toHaveLength(53);
    expect(Object.keys(RESEARCH_FOOTPRINTS).sort()).toEqual(CASES.map(c => c.id).sort());
  });

  it.each(CASES.filter(c => RESEARCH_FOOTPRINTS[c.id].kind === 'rects').map(c => [c.id] as const))('%s: the rects trace the case\'s own walls', id => {
    const f = RESEARCH_FOOTPRINTS[id];
    if (f.kind !== 'rects') throw new Error('not a rects case');
    expect(ends(buildFromRects(f.rects, []))).toEqual(ends(caseOf(id).build()));
  });

  it.each(['9a', '9c', '9d'])('%s: the courtyard\'s outer and inner rects are the case\'s loops, and its four Rings trace them', id => {
    const f = RESEARCH_FOOTPRINTS[id];
    if (f.kind !== 'courtyard') throw new Error('not a courtyard case');
    const comp = caseOf(id).build().comps[0];
    expect(pointSet(comp.outer)).toEqual(corners(f.outer));
    expect(pointSet(comp.holes[0])).toEqual(corners(f.inner));
    // The Rings' union loops keep the Ring corners along them, so each loop is read as the rectangle it bounds.
    const loops = unionLoops(courtyardRects(f));
    for (const l of loops) expect(l.every(p => p.x === bboxOf(l).x0 || p.x === bboxOf(l).x1 || p.y === bboxOf(l).y0 || p.y === bboxOf(l).y1)).toBe(true);
    const asRect = (l: Pt[]): Rect => [bboxOf(l).x0, bboxOf(l).y0, bboxOf(l).x1, bboxOf(l).y1];
    expect(loops.map(asRect).sort()).toEqual([f.outer, f.inner].sort());
  });

  it('9b, left out, is 9a\'s annulus with another cut', () => {
    const a = caseOf('9a').build().comps[0], b = caseOf('9b').build().comps[0];
    expect(pointSet(b.outer)).toEqual(pointSet(a.outer));
    expect(pointSet(b.holes[0])).toEqual(pointSet(a.holes[0]));
  });
});

describe('the research conversion', () => {
  it('leaves out exactly 4g, 5a to 5e and 9b, each with its reason, and converts the other 46', () => {
    const out = RESEARCH_ENTRIES.filter(e => !e.conversion.ok);
    expect(out.map(e => e.id)).toEqual(Object.keys(LEFT_OUT));
    for (const e of out) if (!e.conversion.ok) expect(e.conversion.reason).toMatch(LEFT_OUT[e.id]);
    expect(RESEARCH_FIXTURES).toHaveLength(46);
  });

  it.each(RESEARCH_ENTRIES.filter(e => e.conversion.ok).map(e => [e.id] as const))('%s is exact: storey 0 has every wall in the case\'s form and pitch at every point', id => {
    const f = fixtureOf(id);
    expect(f.rings.every(r => r.baseStorey === 0 && r.storeys === 1 && r.defaultDeg === RESEARCH_DEFAULT_DEG)).toBe(true);
    const fp = RESEARCH_FOOTPRINTS[id];
    expect(f.rings.map(r => r.rect)).toEqual(fp.kind === 'rects' ? fp.rects : fp.kind === 'courtyard' ? courtyardRects(fp) : []);
    expect(researchMismatches(caseOf(id).build(), f)).toEqual([]);
  });

  it('the exactness check catches a run moved or a pitch changed', () => {
    const f = fixtureOf('2b');
    const moved: ShellFixture = {...f, rings: f.rings.map((r, i) => (i === 0 ? {...r, sides: {E: {form: 'hip', runs: [{from: 0, to: 100, form: 'gable', deg: 45}]}}} : r))};
    expect(researchMismatches(caseOf('2b').build(), moved).length).toBeGreaterThan(0);
    const g = fixtureOf('7c');
    const repitched: ShellFixture = {...g, rings: g.rings.map(r => ({...r, sides: {...r.sides, S: {form: 'hip', deg: 31}}}))};
    expect(researchMismatches(caseOf('7c').build(), repitched).length).toBeGreaterThan(0);
  });

  it('writes a gable over part of a side as a run, and a gable over every exposed stretch of a side as the side\'s form', () => {
    // 2b: only the south segment of x = 1000 is gabled, a run of the main Ring's E side; the stem buries [150, 350].
    expect(fixtureOf('2b').rings[0].sides).toEqual({E: {form: 'hip', runs: [{from: 0, to: 150, form: 'gable', deg: 45}]}});
    // 2a: both segments either side of the stem are gabled, so the side is, as SingleStoreyT has it.
    expect(fixtureOf('2a').rings[0].sides).toEqual({E: {form: 'gable'}});
    // 8b: the arm's run of y = 0 is the arm Ring's whole S side.
    expect(fixtureOf('8b').rings.map(r => r.sides)).toEqual([{}, {S: {form: 'gable'}}]);
    // 4b: the middle segment of x = 1000 between the two wings.
    expect(fixtureOf('4b').rings[0].sides).toEqual({E: {form: 'hip', runs: [{from: 150, to: 350, form: 'gable', deg: 45}]}});
  });

  it('carries a pitch given by degrees exactly, and one given by tangent through its arctangent', () => {
    expect(degOfTan(tanDeg(30))).toBe(30);
    expect(degOfTan(1)).toBe(45);
    expect(fixtureOf('7c').rings[0].sides?.S).toEqual({form: 'hip', deg: 30});
    const n = fixtureOf('7a').rings[0].sides?.N;
    expect(n?.form).toBe('hip');
    expect(tanDeg(n?.deg ?? 0)).toBeCloseTo(0.5, 12);
  });

  it('names each fixture research-<id>, apart from every roster name', () => {
    expect(RESEARCH_FIXTURES.map(f => f.name)).toEqual(RESEARCH_ENTRIES.filter(e => e.conversion.ok).map(e => researchName(e.id)));
    const roster = new Set([...EXPORTED_FIXTURES, ...RISE_FIXTURES].map(f => f.name));
    expect(RESEARCH_FIXTURES.filter(f => roster.has(f.name))).toEqual([]);
  });

  it('refuses a case with no footprint rather than guess one', () => {
    expect(convertResearchCase(caseOf('1a'), undefined)).toEqual({ok: false, reason: 'no footprint is restated for it'});
  });

  it('notes a courtyard as placed by the pipeline, a left-out case with its reason', () => {
    expect(researchNote(entryOf('9a'))).toMatch(/pipeline places the cut/);
    expect(researchNote(entryOf('5a'))).toMatch(/Left out: .*monopitch/);
    expect(researchNote(entryOf('2b'))).toMatch(/^Roof-gable research case 2b \(2 T\): T, only the south segment gabled/);
  });
});

describe('the converted research fixtures in the viewer', () => {
  it.each(RESEARCH_FIXTURES.map(f => [f.name, f] as const))('%s passes the wire, so "Edit" gives a valid draft, or is refused for its pitch', (name, f) => {
    const v = validate(f);
    const refused = WIRE_PITCH_REFUSED.map(researchName).includes(name);
    expect(v.ok).toBe(!refused);
    if (!v.ok) expect(v.errors.join('\n')).toMatch(/outside \[7, 75\]/);
  });

  it.each(RESEARCH_FIXTURES.map(f => [f.name, f] as const))('%s builds', async (_, f) => {
    const s = await buildShell(f);
    expect(s.faces.length).toBeGreaterThan(0);
  });
});
