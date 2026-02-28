# Collision Scenarios For Straight Skeleton Algorithm

## Function Needed

```ts
import {StraightSkeletonSolverContext} from "./types";

function edgeProjectionFromOffset(edgeId: number, offset: number, context: StraightSkeletonSolverContext) {
    // using the source position and basis vector,
    // convert an inwards offset from the exterior polygon, 
    // to a length along the given interior edge
}
```

## Collision Types

1. Interior-interior:
   1. Share 1 parent at time of event -> implies fully collapsed exterior edge
   2. Share no parents at time of event  -> implies split event
2. Interior-Exterior -> implies split event

### Interior-Interior, Adjacent

1. Mark shared parent edge as collapsed (accepted)
2. Add a new interior edge bisecting the now-adjacent exterior edges
3. The new edge has the collision event's position as source node.

### Interior-Interior, Non-adjacent

1. Original polygon is now sliced into two regions
2. Create two child polygons
3. Collision position used to create node in each polygon
4. Neither source node of collided edges is added to child polygons: they represent slice start/end locations.

### Interior-Exterior

1. Creates node position at the offset value found via triangle incenter.
2. Partitions the parent polygon into two children
2. Adds interior edges bisecting the two new interior regions