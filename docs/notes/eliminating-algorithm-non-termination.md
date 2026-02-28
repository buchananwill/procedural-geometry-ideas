# Straight Skeleton - Eliminating Non-termination of algorithm

1. The current design re-pushes superseded intersection events for each edge in the new winning event. This is
   unnecessary.
    1. Once a winning event has been evaluated for an edge being pushed, that event only needs pushing a single time for
       all the involved edges.
    2. The event should use as its owner the edge which will be shortest at this event, since that will carry the event
       to its correct place in the heap.
2. Some edges may begin the algorithm without any valid intersection: this is a valid state, since an intersection will
   eventually arise from one of the secondary interior edges. The algorithm can gracefully handle this by simply not
   pushing edges that do not yet have an intersection.
3. There needs to be a silent discard whenever an event is popped from the heap that contains *any* edges that have now
   been accepted, as this event must by definition be stale.