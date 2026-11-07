// Half-edge arithmetic and union-find, in one leaf module with no app imports (journal decision 107, N9), so the
// cleaning and face assembly share them without an import cycle.

/** Half-edge `h = 3t + j` runs from corner `j` of triangle `t` to corner `j + 1`. The next one round its triangle. */
export const nextHalf = (h: number): number => 3 * Math.floor(h / 3) + (h % 3 + 1) % 3;
/** The previous half-edge round its triangle. */
export const prevHalf = (h: number): number => 3 * Math.floor(h / 3) + (h % 3 + 2) % 3;
/** The triangle half-edge `h` belongs to. */
export const triOf = (h: number): number => Math.floor(h / 3);

/** Union-find over `n` items: `find` gives a set's lowest member, `join` merges two sets. */
export interface UnionFind { find: (i: number) => number; join: (i: number, j: number) => void }

export function makeUnionFind(n: number): UnionFind {
  const parent = Int32Array.from({length: n}, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  return {find, join: (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }};
}
