# Review Of Algorithm - Pseudo code

1. Create polygon from clockwise-winding node positions.
2. A heap is kept of collision events.
3. When an interior edge is created, add to the heap **all** intersection events between the edge's source, and
   collision with an exterior edge.
    1. Heap collision events are keyed for priority-min, using the largest length on any edge involved in that
       collision.
    2. For the edge case of *exactly* parallel interior edges, use the full length of the distance between the two nodes
       when keying in the heap, **BUT** if no other edges intervene, then the outcome should be a collision halfway
       between the two parallel ray producers. This edge-case handling prevents head-on collisions for "occurring
       prematurely", while falling back to a 50/50 split if they are genuinely the top of the heap with nothing
       intervening.
    3. Negative lengths for collisions are handled as follows:
        1. If the collision occurs in "open space", where one length is backwards from the ray's source, while the other
           is forwards, they are discarded.
        2. If the collision occurs *exactly* at the source of one of the rays, because the two sources are co-linear,
           the length used is the distance between the two nodes, since one of the rays is pointed directly from that
           source to the other node.
4. Create interior edges from every adjacent pair of exterior edges
    1. Detect reflex exterior vertices using the cross-product and flip their basis vectors
5. Begin popping heap collisions.
    1. A collision is valid providing that at least two of the interior edges involved have not already been accepted.
    2. Discard invalid collisions and pop the next
    3. Each time a valid collision occurs:
        1. Accept all the interior edges involved
        2. Create a new node at the collision location.
        3. Sort the colliding interior edges by ascending clockwise parent index
        4. For each colliding interior edge:
            1. Try to accept the widdershins exterior parent.
                1. If not accepted, and there is a parent waiting to be widdershins, produce a new interior edge
            2. Try to accept the clockwise exterior parent
                1. If not accepted, store as widdershins parent waiting to produce a new interior edge
            3. If producing a new edge:
                1. First produce a normal interior basis vector (A) using the implicit intersection of the two given
                   parents, checking for reflex
                2. Produce another bisected basis vector (B) with the child of the widdershins parent as clockwise
                   parent, and child of the clockwise parent as widdershins parent, checking for reflex
                3. The dot product of these two bases vectors must be positive. If it is not, scale (A) by (-1) so it is
                   pointing in the right direction
                4. Add this edge using the current collision node as the source, and (A) as the basis

This polygon produces an incorrect outcome. `e10` and `e12` should produce the first collision. Instead, `e12` and `e9`
are producing the first collision, and `e12` appears to be passing through `e10` to do this on the rendered view.

```json
[
  {
    "x": 250,
    "y": 250
  },
  {
    "x": 300,
    "y": 450
  },
  {
    "x": 500,
    "y": 450
  },
  {
    "x": 552.2539444027047,
    "y": 313.8617580766341
  },
  {
    "x": 516.5753390285684,
    "y": 153.46489575283587
  },
  {
    "x": 445.3327893511655,
    "y": 190.29558802826025
  },
  {
    "x": 400,
    "y": 100
  }
]
```