import type {
    RecursiveLevelSummary,
    RecursiveStreamReport,
    RecursiveTreeSummary,
} from '../stores/useRecursiveSubdivisionStore';

/**
 * The sentences the recursive subdivision readout says, apart from the components that draw them.
 *
 * Decision 9 makes these sentences load-bearing: the readout exists to catch a spec and a tree
 * disagreeing, so what it CLAIMS has to be as checkable as what it counts. Kept as pure functions of a
 * summary for that reason — a claim built inside JSX is a claim nothing can assert on.
 */

/**
 * `n` followed by `word`, given an -s plural.
 *
 * Every count this readout reports is a count of something the canvas drew, so they all read the same
 * way; saying that once keeps "1 regions" from creeping into whichever line is edited next.
 */
export function pluralize(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * What one stream's report reads as: what it produced, and what became of it.
 *
 * The one place a spec and a tree are said in the same sentence, which is the point of the readout —
 * `2 rings → recursed` and `2 rings → void (overridden)` are the two facts a reader has to be able to
 * tell apart, and a level that quietly ignored its setting looks identical to one that was obeyed.
 */
export function streamLine<TTreatment extends string>(
    produced: number,
    noun: string,
    report: RecursiveStreamReport<TTreatment>,
): string {
    return `${pluralize(produced, noun)} → ${report.recursed ? 'recursed' : report.requested}`
        + `${report.overridden ? ' — overridden: the last level has nowhere to send it' : ''}`;
}

/**
 * One level's residue line: what the rings became, and how many the recursion did not reach.
 *
 * "NOT SUBDIVIDED" RATHER THAN "DISCARDED AS DEGENERATE". A residue ring recurses through exactly the
 * path a segment child does, so it stops for any of the three reasons the driver can report — and in
 * the corpus it stops on an incomplete solve far more often than on the degeneracy floor. The reason
 * is recorded on the ring's own child; this line has not read it, so it does not name one.
 */
export function residueLine(summary: RecursiveLevelSummary): string {
    const produced = summary.residueInert
        ? 'no residue at full depth'
        : streamLine(summary.residueRings, 'residue ring', summary.residueStream);
    return summary.unsubdividedResidueRings > 0
        ? `${produced} (${summary.unsubdividedResidueRings} not subdivided)`
        : produced;
}

/** The whole tree's residue line, reason-agnostic for the same reason {@link residueLine} is. */
export function residueTotalLine(summary: RecursiveTreeSummary): string {
    if (summary.totalResidueRings === 0) {
        return 'No residue: the segments tile every region.';
    }
    const rings = pluralize(summary.totalResidueRings, 'residue ring');
    return summary.totalUnsubdividedResidueRings > 0
        ? `${rings}, ${summary.totalUnsubdividedResidueRings} not subdivided.`
        : `${rings}.`;
}
