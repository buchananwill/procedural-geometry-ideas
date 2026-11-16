import {PerceptualFloorOptions, Vector2} from "./types";
import {findFirstCrossing, isEndpointTouch} from "./polygon-decomposition";
import {
    distanceToSegment,
    isPointInPolygon,
    ringPerimeter,
    segmentSegmentIntersection,
    signedArea,
} from "./planar-geometry";
import {degenerateAreaBar} from "./constants";
import {makeSkeletonNormalisation, normalisePolygon} from "./normalisation";
import {resolvePerceptualFloor} from "./canonicalisation";

/**
 * THE RELATIONS BETWEEN THE LOOPS OF ONE INPUT (skeleton loops-input spec, decisions 26 to 32, 37, 38 and 49
 * to 51).
 *
 * An outline and its holes are refused at the door when they cross, touch or nest wrongly. Every test here
 * reads the perceptual floor δ, a helper's own arithmetic bar, or an exact predicate, and adds no tolerance
 * of its own (decision 26).
 */

/** The kinds of {@link LoopConflict}, in the order {@link findLoopConflict} looks for them (decisions 28 to 32). */
export type LoopConflictKind =
    | 'self-crossing'
    | 'degenerate-hole'
    | 'crossing'
    | 'contact'
    | 'hole-outside-outline'
    | 'hole-inside-hole';

/**
 * The first conflict among the loops of one input (decision 27).
 *
 * `loops` names the loops involved, `0` being the outline. `edges` holds one loop-local edge index per entry of
 * `loops` (edge `j` runs from vertex `j` to vertex `j + 1` of its loop) for the four kinds that name edges, and
 * is empty for the two nesting kinds, as decision 27 fixes, and for `degenerate-hole`, which names one loop and
 * no edge of it.
 *
 * - `self-crossing`: `loops` is `[k, k]` and `edges` the two edges of loop `k` that cross.
 * - `degenerate-hole`: `loops` is `[k]`.
 * - `crossing`: `loops` is `[a, b]` with `a < b`, and `edges` one edge of each.
 * - `contact`: `loops` is `[a, b]` with `a <= b`, and `edges` one edge of each. `a === b` is a loop that touches
 *   itself (decision 49): two of its edges that share no vertex, `edges[0] < edges[1]`.
 * - `hole-outside-outline`: `loops` is `[k, 0]`, hole loop `k` whose vertex 0 is not inside the outline.
 * - `hole-inside-hole`: `loops` is `[k, j]`, hole loop `k` whose vertex 0 is inside hole loop `j`.
 */
export interface LoopConflict {
    kind: LoopConflictKind;
    loops: number[];
    edges: number[];
}

/** An outline and the holes it carries, as indices into the loops given to {@link groupLoopsByNesting}. */
export interface LoopGroup {
    outline: number;
    holes: number[];
}

/**
 * Decision 28's first half: a loop that crosses itself, by `findFirstCrossing` on each loop, which skips an
 * endpoint touch at δ (C8 spec T24). A collinear overlap of two non-adjacent edges of one loop is not seen
 * (the spec's deferred list).
 */
function findSelfCrossing(loops: readonly (readonly Vector2[])[], perceptualFloor: number): LoopConflict | null {
    for (let k = 0; k < loops.length; k++) {
        const crossing = findFirstCrossing([...loops[k]], perceptualFloor);
        if (crossing !== null) {
            return {kind: 'self-crossing', loops: [k, k], edges: [crossing.edgeI, crossing.edgeJ]};
        }
    }
    return null;
}

/**
 * Decision 28's second half: a hole whose area is under `degenerateAreaBar(δ, perimeter)`, because its signed
 * area has no sign the solver can trust. The outline is not asked: a single degenerate loop fails honestly
 * downstream.
 */
function findDegenerateHole(loops: readonly (readonly Vector2[])[], perceptualFloor: number): LoopConflict | null {
    for (let k = 1; k < loops.length; k++) {
        if (isDegenerateHole(loops[k], perceptualFloor)) {
            return {kind: 'degenerate-hole', loops: [k], edges: []};
        }
    }
    return null;
}

/**
 * A ring whose area is under `degenerateAreaBar(δ, perimeter)`: its signed area has no sign the solver can trust
 * (decision 28). `solveSkeleton` also asks it of a hole before judging that hole's winding (decision 50), so a
 * sliver is refused as degenerate and never as mis-wound on that sign.
 */
export function isDegenerateHole(ring: readonly Vector2[], perceptualFloor: number): boolean {
    const copy = [...ring];
    return Math.abs(signedArea(copy)) < degenerateAreaBar(perceptualFloor, ringPerimeter(copy));
}

/** Edge `j` of a loop: from vertex `j` to vertex `j + 1`, wrapping within the loop. */
function edgeOf(loop: readonly Vector2[], j: number): [Vector2, Vector2] {
    return [loop[j], loop[(j + 1) % loop.length]];
}

/**
 * Decision 29: two edges of different loops CROSS when `segmentSegmentIntersection` finds a hit that is not an
 * endpoint touch at δ on either edge — `findFirstCrossing`'s rule, applied across loops.
 */
function edgesCross(a: [Vector2, Vector2], b: [Vector2, Vector2], perceptualFloor: number): boolean {
    const hit = segmentSegmentIntersection(a[0], a[1], b[0], b[1]);
    if (hit === null) {
        return false;
    }
    const lengthA = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
    const lengthB = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y);
    return !isEndpointTouch(hit.tA, lengthA, perceptualFloor) && !isEndpointTouch(hit.tB, lengthB, perceptualFloor);
}

/**
 * Decision 30: two edges of different loops, not crossing, are IN CONTACT when the least of the four
 * endpoint-to-segment distances is strictly under δ; decision 49 asks the same of two edges of one loop that
 * share no vertex. This sees a shared wall, which `segmentSegmentIntersection`
 * cannot (it returns `null` for parallel segments), as well as a shared point and a near-contact. Two segments
 * that do not cross are at their closest at an endpoint of one of them, so the four distances are the whole
 * question.
 */
function edgesTouch(a: [Vector2, Vector2], b: [Vector2, Vector2], perceptualFloor: number): boolean {
    const least = Math.min(
        distanceToSegment(a[0], b[0], b[1]),
        distanceToSegment(a[1], b[0], b[1]),
        distanceToSegment(b[0], a[0], a[1]),
        distanceToSegment(b[1], a[0], a[1]));
    return least < perceptualFloor;
}

/** Edges `i` and `j` of one loop of `count` edges share a vertex: they are one edge or neighbours. */
function edgesShareAVertex(i: number, j: number, count: number): boolean {
    return i === j || (i + 1) % count === j || (j + 1) % count === i;
}

/**
 * The first pair of edges, one from each of two different loops, that the predicate holds for. With
 * `withinLoop`, two edges of ONE loop that share no vertex are asked too (decision 49), and the loop pairs are
 * taken in the order `(a, b)` with `a <= b`, so each loop is asked of itself before it is asked of the loops
 * after it.
 */
function findEdgePair(
    kind: 'crossing' | 'contact',
    loops: readonly (readonly Vector2[])[],
    holds: (a: [Vector2, Vector2], b: [Vector2, Vector2]) => boolean,
    withinLoop: boolean,
): LoopConflict | null {
    for (let a = 0; a < loops.length; a++) {
        for (let b = withinLoop ? a : a + 1; b < loops.length; b++) {
            for (let i = 0; i < loops[a].length; i++) {
                const edgeA = edgeOf(loops[a], i);
                for (let j = a === b ? i + 1 : 0; j < loops[b].length; j++) {
                    if (a === b && edgesShareAVertex(i, j, loops[a].length)) {
                        continue;
                    }
                    if (holds(edgeA, edgeOf(loops[b], j))) {
                        return {kind, loops: [a, b], edges: [i, j]};
                    }
                }
            }
        }
    }
    return null;
}

/** Decision 29 over every pair of loops: the first two edges of different loops that cross. */
function findCrossing(loops: readonly (readonly Vector2[])[], perceptualFloor: number): LoopConflict | null {
    return findEdgePair('crossing', loops, (a, b) => edgesCross(a, b, perceptualFloor), false);
}

/**
 * Decision 30 over every pair of loops, and with `withinLoop` decision 49 over every loop: the first two edges
 * that touch. A loop of a holed input that touches itself is a pinch, and a pinched ring cannot be handed to the
 * join event.
 */
function findContact(
    loops: readonly (readonly Vector2[])[],
    perceptualFloor: number,
    withinLoop: boolean,
): LoopConflict | null {
    return findEdgePair('contact', loops, (a, b) => edgesTouch(a, b, perceptualFloor), withinLoop);
}

/**
 * Decisions 31 and 32: NESTING IS DECIDED BY ONE VERTEX, which is sound once no two loops cross or touch.
 * Vertex 0 of each hole must lie inside the outline, and inside no other hole, by `isPointInPolygon`. No vertex
 * is then within δ of another loop, so that test's ambiguity on a boundary cannot arise.
 */
function findNestingConflict(loops: readonly (readonly Vector2[])[]): LoopConflict | null {
    for (let k = 1; k < loops.length; k++) {
        if (!isPointInPolygon(loops[k][0], loops[0])) {
            return {kind: 'hole-outside-outline', loops: [k, 0], edges: []};
        }
    }
    for (let k = 1; k < loops.length; k++) {
        for (let j = 1; j < loops.length; j++) {
            if (j !== k && isPointInPolygon(loops[k][0], loops[j])) {
                return {kind: 'hole-inside-hole', loops: [k, j], edges: []};
            }
        }
    }
    return null;
}

/**
 * THE FIRST CONFLICT AMONG AN OUTLINE AND ITS HOLES, in the order of decisions 28 to 32, or `null` (decision 27).
 * `loops[0]` is the outline and `loops[k]` hole `k - 1`. `perceptualFloor` is δ in the space the loops are given
 * in: `solveSkeleton` asks in unit space, on the loops the solver will be given (decision 23).
 *
 * Contact includes A LOOP THAT TOUCHES ITSELF (decision 49), asked of every loop here, because this is asked only
 * of a holed input: a single loop with no holes never reaches it, and a self-crossing one is decomposed.
 */
export function findLoopConflict(loops: readonly (readonly Vector2[])[], perceptualFloor: number): LoopConflict | null {
    return findSelfCrossing(loops, perceptualFloor)
        ?? findDegenerateHole(loops, perceptualFloor)
        ?? findCrossing(loops, perceptualFloor)
        ?? findContact(loops, perceptualFloor, true)
        ?? findNestingConflict(loops);
}

/** A loop's name in a message: loop 0 is the outline and loop `k` the caller's hole `k - 1`. */
export function loopName(loop: number): string {
    return loop === 0 ? 'the outline' : `hole ${loop - 1}`;
}

/**
 * The prefix a refusal of one loop carries (decision 16): `''` for the outline, whose messages carry no prefix, and
 * `Hole k: ` for the caller's hole `k`, which is loop `k + 1`.
 */
export function loopRefusalPrefix(loop: number): string {
    return loop === 0 ? '' : `Hole ${loop - 1}: `;
}

/** The refusal of a degenerate hole, loop `loop` (decisions 28 and 50): it names one loop and no edge of it. */
export function describeDegenerateHole(loop: number): string {
    return `Loop conflict (degenerate-hole): ${loopName(loop)} has an area under degenerateAreaBar at the perceptual `
        + `floor, so its winding has no sign the solver can trust.`;
}

/**
 * `solveSkeleton`'s refusal of a conflict, NAMING THE CALLER'S OWN VERTICES (decision 26). `callerVertex(loop,
 * local)` translates a solved loop-local vertex index into the caller's index for that loop, through the loop's
 * map, so a removed vertex or a reversed hole is reported in the caller's numbering.
 */
export function describeLoopConflict(
    conflict: LoopConflict,
    loopSizes: readonly number[],
    callerVertex: (loop: number, local: number) => number,
): string {
    const edgeName = (entry: number): string => {
        const loop = conflict.loops[entry];
        const local = conflict.edges[entry];
        return `${loopName(loop)}'s edge from vertex ${callerVertex(loop, local)} to vertex `
            + `${callerVertex(loop, (local + 1) % loopSizes[loop])}`;
    };
    const vertexZero = (loop: number): string => `vertex ${callerVertex(loop, 0)} of ${loopName(loop)}`;
    const prefix = `Loop conflict (${conflict.kind}): `;
    switch (conflict.kind) {
        case 'self-crossing':
            return `${prefix}${loopName(conflict.loops[0])} crosses itself: ${edgeName(0)} crosses ${edgeName(1)}. `
                + `A holed input needs simple loops; only a single loop with no holes is decomposed.`;
        case 'degenerate-hole':
            return describeDegenerateHole(conflict.loops[0]);
        case 'crossing':
            return `${prefix}${edgeName(0)} crosses ${edgeName(1)}. Loops that cross are refused.`;
        case 'contact':
            if (conflict.loops[0] === conflict.loops[1]) {
                return `${prefix}${loopName(conflict.loops[0])} touches itself: ${edgeName(0)} lies within the `
                    + `perceptual floor of ${edgeName(1)}, which shares no vertex with it. A pinched loop cannot `
                    + `be solved with holes.`;
            }
            return `${prefix}${edgeName(0)} lies within the perceptual floor of ${edgeName(1)}. Loops that touch `
                + `are refused until they can be merged (holed-skeleton roadmap node 8).`;
        case 'hole-outside-outline':
            return `${prefix}${vertexZero(conflict.loops[0])} does not lie inside the outline, so the hole is `
                + `outside it.`;
        case 'hole-inside-hole':
            return `${prefix}${vertexZero(conflict.loops[0])} lies inside ${loopName(conflict.loops[1])}. A hole `
                + `inside a hole is an island; group the loops with groupLoopsByNesting and solve it apart.`;
    }
}

/**
 * GROUP CLOSED, SIMPLE LOOPS INTO OUTLINE-AND-HOLES INPUTS BY NESTING DEPTH (decision 37, BSA.D282).
 *
 * A loop's depth is the number of other loops containing its vertex 0. An even depth is an outline and an odd
 * depth a hole of its deepest container, the containing loop of greatest depth. Groups are ordered by outline
 * index and holes by index. Winding is ignored, and the result is indices, so each caller carries its own weights
 * across to `solveSkeleton`.
 *
 * REFUSES CROSSING AND CONTACT BETWEEN ANY TWO LOOPS BY A THROW (decision 38), with the crossing and contact
 * tests of {@link findLoopConflict} run directly, in one normalisation over all the loops: loops in different
 * groups are solved apart and only this helper sees them together. It does NOT run {@link findLoopConflict}
 * whole, because that returns the first conflict in decision order, so a self-crossing or degenerate loop would
 * mask a crossing or contact behind it (BSA.D297). Self-crossing, degenerate area and a loop touching itself are
 * left to each group's solve, and the two nesting kinds are what this helper decides. The solver never calls it.
 *
 * WHERE THE NESTING IT FINDS IS NOT A CHAIN, IT REFUSES BY NAME (decision 51): a hole whose deepest container is
 * itself at odd depth has no group to join. Once no two loops cross or touch, containment is a chain, so this is
 * a guard on the helper's own premise rather than a refusal any sound input meets.
 *
 * δ HERE IS IN THE UNIT SPACE OF ALL THE LOOPS, and each group's solve measures it in that group's own, so a pair
 * of loops near δ apart may pass this helper and be refused by the solve. The solve's verdict stands: it is a
 * throw, so the difference is signalled and never silent.
 */
export function groupLoopsByNesting(
    loops: readonly (readonly Vector2[])[],
    options?: PerceptualFloorOptions,
): LoopGroup[] {
    const perceptualFloor = resolvePerceptualFloor(options);
    const normalisation = makeSkeletonNormalisation(loops.flatMap(loop => [...loop]));
    const unitLoops = loops.map(loop => normalisePolygon(loop, normalisation));

    const conflict = findCrossing(unitLoops, perceptualFloor) ?? findContact(unitLoops, perceptualFloor, false);
    if (conflict !== null) {
        const [a, b] = conflict.loops;
        const [i, j] = conflict.edges;
        throw new Error(
            `Loop conflict (${conflict.kind}): edge ${i} of loop ${a} `
            + `${conflict.kind === 'crossing' ? 'crosses' : 'lies within the perceptual floor of'} edge ${j} of loop ${b}. `
            + `Loops that cross or touch cannot be grouped into outlines and holes.`);
    }

    const containers = unitLoops.map((loop, index) => unitLoops
        .map((other, otherIndex) => otherIndex)
        .filter(otherIndex => otherIndex !== index && isPointInPolygon(loop[0], unitLoops[otherIndex])));
    const depth = containers.map(list => list.length);

    const groups: LoopGroup[] = [];
    const groupOf = new Map<number, LoopGroup>();
    depth.forEach((loopDepth, index) => {
        if (loopDepth % 2 === 0) {
            const group = {outline: index, holes: []};
            groups.push(group);
            groupOf.set(index, group);
        }
    });
    depth.forEach((loopDepth, index) => {
        if (loopDepth % 2 === 1) {
            const deepest = containers[index].reduce((best, candidate) =>
                depth[candidate] > depth[best] ? candidate : best);
            const group = groupOf.get(deepest);
            if (group === undefined) {
                throw new Error(
                    `Loop nesting is not a chain: loop ${index} lies at depth ${loopDepth}, and its deepest `
                    + `container, loop ${deepest}, lies at depth ${depth[deepest]}, so it is no outline and loop `
                    + `${index} has no group to join.`);
            }
            group.holes.push(index);
        }
    });
    return groups;
}
