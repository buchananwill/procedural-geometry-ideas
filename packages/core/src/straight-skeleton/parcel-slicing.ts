import type {Vector2} from './types';
import type {Strip} from './strip-decomposition';

/**
 * Slicing a strip into parcels — the `slice` operation of Vanegas et al., *Procedural Generation of
 * Parcels in Urban Modeling* (Eurographics 2012), §4.2.3.
 *
 * A strip is one logical street's frontage and the land behind it, produced by `computeStrips`. This
 * module cuts it into individual lots: origins are sampled along the frontage at roughly the target
 * parcel width, a ray is cast inward from each one, and the resulting slivers are cleaned up by the
 * paper's own post-processing.
 *
 * ## Rays follow skeleton edges
 *
 * The detail that makes this method work, and the one that is easy to drop, is that a ray is confined
 * to a single skeleton face. If a straight perpendicular ray would leave the face of the frontage
 * edge it started from, it turns and follows the skeleton edge it met, out to the strip boundary.
 * Without that rule a wobble in the frontage propagates all the way to the back of the strip and the
 * parcels come out visibly skewed.
 *
 * ### How the face structure is recovered
 *
 * A `Strip` carries no skeleton arcs, so the faces are reconstructed from the only thing that defines
 * them: the supporting edges themselves. Inside the skeleton face of an edge `e` the offset of a
 * point is its perpendicular distance to the supporting *line* of `e` — that is what makes the strip
 * clip in `computeStrips` a plain half-plane cut. So over the strip's own supporting edges the face
 * of edge `i` is exactly
 *
 * ```
 * { p in strip : f_i(p) <= f_j(p) for every supporting edge j }, f_i(p) = (p - a_i) . n_i
 * ```
 *
 * with `n_i` the inward unit normal. The seams between those cells are the skeleton arcs interior to
 * the strip, and `f_i = f_j` is precisely the angle bisector the skeleton emits at the vertex the two
 * edges share — so the reconstruction is the skeleton, not an approximation of it, for every arc the
 * strip's own edges generate.
 *
 * Two consequences are worth stating plainly:
 *
 * - A strip supported by a **single** edge has exactly one face. Rays in it are straight by
 *   construction and the following rule is vacuous — correctly so, not by omission. That is the
 *   default `computeStrips` output, one strip per exterior edge.
 * - An arc that a **third**, non-supporting edge cuts into the face (a split event driven by geometry
 *   on the far side of the block) is invisible here. Such an arc lies at offset greater than the
 *   strip depth in every strip shallow enough to be a street frontage, so it does not bound the
 *   clipped face. A supporting edge whose supporting line puts the ray origin on its outer side is a
 *   reflex neighbour whose face lies elsewhere entirely; it is excluded from the comparison rather
 *   than allowed to claim territory it does not own.
 *
 * Whatever the face model concludes, it is a partition — every point has a unique minimising edge —
 * so the parcels tile the strip regardless.
 *
 * ## Parcels are cuts, not polygon booleans
 *
 * The slicing is represented as an ordered list of cuts across the strip, each running from a point
 * on the frontage to a point on the rest of the strip boundary. A parcel is the region between two
 * consecutive cuts, read off by walking the strip boundary. Splitting a parcel inserts a cut and
 * merging two parcels deletes one; no polygon boolean is ever performed, so the tiling is exact by
 * construction and cannot drift as post-processing rearranges things.
 */

/** Relative slack for "these two points are the same" and "this root is positive". */
const RELATIVE_EPSILON = 1e-9;

/** Relative slack for collinearity when deciding whether a parcel is a triangle. */
const COLLINEAR_EPSILON = 1e-9;

/** Iteration caps. Every loop below terminates on its own; these only bound pathological input. */
const MAX_RAY_STEPS = 32;
const MAX_POST_PROCESSING_STEPS = 512;

export interface SliceOptions {
    /** `Amin` — a parcel below this area is merged into a neighbour. */
    minArea: number;
    /** `Amax` — a parcel above this area is cut again. */
    maxArea: number;
    /** `Wmin` — the shortest frontage a parcel may be given when origins are sampled. */
    minWidth: number;
    /** `Wmax` — the longest frontage a parcel may be given when origins are sampled. */
    maxWidth: number;
    /**
     * `ω` — split irregularity, in `[0, 1]`.
     *
     * Origin spacing is drawn from a normal distribution with mean `(Wmin + Wmax) / 2` and variance
     * `3ω`, exactly as the paper states, then clamped to `[Wmin, Wmax]`. `0` gives spacing that is
     * exactly the mean every time, so the parcels come out uniform.
     *
     * The variance is absolute, in world units, because the paper's is — it is not a fraction of the
     * mean. At the paper's scale (metres, parcels tens of metres wide) `ω = 1` is a gentle few-percent
     * perturbation; at a much smaller scale the clamp to `[Wmin, Wmax]` is what keeps it sane.
     */
    splitIrregularity: number;
    /** Seed for the origin sampling. Required: the same seed and strip must give the same parcels. */
    seed: number;
}

export interface Parcel {
    /** Closed polygon of the parcel, clockwise, no duplicated closing vertex. */
    boundary: Vector2[];
    /** The portion of the strip frontage this parcel owns. Never degenerate. */
    frontage: Vector2[];
    /** Absolute area of {@link boundary}. */
    area: number;
}

/** One supporting edge of the strip, with everything the face model needs. */
interface FaceEdge {
    start: Vector2;
    end: Vector2;
    /** Inward unit normal. `(p - start) . normal` is the skeleton offset within this edge's face. */
    normal: Vector2;
    length: number;
    /** Arc length from the start of the frontage to {@link start}. */
    startDistance: number;
}

/** A point on the strip boundary: `lerp(ring[index], ring[index + 1], t)`. */
interface RingPosition {
    index: number;
    t: number;
}

/**
 * The strip, arranged for slicing.
 *
 * `ring` is the strip boundary rotated so that the frontage occupies `ring[0 .. frontageEnd]`. That
 * rotation is what lets a parcel be read off as one forward walk of the ring plus two cuts.
 */
interface Arena {
    ring: Vector2[];
    /** Index in `ring` of the last frontage vertex. Frontage edges are `0 .. frontageEnd - 1`. */
    frontageEnd: number;
    edges: FaceEdge[];
    frontageLength: number;
    /** Characteristic length of the strip, used to scale every tolerance. */
    scale: number;
}

/** A cut across the strip, from the frontage to the rest of the boundary. */
interface Cut {
    origin: RingPosition;
    /** The cut polyline, from the frontage origin inward to {@link end}, both included. */
    points: Vector2[];
    end: RingPosition;
    /** Length of {@link points}, the shared edge between the two parcels this cut separates. */
    length: number;
    /** Arc length of {@link origin} along the frontage. */
    frontageDistance: number;
}

function subtract(a: Vector2, b: Vector2): Vector2 {
    return {x: a.x - b.x, y: a.y - b.y};
}

function dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
}

function distance(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Signed area, positive counter-clockwise, negative clockwise. */
function signedRingArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function boundingScale(ring: Vector2[]): number {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    const diagonal = Math.hypot(maxX - minX, maxY - minY);
    return diagonal > 0 ? diagonal : 1;
}

/** Drop consecutive duplicates, and the closing vertex if it repeats the opening one. */
function dropRepeatedVertices(ring: Vector2[], tolerance: number): Vector2[] {
    const kept: Vector2[] = [];
    for (const vertex of ring) {
        if (kept.length === 0 || distance(kept[kept.length - 1], vertex) > tolerance) {
            kept.push(vertex);
        }
    }
    while (kept.length > 1 && distance(kept[0], kept[kept.length - 1]) <= tolerance) {
        kept.pop();
    }
    return kept;
}

/**
 * mulberry32.
 *
 * The library has no shared seeded generator; every module that needs one states it locally, and this
 * is the generator the test suites already use. Determinism is a hard requirement of `sliceStrip`, so
 * the sampling never touches `Math.random`.
 */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/** Box–Muller over a seeded uniform stream, keeping the second variate rather than discarding it. */
function seededNormal(random: () => number): () => number {
    let spare: number | null = null;
    return () => {
        if (spare !== null) {
            const value = spare;
            spare = null;
            return value;
        }
        const u1 = Math.max(random(), Number.MIN_VALUE);
        const u2 = random();
        const radius = Math.sqrt(-2 * Math.log(u1));
        const angle = 2 * Math.PI * u2;
        spare = radius * Math.sin(angle);
        return radius * Math.cos(angle);
    };
}

function validateOptions(options: SliceOptions): void {
    const {minArea, maxArea, minWidth, maxWidth, splitIrregularity, seed} = options;
    if (!(minWidth > 0) || !Number.isFinite(minWidth)) {
        throw new Error(`sliceStrip requires a positive finite minWidth, received ${minWidth}.`);
    }
    if (!(maxWidth >= minWidth)) {
        throw new Error(`sliceStrip requires maxWidth >= minWidth, received ${maxWidth} and ${minWidth}.`);
    }
    if (!(minArea >= 0)) {
        throw new Error(`sliceStrip requires a non-negative minArea, received ${minArea}.`);
    }
    if (!(maxArea >= minArea)) {
        throw new Error(`sliceStrip requires maxArea >= minArea, received ${maxArea} and ${minArea}.`);
    }
    if (!(splitIrregularity >= 0)) {
        throw new Error(
            `sliceStrip requires a non-negative splitIrregularity, received ${splitIrregularity}.`);
    }
    if (!Number.isFinite(seed)) {
        throw new Error(`sliceStrip requires a finite seed, received ${seed}.`);
    }
}

/**
 * Locate the frontage within the strip boundary and rotate the boundary to start there.
 *
 * Returns `null` when the frontage cannot be found as a consecutive run of the boundary, or when it
 * consumes the whole boundary and there is therefore nothing behind it to cut into. Callers treat
 * either as "this strip is one parcel".
 */
function makeArena(strip: Strip): Arena | null {
    const boundary = strip.boundary;
    const length = boundary.length;
    if (length < 3 || strip.frontage.length < 2) {
        return null;
    }

    const scale = boundingScale(boundary);
    const tolerance = scale * 1e-7;

    const start = boundary.findIndex(point => distance(point, strip.frontage[0]) <= tolerance);
    if (start < 0) {
        return null;
    }

    let steps = 0;
    for (let j = 1; j < strip.frontage.length; j++) {
        const target = strip.frontage[j];
        if (distance(boundary[(start + steps) % length], target) <= tolerance) {
            continue;
        }
        if (steps + 1 >= length) {
            return null;
        }
        if (distance(boundary[(start + steps + 1) % length], target) > tolerance) {
            return null;
        }
        steps += 1;
    }
    if (steps < 1 || steps >= length) {
        return null;
    }

    const ring = [...boundary.slice(start), ...boundary.slice(0, start)];
    if (signedRingArea(ring) > 0) {
        return null;
    }

    const edges: FaceEdge[] = [];
    let frontageLength = 0;
    for (let i = 0; i < steps; i++) {
        const from = ring[i];
        const to = ring[i + 1];
        const run = subtract(to, from);
        const edgeLength = Math.hypot(run.x, run.y);
        if (!(edgeLength > tolerance)) {
            return null;
        }
        // The ring is clockwise, so the interior lies to the right of travel.
        edges.push({
            start: from,
            end: to,
            normal: {x: run.y / edgeLength, y: -run.x / edgeLength},
            length: edgeLength,
            startDistance: frontageLength,
        });
        frontageLength += edgeLength;
    }

    return {ring, frontageEnd: steps, edges, frontageLength, scale};
}

function ringPoint(arena: Arena, position: RingPosition): Vector2 {
    const {ring} = arena;
    const from = ring[position.index % ring.length];
    const to = ring[(position.index + 1) % ring.length];
    return {x: from.x + position.t * (to.x - from.x), y: from.y + position.t * (to.y - from.y)};
}

function ringScalar(position: RingPosition): number {
    return position.index + position.t;
}

/** Points from `from` to `to` inclusive, walking the ring forward and wrapping if need be. */
function ringWalk(arena: Arena, from: RingPosition, to: RingPosition): Vector2[] {
    const {ring} = arena;
    const startScalar = ringScalar(from);
    let endScalar = ringScalar(to);
    if (endScalar < startScalar - 1e-12) {
        endScalar += ring.length;
    }

    const walked = [ringPoint(arena, from)];
    for (let vertex = Math.floor(startScalar) + 1; vertex < endScalar - 1e-12; vertex++) {
        walked.push(ring[vertex % ring.length]);
    }
    walked.push(ringPoint(arena, to));
    return walked;
}

/** Skeleton offset of `point` within the face of `edge`: its perpendicular distance to that line. */
function offsetWithinFace(edge: FaceEdge, point: Vector2): number {
    return dot(subtract(point, edge.start), edge.normal);
}

/**
 * The direction that advances the wavefront at unit rate away from every edge in `active`.
 *
 * One edge gives its inward normal — a plain perpendicular ray. Two edges give the skeleton bisector
 * between their faces, the solution of `v . n_a = v . n_b = 1`, which is the arc the ray must follow
 * rather than cross.
 */
function marchDirection(edges: FaceEdge[], active: number[]): Vector2 | null {
    if (active.length === 1) {
        return edges[active[0]].normal;
    }
    const a = edges[active[0]].normal;
    const b = edges[active[1]].normal;
    const determinant = a.x * b.y - a.y * b.x;
    if (Math.abs(determinant) < 1e-12) {
        return dot(a, b) > 0 ? a : null;
    }
    return {x: (b.y - a.y) / determinant, y: (a.x - b.x) / determinant};
}

/**
 * The pair of faces whose seam the walk continues along after meeting `entrant` at a skeleton node.
 *
 * Three faces meet at a node and only one of the outgoing seams keeps the walk moving inward. The
 * test is that no face left behind may overtake: along the chosen seam its offset must not grow
 * faster than the wavefront does.
 */
function nextActive(edges: FaceEdge[], active: number[], entrant: number): number[] {
    if (active.length === 1) {
        return [active[0], entrant];
    }
    for (const pair of [[active[0], entrant], [active[1], entrant]]) {
        const direction = marchDirection(edges, pair);
        if (direction === null) {
            continue;
        }
        const others = active.filter(index => !pair.includes(index));
        if (others.every(index => dot(direction, edges[index].normal) <= 1 + 1e-9)) {
            return pair;
        }
    }
    return [active[0], entrant];
}

/** Where the ray `point + t * direction` first leaves the strip, and how far along that is. */
function firstRingExit(
    arena: Arena,
    point: Vector2,
    direction: Vector2,
    epsilon: number,
): {distance: number; position: RingPosition} | null {
    const {ring} = arena;
    let best: {distance: number; position: RingPosition} | null = null;

    for (let i = 0; i < ring.length; i++) {
        const from = ring[i];
        const to = ring[(i + 1) % ring.length];
        const edgeX = to.x - from.x;
        const edgeY = to.y - from.y;
        const determinant = direction.x * -edgeY - direction.y * -edgeX;
        if (Math.abs(determinant) < 1e-15) {
            continue;
        }
        const offsetX = from.x - point.x;
        const offsetY = from.y - point.y;
        const along = (offsetX * -edgeY - offsetY * -edgeX) / determinant;
        const across = (direction.x * offsetY - direction.y * offsetX) / determinant;
        if (along <= epsilon || across < -1e-9 || across > 1 + 1e-9) {
            continue;
        }
        if (best === null || along < best.distance) {
            best = {distance: along, position: {index: i, t: Math.min(Math.max(across, 0), 1)}};
        }
    }

    return best;
}

/**
 * Cast a ray inward from a point on the frontage, obeying the paper's face rule.
 *
 * The ray leaves perpendicular to the frontage edge it starts on. At every step the next event is
 * either the strip boundary — where the cut ends — or a skeleton seam, where the ray turns and
 * follows the seam onward instead of crossing into the neighbouring face.
 */
function castRay(arena: Arena, origin: RingPosition): Cut | null {
    const epsilon = arena.scale * RELATIVE_EPSILON;
    const originPoint = ringPoint(arena, origin);
    const points = [originPoint];
    let point = originPoint;
    let active = [origin.index];

    for (let step = 0; step < MAX_RAY_STEPS; step++) {
        const direction = marchDirection(arena.edges, active);
        if (direction === null) {
            return null;
        }
        const exit = firstRingExit(arena, point, direction, epsilon);
        if (exit === null) {
            return null;
        }

        const wavefront = offsetWithinFace(arena.edges[active[0]], point);
        let nearest = Infinity;
        let entrant = -1;
        for (let index = 0; index < arena.edges.length; index++) {
            if (active.includes(index)) {
                continue;
            }
            const competitor = offsetWithinFace(arena.edges[index], point);
            // A supporting edge whose line already puts this point on its outer side is a reflex
            // neighbour: its face is elsewhere, and it may not claim territory here.
            if (competitor < wavefront - epsilon) {
                continue;
            }
            const closingRate = 1 - dot(direction, arena.edges[index].normal);
            if (closingRate <= 1e-9) {
                continue;
            }
            const meeting = (competitor - wavefront) / closingRate;
            if (meeting > epsilon && meeting < nearest) {
                nearest = meeting;
                entrant = index;
            }
        }

        if (entrant < 0 || nearest >= exit.distance - epsilon) {
            const endPoint = ringPoint(arena, exit.position);
            points.push(endPoint);
            return finishCut(origin, points, exit.position, arena);
        }

        point = {x: point.x + nearest * direction.x, y: point.y + nearest * direction.y};
        points.push(point);
        active = nextActive(arena.edges, active, entrant);
    }

    return null;
}

function finishCut(origin: RingPosition, points: Vector2[], end: RingPosition, arena: Arena): Cut {
    const cleaned = [points[0]];
    for (let i = 1; i < points.length; i++) {
        if (distance(cleaned[cleaned.length - 1], points[i]) > arena.scale * 1e-12) {
            cleaned.push(points[i]);
        }
    }
    let length = 0;
    for (let i = 1; i < cleaned.length; i++) {
        length += distance(cleaned[i - 1], cleaned[i]);
    }
    return {
        origin,
        points: cleaned,
        end,
        length,
        frontageDistance: arena.edges[origin.index].startDistance + origin.t * arena.edges[origin.index].length,
    };
}

/** Turn an arc length along the frontage into a position on the ring, kept off the vertices. */
function frontagePosition(arena: Arena, alongFrontage: number): RingPosition {
    for (let index = arena.edges.length - 1; index >= 0; index--) {
        const edge = arena.edges[index];
        if (alongFrontage >= edge.startDistance || index === 0) {
            const raw = (alongFrontage - edge.startDistance) / edge.length;
            return {index, t: Math.min(Math.max(raw, 1e-9), 1 - 1e-9)};
        }
    }
    return {index: 0, t: 0.5};
}

/** The virtual cut at the start of the frontage: no geometry, just the strip's own lateral edge. */
function headCut(arena: Arena): Cut {
    return {
        origin: {index: 0, t: 0},
        points: [arena.ring[0]],
        end: {index: 0, t: 0},
        length: 0,
        frontageDistance: 0,
    };
}

/** The virtual cut at the end of the frontage. */
function tailCut(arena: Arena): Cut {
    const end: RingPosition = {index: arena.frontageEnd, t: 0};
    return {
        origin: end,
        points: [arena.ring[arena.frontageEnd]],
        end,
        length: 0,
        frontageDistance: arena.frontageLength,
    };
}

/**
 * Sample the frontage origins.
 *
 * The walk steps along the frontage by a spacing drawn from `N((Wmin + Wmax) / 2, 3ω)` clamped to
 * `[Wmin, Wmax]`, and stops as soon as the remaining frontage would be shorter than `Wmin`. Every
 * parcel therefore keeps at least `Wmin` of frontage — the egress guarantee the whole skeleton-strip
 * method exists to provide — and a frontage shorter than `2 * Wmin` yields no origins at all, leaving
 * the strip a single parcel.
 */
function sampleOrigins(arena: Arena, options: SliceOptions): number[] {
    const mean = (options.minWidth + options.maxWidth) / 2;
    const deviation = Math.sqrt(3 * options.splitIrregularity);
    const random = seededRandom(options.seed);
    const normal = seededNormal(random);

    const origins: number[] = [];
    let walked = 0;
    for (let guard = 0; guard < MAX_POST_PROCESSING_STEPS; guard++) {
        const drawn = deviation === 0 ? mean : mean + deviation * normal();
        const spacing = Math.min(Math.max(drawn, options.minWidth), options.maxWidth);
        walked += spacing;
        if (arena.frontageLength - walked < options.minWidth) {
            break;
        }
        origins.push(walked);
    }
    return origins;
}

/**
 * Keep only the cuts that leave the strip cleanly and in frontage order.
 *
 * A cut must end strictly behind the frontage and strictly before the cut to its left, or the two
 * parcels it is meant to separate would overlap. Rays that bend along a seam can converge onto the
 * same exit; when they do, the later one is dropped and its two parcels stay merged. Dropping a cut
 * only ever unions parcels, so it cannot cost a parcel its frontage.
 */
function orderedCuts(arena: Arena, candidates: Cut[]): Cut[] {
    const ringLength = arena.ring.length;
    const kept: Cut[] = [];
    let previousExit = ringLength;

    for (const cut of candidates) {
        const exit = ringScalar(cut.end);
        if (!(exit > arena.frontageEnd + 1e-12) || !(exit < previousExit - 1e-12)) {
            continue;
        }
        kept.push(cut);
        previousExit = exit;
    }
    return kept;
}

function buildParcel(arena: Arena, left: Cut, right: Cut): Parcel {
    const tolerance = arena.scale * 1e-12;
    const frontage = dropOpenRepeats(ringWalk(arena, left.origin, right.origin), tolerance);

    const boundary = [...frontage];
    pushAll(boundary, right.points.slice(1), tolerance);
    pushAll(boundary, ringWalk(arena, right.end, left.end).slice(1), tolerance);
    pushAll(boundary, [...left.points].reverse().slice(1), tolerance);

    const closed = dropRepeatedVertices(boundary, tolerance);
    return {boundary: closed, frontage, area: Math.abs(signedRingArea(closed))};
}

function pushAll(target: Vector2[], points: Vector2[], tolerance: number): void {
    for (const point of points) {
        if (target.length === 0 || distance(target[target.length - 1], point) > tolerance) {
            target.push(point);
        }
    }
}

/** Drop consecutive duplicates from an open polyline, leaving its two endpoints alone. */
function dropOpenRepeats(polyline: Vector2[], tolerance: number): Vector2[] {
    const kept = [polyline[0]];
    for (let i = 1; i < polyline.length; i++) {
        if (distance(kept[kept.length - 1], polyline[i]) > tolerance) {
            kept.push(polyline[i]);
        }
    }
    return kept.length >= 2 ? kept : polyline.slice(0, 2);
}

function buildParcels(arena: Arena, cuts: Cut[]): Parcel[] {
    const parcels: Parcel[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        parcels.push(buildParcel(arena, cuts[i], cuts[i + 1]));
    }
    return parcels;
}

/** Is the parcel a triangle once vertices that sit on a straight run are ignored? */
function isTriangular(parcel: Parcel, scale: number): boolean {
    const corners: Vector2[] = [];
    const ring = parcel.boundary;
    for (let i = 0; i < ring.length; i++) {
        const previous = ring[(i - 1 + ring.length) % ring.length];
        const current = ring[i];
        const next = ring[(i + 1) % ring.length];
        const cross = (current.x - previous.x) * (next.y - current.y)
            - (current.y - previous.y) * (next.x - current.x);
        if (Math.abs(cross) > scale * scale * COLLINEAR_EPSILON) {
            corners.push(current);
        }
    }
    return corners.length <= 3;
}

/**
 * Cut every parcel that exceeds `Amax` again, with a second ray from the middle of its frontage.
 *
 * A parcel that will not divide — because the halves would each be narrower than the sampler's own
 * minimum, or because the new ray does not leave the strip in order — is left over `Amax` rather than
 * forced. Those are the only parcels allowed above the bound at this stage.
 */
function splitOversizedParcels(arena: Arena, cuts: Cut[], options: SliceOptions): Cut[] {
    let current = cuts;
    const attempted = new Set<string>();

    for (let guard = 0; guard < MAX_POST_PROCESSING_STEPS; guard++) {
        const parcels = buildParcels(arena, current);
        let target = -1;
        let midpoint = 0;
        for (let index = 0; index < parcels.length; index++) {
            if (!(parcels[index].area > options.maxArea)) {
                continue;
            }
            const left = current[index].frontageDistance;
            const right = current[index + 1].frontageDistance;
            if (right - left < 2 * options.minWidth) {
                continue;
            }
            const candidate = (left + right) / 2;
            if (attempted.has(candidate.toExponential(12))) {
                continue;
            }
            target = index;
            midpoint = candidate;
            break;
        }
        if (target < 0) {
            return current;
        }

        attempted.add(midpoint.toExponential(12));
        const cut = castRay(arena, frontagePosition(arena, midpoint));
        if (cut === null) {
            continue;
        }
        const proposed = [...current.slice(0, target + 1), cut, ...current.slice(target + 1)];
        const inner = orderedCuts(arena, proposed.slice(1, -1));
        if (inner.length !== proposed.length - 2) {
            continue;
        }
        current = proposed;
    }

    return current;
}

/**
 * Merge away parcels that are triangular or below `Amin`, each into the neighbour it shares the
 * longest edge with, until neither fault remains or a single parcel is left.
 *
 * This runs after the `Amax` split, as the paper orders it, so a merge may push a parcel back above
 * `Amax`; that is the paper's own trade and not a defect. The sole parcel of a strip is exempt from
 * both faults because there is nothing left to merge it into.
 */
function mergeUndersizedParcels(arena: Arena, cuts: Cut[], options: SliceOptions): Cut[] {
    const current = [...cuts];

    for (let guard = 0; guard < MAX_POST_PROCESSING_STEPS; guard++) {
        const parcels = buildParcels(arena, current);
        if (parcels.length <= 1) {
            return current;
        }
        const faulty = parcels.findIndex(
            parcel => parcel.area < options.minArea || isTriangular(parcel, arena.scale));
        if (faulty < 0) {
            return current;
        }

        const last = parcels.length - 1;
        const removed = faulty === 0
            ? faulty + 1
            : faulty === last
                ? faulty
                : current[faulty].length >= current[faulty + 1].length ? faulty : faulty + 1;
        current.splice(removed, 1);
    }

    return current;
}

/** The whole strip as one parcel — the answer whenever it cannot meaningfully be sliced. */
function wholeStripAsParcel(strip: Strip): Parcel[] {
    if (strip.boundary.length < 3) {
        return [];
    }
    const area = strip.holes.reduce(
        (total, hole) => total - Math.abs(signedRingArea(hole)),
        Math.abs(signedRingArea(strip.boundary)));
    return [{boundary: [...strip.boundary], frontage: [...strip.frontage], area}];
}

/**
 * Slice a strip into parcels — Vanegas et al. §4.2.3.
 *
 * Origins are sampled along the strip's frontage at roughly `(Wmin + Wmax) / 2` apart, perturbed by
 * `splitIrregularity`; a ray is cast inward from each, confined to a single skeleton face; parcels
 * above `Amax` are cut again; and parcels that are triangular or below `Amin` are merged into the
 * neighbour they share the longest edge with.
 *
 * Guarantees, in the order they matter:
 *
 * - **Tiling.** The parcels partition the strip exactly. They are read off a single walk of the strip
 *   boundary between consecutive cuts, so there is no arithmetic that could open a gap or an overlap.
 * - **Egress.** Every parcel owns a non-degenerate run of the strip frontage — at least `Wmin` of it,
 *   or the whole frontage when the strip is too short to divide. No exceptions.
 * - **Determinism.** The same strip, options and seed give identical output, down to the bit.
 *
 * Boundary behaviour:
 *
 * - A strip with a **hole** is returned as a single parcel. A hole means the strip has closed a loop
 *   around part of the offset contour, so its frontage no longer has an inside and an outside to cut
 *   between and the ray cast is not defined. Returning the strip whole keeps the tiling exact and
 *   keeps the caller's parcel set complete; throwing would make one exotic street policy fatal to an
 *   otherwise fine block.
 * - A strip whose `boundary` is empty — which `computeStrips` produces only at `depth === 0` — yields
 *   no parcels at all.
 * - A frontage shorter than `2 * Wmin` yields one parcel: the whole strip.
 * - A strip whose frontage cannot be located as a run of its own boundary, or which is entirely
 *   frontage with no land behind it, is likewise returned whole rather than sliced badly.
 *
 * @throws if the width or area bounds are not ordered and positive, or the seed is not finite.
 */
export function sliceStrip(strip: Strip, options: SliceOptions): Parcel[] {
    validateOptions(options);

    if (strip.boundary.length < 3) {
        return [];
    }
    if (strip.holes.length > 0) {
        return wholeStripAsParcel(strip);
    }

    const arena = makeArena(strip);
    if (arena === null) {
        return wholeStripAsParcel(strip);
    }

    const candidates: Cut[] = [];
    for (const alongFrontage of sampleOrigins(arena, options)) {
        const cut = castRay(arena, frontagePosition(arena, alongFrontage));
        if (cut !== null) {
            candidates.push(cut);
        }
    }

    let cuts = [headCut(arena), ...orderedCuts(arena, candidates), tailCut(arena)];
    cuts = splitOversizedParcels(arena, cuts, options);
    cuts = mergeUndersizedParcels(arena, cuts, options);

    return buildParcels(arena, cuts).filter(parcel => parcel.boundary.length >= 3);
}

/**
 * {@link sliceStrip} over a whole decomposition, parcels grouped by the strip they came from.
 *
 * Every strip is sliced from the same seed, so a strip's parcels depend only on that strip and not on
 * its position in the array — re-slicing one strip in isolation reproduces its entry exactly.
 */
export function sliceStrips(strips: Strip[], options: SliceOptions): Parcel[][] {
    return strips.map(strip => sliceStrip(strip, options));
}
