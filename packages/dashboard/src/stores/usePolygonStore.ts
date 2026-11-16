import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { HoledTestPolygon } from "@proc-geo/test-fixtures";

export interface Vertex {
  x: number;
  y: number;
}

/**
 * One hole of a loaded holed fixture, drawn read-only (dashboard holed-fixtures spec, decisions 1 and 5; BSA.D284).
 * `weights` is parallel to `vertices`, all ones where the fixture gives none.
 */
export interface StoredHole {
  vertices: Vertex[];
  weights: number[];
}

interface PolygonState {
  vertices: Vertex[];
  /**
   * Per-edge wavefront SPEED, parallel to {@link PolygonState.vertices}: `weights[i]` is the speed
   * of the edge running from vertex `i` to vertex `i + 1` (W-spec W1, arc decision 112(a)).
   *
   * ALL ONES IS THE UNWEIGHTED SKELETON, bit for bit — the solver divides by exactly `1.0`. Every
   * mutator below keeps this array the same length as `vertices`; nothing else in the store may
   * change one without the other.
   */
  weights: number[];
  /**
   * The holes of the loaded holed fixture, `[]` for a single-loop polygon (decision 1). Beside the outline because
   * both canvases, the solve and the outline editor read this store, and a second store could hold one fixture's
   * outline and another's holes. WRITTEN ONLY BY {@link PolygonState.loadHoledFixture} (decision 2); `setVertices`
   * and `resetPolygon` clear it, and the outline mutators leave it untouched (decisions 3 and 4).
   */
  holes: StoredHole[];
  /** The loaded holed fixture's name; `null` exactly when `holes` is `[]`. */
  holedFixtureName: string | null;
  selectedVertex: number | null;
  moveVertex: (index: number, x: number, y: number) => void;
  addVertex: (index: number, vertex: Vertex) => void;
  removeVertex: (index: number) => void;
  setEdgeWeight: (index: number, weight: number) => void;
  resetWeights: () => void;
  setSelectedVertex: (index: number | null) => void;
  setVertices: (vertices: Vertex[]) => void;
  /** Load a holed fixture: its outline, its weights and every hole, copied; the selection cleared (decision 2). */
  loadHoledFixture: (fixture: HoledTestPolygon) => void;
  resetPolygon: () => void;
}

const DEFAULT_VERTICES: Vertex[] = [
  { x: 250, y: 250 },
  { x: 300, y: 450 },
  { x: 500, y: 450 },
  { x: 550, y: 250 },
  { x: 400, y: 100 },
];

/** The unweighted skeleton's weights: one per edge, every one of them exactly `1`. */
function onesFor(count: number): number[] {
  return Array.from({ length: count }, () => 1);
}

/** A fixture's weights copied, or all ones where it gives none (decision 1). */
function weightsOrOnes(weights: readonly number[] | undefined, count: number): number[] {
  return weights !== undefined && weights.length > 0 ? [...weights] : onesFor(count);
}

export const usePolygonStore = create<PolygonState>()(
  immer((set) => ({
    vertices: DEFAULT_VERTICES.map((v) => ({ ...v })),
    weights: onesFor(DEFAULT_VERTICES.length),
    holes: [],
    holedFixtureName: null,
    selectedVertex: null,

    moveVertex: (index, x, y) =>
      set((state) => {
        state.vertices[index].x = x;
        state.vertices[index].y = y;
      }),

    addVertex: (index, vertex) =>
      set((state) => {
        // INSERTING SPLITS AN EDGE AND BOTH HALVES INHERIT ITS WEIGHT (arc decision 130). A vertex
        // arriving at `index` splits the edge that ran into that position — edge `index - 1` around
        // the ring — so duplicating that edge's weight at `index` leaves the two halves carrying the
        // speed the whole edge carried. The user asked for one edge to be drawn as two, not for a
        // speed change to appear where they did not put one.
        const edgeCount = state.vertices.length;
        const splitEdge = (index - 1 + edgeCount) % edgeCount;
        const inheritedWeight = state.weights[splitEdge];
        state.vertices.splice(index, 0, vertex);
        state.weights.splice(index, 0, inheritedWeight);
      }),

    removeVertex: (index) =>
      set((state) => {
        if (state.vertices.length > 3) {
          // DELETING MERGES TWO EDGES AND THE SURVIVOR KEEPS THE WEIGHT OF THE EDGE THAT RAN INTO
          // THE DELETED VERTEX (arc decision 130) — `weights[index - 1]` around the ring, which is
          // exactly what dropping `weights[index]` leaves in place.
          //
          // THIS IS A USER EDIT, NOT CANONICALISATION, so arc decision 120 does not apply here: that
          // decision forbids the SOLVER from removing a vertex whose two incident edges differ in
          // weight, because such a vertex is structural to the shape being solved. A user who
          // selects a vertex and presses delete is redrawing the polygon, and the merged edge has to
          // carry one of the two speeds; it carries the incoming one so that deleting a vertex never
          // changes the speed of the wall the user was standing on when they walked into it.
          state.vertices.splice(index, 1);
          state.weights.splice(index, 1);
        }
      }),

    setEdgeWeight: (index, weight) =>
      set((state) => {
        // W-spec W2: a weight is a finite, strictly positive speed. A half-typed or cleared field
        // leaves the previous weight standing rather than putting a zero into the solver's door.
        if (!Number.isFinite(weight) || weight <= 0) return;
        if (index < 0 || index >= state.weights.length) return;
        state.weights[index] = weight;
      }),

    resetWeights: () =>
      set((state) => {
        state.weights = onesFor(state.vertices.length);
      }),

    setSelectedVertex: (index) =>
      set((state) => {
        state.selectedVertex = index;
      }),

    setVertices: (vertices) =>
      set((state) => {
        // A NEW POLYGON GETS NEW WEIGHTS, ALL ONES (arc decision 130). Every fixture load and every
        // random-polygon generation lands here, and carrying the old weights onto a different ring
        // would put a speed change at whatever vertex happened to inherit the index.
        state.vertices = vertices.map((v) => ({ x: v.x, y: v.y }));
        state.weights = onesFor(vertices.length);
        state.selectedVertex = null;
        // A NEW POLYGON IS A SINGLE LOOP (decision 3): a single-loop fixture, a paste and a random generation all
        // land here, and none of them carries holes.
        state.holes = [];
        state.holedFixtureName = null;
      }),

    loadHoledFixture: (fixture) =>
      set((state) => {
        // COPIED, so no array is shared with the roster (decision 2).
        state.vertices = fixture.outline.map((v) => ({ x: v.x, y: v.y }));
        state.weights = weightsOrOnes(fixture.weights, fixture.outline.length);
        state.holes = fixture.holes.map((hole) => ({
          vertices: hole.vertices.map((v) => ({ x: v.x, y: v.y })),
          weights: weightsOrOnes(hole.weights, hole.vertices.length),
        }));
        state.holedFixtureName = fixture.name;
        state.selectedVertex = null;
      }),

    resetPolygon: () =>
      set((state) => {
        state.vertices = DEFAULT_VERTICES.map((v) => ({ ...v }));
        state.weights = onesFor(DEFAULT_VERTICES.length);
        state.selectedVertex = null;
        state.holes = [];
        state.holedFixtureName = null;
      }),
  }))
);
