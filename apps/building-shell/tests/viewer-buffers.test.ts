// The pure colour path: the draw buffers carry each record's own colour, in linear RGB (journal decision 98, Q6). Each
// of the reviewer's four colour mutations must fail here: every face drawn as Wall, partial Cells untinted, every Edge
// Ridge-red, and an sRGB/linear mix-up.
import {beforeAll, describe, expect, it} from 'vitest';
import {fixtureByName} from '../src/fixture.ts';
import {ShellBuild, buildShellDetailed} from '../src/shell.ts';
import type {Vec3} from '../src/tags.ts';
import {
  DrawBuffers, cellOutlineSegments, cellTriangles, edgeSegments, faceTriangles, ghostSegments, ghostTriangles, linearRGB, triangulatePolygon, vertexPoints,
} from '../src/viewer/buffers.ts';
import {
  EDGE_KIND_COLOUR, GHOST_LINE_COLOUR, OUTLINE_COLOUR, RAW_INTERNAL_GREY, SHELL_KIND_COLOUR, VERTEX_COLOUR, partialColour,
} from '../src/viewer/palette.ts';

let b: ShellBuild;
beforeAll(async () => { b = await buildShellDetailed(fixtureByName('NarrowUpperStorey')); }, 60_000);

const ALL: ReadonlySet<number> = new Set([0, 1]);

/** The sRGB transfer function, written here independently of the viewer's. */
const toLinear = (hex: number): [number, number, number] =>
  [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number];

/** The colour of vertex `v` of primitive `p`, `per` vertices to a primitive. */
const colourOf = (buf: DrawBuffers, p: number, per: number): number[] => Array.from(buf.colors.slice(3 * per * p, 3 * per * p + 3));

function expectColour(actual: number[], hex: number, what: string): void {
  const want = toLinear(hex);
  for (let i = 0; i < 3; i++) expect(actual[i], `${what} channel ${i}`).toBeCloseTo(want[i], 5);
}

/** Every vertex of primitive `p` has the same colour. */
function uniform(buf: DrawBuffers, p: number, per: number): boolean {
  const first = colourOf(buf, p, per);
  for (let v = 1; v < per; v++) {
    const c = Array.from(buf.colors.slice(3 * (per * p + v), 3 * (per * p + v) + 3));
    if (c.some((x, i) => x !== first[i])) return false;
  }
  return true;
}

describe('linear colour', () => {
  it('converts sRGB to linear light, not by a plain divide by 255', () => {
    expect(linearRGB(0x808080)[0]).toBeCloseTo(0.2158605, 6);
    expect(linearRGB(0xff0000)).toEqual([1, 0, 0]);
    expect(linearRGB(0x000000)).toEqual([0, 0, 0]);
    expect(linearRGB(0xb5483a)[0]).toBeCloseTo(toLinear(0xb5483a)[0], 6);
  });
});

describe('face colours', () => {
  const solid = (): DrawBuffers => faceTriangles(b, ALL, false);

  it('draws each triangle in its own face\'s kind colour', () => {
    const buf = solid();
    expect(buf.owner.length).toBeGreaterThan(0);
    for (let t = 0; t < buf.owner.length; t++) {
      const kind = b.shell.faces[buf.owner[t]].tag.kind;
      expectColour(colourOf(buf, t, 3), SHELL_KIND_COLOUR[kind], `triangle ${t} (${kind})`);
      expect(uniform(buf, t, 3)).toBe(true);
    }
  });

  it('shows more than one kind, so "every face drawn as Wall" cannot pass', () => {
    const colours = new Set(Array.from({length: solid().owner.length}, (_, t) => colourOf(solid(), t, 3).join(',')));
    expect(colours.size).toBeGreaterThanOrEqual(3);
    const roof = solid().owner.findIndex(f => b.shell.faces[f].tag.kind === 'Roof');
    const wall = solid().owner.findIndex(f => b.shell.faces[f].tag.kind === 'Wall');
    expect(colourOf(solid(), roof, 3)).not.toEqual(colourOf(solid(), wall, 3));
  });

  it('draws Ground in its own buffer, in its own colour', () => {
    const ground = faceTriangles(b, ALL, true);
    expect(ground.owner.length).toBeGreaterThan(0);
    for (let t = 0; t < ground.owner.length; t++) expectColour(colourOf(ground, t, 3), SHELL_KIND_COLOUR.Ground, 'ground');
    expect(solid().owner.every(f => b.shell.faces[f].tag.kind !== 'Ground')).toBe(true);
  });
});

describe('partial-Cell tint', () => {
  it('tints only the partial Cells, in a lighter shade of the face colour, brighter on every channel', () => {
    const tint = cellTriangles(b, ALL, 'tint');
    expect(new Set(tint.owner).size).toBe(b.shell.report.partialCells);
    for (let t = 0; t < tint.owner.length; t++) {
      const cell = b.shell.cells[tint.owner[t]];
      expect(cell.whole).toBe(false);
      const kind = b.shell.faces[cell.face].tag.kind;
      const got = colourOf(tint, t, 3);
      expectColour(got, partialColour(kind), `Cell ${cell.id} (${kind})`);
      const base = toLinear(SHELL_KIND_COLOUR[kind]);
      for (let i = 0; i < 3; i++) expect(got[i], `Cell ${cell.id} channel ${i}`).toBeGreaterThan(base[i]);
    }
  });

  it('is empty of whole Cells, and the pick buffer holds every Cell', () => {
    expect(new Set(cellTriangles(b, ALL, 'pick').owner).size).toBe(b.shell.cells.length);
  });
});

describe('Edge colours', () => {
  it('draws each Edge in its own kind colour at both ends, so "every Edge Ridge-red" cannot pass', () => {
    const buf = edgeSegments(b, ALL);
    expect(buf.owner.length).toBe(b.shell.edges.length);
    const kinds = new Set<string>();
    for (let s = 0; s < buf.owner.length; s++) {
      const kind = b.shell.edges[buf.owner[s]].kind;
      kinds.add(kind);
      expectColour(colourOf(buf, s, 2), EDGE_KIND_COLOUR[kind], `Edge ${buf.owner[s]} (${kind})`);
      expect(uniform(buf, s, 2)).toBe(true);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(6);
    const ridge = buf.owner.findIndex(e => b.shell.edges[e].kind === 'Ridge');
    const eaves = buf.owner.findIndex(e => b.shell.edges[e].kind === 'Eaves');
    expect(colourOf(buf, ridge, 2)).not.toEqual(colourOf(buf, eaves, 2));
  });

  it('puts each Edge between its own two endpoints', () => {
    const buf = edgeSegments(b, ALL);
    for (let s = 0; s < buf.owner.length; s++) {
      const e = b.shell.edges[buf.owner[s]];
      expect(Array.from(buf.positions.slice(6 * s, 6 * s + 3))).toEqual(e.a.map(Math.fround));
      expect(Array.from(buf.positions.slice(6 * s + 3, 6 * s + 6))).toEqual(e.b.map(Math.fround));
    }
  });
});

describe('outline, vertex and ghost colours', () => {
  it('Cell outlines are one neutral colour, or their NetEdge\'s kind colour when asked', () => {
    const neutral = cellOutlineSegments(b, ALL, false);
    for (let s = 0; s < neutral.owner.length; s++) expectColour(colourOf(neutral, s, 2), OUTLINE_COLOUR, 'outline');
    const byKind = cellOutlineSegments(b, ALL, true);
    for (let s = 0; s < byKind.owner.length; s++) expectColour(colourOf(byKind, s, 2), EDGE_KIND_COLOUR[b.shell.netEdges[byKind.owner[s]].kind], 'net outline');
  });

  it('vertices are drawn in the vertex colour', () => {
    const v = vertexPoints(b, ALL);
    expect(v.owner.length).toBe(b.shell.vertices.length);
    for (let p = 0; p < v.owner.length; p++) expectColour(colourOf(v, p, 1), VERTEX_COLOUR, 'vertex');
  });

  it('ghost parts take their tag\'s kind colour, raw Internal in grey, and their outlines are the ghost line colour', () => {
    const g = ghostTriangles(b, ALL);
    // The buffer holds every part's triangles in part order, so its t-th triangle is the t-th of this list.
    const kinds = b.union.parts.flatMap(part => part.soup.faceIDs.map(f => b.union.tags.table[f].kind));
    expect(g.owner.length).toBe(kinds.length);
    const internal = new Set<number>();
    kinds.forEach((kind, t) => {
      expectColour(colourOf(g, t, 3), kind === 'Internal' ? RAW_INTERNAL_GREY : SHELL_KIND_COLOUR[kind], `ghost triangle ${t} (${kind})`);
      if (kind === 'Internal') internal.add(t);
    });
    expect(internal.size).toBeGreaterThan(0);
    const lines = ghostSegments(b, ALL);
    expect(lines.owner.length).toBeGreaterThan(0);
    for (let s = 0; s < lines.owner.length; s++) expectColour(colourOf(lines, s, 2), GHOST_LINE_COLOUR, 'ghost line');
  });
});

describe('storeys', () => {
  it('hiding every storey empties every layer, and hiding one shrinks the faces', () => {
    const none = new Set<number>();
    for (const buf of [faceTriangles(b, none, false), faceTriangles(b, none, true), edgeSegments(b, none), cellTriangles(b, none, 'pick'),
      cellTriangles(b, none, 'tint'), vertexPoints(b, none), cellOutlineSegments(b, none, false), ghostTriangles(b, none), ghostSegments(b, none)]) {
      expect(buf.owner.length).toBe(0);
    }
    expect(faceTriangles(b, new Set([0]), false).owner.length).toBeLessThan(faceTriangles(b, ALL, false).owner.length);
  });

  it('the solid and ground meshes together hold every output triangle', () => {
    expect(faceTriangles(b, ALL, false).owner.length + faceTriangles(b, ALL, true).owner.length).toBe(b.union.mesh.tris.length / 3);
  });

  it('draws every Edge, vertex and NetEdge when every storey is shown', () => {
    expect(edgeSegments(b, ALL).owner.length).toBe(b.shell.edges.length);
    expect(vertexPoints(b, ALL).owner.length).toBe(b.shell.vertices.length);
    expect(cellOutlineSegments(b, ALL, false).owner.length).toBe(b.shell.netEdges.length);
  });

  it('raw mode draws every raw part, and more triangles than the union keeps', () => {
    expect(new Set(ghostTriangles(b, ALL).owner).size).toBe(b.union.parts.length);
    expect(ghostTriangles(b, ALL).owner.length).toBeGreaterThan(b.union.mesh.tris.length / 3);
  });
});

describe('polygon triangulation', () => {
  it('triangulates a non-convex polygon wound about the face normal, covering its area', () => {
    const L: Vec3[] = [[0, 0, 5], [2, 0, 5], [2, 1, 5], [1, 1, 5], [1, 2, 5], [0, 2, 5]];
    const tris = triangulatePolygon(L, [0, 0, 1]);
    let area = 0;
    for (const [i, j, k] of tris) {
      const cz = (L[j][0] - L[i][0]) * (L[k][1] - L[i][1]) - (L[j][1] - L[i][1]) * (L[k][0] - L[i][0]);
      expect(cz).toBeGreaterThan(0);
      area += cz / 2;
    }
    expect(area).toBeCloseTo(3);
    expect(triangulatePolygon([...L].reverse(), [0, 0, -1]).length).toBe(tris.length);
  });
});
