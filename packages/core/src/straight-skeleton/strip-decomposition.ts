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
     * Shortest frontage, in world units, a strip may be left standing with. `undefined` = off.
     *
     * A run of exterior edges whose total length falls below this cannot host even one
     * minimum-width parcel, so instead of getting its own strip it is merged into the neighbouring
     * run whose junction is straightest — interior angle closest to π — which reads as the short
     * edge being part of the same street rather than a street of its own. Chains of short edges
     * merge transitively, and merging repeats until every strip's frontage reaches this length,
     * so the guarantee is on the strip, not just the single edge.
     *
     * One guard: merging never reduces the decomposition below two strips, because a single
     * all-edge strip always closes a loop around the offset contour — the `holes` strip
     * `sliceStrip` cannot cut. The floor is necessary, not sufficient: at extreme thresholds
     * (every run short) one of the two surviving runs can still encircle the contour on its own,
     * and such a strip degrades gracefully downstream to a single whole-strip parcel — decision 13
     * of the parcel-quality brief. Junctions are merged flattest-first, so the survivors tend to
     * be the sharpest corners, though the greedy order does not guarantee the globally sharpest.
     */
    minEdgeLength?: number;
    /**
     * Are these two adjacent exterior edges the same logical street?
     *
     * Called once per adjacent pair, `(i, i + 1)` around the boundary including the wrap from last
     * back to first. Default: never merge, giving one strip per exterior edge. Applied before
     * {@link minEdgeLength}, which then merges whole runs rather than single edges.
     */
    sameLogicalStreet?: (edgeIdA: number, edgeIdB: number) => boolean;
    /**
     * Mitre tolerance, in radians: the deviation from straight, `|θ − π|`, a junction's interior
     * angle may carry before the corner between its two strips is reshaped. `undefined` — or any
     * value ≥ π, which no deviation can exceed — turns the correction off.
     *
     * The β-strip correction of Vanegas §4.2.2 exists because the skeleton's diagonal seam tilts
     * away from vertical by *half* the junction's deviation from straight, so even gentle corners
     * read as mitred. A deviation predicate rather than a fire-below-threshold one is what makes
     * the correction reach the wide, gentle band (decision 15 of the parcel-quality brief): at
     * every convex junction deviating more than the tolerance, the corner region is awarded to
     * the strip with the longer frontage — Vanegas' StreetLength rule — and the shorter street's
     * frontage is cut back perpendicular to it. The transfer is area-conserving by construction,
     * so the tiling identity is unmoved.
     *
     * Reflex junctions also exceed the tolerance but are never reshaped: the seam bisects the
     * corner wedge, so at a reflex junction it leaves the vertex more than 90° from either edge
     * and the seam apex projects behind the vertex — no valid perpendicular cut exists. The
     * reflex arm is parked with that finding (decision 16; see the reflex-arm characterisation
     * tests).
     *
     * Ignored when {@link classifyCorner} is supplied: an explicit policy is the expert override.
     * Values above `π` are rejected — a deviation can never exceed π, so such a tolerance is
     * almost certainly degrees passed where radians belong.
     */
    mitreTolerance?: number;
    /**
     * Which side gets the corner region at the vertex shared by two adjacent strips.
     *
     * Default: `'none'`, which leaves the diagonal seam where the skeleton put it — the β-strips are
     * then exactly the α-strips. Wins over {@link mitreTolerance} when both are given.
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

/**
 * Signed area, positive counter-clockwise, negative clockwise.
 *
 * Terms are taken relative to the ring's own first vertex. The shoelace sum is invariant
 * under translation, so this is mathematically identical to summing over absolute
 * coordinates, but it does not lose the answer to cancellation for a ring far from the
 * origin: absolute terms are of order D^2 for a ring at distance D, so they carry an error
 * of about D^2 * 2^-52 against a true area of only A, and the sign is lost once
 * D > sqrt(A) * 6.7e7.
 */
function signedArea(ring: Vector2[]): number {
    if (ring.length === 0) {
        return 0;
    }
    const origin = ring[0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
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

/** Bounding-box diagonal of the exterior boundary — the polygon's own characteristic length. */
function exteriorScale(graph: StraightSkeletonGraph): number {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let node = 0; node < graph.numExteriorNodes; node++) {
        const {x, y} = graph.nodes[node].position;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const diagonal = Math.hypot(maxX - minX, maxY - minY);
    return diagonal > 0 ? diagonal : 1;
}

/** Length of one exterior edge of the solved graph. */
function exteriorEdgeLength(graph: StraightSkeletonGraph, edgeId: number): number {
    const from = graph.nodes[edgeId].position;
    const to = graph.nodes[(edgeId + 1) % graph.numExteriorNodes].position;
    return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Merge every run whose total edge length falls short of `minEdgeLength` into a neighbouring run.
 *
 * The neighbour is chosen by straightest continuation: of the short run's two junctions, merge the
 * one whose interior angle is closest to π, because a near-straight junction is two segments of one
 * street while a sharp one is a genuine corner. Where several short runs compete, the flattest
 * junction anywhere goes first, so the surviving junctions tend to be the sharpest — a greedy
 * tendency, not a guarantee: a short run flanked by the two sharpest junctions must still be
 * absorbed through one of them. Merging repeats until nothing is short, so chains of short edges
 * coalesce transitively and the resulting strip — not merely the union of its parts — meets the
 * length bound.
 *
 * The floor is two runs. One run would union every clipped face into the closed band around the
 * offset contour, which is the `holes` strip that `sliceStrip` refuses to cut. The floor removes
 * that certainty, not every occurrence: when every run is short, one of the two survivors can
 * itself wrap far enough around to close a loop (see the pennant characterisation test), and the
 * resulting `holes` strip is handed back whole by `sliceStrip` rather than sliced — accepted as an
 * envelope edge by decision 13 of the parcel-quality brief.
 *
 * Straightness is measured as `|angle − π|`, which is invariant under conjugating the angle to
 * `2π − θ` — this pass therefore never depended on the orientation of `interiorAngleAt`, and the
 * 2026-08-09 orientation fix to that function provably changed nothing here.
 */
function mergeShortRuns(graph: StraightSkeletonGraph, runs: number[][], minEdgeLength: number): number[][] {
    const merged = runs.map(run => [...run]);
    const lengths = merged.map(
        run => run.reduce((total, edgeId) => total + exteriorEdgeLength(graph, edgeId), 0));

    /** How far from straight the junction between run `index` and its successor bends. */
    const bendAfter = (index: number): number => {
        const incoming = merged[index][merged[index].length - 1];
        const outgoing = merged[(index + 1) % merged.length][0];
        return Math.abs(interiorAngleAt(graph, incoming, outgoing) - Math.PI);
    };

    while (merged.length > 2) {
        let junction = -1;
        let flattest = Infinity;
        for (let index = 0; index < merged.length; index++) {
            if (lengths[index] >= minEdgeLength) {
                continue;
            }
            for (const candidate of [(index - 1 + merged.length) % merged.length, index]) {
                const bend = bendAfter(candidate);
                if (bend < flattest) {
                    flattest = bend;
                    junction = candidate;
                }
            }
        }
        if (junction < 0) {
            return merged;
        }

        const absorbed = (junction + 1) % merged.length;
        merged[junction] = [...merged[junction], ...merged[absorbed]];
        lengths[junction] += lengths[absorbed];
        merged.splice(absorbed, 1);
        lengths.splice(absorbed, 1);
    }
    return merged;
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

    const {depth, minEdgeLength} = options;
    if (!(depth >= 0)) {
        throw new Error(`computeStrips requires a non-negative depth, received ${depth}.`);
    }
    if (minEdgeLength !== undefined && !(minEdgeLength >= 0 && Number.isFinite(minEdgeLength))) {
        throw new Error(
            `computeStrips requires a non-negative finite minEdgeLength, received ${minEdgeLength}.`);
    }
    const {mitreTolerance} = options;
    if (mitreTolerance !== undefined && !(mitreTolerance >= 0 && mitreTolerance <= Math.PI)) {
        throw new Error(
            `computeStrips requires mitreTolerance in [0, π] radians, received ` +
            `${mitreTolerance}. A value above π is usually degrees passed where radians belong.`);
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

    let runs = groupIntoRuns(edgeCount, options.sameLogicalStreet ?? (() => false));
    if (minEdgeLength !== undefined && minEdgeLength > 0) {
        runs = mergeShortRuns(graph, runs, minEdgeLength);
    }
    const strips: Strip[] = runs.map(run => {
        const tiles = run.map(edgeId => clippedFaces[edgeId]).filter(tile => tile.length >= 3);
        const contours = run.length === 1 ? tiles : unionOfTiles(tiles);
        const outer = contours.filter(contour => signedArea(contour) < 0);
        const holes = contours.filter(contour => signedArea(contour) > 0);
        outer.sort((a, b) => signedArea(a) - signedArea(b));
        // Stated invariant: a run is a contiguous arc of boundary edges, adjacent clipped faces
        // meet vertex-for-vertex along their shared seam, and each face touches its own edge of
        // that arc — so the union of a run's faces is connected and has exactly one outer contour.
        // The sort puts the largest outer ring first only as defence in depth: if the invariant
        // ever broke, any further outer rings would be silently discarded here, so a tiling-error
        // failure in the suites should look this way first.
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
    // The clockwise sweep from the outgoing direction back to the reversed incoming one is
    // `toAfter - toBefore` under this module's clockwise winding. The subtraction was inverted
    // until 2026-08-09 and reported the conjugate `2π − θ`; the characterisation tests in
    // strip-decomposition.test.ts now guard the corrected orientation.
    let angle = toAfter - toBefore;
    while (angle <= 0) {
        angle += Math.PI * 2;
    }
    while (angle > Math.PI * 2) {
        angle -= Math.PI * 2;
    }
    return angle;
}

/**
 * The production corner policy behind {@link StripOptions.mitreTolerance}.
 *
 * A corner qualifies when its deviation from straight, `|θ − π|`, exceeds the tolerance — the
 * seam's visible tilt is half that deviation, so this is a bound on how mitred a border may look —
 * and the junction is convex: the reflex arm is geometrically vacuous (decision 16, see the
 * reflex-arm characterisation tests), so the gate states outright what the transfer guards would
 * otherwise refuse case by case. The region goes to the strip with the longer frontage, Vanegas'
 * StreetLength rule: the corner lot fronts the main street, and the side street's strip stops
 * short of it. Ties go to the previous strip, so the choice is deterministic.
 */
function mitreClassifier(tolerance: number): (context: CornerContext) => CornerAssignment {
    return context => {
        if (!(Math.abs(context.interiorAngle - Math.PI) > tolerance) || !(context.interiorAngle < Math.PI)) {
            return 'none';
        }
        return context.previousFrontageLength >= context.nextFrontageLength ? 'previous' : 'next';
    };
}

function applyCornerCorrection(result: SkeletonSolveResult, strips: Strip[], options: StripOptions): void {
    const classifyCorner = options.classifyCorner
        ?? (options.mitreTolerance !== undefined
            ? mitreClassifier(options.mitreTolerance)
            : undefined);
    if (classifyCorner === undefined) {
        return;
    }

    const {graph} = result;
    const edgeCount = graph.numExteriorNodes;
    const frontageLengths = strips.map(strip => polylineLength(strip.frontage));
    const edgeLength = (edgeId: number): number => exteriorEdgeLength(graph, edgeId);
    // Decision 12: no transfer may leave its donor's frontage below the strip-level minimum. When
    // no minimum is configured, a scale-relative epsilon still refuses the degenerate transfers
    // that would collapse a frontage to (numerically) nothing.
    const minFrontage = options.minEdgeLength !== undefined && options.minEdgeLength > 0
        ? options.minEdgeLength
        : exteriorScale(graph) * EPSILON;

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
            transferCorner(graph, strips, corner, assignment, minFrontage);
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
 * Returns `null` when the foot does not land strictly inside the donating span — the donor's
 * *current* frontage segment, not the original exterior edge, so a second donation at the other
 * end of an already-shortened frontage is measured against what actually remains. Landing at or
 * past either end would consume the donor's frontage rather than its corner, which is not a
 * correction but a different decomposition, so the corner is left alone instead. Both ends carry
 * the same epsilon (decision 12 of the parcel-quality brief).
 */
function cutPointOnEdge(anchor: Vector2, far: Vector2, apex: Vector2): Vector2 | null {
    const runX = far.x - anchor.x;
    const runY = far.y - anchor.y;
    const lengthSquared = runX * runX + runY * runY;
    if (lengthSquared === 0) {
        return null;
    }

    const fraction = ((apex.x - anchor.x) * runX + (apex.y - anchor.y) * runY) / lengthSquared;
    if (!(fraction > EPSILON) || !(fraction < 1 - EPSILON)) {
        return null;
    }
    return {x: anchor.x + fraction * runX, y: anchor.y + fraction * runY};
}

/**
 * Do two segments cross strictly, endpoint touches and near-tangencies excluded?
 *
 * The comparisons carry a tolerance scaled to the product of the segment lengths — the natural
 * unit of a 2D cross product — because the corner-cut chord this guards *ends on* a boundary
 * segment by construction: the cut is `anchor + fraction · run`, which lands within a few ulps of
 * the frontage line, on a side chosen by rounding residue alone. Under exact-zero comparisons that
 * residue made `cutStaysInside` refuse or accept identical geometry at random — the Awkward
 * Heptagon's v0 corner kept its mitre for exactly this reason. A sine of 1e-9 is far below any
 * real crossing and far above any rounding residue, so the tolerance separates the two cleanly.
 */
function segmentsProperlyCross(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
    const cross = (o: Vector2, p: Vector2, q: Vector2): number =>
        (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);
    const tolerance = EPSILON * Math.hypot(a2.x - a1.x, a2.y - a1.y) * Math.hypot(b2.x - b1.x, b2.y - b1.y);
    const positive = (d: number): boolean => d > tolerance;
    const negative = (d: number): boolean => d < -tolerance;
    return ((positive(d1) && negative(d2)) || (negative(d1) && positive(d2)))
        && ((positive(d3) && negative(d4)) || (negative(d3) && positive(d4)));
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
 * The cut point is the apex's perpendicular foot on the donor's *current* frontage — searched
 * segment by segment outward from the shared vertex, because on a merged multi-edge street the
 * nearest point of the frontage may lie beyond the first edge. Whatever frontage lies between the
 * shared vertex and the cut moves to the taker along with the wedge. The apex itself is chosen by
 * retreat: the deepest seam point whose chord to such a foot stays inside the donor and leaves it
 * `minFrontage` of street — a bent seam or a deep clip often invalidates the deepest point while
 * a shallower one still admits a clean, smaller correction.
 *
 * The transfer is abandoned, leaving the corner as the skeleton left it, only when the seam is
 * degenerate or when *no* seam point admits a valid cut: foot strictly inside some frontage
 * segment, chord interior to the donor, and the donor's surviving frontage at or above
 * `minFrontage` — decision 12 of the parcel-quality brief. The cut is validated against the
 * frontage as it stands *now*, not the original exterior edges, so a strip that has already
 * donated one corner cannot be consumed from the other end: sequential transfers see the shortened
 * frontage, and the length floor holds after every transfer, not merely before the first.
 */
function transferCorner(
    graph: StraightSkeletonGraph,
    strips: Strip[],
    corner: Corner,
    assignment: CornerAssignment,
    minFrontage: number,
): void {
    const previous = strips[corner.previousStripIndex];
    const next = strips[corner.nextStripIndex];
    if (previous.boundary.length < 3 || next.boundary.length < 3) {
        return;
    }

    const vertex = graph.nodes[corner.vertexNode].position;
    const seam = findSeam(previous.boundary, next.boundary, vertex);
    if (seam === null) {
        return;
    }

    const donor = assignment === 'previous' ? next : previous;
    if (donor.frontage.length < 2) {
        return;
    }

    // The donor's CURRENT frontage, oriented so `oriented[0]` is always the shared vertex —
    // reversed when the donor is the previous strip.
    const oriented = assignment === 'previous' ? donor.frontage : [...donor.frontage].reverse();

    // Deepest seam point first, retreating on failure. The seam is a polyline, not the straight
    // diagonal of Vanegas' figure: it bends at every skeleton event it passes, and when a bend
    // leans into the donor the straight chord from the deepest point exits the strip and the cut
    // is invalid there. A shallower seam point still has a valid perpendicular chord, so instead
    // of abandoning the corner the transfer retreats — it moves a smaller wedge and leaves the
    // seam beyond the chosen point where it was. For each candidate apex, the cut is its
    // perpendicular foot on the donor's current frontage, searched segment by segment outward
    // from the shared vertex: on a merged multi-edge street the nearest point of the frontage may
    // lie beyond the first edge, and `transferred` counts the frontage vertices that move to the
    // taker along with the wedge.
    interface ChosenCut {
        apexIndex: number;
        cut: Vector2;
        transferred: number;
        survivingFrontage: Vector2[];
    }
    let chosen: ChosenCut | null = null;
    for (let apexIndex = seam.points.length - 1; apexIndex >= 1 && chosen === null; apexIndex--) {
        const apex = seam.points[apexIndex];
        let cut: Vector2 | null = null;
        let transferred = 0;
        for (let segment = 0; segment + 1 < oriented.length; segment++) {
            cut = cutPointOnEdge(oriented[segment], oriented[segment + 1], apex);
            if (cut !== null) {
                transferred = segment;
                break;
            }
        }
        if (cut === null || !cutStaysInside(donor, apex, cut)) {
            continue;
        }
        const survivingFrontage = assignment === 'previous'
            ? [cut, ...next.frontage.slice(1 + transferred)]
            : [...previous.frontage.slice(0, -(1 + transferred)), cut];
        if (polylineLength(survivingFrontage) < minFrontage) {
            // A shallower apex pulls the foot back toward the vertex, so retreating can still
            // satisfy the decision-12 floor where this depth could not.
            continue;
        }
        chosen = {apexIndex, cut, transferred, survivingFrontage};
    }
    if (chosen === null) {
        return;
    }

    // The donated frontage vertices, `oriented[1 .. transferred]`, leave the donor's boundary and
    // frontage and join the taker's boundary as the same position objects, so every shared segment
    // still cancels exactly and the tiling identity survives the transfer unchanged. `spanLength`
    // covers the seam only up to the chosen apex; any deeper seam stays shared, exactly as it was.
    const {apexIndex, cut, transferred, survivingFrontage} = chosen;
    const apex = seam.points[apexIndex];
    const spanLength = apexIndex + 1;
    const donated = oriented.slice(1, 1 + transferred);
    const previousRunStart = seam.previousStart;
    const nextRunStart = (seam.nextEnd - apexIndex + next.boundary.length) % next.boundary.length;

    if (assignment === 'previous') {
        previous.boundary = spliceCyclicRun(
            previous.boundary, previousRunStart, spanLength, [vertex, ...donated, cut, apex]);
        next.boundary = spliceCyclicRun(next.boundary, nextRunStart, spanLength + transferred, [apex, cut]);
        next.frontage = survivingFrontage;
        return;
    }

    previous.boundary = spliceCyclicRun(
        previous.boundary,
        (previousRunStart - transferred + previous.boundary.length) % previous.boundary.length,
        spanLength + transferred,
        [cut, apex]);
    next.boundary = spliceCyclicRun(
        next.boundary, nextRunStart, spanLength, [apex, cut, ...[...donated].reverse(), vertex]);
    previous.frontage = survivingFrontage;
}
