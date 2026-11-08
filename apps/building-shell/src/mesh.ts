// The union's output mesh as every stage after it reads it: a leaf module, so the cleaning, the imprint and step 4
// can name it without importing the union (the type review of WP3.6, N6).

/** The union's output mesh: float32 positions, vertex indices, one input faceID per triangle. */
export interface ShellMesh { positions: Float32Array; tris: Uint32Array; faceIDs: Uint32Array }
