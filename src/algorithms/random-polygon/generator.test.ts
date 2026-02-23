import {
  initGeneratorState,
  step,
  generate,
  ensureClockwise,
  randomInRange,
  basisFromAngle,
  DEFAULT_PARAMS,
} from "./generator";
import { isClockwise, segmentSegmentIntersection } from "./geometry-helpers";
import type { RandomPolygonParams } from "./types";
import type { Vector2 } from "@/algorithms/straight-skeleton/types";

describe("initGeneratorState", () => {
  it("creates state with one vertex and status running", () => {
    const state = initGeneratorState({ x: 100, y: 200 });
    expect(state.vertices).toEqual([{ x: 100, y: 200 }]);
    expect(state.stepCount).toBe(0);
    expect(state.status).toBe("running");
  });

  it("uses default position when none provided", () => {
    const state = initGeneratorState();
    expect(state.vertices.length).toBe(1);
    expect(state.vertices[0]).toEqual({ x: 400, y: 300 });
  });
});

describe("basisFromAngle", () => {
  it("0 radians gives {x:1, y:0}", () => {
    const v = basisFromAngle(0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it("PI/2 radians gives {x:0, y:1}", () => {
    const v = basisFromAngle(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it("PI radians gives {x:-1, y:0}", () => {
    const v = basisFromAngle(Math.PI);
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
  });
});

describe("randomInRange", () => {
  it("always returns values within [min, max]", () => {
    for (let i = 0; i < 200; i++) {
      const val = randomInRange(10, 50, Math.random());
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThanOrEqual(50);
    }
  });
});

describe("step", () => {
  it("adds one vertex when no intersection occurs", () => {
    // Use params that produce short edges and small angle deltas
    const params: RandomPolygonParams = {
      edgeLength: { min: 5, max: 10, variance: 0 },
      angleDelta: { min: 0.1, max: 0.3, variance: 0 },
      maxEdges: 100,
    };
    const state = initGeneratorState({ x: 0, y: 0 });
    const verticesBefore = state.vertices.length;
    step(state, params);
    // Should have added exactly one vertex (or changed status)
    if (state.status === "running") {
      expect(state.vertices.length).toBe(verticesBefore + 1);
    }
    expect(state.stepCount).toBe(1);
  });

  it("terminates at maxEdges with closed-at-limit status", () => {
    const params: RandomPolygonParams = {
      edgeLength: { min: 5, max: 10, variance: 0 },
      angleDelta: { min: 0.3, max: 0.5, variance: 0 },
      maxEdges: 3,
    };
    const state = initGeneratorState({ x: 0, y: 0 });
    while (state.status === "running") {
      step(state, params);
    }
    expect(state.status).toMatch(/self-intersected|closed-at-limit/);
  });
});

describe("generate", () => {
  it("returns at least 3 vertices", () => {
    const result = generate(DEFAULT_PARAMS);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("returns a clockwise polygon", () => {
    const result = generate(DEFAULT_PARAMS);
    expect(isClockwise(result)).toBe(true);
  });

  it("produces a simple polygon (no self-intersections)", () => {
    // Run several times to catch intermittent issues
    for (let trial = 0; trial < 5; trial++) {
      const verts = generate(DEFAULT_PARAMS);
      const n = verts.length;

      // Test every non-adjacent edge pair
      let foundIntersection = false;
      for (let i = 0; i < n && !foundIntersection; i++) {
        const i2 = (i + 1) % n;
        for (let j = i + 2; j < n; j++) {
          const j2 = (j + 1) % n;
          // Skip adjacent edges
          if (j2 === i) continue;
          const result = segmentSegmentIntersection(
            verts[i], verts[i2], verts[j], verts[j2],
          );
          if (result && result.tA > 0.001 && result.tA < 0.999
            && result.tB > 0.001 && result.tB < 0.999) {
            foundIntersection = true;
          }
        }
      }
      expect(foundIntersection).toBe(false);
    }
  });
});

describe("ensureClockwise", () => {
  it("leaves a CW polygon unchanged", () => {
    // CW in y-down: (0,0)→(0,10)→(10,10)→(10,0)
    const cw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    const result = ensureClockwise(cw);
    expect(result).toEqual(cw);
  });

  it("reverses a CCW polygon to CW", () => {
    // CCW in y-down: (0,0)→(10,0)→(10,10)→(0,10)
    const ccw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = ensureClockwise(ccw);
    expect(isClockwise(result)).toBe(true);
    expect(result).toEqual(ccw.slice().reverse());
  });

  it("handles arrays with fewer than 3 vertices", () => {
    const two: Vector2[] = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(ensureClockwise(two)).toEqual(two);
  });
});
