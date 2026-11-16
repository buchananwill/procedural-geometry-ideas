import type {StraightSkeletonSolverContext, Vector2} from "./types";
import {degenerateAreaBar} from "./constants";
import {distanceToSegment, isPointInPolygon, ringPerimeter, signedArea} from "./planar-geometry";
import {findFirstCrossing} from "./polygon-decomposition";
import {refuseStep} from "./step-scope";
import {formatRing} from "./verdict";

// ── Components: which child each ring goes to (skeleton join-and-divide spec, decisions 10 to 17) ────────────────────────────────

/**
 * A ring's polygon at the layer's `time`: each bisector born in the layer (`newborn`) at its source node, and each older
 * one at `context.wavefrontVertexAt(id, time)` (decision 12). The placement both `componentsOfRings` and the flat-ring
 * test read.
 */
export function ringPolygonAt(
    context: StraightSkeletonSolverContext,
    ring: readonly number[],
    time: number,
    newborn: ReadonlySet<number>,
): Vector2[] {
    const {graph} = context;
    return ring.map(id => newborn.has(id)
        ? graph.nodes[graph.edges[id].source].position
        : context.wavefrontVertexAt(id, time));
}

/** A ring's polygon at the layer's time, its signed area, the degenerate-area bar it is held to, and the verdict. */
export interface RingArea {
    polygon: Vector2[];
    area: number;
    bar: number;
    /**
     * `|area|` at or under `degenerateAreaBar(δ, perimeter)`, δ the solve's perceptual floor: too small to say whether
     * the ring is outer or inner. A NaN area is degenerate.
     */
    degenerate: boolean;
}

/**
 * THE ONE DEFINITION OF A DEGENERATE RING, read by `componentsOfRings`, which refuses it, and by the flat-ring test,
 * which takes it as a candidate.
 */
export function ringArea(
    context: StraightSkeletonSolverContext,
    ring: readonly number[],
    time: number,
    newborn: ReadonlySet<number>,
): RingArea {
    const polygon = ringPolygonAt(context, ring, time, newborn);
    const area = signedArea(polygon);
    const bar = degenerateAreaBar(context.perceptualFloor, ringPerimeter(polygon));
    return {polygon, area, bar, degenerate: !(Math.abs(area) > bar)};
}

/** One child of a step of several rings: an outer ring and the inner rings inside it (decision 10). */
export interface RingComponent {
    outer: number[];
    inner: number[][];
}

/**
 * THE COMPONENTS OF THE RINGS A LAYER LEFT (decisions 12 to 16), for a step of more than one ring. Each ring is
 * classified at the layer's time `time`, the time of the earliest arrival the layer resolved: its polygon is its
 * bisectors' positions at `time` in clockwise-neighbour order, a bisector born in the layer (`newborn`) at its source
 * node and an older one at `context.wavefrontVertexAt(id, time)`.
 *
 *  - A ring whose polygon has NEGATIVE `signedArea` is OUTER, the outline's clockwise winding; positive is inner
 *    (decision 13).
 *  - Each outer ring founds one component, and each inner ring joins the component of the outer ring of least
 *    `|area|` whose polygon contains the inner ring's WITNESS, by `isPointInPolygon` (decision 14). The witness is the
 *    source node of the clockwise parent of the ring's first member: an inner ring holds only hole edges, so it is a
 *    vertex of a hole the ring encloses, and it lies on a wall, which every front left at offset zero (decision 15).
 *  - AMBIGUITY IS REFUSED, NEVER GUESSED (decision 16): a ring of `|area|` at or under `degenerateAreaBar(δ,
 *    perimeter)`, a witness closer than δ to an edge of an outer polygon by `distanceToSegment`, or an inner ring no
 *    outer ring contains is refused as `multi-ring-step-refused`, naming the step and the ring. δ is the solve's
 *    perceptual floor, read here and changed nowhere.
 *  - A RING WHOSE POLYGON CROSSES ITSELF IS REFUSED THE SAME WAY, BEFORE ITS AREA IS READ (BSA.D309): the sign of a
 *    self-crossing polygon's area is the difference of its lobes' and says nothing about its winding, so decision 15's
 *    premise that the rings are simple is checked, not trusted. The test is `findFirstCrossing` at δ, the
 *    decomposition's own, which skips an endpoint touch: a joined ring visits its join node twice, and its four edges
 *    there meet only at their ends. It costs one O(m²) pass per ring a step of several rings leaves; it is never
 *    reached on one loop, whose steps are each of one ring (decision 11).
 *
 *  - A RING OF EXACTLY TWO BISECTORS is its own component and is not classified (skeleton simultaneous-rings spec,
 *    decision 12): a ridge's corridor, which bounds nothing.
 *
 * Components are returned in the order of their outer rings (or rings of two) in `rings`, each inner ring in the order
 * given.
 */
export function componentsOfRings(
    context: StraightSkeletonSolverContext,
    rings: number[][],
    time: number,
    newborn: ReadonlySet<number> = new Set(),
): RingComponent[] {
    const {graph} = context;
    const floor = context.perceptualFloor;
    // A RING OF EXACTLY TWO BISECTORS IS ITS OWN COMPONENT, UNCLASSIFIED (skeleton simultaneous-rings spec, decision 12):
    // the corridor between two fronts meeting along a line, which the pair handler closes as it closes a single loop's
    // corridor (decision 11). Its polygon has two points and its area is exactly 0, so it would be refused below; it
    // bounds nothing and cannot hold a hole.
    const corridors = new Set(rings.filter(ring => ring.length === 2));
    const placed = rings.filter(ring => !corridors.has(ring)).map(ring => {
        const {polygon, area, bar, degenerate} = ringArea(context, ring, time, newborn);
        const crossing = findFirstCrossing(polygon, floor);
        if (crossing !== null) {
            refuseStep(context, 'multi-ring-step-refused', `ring ${formatRing(ring)}'s polygon crosses itself at time `
                + `${time}: its edges ${crossing.edgeI} and ${crossing.edgeJ} cross at (${crossing.point.x}, `
                + `${crossing.point.y}), so the sign of its area cannot classify it as outer or inner.`);
        }
        if (degenerate) {
            refuseStep(context, 'multi-ring-step-refused', `ring ${formatRing(ring)} has area ${area} at time ${time}, `
                + `at or under the ${bar} degenerate-area bar: it cannot be classified as outer or inner.`);
        }
        return {ring, polygon, area};
    });

    const outers = placed.filter(entry => entry.area < 0);
    const componentOf = new Map(outers.map(entry => [entry.ring, {outer: entry.ring, inner: []} as RingComponent] as const));
    for (const ring of corridors) {
        componentOf.set(ring, {outer: ring, inner: []});
    }
    // In the order of their outer rings (or corridor rings) in `rings`.
    const components: RingComponent[] = rings.flatMap(ring => componentOf.get(ring) ?? []);
    for (const entry of placed.filter(candidate => candidate.area > 0)) {
        const parent = context.getInteriorWithId(entry.ring[0]).clockwiseExteriorEdgeIndex;
        const witness = graph.nodes[graph.edges[parent].source].position;
        let container = -1;
        outers.forEach((outer, index) => {
            const {polygon} = outer;
            const near = polygon.some((vertex, k) =>
                distanceToSegment(witness, vertex, polygon[(k + 1) % polygon.length]) < floor);
            if (near) {
                refuseStep(context, 'multi-ring-step-refused', `inner ring ${formatRing(entry.ring)}'s witness `
                    + `(${witness.x}, ${witness.y}) lies within the ${floor} floor of outer ring `
                    + `${formatRing(outer.ring)} at time ${time}: which ring holds it cannot be read.`);
            }
            if (isPointInPolygon(witness, polygon)
                && (container === -1 || Math.abs(outer.area) < Math.abs(outers[container].area))) {
                container = index;
            }
        });
        if (container === -1) {
            refuseStep(context, 'multi-ring-step-refused', `inner ring ${formatRing(entry.ring)}'s witness `
                + `(${witness.x}, ${witness.y}) lies in no outer ring at time ${time}.`);
        }
        componentOf.get(outers[container].ring)!.inner.push(entry.ring);
    }
    return components;
}
