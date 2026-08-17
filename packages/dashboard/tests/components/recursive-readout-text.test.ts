import {
    pluralize,
    residueLine,
    residueTotalLine,
    spineLine,
    spineStrategyLabel,
    streamLine,
} from '../../src/components/recursive-readout-text';
import { summariseRecursiveTree } from '../../src/stores/useRecursiveSubdivisionStore';
import type {
    RecursiveLevelSummary,
    SpineLevelSummary,
} from '../../src/stores/useRecursiveSubdivisionStore';
import {
    RESIDUE_TREE,
    RESIDUE_TREE_LEVELS,
    TREE,
    TREE_LEVELS,
    UNSOLVED_RESIDUE_TREE,
} from '../fixtures/recursive-trees';

/**
 * What the readout CLAIMS, as opposed to what it counts.
 *
 * Decision 9 makes the readout the place a spec and a tree are said in the same sentence, so a
 * sentence that asserts something the summary never established is the same class of defect as a
 * miscount — and it is invisible to every test that only reads numbers. These pin the two claims that
 * are not simply a number read out: that an overridden level says so, and that a ring the recursion
 * did not reach is reported WITHOUT naming a cause the readout has not checked.
 */

const levelOf = (summary: { levels: RecursiveLevelSummary[] }, level: number): RecursiveLevelSummary =>
    summary.levels[level];

describe('pluralize', () => {
    it('drops the -s at exactly one', () => {
        expect(pluralize(0, 'region')).toBe('0 regions');
        expect(pluralize(1, 'region')).toBe('1 region');
        expect(pluralize(2, 'region')).toBe('2 regions');
    });
});

describe('streamLine', () => {
    it('says what a stream produced and that it recursed', () => {
        expect(streamLine(3, 'segment', { requested: 'recurse', recursed: true, overridden: false }))
            .toBe('3 segments → recursed');
    });

    it('names the treatment a terminal stream asked for, rather than calling it recursed', () => {
        expect(streamLine(1, 'residue ring', { requested: 'void', recursed: false, overridden: false }))
            .toBe('1 residue ring → void');
    });

    it('says out loud that a level whose recurse was overridden did not get it', () => {
        // The disagreement decision 9 exists to catch: a spec that asked to recurse and a tree with no
        // children at all. A line that read the same as an honest `leaf` would hide it.
        const line = streamLine(2, 'segment', { requested: 'recurse', recursed: false, overridden: true });
        expect(line).toContain('2 segments → recurse');
        expect(line).toContain('overridden');
    });
});

describe('residueLine', () => {
    it('reports a level cut to full depth as having no residue at all', () => {
        expect(residueLine(levelOf(summariseRecursiveTree(TREE, TREE_LEVELS), 0)))
            .toBe('no residue at full depth');
    });

    it('reports rings the recursion did not reach without naming a cause it has not checked', () => {
        // The claim under test. A residue ring recurses through the same path a segment child does, so
        // it stops on an incomplete solve as readily as on the degeneracy floor — and the summary the
        // line is built from does not record which. The two trees below differ ONLY in that reason.
        const degenerate = residueLine(levelOf(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS), 0));
        const unsolved = residueLine(
            levelOf(summariseRecursiveTree(UNSOLVED_RESIDUE_TREE, RESIDUE_TREE_LEVELS), 0));

        expect(degenerate).toBe('2 residue rings → recursed (1 not subdivided)');
        expect(unsolved).toBe(degenerate);
        expect(unsolved).not.toMatch(/degenerate/i);
    });

    it('says nothing about unsubdivided rings where every ring was recursed on', () => {
        expect(residueLine(levelOf(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS), 1)))
            .toBe('1 residue ring → void');
    });
});

describe('residueTotalLine', () => {
    it('says the segments tile every region where there is no residue at all', () => {
        expect(residueTotalLine(summariseRecursiveTree(TREE, TREE_LEVELS)))
            .toBe('No residue: the segments tile every region.');
    });

    it('totals the rings and the ones not subdivided, again without naming a cause', () => {
        const degenerate = residueTotalLine(summariseRecursiveTree(RESIDUE_TREE, RESIDUE_TREE_LEVELS));
        const unsolved = residueTotalLine(summariseRecursiveTree(UNSOLVED_RESIDUE_TREE, RESIDUE_TREE_LEVELS));

        expect(degenerate).toBe('3 residue rings, 1 not subdivided.');
        expect(unsolved).toBe(degenerate);
        expect(unsolved).not.toMatch(/degenerate/i);
    });
});

/**
 * The spine sentences.
 *
 * Decision 11 makes one of these load-bearing in a way none of the others are: a disconnected spine
 * is the difference between a definition that works on a region and one that does not, and it is the
 * fact the picture exists to communicate. So it is asserted that the line SAYS SO in words, rather
 * than leaving a reader to infer it from a gap between two strokes.
 */

/** A spine summary with everything at its quiet value, so each test names only what it is about. */
function spineSummary(overrides: Partial<SpineLevelSummary> = {}): SpineLevelSummary {
    return {
        level: 0,
        strategy: { kind: 'diameter' },
        regions: 1,
        unavailable: 0,
        empty: 0,
        disconnected: 0,
        maxComponentCount: 1,
        spineLength: 5,
        treeLength: 10,
        lengthFraction: 0.5,
        ...overrides,
    };
}

describe('spineStrategyLabel', () => {
    it('names the definition, and its threshold where it has one', () => {
        expect(spineStrategyLabel({ kind: 'diameter' })).toBe('diameter');
        expect(spineStrategyLabel({ kind: 'wavefront-time', fraction: 0.55 })).toBe('wavefront-time at 55%');
        expect(spineStrategyLabel({ kind: 'whisker-prune', fraction: 0.2 })).toBe('whisker-prune at 20%');
    });

    it('tells one threshold from another, since they are different answers', () => {
        expect(spineStrategyLabel({ kind: 'wavefront-time', fraction: 0.2 }))
            .not.toBe(spineStrategyLabel({ kind: 'wavefront-time', fraction: 0.8 }));
    });
});

describe('spineLine', () => {
    it('says which definition, how much of the skeleton it kept, and that it is whole', () => {
        expect(spineLine(spineSummary()))
            .toBe('spine: diameter → 50% of the skeleton, connected');
    });

    it('says out loud that a spine came apart, and in how many pieces', () => {
        // The claim under test, and the one thing in this readout a reader must not scroll past.
        const line = spineLine(spineSummary({
            strategy: { kind: 'wavefront-time', fraction: 0.55 },
            regions: 3,
            disconnected: 1,
            maxComponentCount: 2,
            lengthFraction: 0.22,
        }));

        expect(line).toContain('wavefront-time at 55%');
        expect(line).toContain('22% of the skeleton');
        expect(line).toContain('1 of 3 spines disconnected');
        expect(line).toContain('2 pieces');
    });

    it('says a threshold above everything retained nothing, rather than calling it connected', () => {
        // Retaining nothing and retaining one whole piece are different answers about a setting, and
        // a line that called the empty spine "connected" would report the first as the second.
        const line = spineLine(spineSummary({
            strategy: { kind: 'whisker-prune', fraction: 0.9 },
            empty: 1,
            spineLength: 0,
            lengthFraction: 0,
        }));

        expect(line).toBe('spine: whisker-prune at 90% → 0% of the skeleton, nothing retained at this threshold');
    });

    it('reports regions it could extract no spine from, apart from the ones it could', () => {
        const line = spineLine(spineSummary({ regions: 2, unavailable: 1 }));
        expect(line).toContain('1 region with no spine');
    });

    it('says there was no spine to extract where a level had no region it could read', () => {
        expect(spineLine(spineSummary({ regions: 0, lengthFraction: 0 })))
            .toContain('no spine to extract');
    });
});
