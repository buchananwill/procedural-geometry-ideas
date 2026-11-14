// Journal decisions 260 to 262 (WP-C2): a fully internal Ring is dropped from the solve, and the shell's report warns
// that it was. A Ring is fully internal when, on every storey of its extent, its footprint lies within the union of the
// other Rings kept on that storey; the Rings are tested last first, each against those still kept. A dropped Ring keeps
// its index, its side settings go with it, and a file round trip keeps it.
import {describe, expect, it} from 'vitest';
import {FixtureRing, RingSides, ShellFixture, internalRings, rectWithinUnion, ring, storeyRings, storeysOf} from '../src/fixture.ts';
import type {Rect} from '../src/roof/model.ts';
import {storeyLoops, unionWallExtents} from '../src/ring-forms.ts';
import {BuildingShell, buildShellDetailed, droppedRingsWarning} from '../src/shell.ts';
import {storeyForms} from '../src/storey.ts';
import {withFileModelIndices} from '../src/wire/dump.ts';
import {readInput, writeInput} from '../src/wire/input-adapter.ts';
import {jutCutFixtures} from './robustness-fixtures.ts';
import {invariantViolations} from './shell-invariants.ts';
import {shellFixture} from './test-builds.ts';
import {scrambled, sparseModelIndex} from './wire-round-trip-cases.ts';

const box = (rect: Rect, baseStorey = 0, storeys = 1, sides: RingSides = {}): FixtureRing => ring(rect, baseStorey, storeys, 45, sides);
const probe = (...rings: FixtureRing[]): ShellFixture => shellFixture('InternalRingProbe', rings);

/** Every Ring of storey `n` of `f`, the dropped ones included: what the solve read before the drop. */
const authoredRings = (f: ShellFixture, n: number) =>
  f.rings.flatMap((r, index) => (r.baseStorey <= n && n < r.baseStorey + r.storeys ? [{index, ring: r}] : []));

describe('rectWithinUnion: exact containment of a rectangle in a union of rectangles', () => {
  it('holds a rectangle covered by two that meet along a line, and not one with a gap between them however thin', () => {
    expect(rectWithinUnion([0, 0, 1000, 400], [[0, 0, 500, 400], [500, 0, 1000, 400]])).toBe(true);
    expect(rectWithinUnion([0, 0, 1000, 400], [[0, 0, 500, 400], [500 + 1 / 1024, 0, 1000, 400]])).toBe(false);
    expect(rectWithinUnion([0, 0, 1000, 400], [[0, 0, 1000, 200], [0, 200, 600, 400], [600, 200, 1000, 400]])).toBe(true);
    expect(rectWithinUnion([0, 0, 1000, 400], [[0, 0, 1000, 200], [0, 200, 600, 400], [650, 200, 1000, 400]])).toBe(false);
  });

  it('holds a rectangle in itself, and not in nothing', () => {
    expect(rectWithinUnion([0, 0, 100, 100], [[0, 0, 100, 100]])).toBe(true);
    expect(rectWithinUnion([0, 0, 100, 100], [])).toBe(false);
  });
});

describe('internalRings: the rule (journal decisions 261 and 262)', () => {
  it('drops a Ring inside one other Ring, whichever comes first', () => {
    expect(internalRings(probe(box([0, 0, 1000, 400]), box([200, 0, 600, 300])))).toEqual([1]);
    expect(internalRings(probe(box([200, 0, 600, 300]), box([0, 0, 1000, 400])))).toEqual([0]);
  });

  it('drops a Ring that lies only within the union of several, no one of them holding it', () => {
    const halves: Rect[] = [[0, 0, 500, 400], [500, 0, 1000, 400]];
    for (const h of halves) expect(rectWithinUnion([0, 0, 1000, 400], [h])).toBe(false);
    expect(internalRings(probe(box(halves[0]), box(halves[1]), box([0, 0, 1000, 400])))).toEqual([2]);
  });

  it('keeps a Ring inside another in plan that stands taller', () => {
    expect(internalRings(probe(box([0, 0, 1000, 400]), box([200, 0, 600, 300], 0, 2)))).toEqual([]);
    expect(internalRings(probe(box([0, 0, 1000, 400], 1, 1), box([200, 0, 600, 300], 0, 2)))).toEqual([]);
  });

  it('keeps a Ring covered on some storeys of its extent only, and drops it once every storey is covered', () => {
    const lower = box([0, 0, 1000, 400], 0, 1), upper = box([0, 0, 1000, 400], 2, 1), tall = box([200, 0, 600, 300], 0, 3);
    expect(internalRings(probe(lower, upper, tall))).toEqual([]);
    expect(internalRings(probe(lower, upper, tall, box([0, 0, 1000, 400], 1, 1)))).toEqual([2]);
  });

  it('drops the later of two identical Rings', () => {
    const r = box([0, 0, 1000, 400]);
    expect(internalRings(probe(r, {...r}))).toEqual([1]);
    expect(internalRings(probe(box([1000, 0, 1300, 400]), r, {...r}))).toEqual([2]);
  });

  it('drops exactly one of two Rings that each lie within the union of the rest with the other, the later', () => {
    // X and Y stand out of A and B in depth, so neither is within them; A lies within X and B, B within A and Y, and
    // neither within X and Y alone, which leave x 400 to 600 open.
    const X = box([0, -100, 400, 400]), Y = box([600, 0, 1000, 500]), A = box([0, 0, 700, 400]), B = box([300, 0, 1000, 400]);
    expect(rectWithinUnion(A.rect, [X.rect, B.rect])).toBe(true);
    expect(rectWithinUnion(B.rect, [A.rect, Y.rect])).toBe(true);
    expect(rectWithinUnion(A.rect, [X.rect, Y.rect])).toBe(false);
    expect(rectWithinUnion(B.rect, [X.rect, Y.rect])).toBe(false);
    expect(internalRings(probe(X, Y, A, B))).toEqual([3]);
    expect(internalRings(probe(X, Y, B, A))).toEqual([3]);
  });

  it('drops none of a building with no internal Ring', () => {
    expect(internalRings(probe(box([0, 0, 500, 400]), box([400, 0, 900, 400]), box([100, 100, 300, 300], 1, 1)))).toEqual([]);
  });
});

describe('the pipeline drops a fully internal Ring and warns that it did', () => {
  // Ring 0 gables its S side over x 0 to 500 and lies wholly inside Ring 1, a hip.
  const f = probe(box([0, 0, 500, 400], 0, 1, {S: {form: 'gable'}}), box([0, 0, 1000, 400]));

  it("leaves the dropped Ring out of every storey's Rings, every other Ring keeping its own index", () => {
    expect(storeyRings(f, 0).map(r => r.index)).toEqual([1]);
    expect(storeysOf(f)).toEqual([0]);
  });

  it("drops the Ring's side settings with it: its gable won the S wall over x 0 to 500, and is gone", async () => {
    const authored = unionWallExtents(authoredRings(f, 0), storeyLoops(f.rings.map(r => r.rect)));
    const south = (ws: typeof authored) => ws.find(w => w.line.axis === 'y' && w.line.at === 0)?.extents.map(e => [e.ring, e.form, e.lo, e.hi]);
    expect(south(authored)).toEqual([[0, 'gable', 0, 500], [1, 'hip', 500, 1000]]);
    const kept = storeyRings(f, 0);
    expect(south(unionWallExtents(kept, storeyLoops(kept.map(r => r.ring.rect))))).toEqual([[1, 'hip', 0, 1000]]);
    expect(storeyForms(kept).walls.every(w => w.form === 'hip' && !w.rises?.length)).toBe(true);
    const {shell} = await buildShellDetailed(f);
    expect(shell.faces.filter(x => x.tag.kind === 'Gable')).toEqual([]);
  });

  it('names the dropped Ring by its own index in the report and Ring 1 by its own in the provenance', async () => {
    const b = await buildShellDetailed(f);
    expect(b.shell.report.droppedRings).toEqual([0]);
    const sources = new Set(b.shell.cells.flatMap(c => (c.source ? [c.source.ringModelIndex] : [])));
    expect([...sources]).toEqual([1]);
    expect(invariantViolations(b, {genus: [0], cheeks: 0})).toEqual([]);
  });

  it('warns in words, naming each dropped Ring', () => {
    expect(droppedRingsWarning([])).toBeNull();
    expect(droppedRingsWarning([0])).toBe('Ring 0 is fully internal and dropped from the solve: it builds nothing');
    expect(droppedRingsWarning([1, 3, 4])).toBe('Rings 1, 3 and 4 are fully internal and dropped from the solve: they build nothing');
  });

  it('keeps the dropped Ring through a file round trip, and names it by the file\'s own model index', async () => {
    const read = readInput(JSON.parse(JSON.stringify(writeInput(f))), f.name);
    if (!read.ok) throw new Error(read.errors.join('; '));
    expect(read.fixture.rings.map(r => [r.rect, r.baseStorey, r.storeys])).toEqual(f.rings.map(r => [r.rect, r.baseStorey, r.storeys]));
    expect(read.fixture.rings[0].sides?.S?.form).toBe('gable');
    const again = readInput(JSON.parse(JSON.stringify(writeInput(read.fixture))), f.name);
    if (!again.ok) throw new Error(again.errors.join('; '));
    expect(again.fixture).toEqual(read.fixture);
    expect((await buildShellDetailed(read.fixture)).shell.report.droppedRings).toEqual([0]);
    // A file listing the Rings in reverse model order, under sparse model indices: the report names the file's own.
    const sparse = readInput(JSON.parse(JSON.stringify(scrambled(f))), f.name);
    if (!sparse.ok) throw new Error(sparse.errors.join('; '));
    const shell = withFileModelIndices((await buildShellDetailed(sparse.fixture)).shell, sparse);
    expect(shell.report.droppedRings).toEqual([sparseModelIndex(0)]);
  });

  it('reports no dropped Ring for a building with none', async () => {
    expect((await buildShellDetailed(probe(box([0, 0, 500, 400]), box([400, 0, 900, 400])))).shell.report.droppedRings).toEqual([]);
  });
});

describe('CourtyardJutCut and CourtyardJutCutSwapped (journal decision 260)', () => {
  // The jutting Ring [-200,300,300,700] is Ring 1 of CourtyardJutCut and Ring 2 of its swap; the Ring inside it,
  // [-200,300,0,700], is Ring 2 and Ring 1. Both drop the inner Ring, and are then one building, the jut's index apart.
  const renamed = (s: BuildingShell, index: (i: number) => number): string => JSON.stringify({
    ...s, fixture: '', report: {...s.report, droppedRings: []},
    cells: s.cells.map(c => ({...c, source: c.source && {...c.source, ringModelIndex: index(c.source.ringModelIndex)}})),
    faces: s.faces.map(x => ({...x, sources: x.sources.map(y => ({...y, ringModelIndex: index(y.ringModelIndex)})).sort((p, q) => p.ringModelIndex - q.ringModelIndex || p.side - q.side)})),
  });

  it('drop the Ring inside the jut, and build the same building, clean', async () => {
    const [cut, swapped] = jutCutFixtures();
    const a = await buildShellDetailed(cut), b = await buildShellDetailed(swapped);
    expect([a.shell.report.droppedRings, b.shell.report.droppedRings]).toEqual([[2], [1]]);
    expect(invariantViolations(b, {genus: [1], cheeks: 0})).toEqual([]);
    expect(invariantViolations(a, {genus: [1], cheeks: 0})).toEqual([]);
    expect(renamed(b.shell, i => (i === 2 ? 1 : i))).toBe(renamed(a.shell, i => i));
  });
});
