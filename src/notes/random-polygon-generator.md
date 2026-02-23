# Random Polygon Generator

Purposes:

1. Fuzzing the straight skeleton algorithm
2. Human visual exploration of the algorithm
3. Procedural geometry outputs

## Basic Rules:

1. Generate a random basis vector and length.
2. Attach to head of vertex list.
3. Perform self-intersection test.
4. If self-intersecting, slice intersected edge where the head collides, and close loop.
5. Check winding order, and reverse nodes if not clockwise.
6. Optionally, stop generating at a given limit, and try to close the loop. Slice tail at first self-intersection if
   closing the loop causes any.

## Tunable Parameters:

- Variance, max, min values for:
    - Edge length
    - delta basis vector from last
- Max generated edges