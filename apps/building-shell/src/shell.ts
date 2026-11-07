// The pipeline's one entry point: the four-step model end to end, from a fixture to its BuildingShell (spec decision
// 33). Steps 1 to 3 are `union.ts`'s; step 4 lays faces, Edges, Cells, NetEdges and vertices on the final mesh only.
import {CellNet, FaceFrame, ShellCell, layCells, vertexRecords} from './cells.ts';
import {EdgeAssembly, EdgeKind, NEW_EDGE_KINDS, NetEdge, ShellEdge, ShellVertex, buildShellEdges, makeVertexRegistry} from './edges.ts';
import {FaceAssembly, ShellFace, assembleFaces, reduceFaceLoops} from './faces.ts';
import {ShellFixture} from './fixture.ts';
import {Wasm, getManifold} from './manifold.ts';
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

/** A BuildingShell with the intermediate records it was read from, for tests and the viewer. */
export interface ShellBuild {
  shell: BuildingShell;
  union: ShellUnion;
  faces: FaceAssembly;
  edges: EdgeAssembly;
  frames: (FaceFrame | null)[];
}

function report(u: ShellUnion, faces: ShellFace[], edges: ShellEdge[], net: CellNet): ShellReport {
  const emitted = new Set<EdgeKind>([...edges.map(e => e.kind), ...net.netEdges.map(n => n.kind)]);
  const newConventions: string[] = [];
  const undersideInterior = net.netEdges.some(n => n.shellEdge < 0 && n.cells.some(c => faces[net.cells[c].face].tag.kind === 'Underside'));
  if (undersideInterior) newConventions.push(CONVENTION_UNDERSIDE_ROOF_INTERIOR);
  if (faces.some(f => f.tag.kind === 'Cheek')) newConventions.push(CONVENTION_CHEEK);
  if (edges.some(e => e.kind === 'InternalCorner')) newConventions.push(CONVENTION_CORNER_BY_GEOMETRY);
  return {
    conflicts: u.conflicts,
    survivingInternal: u.survivingInternal,
    unclassifiedEdges: edges.filter(e => e.kind === 'Unclassified').length,
    cheeks: u.cheeks,
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
  const shell: BuildingShell = {
    fixture: fixture.name,
    faces: asm.faces,
    edges: ea.edges,
    netEdges: net.netEdges,
    vertices: vertexRecords(u, asm, ea, reg, net.cells),
    cells: net.cells,
    report: report(u, asm.faces, ea.edges, net),
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
