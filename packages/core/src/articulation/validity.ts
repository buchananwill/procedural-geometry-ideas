import type { Vector2 } from '../shared/types';
import type { ElementConstraints, MinMax } from './types';
import { crossV, dotV, distV, lenV, subV } from './geometry';

export const ARTICULATION_EPSILON = 1e-6;

/**
 * Signed turning angle at element i between (p[i]-p[i-1]) and (p[i+1]-p[i]),
 * CCW positive, in (-PI, PI]. Null at chain ends or when a segment is
 * degenerate (constraint cannot be evaluated).
 */
export function jointAngleAt(elements: Vector2[], i: number): number | null {
    if (i <= 0 || i >= elements.length - 1) return null;
    const vIn = subV(elements[i], elements[i - 1]);
    const vOut = subV(elements[i + 1], elements[i]);
    if (lenV(vIn) < ARTICULATION_EPSILON || lenV(vOut) < ARTICULATION_EPSILON) return null;
    return Math.atan2(crossV(vIn, vOut), dotV(vIn, vOut));
}

/** How far outside the bound the value sits; zero while it is inside. */
function boundViolation(value: number, bound: MinMax): number {
    return Math.max(0, bound.min - value, value - bound.max);
}

/**
 * How far the length of the link between `lowerLinkIndex` and
 * `lowerLinkIndex + 1` falls outside its bounds. The link is governed by BOTH
 * endpoints' constraints (intersection semantics), so the worse of the two
 * entries is the link's violation. Zero when unconstrained or within bounds.
 */
export function linkDistanceViolation(
    elements: Vector2[],
    constraints: ElementConstraints[],
    lowerLinkIndex: number,
): number {
    const distance = distV(elements[lowerLinkIndex], elements[lowerLinkIndex + 1]);
    const prevBound = constraints[lowerLinkIndex + 1]?.distanceToPrev;
    const nextBound = constraints[lowerLinkIndex]?.distanceToNext;
    return Math.max(
        prevBound ? boundViolation(distance, prevBound) : 0,
        nextBound ? boundViolation(distance, nextBound) : 0,
    );
}

/**
 * How far the turning angle at `index` falls outside its bound. Zero when
 * unconstrained, and zero where the angle cannot be evaluated at all -- a
 * degenerate joint is no more violated than an absent one.
 */
export function jointAngleViolation(
    elements: Vector2[],
    constraints: ElementConstraints[],
    index: number,
): number {
    const bound = constraints[index]?.jointAngle;
    if (!bound) return 0;
    const angle = jointAngleAt(elements, index);
    if (angle === null) return 0;
    return boundViolation(angle, bound);
}

/** Distance bounds on the link between `lowerIndex` and `lowerIndex + 1`. */
export function linkDistanceHolds(
    elements: Vector2[],
    constraints: ElementConstraints[],
    lowerIndex: number,
): boolean {
    return linkDistanceViolation(elements, constraints, lowerIndex) <= ARTICULATION_EPSILON;
}

/** Joint-angle bound at one element; vacuously true where it cannot be evaluated. */
export function jointAngleHolds(
    elements: Vector2[],
    constraints: ElementConstraints[],
    index: number,
): boolean {
    return jointAngleViolation(elements, constraints, index) <= ARTICULATION_EPSILON;
}

/**
 * Shared validity predicate: true iff every enabled bound holds. Validity is a
 * property of the data, never of the strategy.
 */
export function isPoseValid(elements: Vector2[], constraints: ElementConstraints[]): boolean {
    for (let lowerIndex = 0; lowerIndex < elements.length - 1; lowerIndex++) {
        if (!linkDistanceHolds(elements, constraints, lowerIndex)) return false;
    }
    for (let index = 1; index < elements.length - 1; index++) {
        if (!jointAngleHolds(elements, constraints, index)) return false;
    }
    return true;
}

/**
 * Every constraint's violation measured on one pose. Link violations are
 * indexed by the link's lower endpoint; joint violations by element index, and
 * are zero at the chain ends where no angle exists.
 */
interface PoseViolations {
    linkDistances: number[];
    jointAngles: number[];
}

function measurePoseViolations(elements: Vector2[], constraints: ElementConstraints[]): PoseViolations {
    const linkDistances: number[] = [];
    for (let lowerIndex = 0; lowerIndex < elements.length - 1; lowerIndex++) {
        linkDistances.push(linkDistanceViolation(elements, constraints, lowerIndex));
    }
    const jointAngles: number[] = [];
    for (let index = 0; index < elements.length; index++) {
        jointAngles.push(jointAngleViolation(elements, constraints, index));
    }
    return { linkDistances, jointAngles };
}

function poseIsNoWorseThanViolations(
    baseViolations: PoseViolations,
    candidatePose: Vector2[],
    constraints: ElementConstraints[],
): boolean {
    for (let lowerIndex = 0; lowerIndex < candidatePose.length - 1; lowerIndex++) {
        const violation = linkDistanceViolation(candidatePose, constraints, lowerIndex);
        if (violation > baseViolations.linkDistances[lowerIndex] + ARTICULATION_EPSILON) return false;
    }
    for (let index = 0; index < candidatePose.length; index++) {
        const violation = jointAngleViolation(candidatePose, constraints, index);
        if (violation > baseViolations.jointAngles[index] + ARTICULATION_EPSILON) return false;
    }
    return true;
}

/**
 * Predicate closing over the base pose's violations, so a clamp search that
 * tests dozens of candidates measures the base exactly once.
 *
 * This is the acceptance test every strategy clamps on, and it coincides with
 * `isPoseValid` whenever the base pose satisfies its constraints exactly: all
 * base violations are then zero, so "no worse than the base, within epsilon"
 * reduces to "within epsilon of every bound", which is what `isPoseValid`
 * already tested. Only a base that is genuinely violated widens the admissible
 * set, and only by the amount it is already violated by -- which is exactly the
 * room a recovery drag needs.
 */
export function makePoseNoWorsePredicate(
    basePose: Vector2[],
    constraints: ElementConstraints[],
): (candidatePose: Vector2[]) => boolean {
    const baseViolations = measurePoseViolations(basePose, constraints);
    return (candidatePose) => poseIsNoWorseThanViolations(baseViolations, candidatePose, constraints);
}

/** True iff no constraint is violated more by the candidate than by the base. */
export function isPoseNoWorse(
    basePose: Vector2[],
    candidatePose: Vector2[],
    constraints: ElementConstraints[],
): boolean {
    return makePoseNoWorsePredicate(basePose, constraints)(candidatePose);
}
