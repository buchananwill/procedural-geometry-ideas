// Which records the shown storeys keep. One definition, read by the draw buffers and by the legend, so a legend count is
// the count of what is drawn.
//
// Interpretation (spec decision 29, "each storey"): a face, Cell or NetEdge belongs to the storey of its face's tag; a
// ShellEdge belongs to both of its faces' storeys and shows when either is shown; a vertex shows when any incident
// face is shown; a raw part belongs to its own storey.
import type {ShellBuild} from '../shell.ts';

export type StoreySet = ReadonlySet<number>;

export const faceShown = (build: ShellBuild, storeys: StoreySet, face: number): boolean =>
  storeys.has(build.shell.faces[face].tag.storey);

export const cellShown = (build: ShellBuild, storeys: StoreySet, cell: number): boolean =>
  faceShown(build, storeys, build.shell.cells[cell].face);

export const edgeShown = (build: ShellBuild, storeys: StoreySet, edge: number): boolean =>
  build.shell.edges[edge].faces.some(f => faceShown(build, storeys, f));

export const netEdgeShown = (build: ShellBuild, storeys: StoreySet, netEdge: number): boolean =>
  build.shell.netEdges[netEdge].cells.some(c => cellShown(build, storeys, c));

export const vertexShown = (build: ShellBuild, storeys: StoreySet, vertex: number): boolean =>
  build.shell.vertices[vertex].faces.some(f => faceShown(build, storeys, f));
