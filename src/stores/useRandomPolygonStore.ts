import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { RandomPolygonParams, GeneratorState } from "@/algorithms/random-polygon/types";
import { DEFAULT_PARAMS, initGeneratorState, step, generate, ensureClockwise } from "@/algorithms/random-polygon/generator";
import { usePolygonStore } from "./usePolygonStore";

interface RandomPolygonStoreState {
  params: RandomPolygonParams;
  generatorState: GeneratorState | null;
  isStepMode: boolean;

  setEdgeLengthParam: (field: "min" | "max" | "variance", value: number) => void;
  setAngleDeltaParam: (field: "min" | "max" | "variance", value: number) => void;
  setMaxEdges: (value: number) => void;

  generateInstant: () => void;
  startStepMode: () => void;
  stepOnce: () => void;
  finishStepMode: () => void;
  resetGenerator: () => void;
}

export const useRandomPolygonStore = create<RandomPolygonStoreState>()(
  immer((set, get) => ({
    params: { ...DEFAULT_PARAMS },
    generatorState: null,
    isStepMode: false,

    setEdgeLengthParam: (field, value) =>
      set((s) => { s.params.edgeLength[field] = value; }),

    setAngleDeltaParam: (field, value) =>
      set((s) => { s.params.angleDelta[field] = value; }),

    setMaxEdges: (value) =>
      set((s) => { s.params.maxEdges = value; }),

    generateInstant: () => {
      const { params } = get();
      const vertices = generate(params);
      usePolygonStore.getState().setVertices(
        vertices.map((v) => ({ x: v.x, y: v.y }))
      );
    },

    startStepMode: () =>
      set((s) => {
        s.generatorState = initGeneratorState();
        s.isStepMode = true;
      }),

    stepOnce: () => {
      const { generatorState, params } = get();
      if (!generatorState || generatorState.status !== "running") return;
      set((s) => {
        step(s.generatorState!, params);
      });
      const updated = get().generatorState!;
      usePolygonStore.getState().setVertices(
        updated.vertices.map((v) => ({ x: v.x, y: v.y }))
      );
    },

    finishStepMode: () => {
      const { generatorState, params } = get();
      if (!generatorState) return;
      set((s) => {
        while (s.generatorState!.status === "running") {
          step(s.generatorState!, params);
        }
        s.isStepMode = false;
      });
      const final = get().generatorState!;
      const verts = ensureClockwise(final.vertices);
      usePolygonStore.getState().setVertices(
        verts.map((v) => ({ x: v.x, y: v.y }))
      );
    },

    resetGenerator: () =>
      set((s) => {
        s.generatorState = null;
        s.isStepMode = false;
      }),
  }))
);
