import {
    pluralize,
    residueLine,
    residueTotalLine,
    streamLine,
} from '../../src/components/recursive-readout-text';
import { summariseRecursiveTree } from '../../src/stores/useRecursiveSubdivisionStore';
import type { RecursiveLevelSummary } from '../../src/stores/useRecursiveSubdivisionStore';
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
