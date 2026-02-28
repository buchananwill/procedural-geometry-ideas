# Algorithm V4

The V4 version of this algorithm aims to achieve robustness, with disregard for computational efficiency. To this end, the proposed overview is as follows:

1. Init the exterior edges, and primary interior edges.
2. Generate all feasible collision events with interior edges as the instigators
3. Resolve the winning events, for all events that have equal offset distance within epsilon threshold.
   1. Resolve edge-collapse (acceptance) events first
      - Collapsing is the base case, that tends towards termination
   2. Resolve edge-splitting events after 
      - Splitting is a generative event that should only occur if not intervened by collapsing 
   3. Determine event position and create a new node
   4. Attach collided edges to node
   5. Slice/collapse into child polygons as required by split events
      - Form new vertex lists for determining adjacency

