import type { Vector2 } from "@/algorithms/straight-skeleton/types";
import type { RandomPolygonParams, GeneratorState } from "./types";
import { addVectors, scaleVector } from "@/algorithms/straight-skeleton/core-functions";
import {
  findSelfIntersection,
  findClosingIntersection,
  isClockwise,
} from "./geometry-helpers";

/** Default parameter values producing polygons that fit the 800x600 canvas */
export const DEFAULT_PARAMS: RandomPolygonParams = {
  edgeLength: { min: 30, max: 120, variance: 0.5 },
  angleDelta: { min: -Math.PI * 0.6, max: Math.PI * 0.6, variance: 0.5 },
  maxEdges: 20,
};

/**
 * Random value in [min, max] with variance-weighted blend of
 * uniform and triangular distributions.
 * variance=0 → uniform, variance=1 → peaked at center.
 */
export function randomInRange(min: number, max: number, variance: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const uniform = u1;
  const triangular = (u1 + u2) / 2;
  const t = variance * triangular + (1 - variance) * uniform;
  return min + t * (max - min);
}

export function randomEdgeLength(params: RandomPolygonParams): number {
  const { min, max, variance } = params.edgeLength;
  return randomInRange(min, max, variance);
}

export function randomAngleDelta(params: RandomPolygonParams): number {
  const { min, max, variance } = params.angleDelta;
  return randomInRange(min, max, variance);
}

/** Create a unit direction vector from an angle in radians */
export function basisFromAngle(angle: number): Vector2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Create initial generator state with a single starting vertex */
export function initGeneratorState(startPosition?: Vector2): GeneratorState {
  const start = startPosition ?? { x: 400, y: 300 };
  return {
    vertices: [start],
    currentAngle: Math.random() * Math.PI * 2,
    stepCount: 0,
    status: "running",
  };
}

/**
 * Advance the generator by one step. Mutates `state` in place.
 *
 * 1. Generate random direction + length → new point
 * 2. Self-intersection test:
 *    - If hit: slice at intersection, close the loop, done
 * 3. Max-edges check:
 *    - Append vertex, attempt to close loop, slice if closing causes intersection
 * 4. Otherwise: append vertex, continue
 */
export function step(state: GeneratorState, params: RandomPolygonParams): void {
  if (state.status !== "running") return;

  const angleDelta = randomAngleDelta(params);
  const newAngle = state.currentAngle + angleDelta;
  const length = randomEdgeLength(params);
  const lastVertex = state.vertices[state.vertices.length - 1];
  const newPoint = addVectors(lastVertex, scaleVector(basisFromAngle(newAngle), length));

  state.stepCount++;

  // Need at least 2 vertices (1 edge) before self-intersection is possible
  if (state.vertices.length >= 3) {
    const selfHit = findSelfIntersection(state.vertices, newPoint);
    if (selfHit) {
      // Close the loop at the intersection point.
      // The loop is: intersection point → vertices after the hit edge → last vertex → intersection point
      const loopVertices = [
        selfHit.intersection.point,
        ...state.vertices.slice(selfHit.edgeIndex + 1),
      ];
      state.vertices = ensureClockwise(loopVertices);
      state.status = "self-intersected";
      return;
    }
  }

  // Append the new vertex
  state.vertices.push(newPoint);
  state.currentAngle = newAngle;

  // Check if we've hit the edge limit
  if (state.stepCount >= params.maxEdges) {
    // Attempt to close the loop
    const closeHit = findClosingIntersection(state.vertices);
    if (closeHit) {
      // Slice: keep from intersection point through to last vertex, then close
      const loopVertices = [
        closeHit.intersection.point,
        ...state.vertices.slice(closeHit.edgeIndex + 1),
      ];
      state.vertices = ensureClockwise(loopVertices);
    } else {
      // Closes cleanly — just ensure winding
      state.vertices = ensureClockwise(state.vertices);
    }
    state.status = "closed-at-limit";
  }
}

/**
 * Ensure vertices are in clockwise winding order (y-down screen coords).
 * Returns a new array (reversed if needed).
 */
export function ensureClockwise(vertices: Vector2[]): Vector2[] {
  if (vertices.length < 3) return [...vertices];
  if (isClockwise(vertices)) return vertices;
  return [...vertices].reverse();
}

/**
 * Run the generator to completion. Returns a simple clockwise polygon.
 * Retries up to `maxRetries` times if result has fewer than 3 vertices.
 */
export function generate(
  params: RandomPolygonParams,
  startPosition?: Vector2,
  maxRetries = 10,
): Vector2[] {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const state = initGeneratorState(startPosition);
    while (state.status === "running") {
      step(state, params);
    }
    if (state.vertices.length >= 3) {
      return state.vertices;
    }
  }
  // Fallback: return a small triangle at the start position
  const c = startPosition ?? { x: 400, y: 300 };
  return ensureClockwise([
    { x: c.x, y: c.y - 50 },
    { x: c.x + 50, y: c.y + 30 },
    { x: c.x - 50, y: c.y + 30 },
  ]);
}
