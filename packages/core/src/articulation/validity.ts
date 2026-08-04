import type { Vector2 } from '../shared/types';
import type { ElementClampTolerance, ElementConstraints, MinMax } from './types';
import { crossV, dotV, distV, lenV, subV } from './geometry';

export const ARTICULATION_EPSILON = 1e-6;

/**
 * How close a constraint value counts as at its limit by default: generous
 * enough that a clamped solve, which stops up to one clamp resolution short of
 * the true edge, is always recognised as having reached it.
 */
export const DEFAULT_ELEMENT_CLAMP_TOLERANCE: ElementClampTolerance = { distance: 0.5, angle: 0.005 };

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

/** How far the value sits from the nearer of the bound's two limits, on either side of it. */
function distanceFromNearestLimit(value: number, bound: MinMax): number {
    return Math.min(Math.abs(value - bound.min), Math.abs(value - bound.max));
}

/**
 * The bounds governing the length of the link between `lowerLinkIndex` and
 * `lowerLinkIndex + 1`. Either endpoint's constraint entry may declare one and
 * both then apply (intersection semantics), so this is the single place that
 * knows which entries a link's distance answers to.
 */
function enabledLinkDistanceBounds(constraints: ElementConstraints[], lowerLinkIndex: number): MinMax[] {
    const bounds: MinMax[] = [];
    const nextBound = constraints[lowerLinkIndex]?.distanceToNext;
    if (nextBound) bounds.push(nextBound);
    const prevBound = constraints[lowerLinkIndex + 1]?.distanceToPrev;
    if (prevBound) bounds.push(prevBound);
    return bounds;
}

/**
 * How far the length of the link between `lowerLinkIndex` and
 * `lowerLinkIndex + 1` falls outside its bounds -- the worst of the entries
 * governing it. Zero when unconstrained or within bounds.
 */
export function linkDistanceViolation(
    elements: Vector2[],
    constraints: ElementConstraints[],
    lowerLinkIndex: number,
): number {
    const distance = distV(elements[lowerLinkIndex], elements[lowerLinkIndex + 1]);
    const violations = enabledLinkDistanceBounds(constraints, lowerLinkIndex)
        .map((bound) => boundViolation(distance, bound));
    return Math.max(0, ...violations);
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

/**
 * True iff the link between `lowerLinkIndex` and `lowerLinkIndex + 1` sits
 * within `tolerance` of one of its limits, from either side of it.
 */
function linkDistanceIsAtBound(
    elements: Vector2[],
    constraints: ElementConstraints[],
    lowerLinkIndex: number,
    tolerance: number,
): boolean {
    const distance = distV(elements[lowerLinkIndex], elements[lowerLinkIndex + 1]);
    return enabledLinkDistanceBounds(constraints, lowerLinkIndex)
        .some((bound) => distanceFromNearestLimit(distance, bound) <= tolerance);
}

/**
 * True iff the turning angle at `index` sits within `tolerance` of one of its
 * limits. False where no bound exists or the angle cannot be evaluated.
 */
function jointAngleIsAtBound(
    elements: Vector2[],
    constraints: ElementConstraints[],
    index: number,
    tolerance: number,
): boolean {
    const bound = constraints[index]?.jointAngle;
    if (!bound) return false;
    const angle = jointAngleAt(elements, index);
    if (angle === null) return false;
    return distanceFromNearestLimit(angle, bound) <= tolerance;
}

/**
 * Every element participating in a constraint that sits at one of its limits.
 * One uniform rule: an at-bound constraint marks all of its participants -- a
 * link marks both of its endpoints, and a joint angle marks the element it
 * turns at together with the two elements whose positions form it.
 */
function elementsParticipatingInAnAtBoundConstraint(
    elements: Vector2[],
    constraints: ElementConstraints[],
    tolerance: ElementClampTolerance,
): Set<number> {
    const participants = new Set<number>();
    for (let lowerLinkIndex = 0; lowerLinkIndex < elements.length - 1; lowerLinkIndex++) {
        if (!linkDistanceIsAtBound(elements, constraints, lowerLinkIndex, tolerance.distance)) continue;
        participants.add(lowerLinkIndex);
        participants.add(lowerLinkIndex + 1);
    }
    for (let index = 1; index < elements.length - 1; index++) {
        if (!jointAngleIsAtBound(elements, constraints, index, tolerance.angle)) continue;
        participants.add(index - 1);
        participants.add(index);
        participants.add(index + 1);
    }
    return participants;
}

/**
 * The selected elements participating in an at-bound constraint in this pose,
 * in ascending index order. Purely a measurement of the pose handed in: it
 * knows nothing of how the pose was reached, so every strategy reports on the
 * same terms.
 *
 * The default tolerance is repeated in solveArticulation, which always passes
 * one explicitly; it is spelled out here too because the barrel exports this
 * function for callers measuring a pose they built themselves.
 */
export function measureClampedElementIndices(
    elements: Vector2[],
    constraints: ElementConstraints[],
    selection: number[],
    tolerance: ElementClampTolerance = DEFAULT_ELEMENT_CLAMP_TOLERANCE,
): number[] {
    const participants = elementsParticipatingInAnAtBoundConstraint(elements, constraints, tolerance);
    return [...new Set(selection)]
        .sort((first, second) => first - second)
        .filter((index) => participants.has(index));
}
