// Journal decisions 129, 131 and 152: the golden set's records, built from a fixture's build. The port diffs against
// these; port-ready is named by the commit that lands them. Browser-safe: the writer and the drift test do the I/O.
import type {ShellFixture} from './fixture.ts';
import type {ShellMesh} from './mesh.ts';
import type {ShellUnion} from './union.ts';
import {writeInput} from './wire/input-adapter.ts';
import type {BuildingShellInputV1} from './wire/input-types.ts';

/** One mesh as the golden set writes it: flat arrays, as `manifold-3d`'s `Mesh` carries them. */
export interface GoldenMesh { positions: number[]; tris: number[]; faceIDs: number[] }

/** One raw part as handed to Manifold, after weld and snap, in union order. */
export interface GoldenPart extends GoldenMesh { id: number; name: string }

/** One faceID's tag and generating plane. */
export interface GoldenFaceID { faceID: number; kind: string; storey: number; wall: number; plane: number; part: number; n: number[]; d: number }

/**
 * Journal decision 131: a fixture's union stages, so the C++ can tell a difference in the boolean from one in its
 * raw-part builder.
 * - `faceIDs`: every faceID's tag and plane.
 * - `rawParts`: the meshes handed to Manifold, after weld and snap, in union order.
 * - `booleanOutput`: Manifold's union, before cleaning, imprint and re-tag.
 * - `unionOutput`: the final tagged mesh, after cleaning, imprint and re-tag, which step 4 reads, with each
 *   triangle's re-tagged kind, storey and wall.
 */
export interface UnionStages {
  fixture: string;
  faceIDs: GoldenFaceID[];
  rawParts: GoldenPart[];
  booleanOutput: GoldenMesh & {status: string};
  unionOutput: GoldenMesh & {genus: number; triTags: {kind: string; storey: number; wall: number; plane: number}[]};
}

const meshRecord = (m: Pick<ShellMesh, 'positions' | 'tris' | 'faceIDs'>): GoldenMesh =>
  ({positions: Array.from(m.positions), tris: Array.from(m.tris), faceIDs: Array.from(m.faceIDs)});

/** Journal decision 131: a union's three stages. */
export function unionStages(fixture: string, u: ShellUnion): UnionStages {
  return {
    fixture,
    faceIDs: u.tags.table.map((t, faceID) => ({faceID, kind: t.kind, storey: t.storey, wall: t.wall, plane: t.plane, part: t.part, n: [...u.tags.planes[faceID].n], d: u.tags.planes[faceID].d})),
    rawParts: u.parts.map(p => ({id: p.id, name: p.name, positions: [...p.soup.positions], tris: [...p.soup.tris], faceIDs: [...p.soup.faceIDs]})),
    booleanOutput: {status: u.status, ...meshRecord(u.boolean)},
    unionOutput: {genus: u.genus, ...meshRecord(u.mesh), triTags: u.triTags.map(t => ({kind: t.kind, storey: t.storey, wall: t.wall, plane: t.plane}))},
  };
}

/** The C++ replay's Cell lattice (journal decision 152): 50 cm. */
export const CPP_CELL_CM = 50;
/** The C++ replay's corner slack on its lattice, in cm. */
export const CPP_LATTICE_SLACK_CM = 1e-6;
/** The C++ replay's storey cap: a Ring's `baseStorey + storeys` at most this. */
export const CPP_MAX_STOREY = 32;

/** Whether the C++ can replay a fixture's input (journal decision 152, amended), and every reason it cannot. */
export type Replayability = {cppReplayable: true} | {cppReplayable: false; reason: string};

/**
 * Journal decision 152, amended: a fixture is C++-replayable exactly when its `input@1` (as `writeInput` writes it,
 * one run per side the side's whole length, which the C++ replay matches by containment) has every corner on the
 * 50 cm Cell lattice within 1e-6 cm, every `ringIndex` its array position, a cell size of 50, a storey height of a
 * whole number of Cells, and no Ring reaching past storey 32. Otherwise every reason is given, in that order.
 */
export const cppReplayability = (f: ShellFixture): Replayability => cppReplayabilityOf(writeInput(f));

/** `cppReplayability` of an `input@1` document as written. */
export function cppReplayabilityOf(input: BuildingShellInputV1): Replayability {
  const onLattice = (v: number): boolean => Math.abs(v - CPP_CELL_CM * Math.round(v / CPP_CELL_CM)) <= CPP_LATTICE_SLACK_CM;
  const reasons: string[] = [];
  if (!input.rings.every(r => r.corners.every(c => onLattice(c.x) && onLattice(c.y)))) reasons.push('corner off the Cell lattice');
  if (!input.rings.every((r, i) => r.ringIndex === i)) reasons.push('ringIndex not its array position');
  if (input.cellSizeCm !== CPP_CELL_CM) reasons.push(`cellSize not ${CPP_CELL_CM}`);
  if (!onLattice(input.storeyHeightCm)) reasons.push('storey height not a whole number of Cells');
  if (!input.rings.every(r => r.baseStorey + r.storeys <= CPP_MAX_STOREY)) reasons.push(`a Ring reaching past storey ${CPP_MAX_STOREY}`);
  return reasons.length ? {cppReplayable: false, reason: reasons.join('; ')} : {cppReplayable: true};
}

/** A golden file's text: compact JSON and a final newline, so its bytes are its hash. */
export const goldenText = (x: unknown): string => `${JSON.stringify(x)}\n`;
