# Straight Skeleton Algorithm

## Protecting The Invariants

The current implementation of the straight skeleton algorithm makes the following assumptions:

1. The nodes passed as the parameters to build the skeleton are in clockwise rotational order.
2. The polygon does not self-intersect at any point: it forms exactly one interior and one exterior space,
   topologically.
3. The polygon is a closed loop, i.e. the last node of the list is connected to the first.
4. No two nodes are coincident (i.e. they each have a unique position).

The function for forming a straight skeleton should return two things:

1. The original nodes of the polygon plus the interior nodes and edges of the skeleton
2. A success code and message warning if the original set of nodes violated any of the invariants required. In this case
   the straight skeleton will not be computed, and the nodes returned will contain only the original polygon

## Constraining the UI

While editing the UI, if the current polygon violates any of the invariants above, a warning appears and the straight
skeleton function will not be called.

