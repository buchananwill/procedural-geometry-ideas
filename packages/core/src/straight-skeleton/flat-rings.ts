import type {StraightSkeletonSolverContext, Vector2} from "./types";
import {FLAT_STRETCH_BAR_FLOORS} from "./constants";
import {
    crossProduct,
    directionsAreSame,
    dotProduct,
    sineIsBelow,
    sizeOfVector,
    subtractVectors,
} from "./core-functions";
import {inwardDistanceFromWall, wallsAreAntiparallel} from "./wall-time";
import {segmentSegmentIntersection} from "./planar-geometry";
import {isEndpointTouch} from "./polygon-decomposition";
import {bisectWithParams} from "./algorithm-helpers";
import {retireBisectors} from "./wavefront-links";
import {ringArea, ringPolygonAt} from "./ring-components";
import {refuseStep} from "./step-scope";
import {accept, formatRing, PASSED, Refused, Verdict} from "./verdict";

/**
 * FLAT-RING TERMINATION (skeleton flat-ring and third-front spec, decisions 7 to 29). A ring a layer of a step of
 * several rings leaves, of three members or more, whose polygon has no visible area, is either a finished piece of
 * skeleton, closed in its step, or refused by name. It is never classified: a flat ring bounds nothing, so the outer-or-
 * hole question `componentsOfRings` refuses does not arise for it (decision 9). The test of flatness is positive and
 * never reads the area's sign: the ring's members, clustered into nodes at δ, must trace a set of STRETCHES on one line,
 * each covered once each way by two antiparallel wall fronts standing where they stand at the layer's time.
 */

/** The clause of the flatness test a ring fails, in the order the clauses are tested (decisions 12 to 19). */
export type FlatRingClause =
    | 'segment-against-wall'
    | 'segment-off-front'
    | 'stretch-cover-count'
    | 'stretch-same-way'
    | 'stretch-walls-not-antiparallel'
    | 'stretches-meet'
    | 'not-a-tree'
    | 'not-one-line'
    | 'stretch-under-bar'
    | 'level-not-newborn'
    | 'level-off-stretch'
    | 'level-doubled';

/**
 * A stretch between two nodes (node indices of the plan), covered once each way (decision 15). The front running from
 * `from` to `to` is `clockwiseWall`'s, and the front running back is `widdershinsWall`'s.
 */
export interface FlatStretch {
    from: number;
    to: number;
    clockwiseWall: number;
    widdershinsWall: number;
}

/**
 * A ring that passed the test: its members, its nodes, the node of each member (by ring index), and its stretches; the
 * node each level member runs to, the far end of the stretch it runs along (decision 19); and the stretches no level
 * member runs along, each born as one ridge (decision 26).
 */
export interface FlatRingPlan {
    ring: number[];
    nodes: Vector2[];
    nodeOf: number[];
    stretches: FlatStretch[];
    levelEnd: ReadonlyMap<number, number>;
    ridges: FlatStretch[];
}

/** Where a ring's level members run: the node each runs to, and the stretches none runs along. */
type LevelRuns = Pick<FlatRingPlan, 'levelEnd' | 'ridges'>;

/** Why a ring is not a flat termination: the clause it fails, and the reason in that clause's words. */
export interface FlatRingRefusal extends Refused {
    readonly clause: FlatRingClause;
}

/** The flatness test's answer: the ring's plan, or the first clause it fails. */
export type FlatRingVerdict = Verdict<FlatRingPlan, FlatRingRefusal>;

/** A piece of a ring's segment between two nodes, on the front of `wall` (decision 14). */
interface FrontSpan {
    from: number;
    to: number;
    wall: number;
}

const fail = (clause: FlatRingClause, reason: string): FlatRingRefusal => ({ok: false, clause, reason});

function wallBasis(context: StraightSkeletonSolverContext, wall: number): Vector2 {
    return context.getEdgeWithId(wall).basisVector;
}

/** Are this bisector's two parents antiparallel: is it a LEVEL member, a ridge between two facing fronts (decision 19)? */
function isLevel(context: StraightSkeletonSolverContext, id: number): boolean {
    const edge = context.getInteriorWithId(id);
    return wallsAreAntiparallel(context, edge.clockwiseExteriorEdgeIndex, edge.widdershinsExteriorEdgeIndex);
}

/** How far `point` lies off wall `wall`'s front at `time`: `n_W · (p − A_W) − w_W · t` (decision 13). */
function offFront(context: StraightSkeletonSolverContext, wall: number, point: Vector2, time: number): number {
    return inwardDistanceFromWall(context, wall, point) - context.weightOf(wall) * time;
}

/** Each member joins the first node whose seed lies within δ of it, in ring order, or seeds a new node (decision 11). */
function clusterIntoNodes(positions: Vector2[], floor: number): {nodes: Vector2[]; nodeOf: number[]} {
    const nodes: Vector2[] = [];
    const nodeOf = positions.map(position => {
        const index = nodes.findIndex(seed => sizeOfVector(subtractVectors(seed, position)) <= floor);
        if (index >= 0) {
            return index;
        }
        nodes.push(position);
        return nodes.length - 1;
    });
    return {nodes, nodeOf};
}

/**
 * The ring's segments, each from a member's node to its clockwise neighbour's on the member's clockwise parent's front,
 * where the two nodes differ (decisions 12 and 13): each must run along its wall's basis, and each end must stand on its
 * wall's front at `time`. Every segment is tested against decision 12 before any against decision 13.
 */
function frontSegments(
    context: StraightSkeletonSolverContext,
    ring: number[],
    nodes: Vector2[],
    nodeOf: number[],
    time: number,
): Verdict<FrontSpan[], FlatRingRefusal> {
    const segments: FrontSpan[] = [];
    ring.forEach((id, index) => {
        const next = (index + 1) % ring.length;
        if (nodeOf[index] !== nodeOf[next]) {
            segments.push({from: nodeOf[index], to: nodeOf[next], wall: context.getInteriorWithId(id).clockwiseExteriorEdgeIndex});
        }
    });
    const against = segments.find(segment => !directionsAreSame(
        subtractVectors(nodes[segment.to], nodes[segment.from]), wallBasis(context, segment.wall), context.angularResolution));
    if (against !== undefined) {
        return fail('segment-against-wall', `the segment from node ${against.from} to node ${against.to} does not run `
            + `along wall ${against.wall}'s basis`);
    }
    for (const segment of segments) {
        for (const end of [segment.from, segment.to]) {
            const off = offFront(context, segment.wall, nodes[end], time);
            if (Math.abs(off) > context.perceptualFloor) {
                return fail('segment-off-front', `node ${end} lies ${off} off wall ${segment.wall}'s front at time ${time}`);
            }
        }
    }
    return accept(segments);
}

/** Each segment cut at every other node within δ of its line and more than δ from both its ends along it (decision 14). */
function piecesOf(segments: FrontSpan[], nodes: Vector2[], floor: number): FrontSpan[] {
    return segments.flatMap(segment => {
        const start = nodes[segment.from];
        const span = subtractVectors(nodes[segment.to], start);
        const length = sizeOfVector(span);
        const cuts = nodes
            .map((node, index) => ({index, along: dotProduct(subtractVectors(node, start), span) / length,
                off: Math.abs(crossProduct(span, subtractVectors(node, start))) / length}))
            .filter(cut => cut.index !== segment.from && cut.index !== segment.to && cut.off <= floor
                && cut.along > floor && cut.along < length - floor)
            .sort((first, second) => first.along - second.along);
        const pieces: FrontSpan[] = [];
        let from = segment.from;
        for (const cut of cuts) {
            pieces.push({from, to: cut.index, wall: segment.wall});
            from = cut.index;
        }
        pieces.push({from, to: segment.to, wall: segment.wall});
        return pieces;
    });
}

/**
 * The stretches the pieces cover (decision 15): every pair of nodes a piece joins is joined by exactly two pieces,
 * running opposite ways, on antiparallel walls. Each clause is tested over every pair before the next.
 */
function stretchesOf(context: StraightSkeletonSolverContext, pieces: FrontSpan[]): Verdict<FlatStretch[], FlatRingRefusal> {
    const byPair = new Map<string, FrontSpan[]>();
    for (const piece of pieces) {
        const key = `${Math.min(piece.from, piece.to)}-${Math.max(piece.from, piece.to)}`;
        byPair.set(key, [...(byPair.get(key) ?? []), piece]);
    }
    const pairs = [...byPair.entries()];
    const miscovered = pairs.find(([, covers]) => covers.length !== 2);
    if (miscovered !== undefined) {
        return fail('stretch-cover-count', `the stretch between nodes ${miscovered[0]} is covered ${miscovered[1].length} `
            + `time(s), not once each way`);
    }
    const sameWay = pairs.find(([, [first, second]]) => first.from === second.from);
    if (sameWay !== undefined) {
        return fail('stretch-same-way', `the stretch between nodes ${sameWay[0]} is covered twice the same way`);
    }
    const parallel = pairs.find(([, [first, second]]) => !wallsAreAntiparallel(context, first.wall, second.wall));
    if (parallel !== undefined) {
        return fail('stretch-walls-not-antiparallel', `the stretch between nodes ${parallel[0]} lies on walls `
            + `${parallel[1][0].wall} and ${parallel[1][1].wall}, which are not antiparallel`);
    }
    return accept(pairs.map(([, [first, second]]) =>
        ({from: first.from, to: first.to, clockwiseWall: first.wall, widdershinsWall: second.wall})));
}

/**
 * Do two stretches meet other than at a node they share (decision 16): cross, or overlap by more than δ along a common
 * line? Two stretches whose directions lie within the angular resolution of each other are read as parallel.
 */
function stretchesMeet(first: FlatStretch, second: FlatStretch, nodes: Vector2[], context: StraightSkeletonSolverContext): boolean {
    const floor = context.perceptualFloor;
    const [a, b, c, d] = [nodes[first.from], nodes[first.to], nodes[second.from], nodes[second.to]];
    const along = subtractVectors(b, a);
    const length = sizeOfVector(along);
    if (sineIsBelow(along, subtractVectors(d, c), context.angularResolution)) {
        if (Math.abs(crossProduct(along, subtractVectors(c, a))) / length > floor) {
            return false;
        }
        const [p, q] = [c, d].map(point => dotProduct(subtractVectors(point, a), along) / length);
        return Math.min(length, Math.max(p, q)) - Math.max(0, Math.min(p, q)) > floor;
    }
    const crossing = segmentSegmentIntersection(a, b, c, d);
    return crossing !== null && !(isEndpointTouch(crossing.tA, length, floor)
        && isEndpointTouch(crossing.tB, sizeOfVector(subtractVectors(d, c)), floor));
}

/** Decisions 16 to 18: the stretches meet only at shared nodes, form one tree on one line, and each is over the bar. */
function stretchShape(
    stretches: FlatStretch[],
    nodes: Vector2[],
    context: StraightSkeletonSolverContext,
): Verdict<void, FlatRingRefusal> {
    const floor = context.perceptualFloor;
    for (let i = 0; i < stretches.length; i++) {
        for (let j = i + 1; j < stretches.length; j++) {
            if (stretchesMeet(stretches[i], stretches[j], nodes, context)) {
                return fail('stretches-meet', `the stretches ${stretches[i].from}-${stretches[i].to} and `
                    + `${stretches[j].from}-${stretches[j].to} cross or overlap away from a shared node`);
            }
        }
    }
    // EVERY NODE ENDS A STRETCH BY CONSTRUCTION, so decision 17 tests no clause for it (BSA.F117): a node holds a
    // member, its block of members is entered by a segment ending there, and every piece's pair of nodes is a stretch or
    // was refused under `stretch-cover-count`. The ring's walk joins every node, so the count alone decides the tree.
    if (stretches.length !== nodes.length - 1) {
        return fail('not-a-tree', `${stretches.length} stretches join ${nodes.length} nodes`);
    }
    const [line] = stretches;
    const lineBasis = wallBasis(context, line.clockwiseWall);
    const lineDirection = subtractVectors(nodes[line.to], nodes[line.from]);
    const offLine = stretches.find(stretch =>
        !sineIsBelow(wallBasis(context, stretch.clockwiseWall), lineBasis, context.angularResolution)
        || !sineIsBelow(wallBasis(context, stretch.widdershinsWall), lineBasis, context.angularResolution));
    const nodeOffLine = nodes.findIndex(node => Math.abs(crossProduct(lineDirection,
        subtractVectors(node, nodes[line.from]))) / sizeOfVector(lineDirection) > floor);
    if (offLine !== undefined || nodeOffLine >= 0) {
        return fail('not-one-line', offLine !== undefined
            ? `the stretch ${offLine.from}-${offLine.to}'s walls are not parallel to the first stretch's`
            : `node ${nodeOffLine} lies more than ${floor} off the first stretch's line`);
    }
    const short = stretches.find(stretch =>
        !(sizeOfVector(subtractVectors(nodes[stretch.to], nodes[stretch.from])) > FLAT_STRETCH_BAR_FLOORS * floor));
    if (short !== undefined) {
        return fail('stretch-under-bar', `the stretch ${short.from}-${short.to} is no longer than `
            + `${FLAT_STRETCH_BAR_FLOORS} floors (${FLAT_STRETCH_BAR_FLOORS * floor})`);
    }
    return PASSED;
}

/**
 * Decision 19 (and 20): every level member is newborn; on a ring of more than one node it runs along a stretch at its
 * node whose walls are its parents, its clockwise parent being the stretch's wall for the way away from its node; and at
 * most one level member runs each way along a stretch. Returns where the level members run: the node each runs to, the
 * far end of its stretch, and the stretches none runs along. Each clause is tested over every level member before the
 * next.
 */
function levelRuns(
    context: StraightSkeletonSolverContext,
    ring: readonly number[],
    nodeOf: readonly number[],
    nodeCount: number,
    stretches: readonly FlatStretch[],
    newborn: ReadonlySet<number>,
): Verdict<LevelRuns, FlatRingRefusal> {
    const levels = ring.map((id, index) => ({id, node: nodeOf[index]})).filter(member => isLevel(context, member.id));
    const old = levels.find(member => !newborn.has(member.id));
    if (old !== undefined) {
        return fail('level-not-newborn', `the level member e${old.id} was not born in this layer`);
    }
    // A ring of one node has no stretch (decision 20), so its level members end where they stand.
    if (nodeCount === 1) {
        return accept({levelEnd: new Map(), ridges: []});
    }
    const runs = levels.map(member => {
        const {clockwiseExteriorEdgeIndex: clockwise, widdershinsExteriorEdgeIndex: widdershins} = context.getInteriorWithId(member.id);
        const stretch = stretches.find(candidate => (candidate.from === member.node && candidate.clockwiseWall === clockwise
            && candidate.widdershinsWall === widdershins) || (candidate.to === member.node
            && candidate.widdershinsWall === clockwise && candidate.clockwiseWall === widdershins));
        return {...member, stretch};
    });
    const off = runs.find(run => run.stretch === undefined);
    if (off !== undefined) {
        return fail('level-off-stretch', `the level member e${off.id} runs along no stretch of its parents at node ${off.node}`);
    }
    const located = runs.filter((run): run is typeof run & {stretch: FlatStretch} => run.stretch !== undefined);
    // The level member running each way along each stretch: `forward` from `from` to `to`, `backward` from `to` to `from`.
    const forward = new Map<FlatStretch, number>();
    const backward = new Map<FlatStretch, number>();
    const levelEnd = new Map<number, number>();
    for (const {id, node, stretch} of located) {
        const runsForward = stretch.from === node;
        const way = runsForward ? forward : backward;
        const earlier = way.get(stretch);
        if (earlier !== undefined) {
            return fail('level-doubled', `the level members e${earlier} and e${id} run the same way along the stretch `
                + `${stretch.from}-${stretch.to}`);
        }
        way.set(stretch, id);
        levelEnd.set(id, runsForward ? stretch.to : stretch.from);
    }
    return accept({levelEnd, ridges: stretches.filter(stretch => !forward.has(stretch) && !backward.has(stretch))});
}

/**
 * THE FLATNESS TEST (decisions 11 to 21), positive, on a ring at the layer's `time`: its members placed as
 * `componentsOfRings` places them, a newborn member at its source node (`polygon`, which a caller that has already
 * placed them passes in). The first clause that fails is named.
 */
export function flatRingVerdict(
    context: StraightSkeletonSolverContext,
    ring: number[],
    time: number,
    newborn: ReadonlySet<number>,
    polygon: Vector2[] = ringPolygonAt(context, ring, time, newborn),
): FlatRingVerdict {
    const {nodes, nodeOf} = clusterIntoNodes(polygon, context.perceptualFloor);
    let stretches: FlatStretch[] = [];
    // A RING WHOSE MEMBERS ALL FALL IN ONE NODE has no segment and no stretch (decision 20).
    if (nodes.length > 1) {
        const segments = frontSegments(context, ring, nodes, nodeOf, time);
        if (!segments.ok) {
            return segments;
        }
        const covered = stretchesOf(context, piecesOf(segments.value, nodes, context.perceptualFloor));
        if (!covered.ok) {
            return covered;
        }
        const shape = stretchShape(covered.value, nodes, context);
        if (!shape.ok) {
            return shape;
        }
        stretches = covered.value;
    }
    const levels = levelRuns(context, ring, nodeOf, nodes.length, stretches, newborn);
    return levels.ok ? accept({ring, nodes, nodeOf, stretches, ...levels.value}) : levels;
}

/**
 * THE WIRING (decisions 22 to 27). One graph node per cluster: the source node of the cluster's first newborn member in
 * ring order, or else a node at its seed, with a position budget of 0 (§6 item 5). A non-level member ends at its node,
 * and one that ends at its own source is culled; a level member ends at the far node of its stretch; a stretch no level
 * member runs along is born as one ridge between its two walls, from `from`'s node to `to`'s. Every member and ridge is
 * accepted, and the members leave the wavefront; nothing is linked.
 */
function closeFlatRing(context: StraightSkeletonSolverContext, plan: FlatRingPlan, newborn: ReadonlySet<number>): void {
    const {graph} = context;
    const nodeIds = plan.nodes.map((seed, node) => {
        const first = plan.ring.find((id, index) => plan.nodeOf[index] === node && newborn.has(id));
        return first !== undefined ? graph.edges[first].source : context.findOrAddNode(seed, 0).id;
    });
    const at = (node: number) => graph.nodes[nodeIds[node]].position;
    plan.ring.forEach((id, index) => {
        context.terminateEdgesAtPoint([id], at(plan.levelEnd.get(id) ?? plan.nodeOf[index]), 0);
        if (graph.edges[id].target === graph.edges[id].source) {
            context.getInteriorWithId(id).culled = true;
        }
    });
    const ridges = plan.ridges
        .map(stretch => {
            const id = bisectWithParams(context, {clockwiseExteriorEdgeIndex: stretch.clockwiseWall,
                widdershinsExteriorEdgeIndex: stretch.widdershinsWall, source: nodeIds[stretch.from]});
            context.terminateEdgesAtPoint([id], at(stretch.to), 0);
            return id;
        });
    context.acceptAll([...plan.ring, ...ridges]);
    retireBisectors(context, plan.ring);
}

/**
 * CLOSE THE FLAT RINGS A LAYER OF A STEP OF SEVERAL RINGS LEFT (decisions 7, 8, 10 and 28), before its components are
 * read. `rings` are the rings the layer left, read from the links over its own bisectors (`ringsAmong`), the same rings
 * its components are then made of. A CANDIDATE is a ring of three members or more whose polygon at `time` is degenerate
 * (`ringArea`: `|signedArea|` at or under `degenerateAreaBar(δ, perimeter)`); the magnitude selects it and the sign is
 * read for none. Every candidate is tested first, and if any fails the step is refused as `multi-ring-step-refused`,
 * naming the clause, with no ring closed; else every candidate is closed. Returns the ids closed, which leave no child:
 * each closed ring is one of `rings`, whole.
 *
 * CLOSING A RING WRITES NO LINK BUT ITS OWN MEMBERS' (`closeFlatRing` retires them, and a ridge it bears opens only its
 * own slot), so every other ring of `rings` is still what the links say after the closing.
 */
export function closeFlatRings(
    context: StraightSkeletonSolverContext,
    rings: readonly number[][],
    time: number,
    newborn: ReadonlySet<number>,
): Set<number> {
    const plans = rings
        .filter(ring => ring.length >= 3)
        .flatMap(ring => {
            const {polygon, area, bar, degenerate} = ringArea(context, ring, time, newborn);
            if (!degenerate) {
                return [];
            }
            const verdict = flatRingVerdict(context, ring, time, newborn, polygon);
            if (!verdict.ok) {
                refuseStep(context, 'multi-ring-step-refused', `ring ${formatRing(ring)} has area ${area} at time `
                    + `${time}, at or under the ${bar} degenerate-area bar, and is not a flat termination: `
                    + `${verdict.clause}: ${verdict.reason}.`);
            }
            return [verdict.value];
        });
    for (const plan of plans) {
        closeFlatRing(context, plan, newborn);
        context.probe?.flatRingClosed?.(context, plan.ring);
    }
    return new Set(plans.flatMap(plan => plan.ring));
}
