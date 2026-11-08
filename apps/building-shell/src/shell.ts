// The pipeline's one entry point: the four-step model end to end, from a fixture to its BuildingShell (spec decision
// 33). Steps 1 to 3 are `union.ts`'s; step 4 lays faces, Edges, Cells, NetEdges and vertices on the final mesh only.
import {CellNet, FrameTable, ShellCell, layCells, onLattice, vertexRecords} from './cells.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {EdgeAssembly, EdgeKind, NEW_EDGE_KINDS, NetEdge, ShellEdge, ShellVertex, buildShellEdges, makeVertexRegistry} from './edges.ts';
import {FaceAssembly, ShellFace, assembleFaces, reduceFaceLoops} from './faces.ts';
import {ShellFixture} from './fixture.ts';
import {Wasm, getManifold} from './manifold.ts';
import type {AlongAxis} from './storey.ts';
import {ShellUnion, unionShell} from './union.ts';

export interface ShellReport {
  conflicts: string[];
  survivingInternal: number;
  unclassifiedEdges: number;
  cheeks: number;
  partialCells: number;
  /** The new edge kinds (spec decision 21) this shell emits, on a ShellEdge or a NetEdge, in the spec's order. */
  newEdgeKinds: EdgeKind[];
  /** Journal decision 65: every name this shell uses where the C++ net has no precedent. */
  newConventions: string[];
}

export interface BuildingShell {
  fixture: string;
  faces: ShellFace[];
  edges: ShellEdge[];
  netEdges: NetEdge[];
  vertices: ShellVertex[];
  cells: ShellCell[];
  report: ShellReport;
}

/** Journal decision 65: the C++ net has no underside Cells, so their interior sides' `RoofInterior` is new. */
export const CONVENTION_UNDERSIDE_ROOF_INTERIOR = 'RoofInterior on Underside faces';
/** Journal decision 77: the C++ makes a cheek a Gable over no run, so a Cheek face of its own kind is new. */
export const CONVENTION_CHEEK = 'Cheek faces';

/**
 * Spec decision 33 as amended (journal decision 90): a corner between two Rings is named by its geometry, while the C++
 * net calls it `RingJunction`. Rings are rectangles, so every `InternalCorner` lies between two Rings.
 */
export const CONVENTION_CORNER_BY_GEOMETRY = 'InternalCorner between Rings, named by geometry (C++: RingJunction)';

/**
 * Journal decision 96, F5: roof lines are cut exactly, where the C++ net staircases them on whole plan Cells. Listed
 * whenever a Roof Cell is cut by a Hip, Valley or Ridge ShellEdge.
 */
export const CONVENTION_ROOF_LINES_CUT = 'Roof lines cut exactly (C++: staircase)';

/** The ShellEdge kinds whose exact cut the C++ staircases. */
export const ROOF_LINE_KINDS: readonly EdgeKind[] = ['Hip', 'Valley', 'Ridge'];

/** A BuildingShell with the intermediate records it was read from, for tests and the viewer. */
export interface ShellBuild {
  shell: BuildingShell;
  union: ShellUnion;
  faces: FaceAssembly;
  edges: EdgeAssembly;
  frames: FrameTable;
}

/**
 * Whether a Roof Cell has a side on a Hip, Valley or Ridge ShellEdge running off the plan lattice: a line the C++
 * would staircase. A Cell side along a lattice line (a ridge on a Cell line) is no cut.
 */
function cutsRoofCell(faces: ShellFace[], net: CellNet, vertices: ShellVertex[], edges: ShellEdge[], cellSize: number): boolean {
  return net.netEdges.some(n => {
    if (n.shellEdge < 0 || !ROOF_LINE_KINDS.includes(edges[n.shellEdge].kind)) return false;
    if (!n.cells.some(c => faces[net.cells[c].face].tag.kind === 'Roof')) return false;
    const a = vertices[n.v[0]].p, b = vertices[n.v[1]].p;
    const along = (ax: AlongAxis): boolean => Math.abs(a[ax] - b[ax]) <= SHELL_TOLERANCE_CM && onLattice(a[ax], cellSize);
    return !along(0) && !along(1);
  });
}

function report(u: ShellUnion, faces: ShellFace[], edges: ShellEdge[], net: CellNet, vertices: ShellVertex[], cellSize: number): ShellReport {
  const emitted = new Set<EdgeKind>([...edges.map(e => e.kind), ...net.netEdges.map(n => n.kind)]);
  const newConventions: string[] = [];
  const undersideInterior = net.netEdges.some(n => n.shellEdge < 0 && n.cells.some(c => faces[net.cells[c].face].tag.kind === 'Underside'));
  if (undersideInterior) newConventions.push(CONVENTION_UNDERSIDE_ROOF_INTERIOR);
  if (faces.some(f => f.tag.kind === 'Cheek')) newConventions.push(CONVENTION_CHEEK);
  if (edges.some(e => e.kind === 'InternalCorner')) newConventions.push(CONVENTION_CORNER_BY_GEOMETRY);
  if (cutsRoofCell(faces, net, vertices, edges, cellSize)) newConventions.push(CONVENTION_ROOF_LINES_CUT);
  return {
    conflicts: u.conflicts,
    survivingInternal: u.survivingInternal,
    unclassifiedEdges: edges.filter(e => e.kind === 'Unclassified').length,
    // Journal decision 101: the Cheek ShellFaces, as spec decision 30 names them.
    cheeks: faces.filter(f => f.tag.kind === 'Cheek').length,
    partialCells: net.cells.filter(c => !c.whole).length,
    newEdgeKinds: NEW_EDGE_KINDS.filter(k => emitted.has(k)),
    newConventions,
  };
}

/** Step 4 on a union already taken: faces (decision 18), Edges (19 to 21), Cells (22 to 25), NetEdges and vertices. */
export function buildShellFromUnion(wasm: Wasm, fixture: ShellFixture, u: ShellUnion): ShellBuild {
  const asm = assembleFaces(u);
  const reg = makeVertexRegistry();
  const ea = buildShellEdges(u, asm, reg, fixture.storeyHeight);
  reduceFaceLoops(asm, u.mesh.positions, v => ea.endpoints.has(v));
  const net = layCells(wasm, u, asm, ea, reg, fixture.cellSize);
  const vertices = vertexRecords(u, asm, ea, reg, net.cells);
  const shell: BuildingShell = {
    fixture: fixture.name,
    faces: asm.faces,
    edges: ea.edges,
    netEdges: net.netEdges,
    vertices,
    cells: net.cells,
    report: report(u, asm.faces, ea.edges, net, vertices, fixture.cellSize),
  };
  return {shell, union: u, faces: asm, edges: ea, frames: net.frames};
}

/** Every step of the four-step model on one fixture, with its intermediate records. */
export async function buildShellDetailed(fixture: ShellFixture): Promise<ShellBuild> {
  const wasm = await getManifold();
  return buildShellFromUnion(wasm, fixture, await unionShell(fixture));
}

/** Spec decision 33: the pipeline's one entry point. */
export async function buildShell(fixture: ShellFixture): Promise<BuildingShell> {
  return (await buildShellDetailed(fixture)).shell;
}
