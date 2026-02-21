import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface Vertex {
  x: number;
  y: number;
}

interface PolygonState {
  vertices: Vertex[];
  selectedVertex: number | null;
  moveVertex: (index: number, x: number, y: number) => void;
  addVertex: (index: number, vertex: Vertex) => void;
  removeVertex: (index: number) => void;
  setSelectedVertex: (index: number | null) => void;
  resetPolygon: () => void;
}

const DEFAULT_VERTICES: Vertex[] = [
  { x: 250, y: 250 },
  { x: 300, y: 450 },
  { x: 500, y: 450 },
  { x: 550, y: 250 },
  { x: 400, y: 100 },
];

export const usePolygonStore = create<PolygonState>()(
  immer((set) => ({
    vertices: DEFAULT_VERTICES.map((v) => ({ ...v })),
    selectedVertex: null,

    moveVertex: (index, x, y) =>
      set((state) => {
        state.vertices[index].x = x;
        state.vertices[index].y = y;
      }),

    addVertex: (index, vertex) =>
      set((state) => {
        state.vertices.splice(index, 0, vertex);
      }),

    removeVertex: (index) =>
      set((state) => {
        if (state.vertices.length > 3) {
          state.vertices.splice(index, 1);
        }
      }),

    setSelectedVertex: (index) =>
      set((state) => {
        state.selectedVertex = index;
      }),

    resetPolygon: () =>
      set((state) => {
        state.vertices = DEFAULT_VERTICES.map((v) => ({ ...v }));
        state.selectedVertex = null;
      }),
  }))
);
