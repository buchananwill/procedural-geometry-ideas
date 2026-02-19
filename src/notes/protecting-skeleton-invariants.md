# Straight Skeleton Algorithm - Protecting The Invariants

The current implementation of the straight skeleton algorithm makes the following assumptions:

1. The nodes passed as the parameters to build the skeleton are in clockwise rotational order.
2. The polygon does not self-intersect at any point: it forms exactly one interior and one exterior space, topologically.
3. The polygon is a closed loop, i.e. the last node of the list is connected to the first.
4. No two nodes are coincident (i.e. they each have a unique position).
5. 