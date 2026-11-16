import type {StraightSkeletonSolverContext, Vector2} from "./types";
import {degenerateAreaBar, FLAT_STRETCH_BAR_FLOORS} from "./constants";
import {
    crossProduct,
    directionsAreSame,
    dotProduct,
    sineIsBelow,
    sizeOfVector,
    subtractVectors,
} from "./core-functions";
import {inwardDistanceFromWall, wallsAreAntiparallel} from "./wall-time";
import {ringPerimeter, segmentSegmentIntersection, signedArea} from "./planar-geometry";
import {isEndpointTouch} from "./polygon-decomposition";
import {bisectWithParams} from "./algorithm-helpers";
import {retireBisectors, ringsOfWavefront} from "./wavefront-links";
import {ringPolygonAt} from "./ring-components";
import {refuseStep} from "./step-scope";

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
 * `from` to `to` is `clockwiseWall`'s, and the front running back is `widdershinsWall`'s. `forward` is the level member
 * running from `from` to `to`, `backward` the one running from `to` to `from`, where one does (decision 19).
 */
export interface FlatStretch {
    from: number;
    to: number;
    clockwiseWall: number;
    widdershinsWall: number;
    forward?: number;
    backward?: number;
}

/** A ring that passed the test: its members, its nodes, the node of each member (by ring index), and its stretches. */
export interface FlatRingPlan {
    ring: number[];
    nodes: Vector2[];
    nodeOf: number[];
    stretches: FlatStretch[];
}

export type FlatRingVerdict = {flat: true; plan: FlatRingPlan} | {flat: false; clause: FlatRingClause; detail: string};

type FlatRingFailure = Extract<FlatRingVerdict, {flat: false}>;

/** A piece of a ring's segment between two nodes, on the front of `wall` (decision 14). */
interface Piece {
    from: number;
    to: number;
    wall: number;
}

const fail = (clause: FlatRingClause, detail: string): FlatRingFailure => ({flat: false, clause, detail});

const isFailure = (value: object): value is FlatRingFailure => 'clause' in value;

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
): Piece[] | FlatRingFailure {
    const segments: Piece[] = [];
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
    return segments;
}

/** Each segment cut at every other node within δ of its line and more than δ from both its ends along it (decision 14). */
function piecesOf(segments: Piece[], nodes: Vector2[], floor: number): Piece[] {
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
        const pieces: Piece[] = [];
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
function stretchesOf(context: StraightSkeletonSolverContext, pieces: Piece[]): FlatStretch[] | FlatRingFailure {
    const byPair = new Map<string, Piece[]>();
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
    return pairs.map(([, [first, second]]) =>
        ({from: first.from, to: first.to, clockwiseWall: first.wall, widdershinsWall: second.wall}));
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
function stretchShapeFailure(
    stretches: FlatStretch[],
    nodes: Vector2[],
    context: StraightSkeletonSolverContext,
): FlatRingFailure | undefined {
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
    return undefined;
}

/**
 * Decision 19 (and 20): every level member is newborn; on a ring of more than one node it runs along a stretch at its
 * node whose walls are its parents, its clockwise parent being the stretch's wall for the way away from its node; and at
 * most one level member runs each way along a stretch. Records each level member on its stretch. Each clause is tested
 * over every level member before the next.
 */
function levelFailure(
    context: StraightSkeletonSolverContext,
    plan: FlatRingPlan,
    newborn: ReadonlySet<number>,
): FlatRingFailure | undefined {
    const levels = plan.ring.map((id, index) => ({id, node: plan.nodeOf[index]})).filter(member => isLevel(context, member.id));
    const old = levels.find(member => !newborn.has(member.id));
    if (old !== undefined) {
        return fail('level-not-newborn', `the level member e${old.id} was not born in this layer`);
    }
    if (plan.nodes.length === 1) {
        return undefined;
    }
    const runs = levels.map(member => {
        const {clockwiseExteriorEdgeIndex: clockwise, widdershinsExteriorEdgeIndex: widdershins} = context.getInteriorWithId(member.id);
        const stretch = plan.stretches.find(candidate => (candidate.from === member.node && candidate.clockwiseWall === clockwise
            && candidate.widdershinsWall === widdershins) || (candidate.to === member.node
            && candidate.widdershinsWall === clockwise && candidate.clockwiseWall === widdershins));
        return {...member, stretch};
    });
    const off = runs.find(run => run.stretch === undefined);
    if (off !== undefined) {
        return fail('level-off-stretch', `the level member e${off.id} runs along no stretch of its parents at node ${off.node}`);
    }
    for (const {id, node, stretch} of runs) {
        const way = stretch!.from === node ? 'forward' : 'backward';
        if (stretch![way] !== undefined) {
            return fail('level-doubled', `the level members e${stretch![way]} and e${id} run the same way along the stretch `
                + `${stretch!.from}-${stretch!.to}`);
        }
        stretch![way] = id;
    }
    return undefined;
}

/**
 * THE FLATNESS TEST (decisions 11 to 21), positive, on a ring at the layer's `time`: its members placed as
 * `componentsOfRings` places them, a newborn member at its source node. The first clause that fails is named.
 */
export function flatRingVerdict(
    context: StraightSkeletonSolverContext,
    ring: number[],
    time: number,
    newborn: ReadonlySet<number>,
): FlatRingVerdict {
    const {nodes, nodeOf} = clusterIntoNodes(ringPolygonAt(context, ring, time, newborn), context.perceptualFloor);
    const plan: FlatRingPlan = {ring, nodes, nodeOf, stretches: []};
    // A RING WHOSE MEMBERS ALL FALL IN ONE NODE has no segment and no stretch (decision 20).
    if (nodes.length > 1) {
        const segments = frontSegments(context, ring, nodes, nodeOf, time);
        if (isFailure(segments)) {
            return segments;
        }
        const stretches = stretchesOf(context, piecesOf(segments, nodes, context.perceptualFloor));
        if (isFailure(stretches)) {
            return stretches;
        }
        const shape = stretchShapeFailure(stretches, nodes, context);
        if (shape !== undefined) {
            return shape;
        }
        plan.stretches = stretches;
    }
    return levelFailure(context, plan, newborn) ?? {flat: true, plan};
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
    const levelEnd = new Map<number, number>();
    for (const stretch of plan.stretches) {
        if (stretch.forward !== undefined) {
            levelEnd.set(stretch.forward, stretch.to);
        }
        if (stretch.backward !== undefined) {
            levelEnd.set(stretch.backward, stretch.from);
        }
    }
    plan.ring.forEach((id, index) => {
        context.terminateEdgesAtPoint([id], at(levelEnd.get(id) ?? plan.nodeOf[index]), 0);
        if (graph.edges[id].target === graph.edges[id].source) {
            context.getInteriorWithId(id).culled = true;
        }
    });
    const ridges = plan.stretches
        .filter(stretch => stretch.forward === undefined && stretch.backward === undefined)
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
 * read. The rings are read from the links over `outgoing`, this layer's bisectors only, as `componentsAsChildren` reads
 * them. A CANDIDATE is a ring of three members or more whose polygon at `time` has `|signedArea|` at or under
 * `degenerateAreaBar(δ, perimeter)`; the magnitude selects it and the sign is read for none. Every candidate is tested
 * first, and if any fails the step is refused as `multi-ring-step-refused`, naming the clause, with no ring closed; else
 * every candidate is closed. Returns the ids closed, which leave no child.
 */
export function closeFlatRings(
    context: StraightSkeletonSolverContext,
    outgoing: number[],
    time: number,
    newborn: ReadonlySet<number>,
): Set<number> {
    const kept = new Set(outgoing);
    const plans = ringsOfWavefront(context, outgoing)
        .map(ring => ring.filter(id => kept.has(id)))
        .filter(ring => ring.length >= 3)
        .flatMap(ring => {
            const polygon = ringPolygonAt(context, ring, time, newborn);
            const area = signedArea(polygon);
            const bar = degenerateAreaBar(context.perceptualFloor, ringPerimeter(polygon));
            if (Math.abs(area) > bar) {
                return [];
            }
            const verdict = flatRingVerdict(context, ring, time, newborn);
            if (!verdict.flat) {
                refuseStep(context, 'multi-ring-step-refused', `ring [${ring.join(', ')}] has area ${area} at time `
                    + `${time}, at or under the ${bar} degenerate-area bar, and is not a flat termination: `
                    + `${verdict.clause}: ${verdict.detail}.`);
            }
            return [verdict.plan];
        });
    for (const plan of plans) {
        closeFlatRing(context, plan, newborn);
        context.probe?.flatRingClosed?.(context, plan.ring);
    }
    return new Set(plans.flatMap(plan => plan.ring));
}
