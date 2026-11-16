import type {SkeletonInputRefusalKind} from "./types";

/** Where in the caller's input a refusal points, when its site knows. */
export interface InputRefusalPlace {
    /** The loop: 0 the outline, `k + 1` the caller's hole `k`. For a conflict, the first loop it names. */
    loop?: number;
    /** The caller's own vertex or weight index within that loop, before any renumbering. */
    index?: number;
}

/**
 * AN INPUT THE SOLVER REFUSES OUTRIGHT, thrown before any solve runs, with the rule it breaks as `kind`. The message is
 * the refusal's text, word for word as the plain `Error` it replaced carried it, so `instanceof Error` and `.message`
 * read as before; `name` is left as `Error` for the same reason. A hole's refusal carries its `Hole k: ` prefix in the
 * message and its kind unchanged.
 */
export class SkeletonInputRefusal extends Error {
    readonly kind: SkeletonInputRefusalKind;
    readonly loop?: number;
    readonly index?: number;

    constructor(kind: SkeletonInputRefusalKind, message: string, place: InputRefusalPlace = {}) {
        super(message);
        this.kind = kind;
        if (place.loop !== undefined) {
            this.loop = place.loop;
        }
        if (place.index !== undefined) {
            this.index = place.index;
        }
    }
}
