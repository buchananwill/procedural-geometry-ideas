import {Vector2} from './types';

/**
 * A region and the provenance of every run of its boundary: which parts of it are road.
 *
 * ## Provenance is carried, never recovered
 *
 * When a region is subdivided, each child's boundary is ENTIRELY NEW GEOMETRY — some of it lying on
 * the parent's boundary, some skeleton ridge, some a slice cut, some the offset contour — and each
 * child has to know which of its own runs carry access. Recovering that afterwards would mean
 * testing each child edge for coincidence with a parent access run: a proximity test, on
 * machine-generated geometry, at tolerances this codebase has already been bitten by. PROXIMITY IS
 * NEVER A CRITERION FOR A TOPOLOGICAL FACT. The operation that emits a boundary knows the provenance
 * of every edge at the moment it emits it, and the cost of carrying it is a tag per run.
 *
 * Get this wrong in the obvious way and lots front onto back fences. A block's boundary is only
 * partly street; a pass that treats all of it as frontage produces parcels with no access, and the
 * egress invariant passes them, because their frontage is non-degenerate and contiguous. That
 * invariant is a proxy for reachability which happens to be exact only at the first level.
 *
 * ## This generalises `Strip`, and replaces nothing yet
 *
 * `Strip.supportingEdgeIds` names the exterior edges a strip fronts and `Strip.frontage` is their
 * polyline — already "the road-bearing part of this region's boundary", derived from exterior-edge
 * identity. The generalisation is that frontage stops being DERIVED from exterior edges and becomes
 * LABELLED on the boundary, so a spine-facing or lane-facing run is frontage on the same footing.
 * Nothing here performs that generalisation: `computeStrips` and `sliceStrip` are the producers and
 * they emit provenance in the task that makes them recursive. This module fixes the vocabulary and
 * the root so that when they change there is a target to emit into rather than a shape invented at
 * the call site.
 *
 * ## Plain data plus free functions
 *
 * {@link Region} carries no methods, for the reason `SkeletonNormalisation` and {@link
 * import('./skeleton-tree').SkeletonTree} carry none: these values cross into workers and the
 * dashboard, where they are `structuredClone`d, and methods do not survive that — they become
 * `undefined` silently.
 *
 * ## Runs index EDGES, and they partition the boundary exactly
 *
 * Edge `i` of a region runs from `boundary[i]` to `boundary[(i + 1) % boundary.length]`, so a closed
 * ring of `n` vertices has exactly `n` edges. A {@link BoundaryRun} is an inclusive, cyclic span of
 * those edge indices. Every edge belongs to EXACTLY ONE run, runs chain end-to-start around the
 * ring, and adjacent runs never share a provenance — two adjacent runs with the same tag are one
 * run. {@link assertBoundaryPartition} is that statement made executable, because a gap or an
 * overlap is otherwise silent: it produces a region whose frontage is quietly shorter or
 * double-counted, and every downstream invariant still passes.
 *
 * ## Zero access runs is legal here
 *
 * A gated courtyard that stays a shared garden has no connector by design, so a region with no
 * access run is not an error at construction. It becomes an error when something tries to slice or
 * recurse it, which is where that check belongs — not here.
 */

/** Where a run of a region's boundary came from, which is what decides whether it carries access. */
export type BoundaryProvenance =
    | 'perimeter-access'    // lies on a parent access run: inherited road
    | 'perimeter-plain'     // lies on the parent boundary, but not on an access run
    | 'ridge'               // a skeleton bisector chain: shared with the region behind
    | 'cut'                 // a slice cut: shared with the neighbour alongside
    | 'contour'             // the offset contour: the inner edge of a partial-depth pass
    | 'lane'                // a promoted radial connector, this level or an ancestor's
    | 'spine';              // a spine extracted at this level

/**
 * A contiguous, cyclic run of a region's boundary, `[startIndex, endIndex]` inclusive.
 *
 * The indices are EDGE indices, not vertex indices: the run covers edges `startIndex` through
 * `endIndex` walking forward around the ring, wrapping when `endIndex < startIndex`. A run therefore
 * covers at least one edge and never zero, and `{startIndex: 0, endIndex: n - 1}` is the whole
 * boundary.
 */
export interface BoundaryRun {
    startIndex: number;
    endIndex: number;
    provenance: BoundaryProvenance;
}

export interface Region {
    /** Closed polygon, clockwise, no duplicated closing vertex. */
    boundary: Vector2[];
    /** Partitions the boundary exactly: every edge belongs to exactly one run. */
    runs: BoundaryRun[];
}

/**
 * The three provenances that carry access, and the whole of the definition of "road".
 *
 * `ridge`, `cut` and `contour` are boundaries SHARED with a neighbouring region, and
 * `perimeter-plain` is a stretch of parent boundary that was never a road — a region marked against
 * a cliff, or against an existing piste. None of those four can be fronted onto.
 */
export const ACCESS_PROVENANCES: readonly BoundaryProvenance[] = ['perimeter-access', 'lane', 'spine'];

const ACCESS_PROVENANCE_SET: ReadonlySet<BoundaryProvenance> = new Set(ACCESS_PROVENANCES);

/** Below this a ring is not a polygon, so it cannot be a region boundary either. */
const MINIMUM_BOUNDARY_SIZE = 3;

/** Whether a run tagged with this provenance is one a parcel may take frontage on. */
export function isAccessProvenance(provenance: BoundaryProvenance): boolean {
    return ACCESS_PROVENANCE_SET.has(provenance);
}

/** How many boundary edges a run covers, on a ring of `edgeCount` edges. Never zero. */
export function runEdgeCount(run: BoundaryRun, edgeCount: number): number {
    return ((run.endIndex - run.startIndex + edgeCount) % edgeCount) + 1;
}

/**
 * Throw unless `runs` partitions a ring of `edgeCount` edges exactly, per this module's header.
 *
 * Checked, in order: the run list is non-empty; every index is an integer inside the ring; each run
 * begins on the edge after its predecessor ends, cyclically; the covered edge counts sum to
 * `edgeCount` exactly; and no two adjacent runs share a provenance. The chain check is what catches
 * a gap and an overlap, and the sum is what catches a run list that laps the ring.
 */
export function assertRunPartition(runs: readonly BoundaryRun[], edgeCount: number): void {
    if (runs.length === 0) {
        throw new Error('A boundary partition is empty: a region needs at least one run.');
    }

    for (const [position, run] of runs.entries()) {
        assertEdgeIndex(run.startIndex, edgeCount, `Run ${position} startIndex`);
        assertEdgeIndex(run.endIndex, edgeCount, `Run ${position} endIndex`);
    }

    let covered = 0;
    for (const [position, run] of runs.entries()) {
        covered += runEdgeCount(run, edgeCount);

        const next = runs[(position + 1) % runs.length];
        const expectedStart = (run.endIndex + 1) % edgeCount;
        if (next.startIndex !== expectedStart) {
            throw new Error(
                `Boundary runs do not partition the ring: run ${position} ends on edge ${run.endIndex}, `
                + `so run ${(position + 1) % runs.length} must start on edge ${expectedStart}, but it `
                + `starts on edge ${next.startIndex}. That seam is a gap or an overlap.`);
        }
    }

    if (covered !== edgeCount) {
        throw new Error(
            `Boundary runs cover ${covered} edges of a ${edgeCount}-edge ring: every edge must belong `
            + 'to exactly one run.');
    }

    // A single run is adjacent only to itself and is the whole boundary, so it is exempt: the rule
    // it enforces — two adjacent runs with the same tag are ONE run — is already true of it.
    if (runs.length < 2) {
        return;
    }

    for (const [position, run] of runs.entries()) {
        const next = runs[(position + 1) % runs.length];
        if (run.provenance === next.provenance) {
            throw new Error(
                `Boundary runs ${position} and ${(position + 1) % runs.length} are adjacent and share `
                + `the provenance '${run.provenance}': two adjacent runs with the same tag are one run.`);
        }
    }
}

/** {@link assertRunPartition} applied to a region's own runs and boundary. */
export function assertBoundaryPartition(region: Region): void {
    assertRunPartition(region.runs, region.boundary.length);
}

/** Throw unless `index` is an edge of a ring of `edgeCount` edges. */
function assertEdgeIndex(index: number, edgeCount: number, what: string): void {
    if (!Number.isInteger(index)) {
        throw new Error(`${what} is ${index}, which is not an integer edge index.`);
    }
    if (index < 0 || index >= edgeCount) {
        throw new Error(`${what} is ${index}, outside the range [0, ${edgeCount}) of a ${edgeCount}-edge ring.`);
    }
}

/**
 * The runs a parcel in this region may take frontage on: exactly those tagged `perimeter-access`,
 * `lane` or `spine`.
 *
 * Returns copies, so a caller cannot reach back into the region through the runs it was handed. An
 * empty result is a legitimate answer, not a failure — see this module's header.
 */
export function accessRuns(region: Region): BoundaryRun[] {
    return region.runs
        .filter(run => isAccessProvenance(run.provenance))
        .map(run => ({...run}));
}

/**
 * A root region from a bare polygon, whose access runs default to the WHOLE perimeter.
 *
 * The default matches today's behaviour, where the perimeter is the street, so nothing existing
 * changes. A supplied `access` subset is what a region marked against a cliff, an existing piste or
 * another region needs, and it is the same mechanism a region's entrance points will use — it is
 * built now and left unused rather than retrofitted through the recursion driver later.
 *
 * THE SUBSET IS VALIDATED AGAINST THE BOUNDARY AND A MALFORMED ONE IS REJECTED LOUDLY: indices
 * integral and in range, and runs non-overlapping. This is caller input, and a silently-dropped
 * access run produces parcels with no road and no complaint. What is NOT malformed is a subset that
 * leaves gaps or that spells one stretch as two adjacent runs: the complement is filled with
 * `perimeter-plain` so the partition holds, and adjacent runs sharing a provenance are emitted as
 * the single run they are. `provenance` on a supplied run is honoured as given, so an entrance may
 * be handed in as `lane` or `spine` rather than `perimeter-access`.
 *
 * The boundary is copied vertex by vertex and never aliased, matching `canonicalisation.ts`.
 */
export function makeRootRegion(boundary: Vector2[], access?: BoundaryRun[]): Region {
    if (boundary.length < MINIMUM_BOUNDARY_SIZE) {
        throw new Error(
            `A region boundary needs at least ${MINIMUM_BOUNDARY_SIZE} vertices; `
            + `${boundary.length} were supplied.`);
    }

    const edgeCount = boundary.length;
    const region: Region = {
        boundary: boundary.map(vertex => ({x: vertex.x, y: vertex.y})),
        runs: groupIntoRuns(labelEdges(access ?? [{startIndex: 0, endIndex: edgeCount - 1, provenance: 'perimeter-access'}], edgeCount)),
    };

    // The partition is asserted on the way out rather than trusted: this constructor is the one
    // place a region enters the system, and decision 3's check is worthless if it only ever runs on
    // regions someone else already validated.
    assertBoundaryPartition(region);
    return region;
}

/**
 * One provenance per edge, from the supplied access runs, with everything they did not claim left
 * `perimeter-plain`.
 *
 * An edge claimed twice is the malformed case decision 10 names, and it is reported as an overlap
 * rather than resolved by last-writer-wins — a silently-dropped access run produces parcels with no
 * road and no complaint.
 */
function labelEdges(access: readonly BoundaryRun[], edgeCount: number): BoundaryProvenance[] {
    const labels: BoundaryProvenance[] = new Array(edgeCount).fill('perimeter-plain');
    const claimedBy: number[] = new Array(edgeCount).fill(-1);

    for (const [position, run] of access.entries()) {
        assertEdgeIndex(run.startIndex, edgeCount, `Access run ${position} startIndex`);
        assertEdgeIndex(run.endIndex, edgeCount, `Access run ${position} endIndex`);

        const span = runEdgeCount(run, edgeCount);
        for (let step = 0; step < span; step++) {
            claimEdge(labels, claimedBy, (run.startIndex + step) % edgeCount, position, run.provenance);
        }
    }

    return labels;
}

/** Record one edge as this run's, or report the overlap with whichever run took it first. */
function claimEdge(
    labels: BoundaryProvenance[],
    claimedBy: number[],
    edge: number,
    position: number,
    provenance: BoundaryProvenance,
): void {
    if (claimedBy[edge] !== -1) {
        throw new Error(
            `Access runs ${claimedBy[edge]} and ${position} overlap on edge ${edge}: `
            + 'a boundary edge belongs to exactly one run.');
    }
    claimedBy[edge] = position;
    labels[edge] = provenance;
}

/**
 * Per-edge provenances gathered into the maximal cyclic runs they describe.
 *
 * Walking from the first SEAM — the first edge whose provenance differs from its predecessor's — is
 * what makes the answer canonical rather than an artefact of starting at edge 0: a stretch that
 * wraps past the seam between edges `n - 1` and `0` comes back as one run, and a caller who spelled
 * one stretch as two adjacent runs of the same tag gets the single run they meant. With no seam at
 * all every edge shares one provenance, which is the whole boundary as a single run.
 */
function groupIntoRuns(labels: readonly BoundaryProvenance[]): BoundaryRun[] {
    const edgeCount = labels.length;
    const firstSeam = labels.findIndex(
        (provenance, edge) => provenance !== labels[(edge - 1 + edgeCount) % edgeCount]);

    if (firstSeam === -1) {
        return [{startIndex: 0, endIndex: edgeCount - 1, provenance: labels[0]}];
    }

    const runs: BoundaryRun[] = [];
    for (let step = 0; step < edgeCount; step++) {
        const edge = (firstSeam + step) % edgeCount;
        const current = runs[runs.length - 1];
        if (current !== undefined && current.provenance === labels[edge]) {
            current.endIndex = edge;
        } else {
            runs.push({startIndex: edge, endIndex: edge, provenance: labels[edge]});
        }
    }

    return runs;
}

/**
 * The vertices at which one run gives way to the next: the vertices canonicalisation must PIN.
 *
 * A run boundary is where access changes to non-access, which is semantically significant however
 * small its deviation happens to be — and a lane mouth can meet a frontage almost tangentially, so
 * the deviation genuinely can fall under the noise floor. Pinning these costs nothing (they are a
 * handful of vertices) and removes the whole class of failure where a canonicalisation silently
 * fuses a road run into the fence beside it.
 *
 * Run `k` starts on edge `startIndex`, whose first vertex has the same index; on a valid partition
 * that vertex is exactly where run `k - 1` stopped. A SINGLE run has no such vertex — it gives way
 * to nothing — so a whole-perimeter region pins nothing and canonicalises exactly as it does today.
 */
export function runBoundaryVertexIndices(runs: readonly BoundaryRun[]): number[] {
    if (runs.length < 2) {
        return [];
    }
    return [...new Set(runs.map(run => run.startIndex))].sort((left, right) => left - right);
}

/**
 * Carry runs recorded against a polygon onto the polygon canonicalisation returned, through the
 * index remap rather than by recomputing them from geometry.
 *
 * Removing a vertex renumbers every index after it, so a {@link BoundaryRun} recorded before
 * canonicalisation refers to the wrong edges after it. Recomputing the runs from the new geometry is
 * the forbidden proximity test wearing a different hat, so the remap is threaded through instead —
 * the same move the stroke pipeline's `inputToDeduped` makes for the same reason.
 *
 * `indexRemap` is {@link import('./canonicalisation').CanonicalPolygon.indexRemap}: input vertex
 * index to surviving vertex index, `REMOVED_VERTEX_INDEX` where the vertex did not survive. A run is
 * bounded by the vertex it starts on and the vertex its last edge ends on; both must have survived,
 * which is what pinning {@link runBoundaryVertexIndices} guarantees. THROWS IF EITHER DID NOT,
 * because a run whose boundary was canonicalised away has no honest image on the new ring and
 * inventing one is how a road quietly becomes a fence.
 *
 * A WHOLE-PERIMETER RUN IS THE ONE EXEMPTION, and it is the same exemption
 * {@link runBoundaryVertexIndices} makes: such a run gives way to nothing, so it pins nothing, so the
 * vertex it happens to be spelled from is free to be culled. Its start and its far bound are the same
 * vertex and neither carries any meaning — the run covers every edge either way — so it is carried
 * onto the entire surviving ring without asking whether that vertex survived. Requiring it here would
 * make a whole-perimeter region, which is exactly what `makeRootRegion(boundary)` builds, throw
 * whenever canonicalisation happened to take vertex 0.
 */
export function remapRuns(
    runs: readonly BoundaryRun[],
    indexRemap: readonly number[],
    survivingCount: number,
): BoundaryRun[] {
    const inputCount = indexRemap.length;

    return runs.map((run, position) => (
        runEdgeCount(run, inputCount) === inputCount
            // Spelled from edge 0, which is `groupIntoRuns`'s own spelling of a seamless ring.
            ? {startIndex: 0, endIndex: survivingCount - 1, provenance: run.provenance}
            : remapBoundedRun(run, position, indexRemap, survivingCount)));
}

/** A run bounded by two distinct vertices, carried onto the images of those two vertices. */
function remapBoundedRun(
    run: BoundaryRun,
    position: number,
    indexRemap: readonly number[],
    survivingCount: number,
): BoundaryRun {
    const startVertex = remappedVertex(indexRemap, run.startIndex, position, 'starts on');
    // The vertex the run's LAST EDGE ENDS ON, which is the far bound of the run and the vertex the
    // next run starts at. Its image is one edge past the run's new end.
    const endVertex = remappedVertex(
        indexRemap, (run.endIndex + 1) % indexRemap.length, position, 'ends at');

    return {
        startIndex: startVertex,
        endIndex: (endVertex - 1 + survivingCount) % survivingCount,
        provenance: run.provenance,
    };
}

/** The surviving index of a run-bounding vertex, or a report that the pinning rule was not applied. */
function remappedVertex(
    indexRemap: readonly number[],
    vertexIndex: number,
    runPosition: number,
    role: string,
): number {
    const remapped = indexRemap[vertexIndex];
    if (remapped === undefined || remapped < 0) {
        throw new Error(
            `Run ${runPosition} ${role} vertex ${vertexIndex}, which canonicalisation removed. A run `
            + 'boundary must be pinned before canonicalisation; a run whose boundary went has no '
            + 'image on the surviving ring.');
    }
    return remapped;
}
