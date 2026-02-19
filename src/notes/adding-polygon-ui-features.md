# Additional Features For The Polygon Editing UI

The purpose of the polygon editing UI is to allow a user to understand how the straight skeleton algorithm functions. To
this end, it would be beneficial for the UI to allow the user to perform targeted "experiments", manipulating a specific
attribute of the polygon. The proposed levers are drawn from the representation used by the straight skeleton algorithm
implemented in this project. Edges comprise a source and a target, with the basis vector explicitly stored as a field of
the edge. This maps well to operations like fixing the basis vector, while changing the length.

## Proposed Features

- [ ]  Lock or edit directly any of:
    - [ ]  vertex position
    - [ ]  edge length
    - [ ]  Edge basis vector
- [ ]  Button to toggle straight skeleton on/off
    - [ ]  While on, skeleton updates immediately after UI edits to the polygon
