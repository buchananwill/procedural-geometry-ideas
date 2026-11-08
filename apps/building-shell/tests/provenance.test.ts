// Spec decision 23 as amended (journal decision 130): every Wall and Gable Cell carries the Ring side its raw wall came
// from, the lowest model index winning; Cells are cut at provenance boundaries; each face lists its Cells' sources.
// The independent check reads the fixture's Ring rectangles here, never the pipeline's spans.
import {describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {EXPORTED_FIXTURES, RING_SIDES, ShellFixture, fixtureByName, ring, storeyRings} from '../src/fixture.ts';
import type {CellSource} from '../src/provenance.ts';
import {ringSideLines} from '../src/ring-forms.ts';
import type {BuildingShell} from '../src/shell.ts';
import {withFileModelIndices} from '../src/wire/dump.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {randomFixtures} from './robustness-fixtures.ts';
import {memoBuilds, shellFixture} from './test-builds.ts';
import {ASYMMETRIC_L, scrambled} from './wire-round-trip-cases.ts';

const build = memoBuilds();
const shellOf = async (f: ShellFixture): Promise<BuildingShell> => (await build(f)).shell;

/** A Ring side on a face's plane at its storey, facing out the face's way, with its span along the face's `s` axis. */
interface SideOnPlane { source: CellSource; lo: number; hi: number }

/** Independently: every Ring side of the face's storey on its plane, facing out its way, lowest model index first. */
function sidesOnPlane(f: ShellFixture, shell: BuildingShell, face: number): SideOnPlane[] {
  const {normal, offset, tag} = shell.faces[face];
  const alongY = Math.abs(normal[0]) > Math.abs(normal[1]);
  const outward = alongY ? normal[0] : normal[1];
  return storeyRings(f, tag.storey).flatMap(({index, ring}) => RING_SIDES.flatMap((side, k) => {
    const l = ringSideLines(ring.rect)[side];
    const onPlane = l.axis === (alongY ? 'x' : 'y') && Math.abs(l.at - offset * outward) <= SHELL_TOLERANCE_CM;
    const facing = (side === 'E' || side === 'N') === outward > 0;
    return onPlane && facing ? [{source: {ringModelIndex: index, side: k}, lo: l.lo, hi: l.hi}] : [];
  }));
}

/** A Cell's corners along the face's `s` axis: world y on a face facing ±x, world x on one facing ±y. */
const cellS = (shell: BuildingShell, cell: number): number[] => {
  const c = shell.cells[cell], n = shell.faces[c.face].normal;
  return c.polygon.map(p => (Math.abs(n[0]) > Math.abs(n[1]) ? p[1] : p[0]));
};

/**
 * Every Cell's provenance against the independent reading: a Wall Cell lies within its source side's span and no
 * lower-index side on its plane holds its middle; a Gable Cell's source lies on its plane; every other Cell has none;
 * each face lists its Cells' distinct sources, ascending.
 */
function provenanceViolations(f: ShellFixture, shell: BuildingShell): string[] {
  const out: string[] = [];
  const tol = SHELL_TOLERANCE_CM;
  for (const c of shell.cells) {
    const kind = shell.faces[c.face].tag.kind;
    if (kind !== 'Wall' && kind !== 'Gable') {
      if (c.source !== null) out.push(`cell ${c.id} on a ${kind} face has source ${JSON.stringify(c.source)}`);
      continue;
    }
    if (!c.source) { out.push(`cell ${c.id} on a ${kind} face has no source`); continue; }
    const sides = sidesOnPlane(f, shell, c.face);
    const mine = sides.find(x => x.source.ringModelIndex === c.source?.ringModelIndex && x.source.side === c.source?.side);
    if (!mine) { out.push(`cell ${c.id}'s source ${JSON.stringify(c.source)} lies on no side of its plane`); continue; }
    if (kind === 'Gable') continue;
    const s = cellS(shell, c.id);
    const lo = Math.min(...s), hi = Math.max(...s), mid = s.reduce((t, x) => t + x, 0) / s.length;
    if (lo < mine.lo - tol || hi > mine.hi + tol) out.push(`cell ${c.id} spans ${lo} to ${hi}, beyond its source side's ${mine.lo} to ${mine.hi}`);
    const better = sides.find(x => x.source.ringModelIndex < mine.source.ringModelIndex && x.lo - tol <= mid && mid <= x.hi + tol);
    if (better) out.push(`cell ${c.id} takes Ring ${mine.source.ringModelIndex}, where Ring ${better.source.ringModelIndex}'s side holds it`);
  }
  for (const face of shell.faces) {
    const keys = [...new Set(shell.cells.filter(c => c.face === face.id && c.source).map(c => `${c.source?.ringModelIndex}|${c.source?.side}`))];
    const want = keys.map(k => k.split('|').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([ringModelIndex, side]) => ({ringModelIndex, side}));
    if (JSON.stringify(face.sources) !== JSON.stringify(want)) out.push(`face ${face.id} lists sources ${JSON.stringify(face.sources)}, its Cells ${JSON.stringify(want)}`);
  }
  return out;
}

describe('wall provenance (journal decision 130, spec decision 23 as amended)', () => {
  it.each(EXPORTED_FIXTURES.map(f => [f.name, f] as const))('%s: every Cell carries its raw wall\'s Ring side, read independently', async (_, f) => {
    expect(provenanceViolations(f, await shellOf(f))).toEqual([]);
  });

  // Random fixtures on a 10 cm grid put Ring corners off the 50 cm lattice, so Cells are cut at provenance boundaries.
  it.each(randomFixtures(1, 40, 250).map(f => [f.name, f] as const))('random %s: every Cell carries one source, and none spans a boundary', async (_, f) => {
    expect(provenanceViolations(f, await shellOf(f))).toEqual([]);
  });

  /** Every source a fixture's Cells on one wall plane carry, by plane. */
  const sourcesOn = (shell: BuildingShell, kind: string, normal: [number, number, number], offset: number): CellSource[] =>
    shell.faces.filter(x => x.tag.kind === kind && x.normal.every((v, i) => Math.abs(v - normal[i]) < 1e-9) && Math.abs(x.offset - offset) <= SHELL_TOLERANCE_CM)
      .flatMap(x => x.sources);

  it("FlushRingConflict: y = 0 is Ring 0's S side over x 0 to 500 and Ring 1's over 500 to 1000; swapped, the indices follow", async () => {
    expect(sourcesOn(await shellOf(fixtureByName('FlushRingConflict')), 'Wall', [0, -1, 0], 0)).toEqual([{ringModelIndex: 0, side: 0}, {ringModelIndex: 1, side: 0}]);
    expect(sourcesOn(await shellOf(fixtureByName('FlushRingConflictSwapped')), 'Wall', [0, -1, 0], 0)).toEqual([{ringModelIndex: 0, side: 0}, {ringModelIndex: 1, side: 0}]);
  });

  it("OverlapRingConflict: the E sides coincide over y 0 to 400, and the lower index, Ring 0, wins there; swapped, Ring 0 holds the whole wall", async () => {
    expect(sourcesOn(await shellOf(fixtureByName('OverlapRingConflict')), 'Wall', [1, 0, 0], 1000)).toEqual([{ringModelIndex: 0, side: 1}, {ringModelIndex: 1, side: 1}]);
    expect(sourcesOn(await shellOf(fixtureByName('OverlapRingConflictSwapped')), 'Wall', [1, 0, 0], 1000)).toEqual([{ringModelIndex: 0, side: 1}]);
  });

  it("SingleStoreyT: the Gable on x = 1000 stands on Ring 0's E side, side 1", async () => {
    expect(sourcesOn(await shellOf(fixtureByName('SingleStoreyT')), 'Gable', [1, 0, 0], 1000)).toEqual([{ringModelIndex: 0, side: 1}]);
  });
});

describe("a shell from input@1 names the file's own Rings and sides (journal decisions 140's Q3 note and 156, F1)", () => {
  it.each(['FlushRingConflict', 'OverlapRingConflictSwapped', 'Courtyard'])('%s: every source maps back to the Ring and the side slot it came from in the file', async name => {
    const f = fixtureByName(name);
    const file = scrambled(f);
    const read = readInput(JSON.parse(JSON.stringify(file)), name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    const shell = withFileModelIndices(await shellOf(read.fixture), read);
    // The scrambled file gives the fixture's Ring i the model index 7 + 13 i, and starts it at corner (i + 1) mod 4, so
    // its compass side k is the file's slot (k - i - 1) mod 4.
    const authored = await shellOf(f);
    const slot = (ring: number, k: number): number => (((k - ring - 1) % 4) + 4) % 4;
    expect(shell.cells.map(c => c.source)).toEqual(authored.cells.map(c => c.source && {ringModelIndex: 7 + 13 * c.source.ringModelIndex, side: slot(c.source.ringModelIndex, c.source.side)}));
  });

  // The gate (decision 156, F1): Ring 0 of the asymmetric L, written starting at its SE corner, holds its W gable at
  // file side 2, not compass side 3.
  it("the rotated L's W gable reports the file's side 2", async () => {
    const w = writeInput(ASYMMETRIC_L);
    const r = w.rings[0];
    r.corners = [...r.corners.slice(1), ...r.corners.slice(0, 1)];
    r.sides = [...r.sides.slice(1), ...r.sides.slice(0, 1)];
    const read = readInput(JSON.parse(JSON.stringify(w)), 'RotatedL');
    if (!read.ok) throw new Error(read.errors.join('; '));
    const shell = withFileModelIndices(await shellOf(read.fixture), read);
    expect(shell.faces.filter(x => x.tag.kind === 'Gable').map(x => x.sources)).toEqual([[{ringModelIndex: 0, side: 2}]]);
  });
});

/**
 * Journal decision 156, F9: the T probe. SingleStoreyT's bar authored as two Rings split along y at 200, both gabling
 * their E sides; the stem buries x = 1000 from y 150 to 350. The visible stretches are Ring 0's from 0 to 150 and Ring
 * 1's from 350 to 500. The Gable's band reaches over the buried stretch, and its Cells there take the nearest visible
 * stretch: the gap from 150 to 350 splits at its middle, 250, not at the Rings' split, 200.
 */
describe('provenance from visible stretches only (journal decision 156, F9)', () => {
  const T = shellFixture('TProbeSplit200', [
    ring([0, 0, 1000, 200], 0, 1, 45, {E: {form: 'gable'}}), ring([0, 200, 1000, 500], 0, 1, 45, {E: {form: 'gable'}}), ring([1000, 150, 1400, 350], 0, 1, 45),
  ]);

  it("splits the buried stretch's Gable Cells at the gap's middle: Ring 0 below y = 250, Ring 1 above", async () => {
    const shell = await shellOf(T);
    const gable = shell.faces.find(x => x.tag.kind === 'Gable' && Math.abs(x.normal[0] - 1) < 1e-9 && Math.abs(x.offset - 1000) <= SHELL_TOLERANCE_CM);
    if (!gable) throw new Error('no Gable on x = 1000');
    const cells = shell.cells.filter(c => c.face === gable.id);
    expect(cells.some(c => Math.min(...cellS(shell, c.id)) >= 200 - SHELL_TOLERANCE_CM && Math.max(...cellS(shell, c.id)) <= 250 + SHELL_TOLERANCE_CM)).toBe(true);
    for (const c of cells) {
      const s = cellS(shell, c.id), mid = s.reduce((t, x) => t + x, 0) / s.length;
      expect(c.source, `cell over y ${Math.min(...s)} to ${Math.max(...s)}`).toEqual({ringModelIndex: mid < 250 ? 0 : 1, side: 1});
    }
  });

  it('keeps every Cell on its independent reading', async () => {
    expect(provenanceViolations(T, await shellOf(T))).toEqual([]);
  });
});
