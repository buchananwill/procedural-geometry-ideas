// The shell as flat typed arrays, one builder per drawn layer. Pure data: no scene, no DOM. Each builder keeps only what
// the shown storeys hold (see `visibility.ts`) and returns an `owner` array that maps a drawn triangle, segment or point
// back to the record it came from, so a hover can name it.
import {ShapeUtils, Vector2} from 'three';
import type {ShellBuild} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import type {TriIndices} from '../weld.ts';
import {RGB, hexToRgb, srgbToLinear} from './colour-metrics.ts';
import {EDGE_KIND_COLOUR, GHOST_LINE_COLOUR, OUTLINE_COLOUR, RAW_INTERNAL_GREY, SHELL_KIND_COLOUR, VERTEX_COLOUR, partialColour} from './palette.ts';
import {StoreySet, cellShown, edgeShown, faceShown, netEdgeShown, vertexShown} from './visibility.ts';

/**
 * One drawn layer. `positions` and `colors` are three floats per vertex, with `colors` in linear RGB; `owner` holds one
 * record id per triangle (three vertices), per segment (two) or per point (one), depending on the layer.
 */
export interface DrawBuffers { positions: Float32Array; colors: Float32Array; owner: Int32Array }

export interface Bounds { min: Vec3; max: Vec3 }

/** A palette colour as linear RGB, which is what a vertex-colour attribute holds. */
export const linearRGB = (hex: number): RGB => {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
};

/** Collects vertices of one colour per owner into a `DrawBuffers`. */
class Writer {
  private pos: number[] = [];
  private col: number[] = [];
  private own: number[] = [];
  /** Adds one primitive: its vertices, drawn in `hex`, owned by record `owner`. */
  push(vertices: readonly Readonly<Vec3>[], hex: number, owner: number): void {
    const [r, g, b] = linearRGB(hex);
    for (const v of vertices) { this.pos.push(v[0], v[1], v[2]); this.col.push(r, g, b); }
    this.own.push(owner);
  }
  done(): DrawBuffers {
    return {positions: Float32Array.from(this.pos), colors: Float32Array.from(this.col), owner: Int32Array.from(this.own)};
  }
}

const at = (positions: ArrayLike<number>, v: number): Vec3 => [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];

// ---- Polygons -----------------------------------------------------------------------------------------------------

/**
 * Triangulates a planar polygon whose outward normal is `normal`, as index triples into `poly`, each wound
 * counter-clockwise about `normal`. The polygon is projected along the normal's dominant axis.
 */
export function triangulatePolygon(poly: readonly Readonly<Vec3>[], normal: Readonly<Vec3>): TriIndices[] {
  const abs = normal.map(Math.abs);
  const drop = abs[0] >= abs[1] && abs[0] >= abs[2] ? 0 : abs[1] >= abs[2] ? 1 : 2;
  const [s, t] = [0, 1, 2].filter(a => a !== drop);
  const contour = poly.map(p => new Vector2(p[s], p[t]));
  const out: TriIndices[] = [];
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
    const a = poly[i], b = poly[j], c = poly[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const facing = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2];
    out.push(facing >= 0 ? [i, j, k] : [i, k, j]);
  }
  return out;
}

// ---- Faces --------------------------------------------------------------------------------------------------------

/**
 * The output mesh's triangles of the shown storeys, in their face's kind colour. `ground` picks the Ground faces
 * alone (drawn translucent) or everything else. `owner` is the ShellFace id.
 */
export function faceTriangles(build: ShellBuild, storeys: StoreySet, ground: boolean): DrawBuffers {
  const {mesh} = build.union;
  const w = new Writer();
  for (let t = 0; t < mesh.tris.length / 3; t++) {
    const face = build.shell.faces[build.faces.triFace[t]];
    if ((face.tag.kind === 'Ground') !== ground || !faceShown(build, storeys, face.id)) continue;
    w.push([at(mesh.positions, mesh.tris[3 * t]), at(mesh.positions, mesh.tris[3 * t + 1]), at(mesh.positions, mesh.tris[3 * t + 2])],
      SHELL_KIND_COLOUR[face.tag.kind], face.id);
  }
  return w.done();
}

// ---- Cells --------------------------------------------------------------------------------------------------------

/**
 * Cells of the shown storeys as triangles. `tint` keeps the partial Cells alone, in a lighter shade of their face's
 * colour (spec decision 28 as amended: the opt-in highlight); `pick` keeps every Cell, for picking. `owner` is the
 * ShellCell id.
 */
export function cellTriangles(build: ShellBuild, storeys: StoreySet, mode: 'tint' | 'pick'): DrawBuffers {
  const w = new Writer();
  for (const cell of build.shell.cells) {
    if (!cellShown(build, storeys, cell.id) || (mode === 'tint' && cell.whole)) continue;
    const face = build.shell.faces[cell.face];
    for (const [i, j, k] of triangulatePolygon(cell.polygon, face.normal)) {
      w.push([cell.polygon[i], cell.polygon[j], cell.polygon[k]], partialColour(face.tag.kind), cell.id);
    }
  }
  return w.done();
}

/**
 * Cell outlines: each NetEdge once, between its two vertices, when a Cell of a shown storey borders it. Coloured by the
 * NetEdge's kind when `byKind`, else the one neutral outline colour. `owner` is the NetEdge id.
 */
export function cellOutlineSegments(build: ShellBuild, storeys: StoreySet, byKind: boolean): DrawBuffers {
  const w = new Writer();
  for (const n of build.shell.netEdges) {
    if (!netEdgeShown(build, storeys, n.id)) continue;
    w.push([build.shell.vertices[n.v[0]].p, build.shell.vertices[n.v[1]].p], byKind ? EDGE_KIND_COLOUR[n.kind] : OUTLINE_COLOUR, n.id);
  }
  return w.done();
}

// ---- Edges and vertices -------------------------------------------------------------------------------------------

/** ShellEdges in their kind colour. `owner` is the ShellEdge id. */
export function edgeSegments(build: ShellBuild, storeys: StoreySet): DrawBuffers {
  const w = new Writer();
  for (const e of build.shell.edges) {
    if (edgeShown(build, storeys, e.id)) w.push([e.a, e.b], EDGE_KIND_COLOUR[e.kind], e.id);
  }
  return w.done();
}

/** ShellVertices with at least one face of a shown storey. `owner` is the ShellVertex id. */
export function vertexPoints(build: ShellBuild, storeys: StoreySet): DrawBuffers {
  const w = new Writer();
  for (const v of build.shell.vertices) {
    if (vertexShown(build, storeys, v.id)) w.push([v.p], VERTEX_COLOUR, v.id);
  }
  return w.done();
}

// ---- Raw mode -----------------------------------------------------------------------------------------------------

/** Every triangle of every raw part of a shown storey, in its tag's kind colour. `owner` is the part id. */
export function ghostTriangles(build: ShellBuild, storeys: StoreySet): DrawBuffers {
  const {parts, tags} = build.union;
  const w = new Writer();
  for (const part of parts) {
    if (!storeys.has(part.storey)) continue;
    const {positions, tris, faceIDs} = part.soup;
    for (let t = 0; t < tris.length / 3; t++) {
      const kind = tags.table[faceIDs[t]].kind;
      w.push([at(positions, tris[3 * t]), at(positions, tris[3 * t + 1]), at(positions, tris[3 * t + 2])],
        kind === 'Internal' ? RAW_INTERNAL_GREY : SHELL_KIND_COLOUR[kind], part.id);
    }
  }
  return w.done();
}

/**
 * The ghost parts' outlines: every edge between two raw triangles of different faces. An edge inside one raw face (a
 * triangulation diagonal) is left out. `owner` is the part id.
 */
export function ghostSegments(build: ShellBuild, storeys: StoreySet): DrawBuffers {
  const w = new Writer();
  for (const part of build.union.parts) {
    if (!storeys.has(part.storey)) continue;
    const {positions, tris, faceIDs} = part.soup;
    const seen = new Map<string, number>();
    for (let t = 0; t < tris.length / 3; t++) {
      for (let j = 0; j < 3; j++) {
        const a = tris[3 * t + j], b = tris[3 * t + (j + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const other = seen.get(key);
        if (other === undefined) { seen.set(key, faceIDs[t]); continue; }
        if (other !== faceIDs[t]) w.push([at(positions, a), at(positions, b)], GHOST_LINE_COLOUR, part.id);
      }
    }
  }
  return w.done();
}

/** The bounding box of the output mesh: where the camera looks. */
export function meshBounds(build: ShellBuild): Bounds {
  const P = build.union.mesh.positions;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) {
    const a = i % 3;
    min[a] = Math.min(min[a], P[i]);
    max[a] = Math.max(max[a], P[i]);
  }
  return {min, max};
}
