import {
  segmentSegmentIntersection,
  signedArea,
  isClockwise,
  findSelfIntersection,
  findClosingIntersection,
} from "@proc-geo/core";
import type { Vector2 } from "@proc-geo/core";

describe("segmentSegmentIntersection", () => {
  it("finds intersection of crossing segments (X shape)", () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 10, y: 0 }, { x: 0, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(5);
    expect(result!.tA).toBeCloseTo(0.5);
    expect(result!.tB).toBeCloseTo(0.5);
  });

  it("returns null for parallel segments", () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 },
    );
    expect(result).toBeNull();
  });

  it("returns null for collinear overlapping segments", () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 5, y: 0 }, { x: 15, y: 0 },
    );
    expect(result).toBeNull();
  });

  it("returns null for completely disjoint segments", () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 5, y: 5 }, { x: 6, y: 5 },
    );
    expect(result).toBeNull();
  });

  it("detects intersection near segment endpoints", () => {
    // T-junction: horizontal segment and vertical segment meeting at (5,0)
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 5, y: -5 }, { x: 5, y: 5 },
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(0);
  });

  it("returns null when segments would intersect if extended but don't overlap", () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 1, y: 1 },
      { x: 5, y: 0 }, { x: 5, y: 1 },
    );
    expect(result).toBeNull();
  });
});

describe("signedArea", () => {
  it("returns negative for clockwise triangle (y-down)", () => {
    // CW in y-down: (0,0)→(0,10) goes down, (0,10)→(10,0) goes right+up, (10,0)→(0,0) goes left
    const cw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(signedArea(cw)).toBeLessThan(0);
  });

  it("returns positive for counter-clockwise triangle (y-down)", () => {
    const ccw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(signedArea(ccw)).toBeGreaterThan(0);
  });

  it("returns 0 for degenerate (collinear) points", () => {
    const line: Vector2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(signedArea(line)).toBeCloseTo(0);
  });

  describe("is translation-invariant", () => {
    // The shoelace sum is invariant under translation. Summed over ABSOLUTE coordinates it is
    // not NUMERICALLY invariant: every term is then of order D^2 for a polygon at distance D,
    // so the sum carries an absolute error of about D^2 * 2^-52 against a true area of only A,
    // and the sign is lost once D > sqrt(A) * 6.7e7. A 2-unit square at 1e9 used to come back
    // as exactly 0. The implementation subtracts the polygon's own first vertex first.
    const shapes: [string, Vector2[], number][] = [
      [
        "unit-ish square (A = 4)",
        [
          { x: 0, y: 0 },
          { x: 0, y: 2 },
          { x: 2, y: 2 },
          { x: 2, y: 0 },
        ],
        -4,
      ],
      [
        "strip trapezoid (A = 0.75)",
        [
          { x: 0, y: 0 },
          { x: 0, y: 2 },
          { x: 0.5, y: 1.5 },
          { x: 0.5, y: 0.5 },
        ],
        -0.75,
      ],
      [
        "counter-clockwise triangle (A = 50)",
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
        50,
      ],
    ];

    const translations = [0, 1e3, 1e6, 1e8, 1e9, 1e10, 1e11];

    describe.each(shapes)("%s", (_name, vertices, expected) => {
      it.each(translations)(
        "gives the same area translated by %p on both axes",
        (translate) => {
          const moved = vertices.map((vertex) => ({
            x: vertex.x + translate,
            y: vertex.y + translate,
          }));
          // Relative error against the untranslated value, not an absolute epsilon.
          expect(signedArea(moved) / expected).toBeCloseTo(1, 9);
          expect(Math.sign(signedArea(moved))).toBe(Math.sign(expected));
        },
      );

      it("is unchanged by an asymmetric translation of 1e9", () => {
        const moved = vertices.map((vertex) => ({
          x: vertex.x + 1e9,
          y: vertex.y - 7e8,
        }));
        expect(signedArea(moved) / expected).toBeCloseTo(1, 9);
      });
    });

    it("does not depend on which vertex the ring starts at", () => {
      const square: Vector2[] = [
        { x: 1e9, y: 1e9 },
        { x: 1e9, y: 1e9 + 2 },
        { x: 1e9 + 2, y: 1e9 + 2 },
        { x: 1e9 + 2, y: 1e9 },
      ];
      for (let start = 0; start < square.length; start++) {
        const rotated = [...square.slice(start), ...square.slice(0, start)];
        expect(signedArea(rotated)).toBeCloseTo(-4, 9);
      }
    });

    it("returns 0 for an empty vertex list rather than throwing", () => {
      expect(signedArea([])).toBe(0);
    });
  });
});

describe("isClockwise", () => {
  it("returns true for clockwise polygon (y-down)", () => {
    // Same as SQUARE from test-constants: (0,0)→(0,2)→(2,2)→(2,0) is CW
    const cw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(isClockwise(cw)).toBe(true);
  });

  it("returns false for counter-clockwise polygon (y-down)", () => {
    const ccw: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isClockwise(ccw)).toBe(false);
  });
});

describe("findSelfIntersection", () => {
  it("returns null for a simple chain with no intersection", () => {
    const vertices: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const newPoint = { x: 0, y: 10 };
    expect(findSelfIntersection(vertices, newPoint)).toBeNull();
  });

  it("detects self-intersection in a figure-8 chain", () => {
    // Chain: (0,0) → (10,0) → (10,10) → (0,10)
    // New edge: (0,10) → (5,-5) crosses edge (0,0)→(10,0)
    const vertices: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const newPoint = { x: 5, y: -5 };
    const result = findSelfIntersection(vertices, newPoint);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(0); // crosses edge 0→1
    expect(result!.intersection.point.y).toBeCloseTo(0);
  });

  it("returns null when chain has fewer than 2 vertices", () => {
    expect(findSelfIntersection([{ x: 0, y: 0 }], { x: 5, y: 5 })).toBeNull();
  });

  it("returns the earliest intersection when multiple edges are crossed", () => {
    // Z-shaped chain that crosses two edges when going back
    const vertices: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 0, y: 10 },
    ];
    // New edge from (0,10) → (10,-5) would cross both horizontal segments
    const newPoint = { x: 10, y: -5 };
    const result = findSelfIntersection(vertices, newPoint);
    expect(result).not.toBeNull();
    // Should return the first crossing along the new edge (smallest tA)
    expect(result!.intersection.tA).toBeLessThan(1);
  });
});

describe("findClosingIntersection", () => {
  it("returns null for a simple convex polygon", () => {
    const square: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(findClosingIntersection(square)).toBeNull();
  });

  it("returns null for a triangle (always closes cleanly)", () => {
    const tri: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(findClosingIntersection(tri)).toBeNull();
  });

  it("detects intersection when closing edge crosses an interior edge", () => {
    // Shape where closing edge must cross an existing edge
    // Like an hourglass: last→first crosses through the middle
    const vertices: Vector2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];
    // Closing edge: (10,10) → (0,0) crosses edge (10,0)→(0,10)
    const result = findClosingIntersection(vertices);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.intersection.point.x).toBeCloseTo(5);
    expect(result!.intersection.point.y).toBeCloseTo(5);
  });
});
