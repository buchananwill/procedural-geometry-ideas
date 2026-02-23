import {Vector2} from "@/algorithms/straight-skeleton/types";
import {FLOATING_POINT_EPSILON} from "@/algorithms/straight-skeleton/constants";

export function areEqual(a: number, b: number, epsilon = FLOATING_POINT_EPSILON): boolean {
    return Math.abs(a - b) < epsilon;
}

export function vectorsAreEqual(a: Vector2, b: Vector2, epsilon?: number): boolean {
    return areEqual(a.x, b.x, epsilon) && areEqual(a.y, b.y, epsilon);
}

export function assertIsNumber(x: unknown): asserts x is number {
    if (typeof x !== "number") {
        throw new Error("Expected a number");
    }
}

export function fp_compare(a: number, b: number, epsilon = FLOATING_POINT_EPSILON): number {
    const diff = a - b;
    if (Math.abs(diff) < epsilon) {
        return 0;
    }
    return diff < 0 ? - 1 : 1;
}

export function addVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x + b.x), y: (a.y + b.y)};
}

/**
 * Subtract b from a
 * */
export function subtractVectors(a: Vector2, b: Vector2): Vector2 {
    return {x: (a.x - b.x), y: (a.y - b.y)};
}

export function scaleVector(v: Vector2, scalar: number): Vector2 {
    return {x: v.x * scalar, y: v.y * scalar};
}

export function sizeOfVector(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * If argument v has size 0, returns [1,0]
 * */
export function normalize(v: Vector2): [Vector2, number] {
    const size = sizeOfVector(v)
    if (size === 0) {
        return [{x: 0, y: 0}, size];
    }
    return [{x: v.x / size, y: v.y / size}, size];
}

export function makeBasis(from: Vector2, to: Vector2): Vector2 {
    const relativeVector = subtractVectors(to, from);
    return normalize(relativeVector)[0];
}

/**
 * Assumes vectors are ordered so that iBasis is the clockwise-most exterior edge, in the case of a polygon perimeter
 * */
export function makeBisectedBasis(iBasis: Vector2, jBasis: Vector2): Vector2 {
    const added = addVectors(iBasis, jBasis);
    const [bisection, size] = normalize(added);
    if (areEqual(size, 0)) {
        // noinspection JSSuspiciousNameCombination Matrix rotation
        return {x: iBasis.y, y: iBasis.x * -1}
    }
    return bisection;
}

export function crossProduct(a: Vector2, b: Vector2): number {
    return a.x * b.y - b.x * a.y
}

export function dotProduct(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y
}

