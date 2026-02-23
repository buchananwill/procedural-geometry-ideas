import type { Vector2 } from "@/algorithms/straight-skeleton/types";

/** Range with variance control for random generation */
export interface RangeParams {
  min: number;
  max: number;
  /** 0 = uniform distribution, 1 = strongly peaked at center */
  variance: number;
}

/** Tunable parameters for the random polygon generator */
export interface RandomPolygonParams {
  edgeLength: RangeParams;
  /** Angular delta from previous heading, in radians */
  angleDelta: RangeParams;
  maxEdges: number;
}

/** Result of a finite segment-segment intersection test */
export interface SegmentIntersection {
  /** Parameter along segment A (0..1) */
  tA: number;
  /** Parameter along segment B (0..1) */
  tB: number;
  /** The intersection point */
  point: Vector2;
}

/** Status of the generator state machine */
export type GeneratorStatus =
  | "running"
  | "self-intersected"
  | "closed-at-limit";

/** Mutable state of the generator between steps */
export interface GeneratorState {
  vertices: Vector2[];
  /** Current heading angle in radians */
  currentAngle: number;
  stepCount: number;
  status: GeneratorStatus;
}
