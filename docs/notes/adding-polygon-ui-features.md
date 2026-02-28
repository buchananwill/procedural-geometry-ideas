# Additional Features For The Polygon Editing UI

The purpose of the polygon editing UI is to allow a user to understand how the straight skeleton algorithm functions. To
this end, it would be beneficial for the UI to allow the user to perform targeted "experiments", manipulating a specific
attribute of the polygon. The proposed levers are drawn from the representation used by the straight skeleton algorithm
implemented in this project. Edges comprise a source and a target, with the basis vector explicitly stored as a field of
the edge. This maps well to operations like fixing the basis vector, while changing the length.

## Proposed Core Skeleton Features

- [x]  Button to toggle straight skeleton on/off
    - [x]  While on, skeleton updates immediately after UI edits to the polygon
- [ ]  Lock or edit directly any of:
    - [ ]  vertex position
    - [ ]  edge length
    - [ ]  Edge basis vector
- [x] copy button to serialize exterior polygon nodes
- [ ] copy button to serialize polygon and skeleton
- [ ] paste button to deserialize exterior polygon nodes from clipboard
- [ ] dropdown selection of interesting/classic polygon shapes
- [ ] animate creation of straight skeleton
    - [ ] draw-on interior edges, extending from source to target
    - [ ] step through each heap.pop() that results in accepting edges, capturing a snapshot of the delta to update the rendered drawing
    - [ ] keep the entire timeline once completed, so the user can scrub to a particular wavefront frame

## Related Features
- [ ] page for each of the geometry ops used to build the straight skeleton, showing visually what the purpose/derivation is, and the maths code
    - [ ] making a basis vector
    - [ ] bisecting two basis vectors using addition
    - [ ] cross-product to check for reflex angles
    - [ ] finding the intersection of two rays