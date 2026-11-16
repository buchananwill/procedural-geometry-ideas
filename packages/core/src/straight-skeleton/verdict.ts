/**
 * ONE REFUSAL IDIOM. A check that can refuse returns a {@link Verdict}: the value it found, or the reason it refuses,
 * told apart by `ok` and never by the value's type. A check whose only answer is "no reason to refuse" returns
 * `Verdict<void>` and passes with {@link PASSED}. A refusal that carries more than its reason extends {@link Refused}
 * (the flatness test's clause, `flat-rings.ts`).
 */
export interface Accepted<T> {
    readonly ok: true;
    readonly value: T;
}

/** Why a check refuses, in the words the refusal it feeds will print. */
export interface Refused {
    readonly ok: false;
    readonly reason: string;
}

export type Verdict<T, R extends Refused = Refused> = Accepted<T> | R;

export function accept<T>(value: T): Accepted<T> {
    return {ok: true, value};
}

export function refuse(reason: string): Refused {
    return {ok: false, reason};
}

/** The verdict of a check that found no reason to refuse and has nothing else to say. */
export const PASSED: Accepted<void> = accept(undefined);

/** A ring of bisector ids as every refusal prints it: `[a, b, c]`. */
export function formatRing(ring: readonly number[]): string {
    return `[${ring.join(', ')}]`;
}
