# Event Priority Rules For The Straight Skeleton Algorithm

There are two distinct prioritizations need to properly order events:

1. Per-edge priority.
2. Across all events priority.

These need to be separately tracked for different purposes. The per-edge priority is our guarantee that two edge's don't
cross without the correct opportunity to generate a valid event. The across-events priority allows us to correctly order
all the events as the polygon transforms. Since not every edge is available at the outset, we must not resolve any
edge's top event before all other preceding events have been resolved, and the time-dependent state known.

## Per Edge

1. If an event is the shortest ray length for both participants, that is the highest priority event for each
   participant.
2. Failing rule 1, the event with the shortest matched-offset (i.e. valid for both participants) is the highest priority event.

##  Across Edges

1. Event offset is the only priority. Only other events with epsilon-equal priority are also processed in this step.  