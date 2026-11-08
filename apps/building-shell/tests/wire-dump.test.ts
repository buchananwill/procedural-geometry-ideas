// Journal decision 140, F6 and F9: a playtest dump is `<subject>.input.json` plus an optional `<subject>.output.json`.
// The output (a stand-in in canonical form until the port's structs exist) is validated at its boundary and diffed in
// full, or, with no edge ends, as the legacy baseline.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {BuildingShell, buildShell} from '../src/shell.ts';
import {diffReportLines} from '../src/wire/canonical.ts';
import {readOutput, writeOutput} from '../src/wire/canonical-output-schema.ts';
import {dumpReport, listDumps} from '../src/wire/dump.ts';
import {AdaptedInput, readInput, writeInput} from '../src/wire/input-adapter.ts';
import {MutableJson, mutableJson} from './wire-json.ts';
import {expectBaselineShape} from './wire-report-shape.ts';

let shell: BuildingShell;
let adapted: AdaptedInput;
beforeAll(async () => {
  const f = fixtureByName('SingleStoreyT');
  const r = readInput(writeInput(f), f.name);
  if (!r.ok) throw new Error(r.errors.join('; '));
  adapted = r;
  shell = await buildShell(r.fixture);
}, 60_000);

/** An output as JSON, so a test can change it freely. */
const outputJson = (): MutableJson => mutableJson(writeOutput('cpp-port', shell));

describe('the dump listing', () => {
  it('pairs each input with the output sharing its basename, and names every stray JSON', () => {
    expect(listDumps(['A.input.json', 'A.output.json', 'B.input.json', 'C.output.json', 'D.json', 'notes.txt'])).toEqual({
      dumps: [{subject: 'A', input: 'A.input.json', output: 'A.output.json'}, {subject: 'B', input: 'B.input.json'}],
      strays: ['C.output.json', 'D.json'],
    });
  });

  it('refuses an empty subject and a suffix in the wrong case, as strays (decision 143, F7)', () => {
    expect(listDumps(['.input.json', '.output.json', 'E.Input.json', 'F.input.JSON', 'H.output.input.json'])).toEqual({
      dumps: [{subject: 'H.output', input: 'H.output.input.json'}],
      strays: ['.input.json', '.output.json', 'E.Input.json', 'F.input.JSON'],
    });
  });
});

describe('a dump with an output', () => {
  it('diffs in full and finds nothing when the output is this engine\'s own shell', () => {
    const r = dumpReport('T', adapted, shell, outputJson());
    if ('ok' in r) throw new Error(r.errors.join('; '));
    expect(r.mode === 'full' && r.same).toBe(true);
    expect(r.engines).toEqual(['prototype @proc-geo/building-shell', 'cpp-port']);
  });

  it('shows a moved edge end', () => {
    const o = outputJson();
    o.edges[0].b.x += 1;
    const r = dumpReport('T', adapted, shell, o);
    if ('ok' in r) throw new Error(r.errors.join('; '));
    expect(diffReportLines(r).filter(l => l.includes('edge only in'))).toHaveLength(2);
  });

  it('runs the legacy baseline when no edge carries ends, labelled as a baseline', () => {
    const o = outputJson();
    for (const e of o.edges) { delete e.a; delete e.b; }
    for (const f of o.faces) delete f.perimeter;
    const r = dumpReport('T', adapted, shell, o);
    if ('ok' in r) throw new Error(r.errors.join('; '));
    if (r.mode !== 'baseline') throw new Error(`expected a baseline, got ${r.mode}`);
    console.log(diffReportLines(r).join('\n')); // decision 143, F6: printed, never discarded
    expectBaselineShape(r);
    expect(diffReportLines(r)).toEqual(['T: BASELINE against cpp-port, not a pass or a fail']);
  });

  it('reports a baseline difference in faces and in edge-kind counts', () => {
    const o = outputJson();
    for (const e of o.edges) { delete e.a; delete e.b; }
    o.faces.pop();
    o.edges[0].kind = 'Unclassified';
    const r = dumpReport('T', adapted, shell, o);
    if ('ok' in r || r.mode !== 'baseline') throw new Error('expected a baseline');
    expectBaselineShape(r);
    expect(r.diff.facesOnlyA).toHaveLength(1);
    expect(r.diff.edgeKindCounts.map(c => c.kind)).toContain('Unclassified');
  });

  it('refuses an output whose edges carry ends only in part', () => {
    const o = outputJson();
    delete o.edges[0].a;
    delete o.edges[0].b;
    expect(readOutput(o)).toEqual({ok: false, errors: [`1 of ${o.edges.length} edges carry no ends: an output's edges carry ends all or none (journal decision 140)`]});
  });

  it('validates kinds into ShellKind and EdgeKind at the boundary (decision 138, B6)', () => {
    const o = outputJson();
    o.faces[0].kind = 'Soffit';
    o.edges[0].kind = 'Gutter';
    const r = readOutput(o);
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.errors.map(e => e.split(':')[0])).toEqual(['faces.0.kind', 'edges.0.kind']);
  });
});
