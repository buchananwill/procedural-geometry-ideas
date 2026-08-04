import { useArticulationStore } from '../../src/stores/useArticulationStore';

// Zustand stores are singletons, so reset the slices these tests touch.
const resetStore = () => {
    useArticulationStore.setState({
        elements: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 200, y: 0 },
        ],
        constraints: [{}, {}, {}],
        selection: [],
        pivotIndex: 0,
    });
};

beforeEach(() => {
    resetStore();
});

describe('applyConstraintsTo', () => {
    it('applies the given bounds to every listed element', () => {
        useArticulationStore.getState().applyConstraintsTo([0, 2], {
            jointAngle: { min: -1, max: 1 },
        });
        const { constraints } = useArticulationStore.getState();
        expect(constraints[0].jointAngle).toEqual({ min: -1, max: 1 });
        expect(constraints[2].jointAngle).toEqual({ min: -1, max: 1 });
        expect(constraints[1].jointAngle).toBeUndefined();
    });

    it('gives each element its own MinMax objects rather than shared references', () => {
        const source = { jointAngle: { min: -1, max: 1 }, distanceToNext: { min: 20, max: 200 } };
        useArticulationStore.getState().applyConstraintsTo([0, 1, 2], source);
        const { constraints } = useArticulationStore.getState();
        expect(constraints[0].jointAngle).not.toBe(constraints[1].jointAngle);
        expect(constraints[1].jointAngle).not.toBe(constraints[2].jointAngle);
        expect(constraints[0].jointAngle).not.toBe(source.jointAngle);
        expect(constraints[0].distanceToNext).not.toBe(constraints[1].distanceToNext);
        expect(constraints[0]).not.toBe(constraints[1]);
    });

    it('omits absent axes entirely rather than storing undefined keys', () => {
        useArticulationStore.getState().applyConstraintsTo([0], { jointAngle: { min: -1, max: 1 } });
        const stored = useArticulationStore.getState().constraints[0];
        expect('distanceToPrev' in stored).toBe(false);
        expect('distanceToNext' in stored).toBe(false);
        expect('jointAngle' in stored).toBe(true);
    });

    it('replaces pre-existing constraints rather than merging into them', () => {
        useArticulationStore.getState().setConstraints(0, { distanceToPrev: { min: 20, max: 200 } });
        useArticulationStore.getState().applyConstraintsTo([0], { jointAngle: { min: -1, max: 1 } });
        const stored = useArticulationStore.getState().constraints[0];
        expect(stored).toEqual({ jointAngle: { min: -1, max: 1 } });
        expect('distanceToPrev' in stored).toBe(false);
    });

    it('ignores out-of-range indices', () => {
        useArticulationStore.getState().applyConstraintsTo([-1, 5, 1], { jointAngle: { min: -1, max: 1 } });
        const { constraints } = useArticulationStore.getState();
        expect(constraints).toHaveLength(3);
        expect(constraints[1].jointAngle).toEqual({ min: -1, max: 1 });
    });
});

describe('replaceChain', () => {
    it('replaces the elements with unconstrained copies and resets solve state', () => {
        useArticulationStore.setState({ selection: [1, 2], pivotIndex: 2, appliedFraction: 0.5 });
        const replacement = [{ x: 400, y: 100 }, { x: 400, y: 200 }];
        useArticulationStore.getState().replaceChain(replacement);
        const state = useArticulationStore.getState();
        expect(state.elements).toEqual(replacement);
        expect(state.elements[0]).not.toBe(replacement[0]);
        expect(state.constraints).toEqual([{}, {}]);
        expect(state.selection).toEqual([]);
        expect(state.pivotIndex).toBe(0);
        expect(state.drag).toBeNull();
        expect(state.appliedFraction).toBe(1);
        expect(state.clampedElementIndices).toEqual([]);
    });
});

describe('setConstraints', () => {
    it('sets the constraints of the given element', () => {
        useArticulationStore.getState().setConstraints(2, { jointAngle: { min: -2, max: 2 } });
        expect(useArticulationStore.getState().constraints[2].jointAngle).toEqual({ min: -2, max: 2 });
    });

    it('ignores out-of-range indices', () => {
        useArticulationStore.getState().setConstraints(-1, { jointAngle: { min: -2, max: 2 } });
        useArticulationStore.getState().setConstraints(5, { jointAngle: { min: -2, max: 2 } });
        const { constraints } = useArticulationStore.getState();
        expect(constraints).toHaveLength(3);
        expect(constraints).toEqual([{}, {}, {}]);
    });
});
