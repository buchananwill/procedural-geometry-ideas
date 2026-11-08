// Decision 142, N7: the one shared helper for tests that reshape a wire file past its types, deleting a required field
// or adding an unknown one. It is the one place an untyped value is allowed, so the tests that use it say so by name.

/** A JSON copy a test may reshape freely, to feed a malformed file to the refinement. */
export type MutableJson = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A deep JSON copy of a value, as a `MutableJson`. */
export const mutableJson = (v: unknown): MutableJson => JSON.parse(JSON.stringify(v));
