// The export (spec decision 33): one JSON BuildingShell per fixture, round-tripping exactly.
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {OUT_DIR, shellFileName, writeShells} from '../src/export.ts';
import {SHELL_FIXTURES, fixtureByName} from '../src/fixture.ts';
import {BuildingShell, buildShell} from '../src/shell.ts';

describe('the export (decision 33)', () => {
  it('writes out/<fixture>.json under the app', () => {
    expect(path.basename(OUT_DIR)).toBe('out');
    expect(path.basename(path.dirname(OUT_DIR))).toBe('building-shell');
    expect(shellFileName('Bridge')).toBe('Bridge.json');
  });

  it('writes one file per fixture, each the BuildingShell exactly', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'building-shell-export-'));
    try {
      const fixtures = [fixtureByName('NarrowUpperStorey'), fixtureByName('Overhang')];
      const built = new Map<string, BuildingShell>();
      const written = await writeShells(dir, fixtures, async f => {
        const s = await buildShell(f);
        built.set(f.name, s);
        return s;
      });
      expect(written.map(f => path.basename(f))).toEqual(['NarrowUpperStorey.json', 'Overhang.json']);
      for (const f of fixtures) {
        // Parsed JSON is unknown until the deep equality has shown it is the shell (journal decision 94, N3).
        const back: unknown = JSON.parse(await readFile(path.join(dir, shellFileName(f.name)), 'utf8'));
        const want = built.get(f.name);
        if (!want) throw new Error(`no shell built for ${f.name}`);
        expect(back).toEqual(want);
        expect(Object.keys(want).sort()).toEqual(['cells', 'edges', 'faces', 'fixture', 'netEdges', 'report', 'vertices']);
        expect(Object.keys(want.report).sort()).toEqual(
          ['cheeks', 'conflicts', 'newConventions', 'newEdgeKinds', 'partialCells', 'survivingInternal', 'unclassifiedEdges']);
      }
    } finally {
      await rm(dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('covers the whole roster', () => {
    expect(SHELL_FIXTURES.map(f => shellFileName(f.name))).toHaveLength(11);
  });
});
