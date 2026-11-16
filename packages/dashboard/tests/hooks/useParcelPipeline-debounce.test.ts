import { HOLED_F1, HOLED_F2 } from '@proc-geo/test-fixtures';
import type { PipelineParams } from '../../src/hooks/parcel-pipeline';
import { useParcelPipeline } from '../../src/hooks/useParcelPipeline';

/*
 * ============================================================================
 *  THE OUTLINE AND ITS HOLES REACH THE PARCELS PIPELINE TOGETHER (BSA.D323)
 * ============================================================================
 *
 * `useParcelPipeline` debounces its inputs, and every debounce is a timer of its own: two timers of the same wait can
 * fire on different renders, so a render between them would pair one fixture's outline with another's holes. The
 * outline and holes are therefore ONE debounced value.
 *
 * The dashboard has no React renderer, so this runs the hook as a plain function: `useMemo` computes, `useEffect` is
 * skipped, the store is read through `getState`, and `useDebouncedValue` is a fake whose timers fire independently. For
 * a change from fixture A to fixture B, EVERY combination of fired and unfired timers is tried, and the pipeline must
 * never be handed an outline and holes of two different fixtures.
 */

const mockCaptured: PipelineParams[] = [];
let mockDebounce: (call: number, value: unknown) => unknown = (_call, value) => value;
let mockCall = 0;

jest.mock('react', () => ({
    ...jest.requireActual('react'),
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => undefined,
}));

jest.mock('@mantine/hooks', () => ({
    useDebouncedValue: (value: unknown) => [mockDebounce(mockCall++, value), () => undefined],
}));

jest.mock('../../src/stores/useParcelStore', () => {
    const actual = jest.requireActual('../../src/stores/useParcelStore');
    return {
        ...actual,
        useParcelStore: (selector: (state: unknown) => unknown) => selector(actual.useParcelStore.getState()),
    };
});

jest.mock('../../src/hooks/parcel-pipeline', () => ({
    ...jest.requireActual('../../src/hooks/parcel-pipeline'),
    runParcelPipeline: (params: PipelineParams) => {
        mockCaptured.push(params);
        return {};
    },
}));

interface Polygon {
    vertices: { x: number; y: number }[];
    holes: { vertices: { x: number; y: number }[] }[];
}

const polygonOf = (fixture: typeof HOLED_F1): Polygon => ({
    vertices: fixture.outline.map(v => ({...v})),
    holes: fixture.holes.map(hole => ({vertices: hole.vertices.map(v => ({...v}))})),
});

/** One render: the values each debounce was handed, and the params the pipeline was run on. */
function render(polygon: Polygon, debounce: (call: number, value: unknown) => unknown) {
    const handed: unknown[] = [];
    mockCall = 0;
    mockDebounce = (call, value) => {
        handed[call] = value;
        return debounce(call, value);
    };
    mockCaptured.length = 0;
    useParcelPipeline(polygon.vertices, polygon.holes);
    return {handed, params: mockCaptured[0]};
}

describe('useParcelPipeline debounces the outline and its holes as one value', () => {
    const sources: [string, Polygon, Polygon][] = [
        ['holed F1 to holed F2', polygonOf(HOLED_F1), polygonOf(HOLED_F2)],
        ['holed F1 to a single loop', polygonOf(HOLED_F1), {vertices: [{x: 0, y: 0}, {x: 0, y: 4}, {x: 4, y: 4}, {x: 4, y: 0}], holes: []}],
        ['a single loop to holed F2', {vertices: [{x: 0, y: 0}, {x: 0, y: 4}, {x: 4, y: 4}, {x: 4, y: 0}], holes: []}, polygonOf(HOLED_F2)],
    ];

    it.each(sources)('%s: under every order the timers fire in, the pipeline sees one fixture\'s outline and holes', (_name, a, b) => {
        // Settled on A: every debounce has caught up.
        const settled = render(a, (_call, value) => value);
        expect(settled.params.vertices).toBe(a.vertices);
        expect(settled.params.holes).toBe(a.holes);
        const timers = settled.handed.length;

        for (let fired = 0; fired < 1 << timers; fired++) {
            const {params} = render(b, (call, value) => (fired & (1 << call)) !== 0 ? value : settled.handed[call]);
            const fromA = params.vertices === a.vertices && params.holes === a.holes;
            const fromB = params.vertices === b.vertices && params.holes === b.holes;
            expect({fired, paired: fromA || fromB}).toEqual({fired, paired: true});
        }
    });
});
