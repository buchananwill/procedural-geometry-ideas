// Journal decisions 129, 131 and 152: the golden set's records, built from a fixture's build, and the manifest's schema.
// The port diffs against these and reads their shapes (decision 155, B8, B10 and N5), so each derives from the
// pipeline's own types. Port-ready is named by the commit that lands them. Browser-safe: the writer and the drift test
// do the I/O.
import {z} from 'zod';
import {EDGE_KINDS} from './edges.ts';
import {RING_SIDES} from './fixture.ts';
import type {ShellFixture} from './fixture.ts';
import type {ShellMesh} from './mesh.ts';
import {ringSideLines} from './ring-forms.ts';
import type {ShellReport} from './shell.ts';
import type {RawPart} from './storey.ts';
import type {FaceTag, PartlessTag, Plane3} from './tags.ts';
import type {ShellUnion} from './union.ts';
import {readInput, writeInput} from './wire/input-adapter.ts';
import type {AdaptedInput} from './wire/input-adapter.ts';
import {WIRE_CORNER_SNAP_CM} from './wire/input-types.ts';
import type {BuildingShellInputV1, WireSide} from './wire/input-types.ts';

/** A mesh's flat arrays, as `manifold-3d`'s `Mesh` carries them. */
type MeshArrays = Pick<ShellMesh, 'positions' | 'tris' | 'faceIDs'>;

/** One mesh as the golden set writes it: the same arrays, as plain lists. */
export type GoldenMesh = {[K in keyof MeshArrays]: number[]};

/** One raw part as handed to Manifold, after weld and snap, in union order. */
export type GoldenPart = Pick<RawPart, 'id' | 'name'> & GoldenMesh;

/** One faceID with its tag and its generating plane. */
export type GoldenFaceID = {faceID: number} & FaceTag & Plane3;

/** Decision 131's first stage: the raw parts as handed to Manifold, and every faceID's tag and plane. */
export interface RawPartsStage { faceIDs: GoldenFaceID[]; rawParts: GoldenPart[] }

/** Decision 131's second stage: Manifold's union, before cleaning, imprint and re-tag. */
export type BooleanStage = {status: ShellUnion['status']} & GoldenMesh;

/** Decision 131's third stage: the final tagged mesh, after cleaning, imprint and re-tag, which step 4 reads. */
export type UnionOutputStage = Pick<ShellUnion, 'genus'> & GoldenMesh & {triTags: PartlessTag[]};

/**
 * Journal decision 131: a fixture's union stages, so the C++ can tell a difference in the boolean from one in its
 * raw-part builder.
 */
export type UnionStages = {fixture: string} & RawPartsStage & {booleanOutput: BooleanStage; unionOutput: UnionOutputStage};

const meshRecord = (m: MeshArrays): GoldenMesh =>
  ({positions: Array.from(m.positions), tris: Array.from(m.tris), faceIDs: Array.from(m.faceIDs)});

/** Journal decision 131: a union's three stages. */
export function unionStages(fixture: string, u: ShellUnion): UnionStages {
  return {
    fixture,
    faceIDs: u.tags.table.map((t, faceID): GoldenFaceID => {
      const {n, d} = u.tags.planes[faceID];
      return {faceID, kind: t.kind, storey: t.storey, wall: t.wall, plane: t.plane, part: t.part, n: [n[0], n[1], n[2]], d};
    }),
    rawParts: u.parts.map((p): GoldenPart => ({id: p.id, name: p.name, positions: [...p.soup.positions], tris: [...p.soup.tris], faceIDs: [...p.soup.faceIDs]})),
    booleanOutput: {status: u.status, ...meshRecord(u.boolean)},
    unionOutput: {genus: u.genus, ...meshRecord(u.mesh), triTags: u.triTags.map((t): PartlessTag => ({kind: t.kind, storey: t.storey, wall: t.wall, plane: t.plane}))},
  };
}

/** The C++ replay's Cell lattice (journal decision 152): 50 cm. */
export const CPP_CELL_CM = 50;
/** The C++ replay's corner slack on its lattice, in cm. */
export const CPP_LATTICE_SLACK_CM = 1e-6;
/** The C++ replay's storey cap: a Ring's `baseStorey + storeys` at most this. */
export const CPP_MAX_STOREY = 32;

/** A replayable fixture (journal decision 152, amended). */
export const ReplayableSchema = z.strictObject({cppReplayable: z.literal(true)});
/**
 * A fixture the C++ cannot replay, and every reason, one string each (journal decision 160, N6): `readInput`'s own
 * refusals contain `'; '`, so a joined string could not be split.
 */
export const NotReplayableSchema = z.strictObject({cppReplayable: z.literal(false), reasons: z.array(z.string().min(1)).min(1)});

/** Whether the C++ can replay a fixture's input (journal decision 152, amended), and every reason it cannot. */
export type Replayability = z.output<typeof ReplayableSchema> | z.output<typeof NotReplayableSchema>;

/**
 * Journal decision 152, amended: whether a fixture's `input@1` is shown to replay in the C++, a conservative subset of
 * what the C++ replay accepts, never that set exactly (journal decision 182). `true` means this prototype can show the
 * replay contains the file's runs; `false` means only that it cannot, not that the C++ refuses the file. The flag holds
 * when the document (as `writeInput` writes it, one run per side the side's whole length, which the C++ replay matches
 * by containment) has every corner on the 50 cm Cell lattice within 1e-6 cm, every `ringIndex` its array position, a
 * cell size of 50, a storey height of a whole number of Cells, and no Ring reaching past storey 32, and (journal
 * decision 158, 2) when the prototype's own `readInput` accepts it, so a fixture the wire's bounds refuse (a pitch
 * outside [7°, 75°]) is never offered to the C++ as replayable, and (journal decisions 179, finding 1, and 181, N1)
 * when every side carries exactly one run, from 0 to the side's snapped length, within `WIRE_CORNER_SNAP_CM`
 * (`isOneWholeRun`). Otherwise every reason is given, in that order: `readInput`'s refusals one reason each (journal
 * decision 160, N6), or, only when `readInput` accepts the file, the run shape's one reason (journal decision 181, B1).
 */
export const cppReplayability = (f: ShellFixture): Replayability => cppReplayabilityOf(writeInput(f));

/** The reasons `cppReplayability` gives for a document `readInput` refuses: one per refusal, every one. */
export const readInputRefusals = (errors: readonly string[]): string[] => errors.map(e => `readInput refuses it: ${e}`);

/** The reason `cppReplayability` gives for a document with a side that is not one run of its whole length. */
export const NOT_ONE_WHOLE_RUN = 'a side not one run from 0 to its length';

/**
 * One file side of a document `readInput` accepts, with its length between its snapped corners (journal decision 181,
 * N1).
 */
export interface SnappedSide { side: WireSide; lengthCm: number }

/**
 * Journal decision 181, N1: every side of a document `readInput` accepts, measured as spec 16 measures it, along its
 * snapped corners. Each fixture Ring's rect is its file Ring's snapped corners, the file Ring found by its model index
 * (unique, or `readInput` refuses the file), and each compass side's file slot is the read's `sideSlots`.
 */
export function snappedSides(read: AdaptedInput): SnappedSide[] {
  return read.fixture.rings.flatMap((ring, position) => {
    const modelIndex = read.modelIndices[position];
    const file = read.input.rings.find(r => r.modelIndex === modelIndex);
    if (!file) throw new Error(`readInput's fixture Ring ${position} names model index ${modelIndex}, which its input does not hold`);
    const lines = ringSideLines(ring.rect);
    return RING_SIDES.map((c): SnappedSide => ({side: file.sides[read.sideSlots[position][c]], lengthCm: lines[c].hi - lines[c].lo}));
  });
}

/**
 * Journal decisions 179, finding 1, and 181, N1: whether a side carries exactly one run, from 0 to the side's snapped
 * length, each end within `WIRE_CORNER_SNAP_CM`. That is the run shape `writeInput` writes, and the only one this
 * prototype can show the C++ replay will contain: a lone box's plate run is its whole side, which no split run
 * contains, and the C++ plate runs are not derivable here (decision 152).
 */
export function isOneWholeRun({side, lengthCm}: SnappedSide): boolean {
  if (side.runs.length !== 1) return false;
  const [run] = side.runs;
  return Math.abs(run.startCm) <= WIRE_CORNER_SNAP_CM && Math.abs(run.endCm - lengthCm) <= WIRE_CORNER_SNAP_CM;
}

/**
 * `cppReplayability` of an `input@1` document as written. It never throws on a malformed document (journal decision
 * 181, B1): the run shape is read only from a document `readInput` accepts, and a refused one gives its refusals alone.
 */
export function cppReplayabilityOf(input: BuildingShellInputV1): Replayability {
  const onLattice = (v: number): boolean => Math.abs(v - CPP_CELL_CM * Math.round(v / CPP_CELL_CM)) <= CPP_LATTICE_SLACK_CM;
  const reasons: string[] = [];
  if (!input.rings.every(r => r.corners.every(c => onLattice(c.x) && onLattice(c.y)))) reasons.push('corner off the Cell lattice');
  if (!input.rings.every((r, i) => r.ringIndex === i)) reasons.push('ringIndex not its array position');
  if (input.cellSizeCm !== CPP_CELL_CM) reasons.push(`cellSize not ${CPP_CELL_CM}`);
  if (!onLattice(input.storeyHeightCm)) reasons.push('storey height not a whole number of Cells');
  if (!input.rings.every(r => r.baseStorey + r.storeys <= CPP_MAX_STOREY)) reasons.push(`a Ring reaching past storey ${CPP_MAX_STOREY}`);
  // Read through JSON, as a file is: `readInput` never sees the writer's own objects.
  const read = readInput(JSON.parse(JSON.stringify(input)), 'cppReplayability');
  if (!read.ok) reasons.push(...readInputRefusals(read.errors));
  else if (!snappedSides(read).every(isOneWholeRun)) reasons.push(NOT_ONE_WHOLE_RUN);
  return reasons.length ? {cppReplayable: false, reasons} : {cppReplayable: true};
}

/** Spec decision 33's `ShellReport`, as the manifest pins it, checked against the type below. */
export const ShellReportSchema = z.strictObject({
  conflicts: z.array(z.string()),
  survivingInternal: z.number(),
  unclassifiedEdges: z.number(),
  cheeks: z.number(),
  partialCells: z.number(),
  newEdgeKinds: z.array(z.enum(EDGE_KINDS)),
  newConventions: z.array(z.string()),
});

/**
 * Journal decision 161 (Info): every residue class the golden set enrols, by a stable name. A residue's violation
 * strings carry prototype-internal ids, so the port keys on this name instead.
 */
export const RESIDUE_CLASS_NAMES = [
  'algorithm-B Cheek',
  'algorithm-B cut-piece overshoot',
  'partial coplanar contact of two storeys',
  'edge contact between opposite coplanar faces',
  'cleanMesh stuck cap',
  'Cell outside its face fan',
  'Gable-Wall edge Unclassified',
  'sub-tolerance roof feature',
  'low-pitch pocket',
  'roof meets the floor above',
  'near-touching islands',
  'courtyard cut collinear with a jutting wall',
] as const;

/** One residue class's stable name. */
export type ResidueClass = typeof RESIDUE_CLASS_NAMES[number];

/**
 * A genus per connected component, highest first (spec decision 32 as amended; journal decision 163, N5): one name for
 * the manifest's expected and measured genus and the tests' pinned expectations.
 */
export const GenusPerComponentSchema = z.array(z.number());

/** A genus per connected component, highest first (`GenusPerComponentSchema`). */
export type GenusPerComponent = Readonly<z.output<typeof GenusPerComponentSchema>>;

/**
 * What every manifest entry carries: the fixture's name and the genus per component its pin expects (journal decision
 * 161, finding 5: an expectation, never the shell's own genus).
 */
const EntryBaseSchema = z.strictObject({fixture: z.string().min(1), expectedGenus: GenusPerComponentSchema});

/**
 * A fixture whose build succeeded: the genus per component its union measures (decision 161, finding 5), its files and
 * its pinned report.
 */
const FilesSchema = z.strictObject({measuredGenus: GenusPerComponentSchema, shell: z.string(), union: z.string(), report: ShellReportSchema});

/**
 * A replayable fixture names its `input@1` file (journal decision 152), whether it builds or throws (decision 161,
 * finding 1), so the port can check whether its own build throws too.
 */
const InputSchema = z.strictObject({input: z.string()});

/**
 * Journal decision 156, F4: every entry says whether its fixture is clean, so a port reading a shell alone cannot take a
 * defect for truth. A clean build keeps every invariant against `expectedGenus`.
 */
const CleanSchema = z.strictObject({clean: z.literal(true), violations: z.tuple([])});

/** A residue's class, by its stable name (journal decision 161, Info). */
const ResidueClassSchema = z.strictObject({residueClass: z.enum(RESIDUE_CLASS_NAMES)});

/** A build that breaks an invariant: its class and exactly its violations, its enrolled defect. */
const DefectSchema = z.strictObject({clean: z.literal(false), ...ResidueClassSchema.shape, violations: z.array(z.string()).min(1)});

/** A fixture whose build throws: its class and its error, in place of its shell and union (journal decision 129). */
const RefusedSchema = z.strictObject({clean: z.literal(false), ...ResidueClassSchema.shape, error: z.string().min(1)});

/**
 * Journal decisions 129, 152, 155 (B10, N5), 156 (F4) and 161 (finding 1): one manifest entry, built on its
 * replayability, as a union of its files and outcome, clean or defective, or its error. Every replayable entry names its
 * input, a throwing one included.
 */
export const GoldenEntrySchema = z.union([
  EntryBaseSchema.extend(ReplayableSchema.shape).extend(FilesSchema.shape).extend(InputSchema.shape).extend(CleanSchema.shape),
  EntryBaseSchema.extend(ReplayableSchema.shape).extend(FilesSchema.shape).extend(InputSchema.shape).extend(DefectSchema.shape),
  EntryBaseSchema.extend(NotReplayableSchema.shape).extend(FilesSchema.shape).extend(CleanSchema.shape),
  EntryBaseSchema.extend(NotReplayableSchema.shape).extend(FilesSchema.shape).extend(DefectSchema.shape),
  EntryBaseSchema.extend(ReplayableSchema.shape).extend(InputSchema.shape).extend(RefusedSchema.shape),
  EntryBaseSchema.extend(NotReplayableSchema.shape).extend(RefusedSchema.shape),
]);

export type GoldenEntry = z.output<typeof GoldenEntrySchema>;

/** The manifest's file name in the golden set (journal decision 129). */
export const MANIFEST_FILE = 'manifest.json';

/** The manifest's schema tag. */
export const GOLDEN_SCHEMA = 'building-shell/golden@1';

/** The manifest: every named fixture, in the golden set's order. */
export const GoldenManifestSchema = z.strictObject({schema: z.literal(GOLDEN_SCHEMA), fixtures: z.array(GoldenEntrySchema)});

export type GoldenManifest = z.output<typeof GoldenManifestSchema>;

/** Compile-time (decision 155, N5): the report schema is `ShellReport`, both ways. */
const reportMatches: [z.output<typeof ShellReportSchema>] extends [ShellReport] ? ([ShellReport] extends [z.output<typeof ShellReportSchema>] ? true : never) : never = true;
void reportMatches;

/** A golden file's text: compact JSON and a final newline, so its bytes are its hash. */
export const goldenText = (x: unknown): string => `${JSON.stringify(x)}\n`;
