// The C++ port's two in-game regressions, as Ring-authored fixtures (`PORT_FIXTURES`): spec decision 32's invariants,
// each defect's assertions, and the full measured topology pinned as reference data for the port.
import {beforeAll, describe, expect, it} from 'vitest';
import {SHELL_TOLERANCE_CM} from '../src/constants.ts';
import {PORT_FIXTURES, ShellFixture} from '../src/fixture.ts';
import {CONVENTION_ROOF_LINES_CUT, ShellBuild, ShellReport, buildShellDetailed} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {ClassedPinTable, pinnedOutcome} from './pin-table.ts';
import {dist, invariantViolations} from './shell-invariants.ts';

const TAN60 = Math.sqrt(3);

const builds = new Map<string, ShellBuild>();
beforeAll(async () => {
  for (const f of PORT_FIXTURES) builds.set(f.name, await buildShellDetailed(f));
}, 60_000);
const get = (name: string): ShellBuild => {
  const b = builds.get(name);
  if (!b) throw new Error(`no shell built for ${name}`);
  return b;
};
const near = (p: Vec3, q: Vec3): boolean => dist(p, q) <= SHELL_TOLERANCE_CM;

/** A port fixture's measured topology: its record counts, its genus and its report. */
interface PortPin {
  genus: number;
  faces: number;
  edges: number;
  netEdges: number;
  cells: number;
  vertices: number;
  report: ShellReport;
}

const report = (r: Partial<ShellReport> & Pick<ShellReport, 'conflicts' | 'partialCells'>): ShellReport => ({
  survivingInternal: 0, unclassifiedEdges: 0, cheeks: 0, tucks: 0, newEdgeKinds: [], newConventions: [CONVENTION_ROOF_LINES_CUT], droppedRings: [], ...r,
});
const flushWall = (name: string): string => `${name}: n=(0.000000, -1.000000, 0.000000) d=0.000: Wall storey 1 wall 0 (part 3) over Gable storey 0 wall 0 (part 2)`;

/** The port fixtures' names, as `PORT_FIXTURES` lists them. */
const PORT_NAMES = ['PortNarrowUpper300', 'PortNarrowUpperGabled300', 'PortPokeOut300', 'PortPokeOut250'] as const;
type PortName = typeof PORT_NAMES[number];

/**
 * Measured at WP3.6, and at WP3.7 for PortPokeOut250, which now builds clean (journal decision 132, finding 3): the
 * cleaning drops the zero-volume pillow Manifold's union left at its plate (decision 122, G1).
 */
const PINS: Record<PortName, PortPin> = {
  PortNarrowUpper300: {genus: 0, faces: 10, edges: 22, netEdges: 1065, cells: 522, vertices: 544, report: report({conflicts: [flushWall('PortNarrowUpper300')], partialCells: 56})},
  PortNarrowUpperGabled300: {
    genus: 0, faces: 10, edges: 22, netEdges: 1065, cells: 522, vertices: 544,
    report: report({
      conflicts: [
        'PortNarrowUpperGabled300: n=(0.000000, -1.000000, 0.000000) d=0.000: Gable storey 0 wall 0 (part 2) over Gable storey 1 wall 0 (part 5)',
        flushWall('PortNarrowUpperGabled300'),
      ],
      partialCells: 56,
    }),
  },
  PortPokeOut300: {genus: 0, faces: 22, edges: 48, netEdges: 1121, cells: 552, vertices: 570, report: report({conflicts: [flushWall('PortPokeOut300')], partialCells: 96})},
  PortPokeOut250: {genus: 0, faces: 22, edges: 48, netEdges: 1049, cells: 518, vertices: 532, report: report({conflicts: [flushWall('PortPokeOut250')], partialCells: 104})},
};

/**
 * WP3.6 measured PortPokeOut250's raw Manifold union keeping storey 1's wall-prism top and hip-solid bottom as two
 * coincident opposite Internal triangles each, over x 455.66 to 500 at the plate z = 500. Since WP3.7 the cleaning
 * removes them as a zero-volume sheet, so no port fixture carries a known violation; the table stays for the next.
 */
const KNOWN_VIOLATIONS: ClassedPinTable<PortName> = {};

it("removes PortPokeOut250's pillow as a zero-volume sheet of four triangles (journal decision 122, G1)", () => {
  expect(get('PortPokeOut250').union.clean.sheetTris).toBe(4);
});

/** The port fixture of each name. */
const portFixture = (name: PortName): ShellFixture => {
  const f = PORT_FIXTURES.find(x => x.name === name);
  if (!f) throw new Error(`no port fixture named ${name}`);
  return f;
};

it('lists every port fixture by name', () => {
  expect(PORT_FIXTURES.map(f => f.name)).toEqual([...PORT_NAMES]);
});

describe.each(PORT_NAMES.map(name => [name, portFixture(name)] as const))('%s', (name, f) => {
  it("keeps spec decision 32's invariants, with its genus as measured", () => {
    expect(invariantViolations(get(name), {genus: PINS[name].genus, cheeks: 0})).toEqual(pinnedOutcome(KNOWN_VIOLATIONS, name));
  });

  it('has its pinned topology and report (reference data for the C++ port)', () => {
    const {shell, union} = get(name);
    const {report: want, ...counts} = PINS[name];
    expect({
      genus: union.genus, faces: shell.faces.length, edges: shell.edges.length, netEdges: shell.netEdges.length,
      cells: shell.cells.length, vertices: shell.vertices.length,
    }).toEqual(counts);
    expect(shell.report).toEqual(want);
    expect(f.storeyHeight).toBe(name.endsWith('250') ? 250 : 300);
  });
});

describe.each(['PortNarrowUpper300', 'PortNarrowUpperGabled300'])('%s: defect 1, missing tiles', name => {
  it("tiles the whole lower roof with storey 0's Roof Cells: plan area 360000", () => {
    const {shell} = get(name);
    const roof0 = new Set(shell.faces.filter(x => x.tag.kind === 'Roof' && x.tag.storey === 0).map(x => x.id));
    const plan = shell.cells.filter(c => roof0.has(c.face)).reduce((s, c) =>
      s + Math.abs(c.polygon.reduce((a, p, i) => { const q = c.polygon[(i + 1) % c.polygon.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2, 0);
    expect(Math.abs(plan - 360000)).toBeLessThan(0.05);
  });

  it('keeps no storey-1 Roof', () => {
    expect(get(name).shell.faces.filter(x => x.tag.kind === 'Roof' && x.tag.storey === 1)).toEqual([]);
  });
});

describe.each([
  ['PortPokeOut300', 300, 150, 450],
  ['PortPokeOut250', 250, 100, 500],
] as const)('%s: defect 2, the lost ridge', (name, h, x0, x1) => {
  const apex = h + 300 * TAN60;

  it(`keeps the lower Ridge whole from (300, 0, ${apex.toFixed(1)}) to (300, 300, ${apex.toFixed(1)})`, () => {
    const {shell} = get(name);
    const ridges = shell.edges.filter(e => e.kind === 'Ridge' && e.faces.every(fi => shell.faces[fi].tag.storey === 0));
    expect(ridges).toHaveLength(1);
    const [r] = ridges;
    const ends: Vec3[] = [[300, 0, apex], [300, 300, apex]];
    expect((near(r.a, ends[0]) && near(r.b, ends[1])) || (near(r.a, ends[1]) && near(r.b, ends[0]))).toBe(true);
  });

  it(`keeps storey 1's Wall faces on x = ${x0} and x = ${x1} above the lower roof, up to the plate`, () => {
    const {shell} = get(name);
    for (const [x, nx] of [[x0, -1], [x1, 1]] as const) {
      const walls = shell.faces.filter(fc => fc.tag.kind === 'Wall' && fc.tag.storey === 1 && Math.abs(fc.normal[0] - nx) < 1e-9 && Math.abs(fc.offset - nx * x) <= SHELL_TOLERANCE_CM);
      expect(walls, `Wall on x = ${x}`).toHaveLength(1);
      const zs = walls[0].loops.flat().map(p => p[2]);
      // The lower roof meets the wall at h + x tan 60 (west) or h + (600 - x) tan 60 (east), below the plate 2h.
      expect(Math.min(...zs)).toBeCloseTo(h + Math.min(x, 600 - x) * TAN60, 2);
      expect(Math.max(...zs)).toBeCloseTo(2 * h, 6);
      expect(Math.min(...zs)).toBeLessThan(2 * h);
    }
  });
});
