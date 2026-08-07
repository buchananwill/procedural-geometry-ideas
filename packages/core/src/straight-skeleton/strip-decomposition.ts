import type {SkeletonSolveResult, StraightSkeletonGraph, Vector2} from './types';
import {computeNodeOffsets, requireProjectableResult} from './offset-projection';

/**
 * Decomposition of a solved block into street-facing strips.
 *
 * This is step one of the parcel subdivision of Vanegas et al., *Procedural Generation of Parcels in
 * Urban Modeling* (Eurographics 2012), §4.2. A block is offset inward by `d_offset`; the region
 * between the boundary and that offset contour is carved into strips, one per street; a later pass
 * slices each strip into parcels. This module builds the strips and stops there.
 *
 * ## Strips are skeleton faces, clipped
 *
 * Every exterior edge of a straight skeleton owns exactly one face: the region swept by that edge as
 * the boundary marches inward. Those faces tile the polygon exactly. Inside the face of edge `e`,
 * a point's skeleton offset is simply its perpendicular distance from the supporting line of `e`, so
 * "clip the face at depth `d`" is a half-plane clip parallel to `e` — no contour intersection
 * required. A strip is the union of the clipped faces of the exterior edges it is supported by, and
 * the tiling property survives the clip: the strips plus the offset rings tile the polygon.
 *
 * ## Policy is injected, never inferred
 *
 * Vanegas groups faces into a strip per *logical street*, and resolves the diagonal seam where two
 * strips meet by a per-vertex rule that compares street widths or street lengths. A bare polygon has
 * no street network — there is no width to compare and no way to tell a two-segment curve in one
 * road from a genuine junction of two roads. Both decisions are therefore parameters:
 * {@link StripOptions.sameLogicalStreet} and {@link StripOptions.classifyCorner}. The defaults are
 * the identity policies — merge nothing, move nothing — so the default output is the finest possible
 * α-strip decomposition and the β-strips equal the α-strips.
 */

/** Slack for comparing an offset against the clip depth. */
const EPSILON = 1e-9;

/** A strip of the block: one logical street's frontage and the land behind it. */
export interface Strip {
    /** Exterior edge ids forming this strip's logical street, in boundary order. */
    supportingEdgeIds: number[];
    /**
     * Closed polygon of the strip, clockwise, no duplicated closing vertex.
     *
     * Empty when the strip has no area, which happens only at `depth === 0`.
     */
    boundary: Vector2[];
    /**
     * Counter-clockwise inner contours of {@link boundary}, if any.
     *
     * A strip supported by a single edge never has one — a clipped skeleton face is simply
     * connected. Holes appear only when a `sameLogicalStreet` policy merges enough of the boundary
     * for the strip to close a loop around a piece of the offset contour, which in the limit is the
     * "one street all the way round" case. Usually empty.
     */
    holes: Vector2[][];
    /** The street-facing polyline: the supporting edges, in order. */
    frontage: Vector2[];
}

/**
 * What a corner classifier is told about the seam between two adjacent strips.
 *
 * The seam is the skeleton bisector chain running inward from `vertex`, the boundary vertex the two
 * strips meet at. `previous` is the strip whose frontage *ends* at that vertex; `next` is the strip
 * whose frontage *starts* there.
 *
 * Vanegas' own two rules are both expressible from this:
 *
 * - **StreetWidth** — look the streets up by their edge ids (`previousEdgeIds` / `nextEdgeIds`) in
 *   whatever road network the caller holds, and award the corner to the wider one. The ids are what
 *   make this possible; nothing about a bare polygon knows road widths.
 * - **StreetLength** — compare `previousFrontageLength` against `nextFrontageLength` and award the
 *   corner to the longer street.
 */
export interface CornerContext {
    /** The boundary vertex the two strips meet at. */
    vertex: Vector2;
    /** Supporting exterior edge ids of the strip whose frontage ends at `vertex`, in boundary order. */
    previousEdgeIds: number[];
    /** Supporting exterior edge ids of the strip whose frontage starts at `vertex`, in boundary order. */
    nextEdgeIds: number[];
    /** Total length of the previous strip's frontage — Vanegas' StreetLength for that street. */
    previousFrontageLength: number;
    /** Total length of the next strip's frontage — Vanegas' StreetLength for that street. */
    nextFrontageLength: number;
    /** Length of the single exterior edge arriving at `vertex` from the previous strip. */
    previousEdgeLength: number;
    /** Length of the single exterior edge leaving `vertex` into the next strip. */
    nextEdgeLength: number;
    /** Interior angle of the block at `vertex`, in radians, in `(0, 2π)`. Reflex corners exceed π. */
    interiorAngle: number;
    /** The inward depth the strips were cut at, echoed back for convenience. */
    depth: number;
    /** Index of the previous strip in the array `computeStrips` is about to return. */
    previousStripIndex: number;
    /** Index of the next strip in the array `computeStrips` is about to return. */
    nextStripIndex: number;
}

/** Which of two adjacent strips takes the near-triangular region at the vertex they share. */
export type CornerAssignment = 'previous' | 'next' | 'none';

export interface StripOptions {
    /** Inward depth, `d_offset` in the paper. */
    depth: number;
    /**
     * Are these two adjacent exterior edges the same logical street?
     *
     * Called once per adjacent pair, `(i, i + 1)` around the boundary including the wrap from last
     * back to first. Default: never merge, giving one strip per exterior edge.
     */
    sameLogicalStreet?: (edgeIdA: number, edgeIdB: number) => boolean;
    /**
     * Which side gets the corner region at the vertex shared by two adjacent strips.
     *
     * Default: `'none'`, which leaves the diagonal seam where the skeleton put it — the β-strips are
     * then exactly the α-strips.
     */
    classifyCorner?: (context: CornerContext) => CornerAssignment;
}

/** A neighbour in the skeleton's planar embedding, with the direction to reach it. */
interface Neighbour {
    node: number;
    angle: number;
}

/** A vertex of an unclipped skeleton face. */
interface FacePoint {
    node: number;
    position: Vector2;
    offset: number;
}

/** The junction between two consecutive strips: where they meet and which edges meet there. */
interface Corner {
    /** Index of the strip whose frontage ends at the shared vertex. */
    previousStripIndex: number;
    /** Index of the strip whose frontage starts at the shared vertex. */
    nextStripIndex: number;
    /** Boundary node id shared by the two strips. */
    vertexNode: number;
    /** Exterior edge arriving at the vertex. */
    incomingEdgeId: number;
    /** Exterior edge leaving the vertex. */
    outgoingEdgeId: number;
}

function positionKey(point: Vector2): string {
    return `${point.x},${point.y}`;
}

function samePoint(a: Vector2, b: Vector2): boolean {
    return a.x === b.x && a.y === b.y;
}

/** Signed area, positive counter-clockwise, negative clockwise. */
function signedArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function dropRepeatedVertices(ring: Vector2[]): Vector2[] {
    const kept: Vector2[] = [];
    for (const vertex of ring) {
        if (kept.length === 0 || !samePoint(kept[kept.length - 1], vertex)) {
            kept.push(vertex);
        }
    }
    while (kept.length > 1 && samePoint(kept[0], kept[kept.length - 1])) {
        kept.pop();
    }
    return kept;
}

/**
 * The skeleton as an undirected planar graph: every node mapped to its neighbours, sorted by the
 * angle of the direction that reaches them.
 *
 * Both exterior edges and resolved interior edges are included. An interior edge the solver never
 * terminated has no target and cannot bound a face, so it is left out; a duplicate connection
 * between the same pair of nodes is kept once, since the second copy would only add a zero-area
 * sliver and would break the angular ordering the face walk depends on.
 */
function buildAdjacency(graph: StraightSkeletonGraph): Map<number, Neighbour[]> {
    const adjacency = new Map<number, Neighbour[]>();
    const connected = new Set<string>();

    const link = (from: number, to: number): void => {
        const source = graph.nodes[from].position;
        const target = graph.nodes[to].position;
        const neighbours = adjacency.get(from) ?? [];
        neighbours.push({node: to, angle: Math.atan2(target.y - source.y, target.x - source.x)});
        adjacency.set(from, neighbours);
    };

    const connect = (a: number, b: number): void => {
        if (a === b || graph.nodes[a] === undefined || graph.nodes[b] === undefined) {
            return;
        }
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (connected.has(key)) {
            return;
        }
        connected.add(key);
        link(a, b);
        link(b, a);
    };

    for (let edgeId = 0; edgeId < graph.numExteriorNodes; edgeId++) {
        const edge = graph.edges[edgeId];
        if (edge?.target !== undefined) {
            connect(edge.source, edge.target);
        }
    }
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (edge?.target !== undefined) {
            connect(edge.source, edge.target);
        }
    }

    for (const neighbours of adjacency.values()) {
        neighbours.sort((a, b) => a.angle - b.angle);
    }
    return adjacency;
}

/**
 * Walk the face lying to the right of the directed edge `start -> second`.
 *
 * At every node the walk takes the next neighbour counter-clockwise from the direction it came in
 * on, which is the sharpest available clockwise turn and therefore hugs the face on the right. The
 * polygon is stored clockwise, so seeding with an exterior edge in boundary order yields that edge's
 * skeleton face, traced clockwise.
 */
function traceFace(adjacency: Map<number, Neighbour[]>, start: number, second: number, limit: number): number[] {
    const face = [start];
    let previous = start;
    let current = second;

    while (current !== start) {
        face.push(current);
        const neighbours = adjacency.get(current);
        if (neighbours === undefined) {
            throw new Error(`computeStrips could not trace a skeleton face: node ${current} has no neighbours.`);
        }
        const arrivedFrom = neighbours.findIndex(neighbour => neighbour.node === previous);
        if (arrivedFrom < 0) {
            throw new Error(
                `computeStrips could not trace a skeleton face: node ${current} does not list node ` +
                `${previous} as a neighbour, so the skeleton graph is not a consistent planar embedding.`);
        }
        previous = current;
        current = neighbours[(arrivedFrom + 1) % neighbours.length].node;
        if (face.length > limit) {
            throw new Error(
                `computeStrips could not trace a skeleton face: the walk from node ${start} visited ` +
                `more than ${limit} nodes without closing.`);
        }
    }

    return face;
}

/**
 * The point at skeleton offset `depth` on the arc between two face vertices.
 *
 * Cached per node pair, in a canonical order, so that the two faces either side of an arc are handed
 * the identical object. That identity is what lets adjacent clipped faces be unioned by cancelling
 * opposite directed segments: were each face to compute its own crossing point, the two would differ
 * in the last bits and nothing would cancel.
 */
function makeCrossingLookup(depth: number): (a: FacePoint, b: FacePoint) => Vector2 {
    const cache = new Map<string, Vector2>();
    return (a: FacePoint, b: FacePoint): Vector2 => {
        const [low, high] = a.node <= b.node ? [a, b] : [b, a];
        const key = `${low.node}-${high.node}`;
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const span = high.offset - low.offset;
        const fraction = span === 0 ? 0 : (depth - low.offset) / span;
        const crossing = fraction <= 0
            ? low.position
            : fraction >= 1
                ? high.position
                : {
                    x: low.position.x + fraction * (high.position.x - low.position.x),
                    y: low.position.y + fraction * (high.position.y - low.position.y),
                };
        cache.set(key, crossing);
        return crossing;
    };
}

/**
 * Clip one skeleton face to the band within `depth` of its own supporting edge.
 *
 * Sutherland–Hodgman against the half-plane `offset <= depth`. Within a skeleton face the offset is
 * the perpendicular distance to the supporting line of the face's edge, so the half-plane is a
 * straight line parallel to that edge and the clip is exact. The face is monotone away from its edge
 * — the swept region above every point of the edge is one interval — so the clipped result is a
 * single simple polygon even where the face has been notched by a split event.
 */
function clipFaceToDepth(
    face: FacePoint[],
    depth: number,
    crossingAt: (a: FacePoint, b: FacePoint) => Vector2,
): Vector2[] {
    const clipped: Vector2[] = [];
    for (let i = 0; i < face.length; i++) {
        const current = face[i];
        const next = face[(i + 1) % face.length];
        const currentInside = current.offset <= depth + EPSILON;
        const nextInside = next.offset <= depth + EPSILON;
        if (currentInside) {
            clipped.push(current.position);
        }
        if (currentInside !== nextInside) {
            clipped.push(crossingAt(current, next));
        }
    }
    return dropRepeatedVertices(clipped);
}

/**
 * Union a set of clipped faces that tile a region, by cancelling shared boundary.
 *
 * Every face is wound clockwise, so an arc interior to the union appears twice, once in each
 * direction. Cancelling those pairs leaves exactly the segments on the union's boundary, which are
 * then stitched back into closed contours. No general polygon boolean is involved, and none is
 * needed: the inputs already meet exactly, vertex for vertex.
 */
function unionOfTiles(tiles: Vector2[][]): Vector2[][] {
    const points = new Map<string, Vector2>();
    const remaining = new Map<string, number>();

    for (const tile of tiles) {
        for (let i = 0; i < tile.length; i++) {
            const from = tile[i];
            const to = tile[(i + 1) % tile.length];
            const fromKey = positionKey(from);
            const toKey = positionKey(to);
            if (fromKey === toKey) {
                continue;
            }
            points.set(fromKey, from);
            points.set(toKey, to);

            const reversed = `${toKey}|${fromKey}`;
            const reversedCount = remaining.get(reversed) ?? 0;
            if (reversedCount > 0) {
                remaining.set(reversed, reversedCount - 1);
                continue;
            }
            const forward = `${fromKey}|${toKey}`;
            remaining.set(forward, (remaining.get(forward) ?? 0) + 1);
        }
    }

    const outgoing = new Map<string, string[]>();
    for (const [segment, count] of remaining) {
        if (count <= 0) {
            continue;
        }
        const [fromKey, toKey] = segment.split('|');
        const targets = outgoing.get(fromKey) ?? [];
        for (let i = 0; i < count; i++) {
            targets.push(toKey);
        }
        outgoing.set(fromKey, targets);
    }

    return stitchContours(points, outgoing);
}

/**
 * Chain leftover directed segments into closed contours.
 *
 * Where several segments leave the same point — a pinch, where the region touches itself — the walk
 * takes the sharpest clockwise turn, the same rule the face trace uses, which keeps the enclosed
 * region on the right and separates the contours correctly instead of splicing them together.
 */
function stitchContours(points: Map<string, Vector2>, outgoing: Map<string, string[]>): Vector2[][] {
    const contours: Vector2[][] = [];

    const limit = points.size + 2;

    for (const seed of [...outgoing.keys()]) {
        for (;;) {
            const seedTargets = outgoing.get(seed);
            if (seedTargets === undefined || seedTargets.length === 0) {
                break;
            }

            const contour = [points.get(seed)!];
            let previousKey = seed;
            let currentKey = seedTargets.shift()!;
            let closed = false;

            while (contour.length <= limit) {
                if (currentKey === seed) {
                    closed = true;
                    break;
                }
                contour.push(points.get(currentKey)!);
                const targets = outgoing.get(currentKey);
                if (targets === undefined || targets.length === 0) {
                    break;
                }
                const chosen = sharpestClockwiseTurn(points, previousKey, currentKey, targets);
                const nextKey = targets[chosen];
                targets.splice(chosen, 1);
                previousKey = currentKey;
                currentKey = nextKey;
            }

            if (closed) {
                const deduped = dropRepeatedVertices(contour);
                if (deduped.length >= 3) {
                    contours.push(deduped);
                }
            }
        }
    }

    return contours;
}

/** Index within `targets` of the direction that turns furthest clockwise away from the arrival. */
function sharpestClockwiseTurn(
    points: Map<string, Vector2>,
    previousKey: string,
    currentKey: string,
    targets: string[],
): number {
    const current = points.get(currentKey)!;
    const previous = points.get(previousKey)!;
    const arrivalReversed = Math.atan2(previous.y - current.y, previous.x - current.x);

    let best = 0;
    let bestDelta = Infinity;
    targets.forEach((targetKey, index) => {
        const target = points.get(targetKey)!;
        const angle = Math.atan2(target.y - current.y, target.x - current.x);
        let delta = angle - arrivalReversed;
        while (delta <= 0) {
            delta += Math.PI * 2;
        }
        while (delta > Math.PI * 2) {
            delta -= Math.PI * 2;
        }
        if (delta < bestDelta) {
            bestDelta = delta;
            best = index;
        }
    });
    return best;
}

/** Group exterior edges into maximal runs of consecutive edges belonging to the same logical street. */
function groupIntoRuns(edgeCount: number, sameLogicalStreet: (a: number, b: number) => boolean): number[][] {
    if (edgeCount === 0) {
        return [];
    }
    if (edgeCount === 1) {
        return [[0]];
    }

    const mergedWithNext: boolean[] = [];
    for (let edgeId = 0; edgeId < edgeCount; edgeId++) {
        mergedWithNext.push(sameLogicalStreet(edgeId, (edgeId + 1) % edgeCount));
    }
    if (mergedWithNext.every(merged => merged)) {
        return [[...Array(edgeCount).keys()]];
    }

    let firstEdge = 0;
    for (let edgeId = 0; edgeId < edgeCount; edgeId++) {
        if (!mergedWithNext[(edgeId - 1 + edgeCount) % edgeCount]) {
            firstEdge = edgeId;
            break;
        }
    }

    const runs: number[][] = [];
    let run: number[] = [];
    for (let step = 0; step < edgeCount; step++) {
        const edgeId = (firstEdge + step) % edgeCount;
        run.push(edgeId);
        if (!mergedWithNext[edgeId]) {
            runs.push(run);
            run = [];
        }
    }
    if (run.length > 0) {
        runs.push(run);
    }
    return runs;
}

function frontageOf(graph: StraightSkeletonGraph, run: number[]): Vector2[] {
    const frontage = [graph.nodes[run[0]].position];
    for (const edgeId of run) {
        frontage.push(graph.nodes[(edgeId + 1) % graph.numExteriorNodes].position);
    }
    return frontage;
}

function polylineLength(polyline: Vector2[]): number {
    let total = 0;
    for (let i = 1; i < polyline.length; i++) {
        total += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].y - polyline[i - 1].y);
    }
    return total;
}

/**
 * Strips of a solved block: the land between the boundary and the inward offset contour at
 * `options.depth`, carved up one strip per logical street.
 *
 * With the default options every exterior edge is its own street and no corner region is moved, so
 * the result is one strip per exterior edge — the finest α-strip decomposition — and the β-strip
 * correction is the identity.
 *
 * Boundary behaviour:
 * - `depth === 0` gives every strip an empty `boundary`; the whole polygon is still outside them.
 * - `depth >= computeMaxOffset(result)` means the offset contour has vanished. The clip then removes
 *   nothing and each strip runs all the way to the skeleton itself, so the strips alone tile the
 *   polygon. That is the limiting case of the general statement, not a special one: strips plus
 *   offset rings always tile the polygon, and past the maximum offset there are no rings.
 *
 * @throws if `depth` is negative, or the solve is incomplete or has no solver context.
 */
export function computeStrips(result: SkeletonSolveResult, options: StripOptions): Strip[] {
    requireProjectableResult(result, 'computeStrips');

    const {depth} = options;
    if (!(depth >= 0)) {
        throw new Error(`computeStrips requires a non-negative depth, received ${depth}.`);
    }

    const {graph} = result;
    const edgeCount = graph.numExteriorNodes;
    if (edgeCount === 0) {
        return [];
    }

    const nodeOffsets = computeNodeOffsets(result);
    const adjacency = buildAdjacency(graph);
    const crossingAt = makeCrossingLookup(depth);
    const walkLimit = graph.nodes.length * 2 + 8;

    const clippedFaces: Vector2[][] = [];
    for (let edgeId = 0; edgeId < edgeCount; edgeId++) {
        const faceNodes = traceFace(adjacency, edgeId, (edgeId + 1) % edgeCount, walkLimit);
        const face: FacePoint[] = faceNodes.map(node => ({
            node,
            position: graph.nodes[node].position,
            offset: nodeOffsets.get(node) ?? 0,
        }));
        clippedFaces.push(clipFaceToDepth(face, depth, crossingAt));
    }

    const runs = groupIntoRuns(edgeCount, options.sameLogicalStreet ?? (() => false));
    const strips: Strip[] = runs.map(run => {
        const tiles = run.map(edgeId => clippedFaces[edgeId]).filter(tile => tile.length >= 3);
        const contours = run.length === 1 ? tiles : unionOfTiles(tiles);
        const outer = contours.filter(contour => signedArea(contour) < 0);
        const holes = contours.filter(contour => signedArea(contour) > 0);
        outer.sort((a, b) => signedArea(a) - signedArea(b));
        return {
            supportingEdgeIds: run,
            boundary: outer[0] ?? [],
            holes,
            frontage: frontageOf(graph, run),
        };
    });

    applyCornerCorrection(result, strips, options);
    return strips;
}

/** The corners between consecutive strips, in strip order, when there are at least two strips. */
function cornersBetweenStrips(strips: Strip[], edgeCount: number): Corner[] {
    if (strips.length < 2) {
        return [];
    }
    return strips.map((strip, index) => {
        const next = strips[(index + 1) % strips.length];
        const incomingEdgeId = strip.supportingEdgeIds[strip.supportingEdgeIds.length - 1];
        return {
            previousStripIndex: index,
            nextStripIndex: (index + 1) % strips.length,
            vertexNode: (incomingEdgeId + 1) % edgeCount,
            incomingEdgeId,
            outgoingEdgeId: next.supportingEdgeIds[0],
        };
    });
}

/**
 * Interior angle of the block at the vertex where `incoming` meets `outgoing`, in `(0, 2π)`.
 *
 * The polygon is wound clockwise, so the interior lies to the right of travel and the interior angle
 * is measured by turning clockwise from the outgoing direction back to the reversed incoming one.
 */
function interiorAngleAt(graph: StraightSkeletonGraph, incomingEdgeId: number, outgoingEdgeId: number): number {
    const edgeCount = graph.numExteriorNodes;
    const vertex = graph.nodes[(incomingEdgeId + 1) % edgeCount].position;
    const before = graph.nodes[incomingEdgeId].position;
    const after = graph.nodes[(outgoingEdgeId + 1) % edgeCount].position;

    const toBefore = Math.atan2(before.y - vertex.y, before.x - vertex.x);
    const toAfter = Math.atan2(after.y - vertex.y, after.x - vertex.x);
    let angle = toBefore - toAfter;
    while (angle <= 0) {
        angle += Math.PI * 2;
    }
    while (angle > Math.PI * 2) {
        angle -= Math.PI * 2;
    }
    return angle;
}

function applyCornerCorrection(result: SkeletonSolveResult, strips: Strip[], options: StripOptions): void {
    const {classifyCorner} = options;
    if (classifyCorner === undefined) {
        return;
    }

    const {graph} = result;
    const edgeCount = graph.numExteriorNodes;
    const frontageLengths = strips.map(strip => polylineLength(strip.frontage));
    const edgeLength = (edgeId: number): number => {
        const from = graph.nodes[edgeId].position;
        const to = graph.nodes[(edgeId + 1) % edgeCount].position;
        return Math.hypot(to.x - from.x, to.y - from.y);
    };

    for (const corner of cornersBetweenStrips(strips, edgeCount)) {
        const previous = strips[corner.previousStripIndex];
        const next = strips[corner.nextStripIndex];
        const assignment = classifyCorner({
            vertex: graph.nodes[corner.vertexNode].position,
            previousEdgeIds: previous.supportingEdgeIds,
            nextEdgeIds: next.supportingEdgeIds,
            previousFrontageLength: frontageLengths[corner.previousStripIndex],
            nextFrontageLength: frontageLengths[corner.nextStripIndex],
            previousEdgeLength: edgeLength(corner.incomingEdgeId),
            nextEdgeLength: edgeLength(corner.outgoingEdgeId),
            interiorAngle: interiorAngleAt(graph, corner.incomingEdgeId, corner.outgoingEdgeId),
            depth: options.depth,
            previousStripIndex: corner.previousStripIndex,
            nextStripIndex: corner.nextStripIndex,
        });
        if (assignment !== 'none') {
            transferCorner(graph, strips, corner, assignment);
        }
    }
}

/**
 * The seam two adjacent strips share, as a run of positions starting at their shared vertex.
 *
 * Both strips were assembled from the same node positions and the same cached arc crossings, so the
 * seam is literally the same objects in both arrays — forwards from the shared vertex in the
 * previous strip, backwards from it in the next one. Walking the two in opposite directions while
 * the positions agree recovers the whole seam without consulting the graph again.
 */
interface Seam {
    /** Positions from the shared vertex out to the deepest shared point. */
    points: Vector2[];
    /** Index of the shared vertex in the previous strip's boundary. */
    previousStart: number;
    /** Index of the shared vertex in the next strip's boundary. */
    nextEnd: number;
}

function findSeam(previousBoundary: Vector2[], nextBoundary: Vector2[], vertex: Vector2): Seam | null {
    const previousStart = previousBoundary.findIndex(point => samePoint(point, vertex));
    const nextEnd = nextBoundary.findIndex(point => samePoint(point, vertex));
    if (previousStart < 0 || nextEnd < 0) {
        return null;
    }

    const points = [vertex];
    const limit = Math.min(previousBoundary.length, nextBoundary.length) - 1;
    for (let step = 1; step < limit; step++) {
        const alongPrevious = previousBoundary[(previousStart + step) % previousBoundary.length];
        const alongNext = nextBoundary[(nextEnd - step + nextBoundary.length) % nextBoundary.length];
        if (!samePoint(alongPrevious, alongNext)) {
            break;
        }
        points.push(alongPrevious);
    }

    return points.length < 2 ? null : {points, previousStart, nextEnd};
}

/**
 * Where to cut the donating strip's frontage.
 *
 * Vanegas §4.2.2 takes the deepest point of the shared seam and runs a straight line from it to the
 * nearest point on the frontage that is giving the corner up. Nearest means the perpendicular foot,
 * so the new seam meets that street at a right angle — which is the whole point of the correction,
 * since the diagonal it replaces is what made corner parcels look wrong.
 *
 * Returns `null` when the foot does not land strictly inside the donating edge. Landing at or past
 * the far end would consume the donor's entire frontage rather than its corner, which is not a
 * correction but a different decomposition, so the corner is left alone instead.
 */
function cutPointOnEdge(anchor: Vector2, far: Vector2, apex: Vector2): Vector2 | null {
    const runX = far.x - anchor.x;
    const runY = far.y - anchor.y;
    const lengthSquared = runX * runX + runY * runY;
    if (lengthSquared === 0) {
        return null;
    }

    const fraction = ((apex.x - anchor.x) * runX + (apex.y - anchor.y) * runY) / lengthSquared;
    if (!(fraction > EPSILON) || !(fraction < 1)) {
        return null;
    }
    return {x: anchor.x + fraction * runX, y: anchor.y + fraction * runY};
}

function segmentsProperlyCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
    const cross = (o: Vector2, p: Vector2, q: Vector2): number =>
        (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function containsPoint(ring: Vector2[], point: Vector2): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > point.y) !== (b.y > point.y)
            && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Is the straight line from the seam's deepest point to the cut point interior to the strip giving
 * the corner up?
 *
 * Vanegas requires the cut be "reachable by a straight line interior to the strip", and a strip is
 * not convex, so it has to be checked rather than assumed. Crossing the donor's own boundary would
 * carve out a region that is partly somebody else's, so a cut that does is refused and the corner is
 * left where the skeleton put it.
 */
function cutStaysInside(donor: Strip, apex: Vector2, cut: Vector2): boolean {
    const contours = [donor.boundary, ...donor.holes];
    for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
            if (segmentsProperlyCross(apex, cut, contour[i], contour[(i + 1) % contour.length])) {
                return false;
            }
        }
    }
    const midpoint: Vector2 = {x: (apex.x + cut.x) / 2, y: (apex.y + cut.y) / 2};
    return containsPoint(donor.boundary, midpoint) && !donor.holes.some(hole => containsPoint(hole, midpoint));
}

/** Replace `runLength` positions of a closed ring, starting at `startIndex`, with `replacement`. */
function spliceCyclicRun(ring: Vector2[], startIndex: number, runLength: number, replacement: Vector2[]): Vector2[] {
    const rotated = [...ring.slice(startIndex), ...ring.slice(0, startIndex)];
    return dropRepeatedVertices([...replacement, ...rotated.slice(runLength)]);
}

/**
 * Move the near-triangular region at one corner from one strip to its neighbour — the α-strip to
 * β-strip correction of Vanegas §4.2.2.
 *
 * The region is bounded by the seam the two strips share, the perpendicular cut from the seam's
 * deepest point, and the piece of frontage between the cut and the shared vertex. Both strips are
 * respliced from the identical positions, so exactly the area one loses is the area the other gains
 * and the decomposition still tiles the block. The donating strip's frontage is shortened to the cut
 * point, because that is now where its street-facing edge really begins or ends.
 *
 * The transfer is abandoned, leaving the corner as the skeleton left it, when the seam is degenerate,
 * when the perpendicular foot falls outside the donating edge, or when the cut would leave the
 * donating strip.
 */
function transferCorner(
    graph: StraightSkeletonGraph,
    strips: Strip[],
    corner: Corner,
    assignment: CornerAssignment,
): void {
    const previous = strips[corner.previousStripIndex];
    const next = strips[corner.nextStripIndex];
    if (previous.boundary.length < 3 || next.boundary.length < 3) {
        return;
    }

    const edgeCount = graph.numExteriorNodes;
    const vertex = graph.nodes[corner.vertexNode].position;
    const seam = findSeam(previous.boundary, next.boundary, vertex);
    if (seam === null) {
        return;
    }

    const apex = seam.points[seam.points.length - 1];
    const runLength = seam.points.length;
    const donor = assignment === 'previous' ? next : previous;
    const donorEdgeFar = assignment === 'previous'
        ? graph.nodes[(corner.outgoingEdgeId + 1) % edgeCount].position
        : graph.nodes[corner.incomingEdgeId].position;

    const cut = cutPointOnEdge(vertex, donorEdgeFar, apex);
    if (cut === null || !cutStaysInside(donor, apex, cut)) {
        return;
    }

    const previousRunStart = seam.previousStart;
    const nextRunStart = (seam.nextEnd - runLength + 1 + next.boundary.length) % next.boundary.length;

    if (assignment === 'previous') {
        previous.boundary = spliceCyclicRun(previous.boundary, previousRunStart, runLength, [vertex, cut, apex]);
        next.boundary = spliceCyclicRun(next.boundary, nextRunStart, runLength, [apex, cut]);
        next.frontage = [cut, ...next.frontage.slice(1)];
        return;
    }

    previous.boundary = spliceCyclicRun(previous.boundary, previousRunStart, runLength, [cut, apex]);
    next.boundary = spliceCyclicRun(next.boundary, nextRunStart, runLength, [apex, cut, vertex]);
    previous.frontage = [...previous.frontage.slice(0, -1), cut];
}
