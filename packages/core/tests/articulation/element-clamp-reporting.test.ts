import { solveArticulation } from '../../src/articulation/solve';
import { rigidRotationPose } from '../../src/articulation/strategies/rigid';
import { CLAMP_RESOLUTION } from '../../src/articulation/clamping';
import {
    ARTICULATION_EPSILON,
    DEFAULT_ELEMENT_CLAMP_TOLERANCE,
    isPoseValid,
    jointAngleAt,
    jointAngleViolation,
    linkDistanceViolation,
} from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type {
    ArticulationChain,
    ElementClampTolerance,
    ElementConstraints,
    MinMax,
    StrategyId,
    TransformDelta,
} from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

const EVERY_STRATEGY: StrategyId[] = ['rigid', 'spread', 'saturate'];

function horizontalChain(length: number): ArticulationChain {
    const elements: Vector2[] = Array.from({ length }, (_, x) => ({ x, y: 0 }));
    return { elements, constraints: elements.map(() => ({})) };
}

describe('a clamped rigid drag reports the binding elements, not the whole selection', () => {
    // Selection [1,2,3] dragged +y between fixed neighbours at both ends; links
    // (0,1) and (3,4) may each reach 2, so both bind at the same fraction while
    // element 2 sits between two unbounded links.
    const chain = horizontalChain(5);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
    chain.constraints[3] = { distanceToNext: { min: 0, max: 2 } };
    const result = solveArticulation({
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'rigid',
        delta: { kind: 'translate', vector: { x: 0, y: 10 } },
    });

    it('clamps the selection well short of the requested drag', () => {
        expect(result.appliedFraction).toBeGreaterThan(0);
        expect(result.appliedFraction).toBeLessThan(Math.sqrt(3) / 10 + CLAMP_RESOLUTION);
    });
    it('names exactly the two elements riding their bounds', () => {
        expect(distV(result.elements[0], result.elements[1])).toBeCloseTo(2, 2);
        expect(distV(result.elements[3], result.elements[4])).toBeCloseTo(2, 2);
        expect(result.clampedElementIndices).toEqual([1, 3]);
    });
});

describe('a fully absorbed saturate drag still reports its at-bound elements', () => {
    // Only element 1 is bounded, so it stops at its maximum while elements 2
    // and 3 carry the entire remaining vector: nothing is discarded.
    const chain = horizontalChain(4);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
    const result = solveArticulation({
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'saturate',
        delta: { kind: 'translate', vector: { x: 0, y: 10 } },
    });

    it('absorbs the whole delta', () => {
        expect(result.appliedFraction).toBeCloseTo(1, 9);
        expect(result.elements[3].y).toBeCloseTo(10, 9);
    });
    it('reports the element resting on its bound', () => {
        expect(distV(result.elements[0], result.elements[1])).toBeCloseTo(2, 2);
        expect(result.clampedElementIndices).toEqual([1]);
    });
});

describe('a bound owned by an unselected element still names its selected participants', () => {
    it('reports the neighbour of an at-bound joint the selection never contained', () => {
        // Only element 2 is dragged, about the far pivot, so the only bound that
        // can stop it is the joint at unselected element 1 -- formed by elements
        // 0, 1 and 2. Attributing joints to their own element alone would leave
        // this clamped drag highlighting nothing.
        const chain: ArticulationChain = {
            elements: [0, 1, 2, 3].map((y) => ({ x: 0, y })),
            constraints: [{}, { jointAngle: { min: -Math.PI / 9, max: Math.PI / 9 } }, {}, {}],
        };
        const result = solveArticulation({
            chain,
            selection: [2],
            pivotIndex: 0,
            strategyId: 'rigid',
            delta: { kind: 'rotate', angle: Math.PI / 3 },
        });
        expect(result.appliedFraction).toBeLessThan(1);
        expect(Math.abs(jointAngleAt(result.elements, 1)!)).toBeCloseTo(Math.PI / 9, 2);
        expect(result.clampedElementIndices).toEqual([2]);
    });
    it('reports the endpoint of a link whose bound only the far endpoint declares', () => {
        const chain = horizontalChain(3);
        chain.constraints[0] = { distanceToNext: { min: 0, max: 2 } };
        const result = solveArticulation({
            chain,
            selection: [1],
            pivotIndex: 0,
            strategyId: 'rigid',
            delta: { kind: 'translate', vector: { x: 5, y: 0 } },
        });
        expect(distV(result.elements[0], result.elements[1])).toBeCloseTo(2, 2);
        expect(result.clampedElementIndices).toEqual([1]);
    });
});

describe('unconstrained drags report nothing', () => {
    it('is empty for every strategy and both delta kinds', () => {
        const deltas: TransformDelta[] = [
            { kind: 'translate', vector: { x: 3, y: 7 } },
            { kind: 'rotate', angle: Math.PI / 4 },
        ];
        for (const strategyId of EVERY_STRATEGY) {
            for (const delta of deltas) {
                const chain = horizontalChain(5);
                const result = solveArticulation({
                    chain,
                    selection: [1, 2, 3],
                    pivotIndex: 0,
                    strategyId,
                    delta,
                });
                expect(result.appliedFraction).toBe(1);
                expect(result.clampedElementIndices).toEqual([]);
            }
        }
    });
});

describe('an invalid starting pose reports its violated elements before any motion', () => {
    // Link (0,1) is 1.2 long against a maximum of 1: outside the bound, but by
    // less than the detection tolerance, so element 1 reads as at that bound.
    function overstretchedPair(): ArticulationChain {
        return {
            elements: [{ x: 0, y: 0 }, { x: 1.2, y: 0 }],
            constraints: [{}, { distanceToPrev: { min: 0, max: 1 } }],
        };
    }

    it('reports the violated element even when the drag is refused outright', () => {
        const chain = overstretchedPair();
        const result = solveArticulation({
            chain,
            selection: [1],
            pivotIndex: 0,
            strategyId: 'rigid',
            delta: { kind: 'translate', vector: { x: 2, y: 0 } },
        });
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(false);
        expect(result.appliedFraction).toBe(0);
        expect(result.elements).toEqual(chain.elements);
        expect(result.clampedElementIndices).toEqual([1]);
    });
    it('reports it identically for a degenerate delta, which never reaches a strategy', () => {
        const chain = overstretchedPair();
        const result = solveArticulation({
            chain,
            selection: [1],
            pivotIndex: 0,
            strategyId: 'saturate',
            delta: { kind: 'translate', vector: { x: 1e-9, y: 0 } },
        });
        expect(result.appliedFraction).toBe(1);
        expect(result.clampedElementIndices).toEqual([1]);
    });
});

describe('a custom tolerance narrows what counts as at a bound', () => {
    it('drops an element the default tolerance would have reported', () => {
        const chain = horizontalChain(3);
        chain.constraints[1] = { distanceToPrev: { min: 0, max: 1.4 } };
        const solveWith = (elementClampTolerance?: ElementClampTolerance) =>
            solveArticulation({
                chain,
                selection: [1],
                pivotIndex: 0,
                strategyId: 'rigid',
                delta: { kind: 'translate', vector: { x: 0, y: 0.2 } },
                elementClampTolerance,
            });
        // Link (0,1) ends about 1.02 long, 0.38 inside its maximum.
        expect(solveWith().clampedElementIndices).toEqual([1]);
        expect(solveWith({ distance: 0.01, angle: 1e-4 }).clampedElementIndices).toEqual([]);
    });
});

/** mulberry32, so every property trial is reproducible from its seed. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A wandering chain whose bounds all admit its own starting pose. Links are at
 * least one unit long so that a joint angle responds slowly enough to element
 * displacement for the detection envelope below to hold at the default angle
 * tolerance.
 */
function randomConstrainedChain(random: () => number): ArticulationChain {
    const length = 3 + Math.floor(random() * 4);
    const elements: Vector2[] = [{ x: 0, y: 0 }];
    let heading = random() * Math.PI * 2;
    for (let index = 1; index < length; index++) {
        heading += (random() - 0.5) * 1.2;
        const linkLength = 1 + random();
        elements.push({
            x: elements[index - 1].x + Math.cos(heading) * linkLength,
            y: elements[index - 1].y + Math.sin(heading) * linkLength,
        });
    }
    const constraints: ElementConstraints[] = elements.map(() => ({}));
    for (let index = 1; index < length; index++) {
        const linkLength = distV(elements[index - 1], elements[index]);
        if (random() < 0.5) {
            constraints[index].distanceToPrev = { min: linkLength * 0.6, max: linkLength * 1.3 };
        }
        if (random() < 0.25) {
            constraints[index - 1].distanceToNext = { min: linkLength * 0.5, max: linkLength * 1.6 };
        }
    }
    for (let index = 1; index < length - 1; index++) {
        const angle = jointAngleAt(elements, index);
        if (random() < 0.5 && angle !== null) {
            const slack = 0.05 + random() * 0.5;
            constraints[index].jointAngle = { min: angle - slack, max: angle + slack };
        }
    }
    return { elements, constraints };
}

/** Displace one element far enough that the bounds fitted to the original pose break. */
function withOneElementDisplaced(chain: ArticulationChain, random: () => number): ArticulationChain {
    const displacedIndex = Math.floor(random() * chain.elements.length);
    const heading = random() * Math.PI * 2;
    const magnitude = 0.3 + random() * 1.5;
    const elements = chain.elements.map((point, index) => (index === displacedIndex
        ? { x: point.x + Math.cos(heading) * magnitude, y: point.y + Math.sin(heading) * magnitude }
        : { ...point }));
    return { elements, constraints: chain.constraints };
}

function randomContiguousSelection(random: () => number, chainLength: number): number[] {
    const first = Math.floor(random() * chainLength);
    const last = Math.min(chainLength - 1, first + Math.floor(random() * chainLength));
    return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

/**
 * Deltas modest enough to stay inside the guaranteed detection envelope: one
 * clamp resolution of this motion moves any element far less than the default
 * distance tolerance, and turns any joint far less than the angle tolerance.
 */
function randomModestDelta(random: () => number): TransformDelta {
    if (random() < 0.5) {
        const heading = random() * Math.PI * 2;
        const magnitude = 0.5 + random() * 2.5;
        return {
            kind: 'translate',
            vector: { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude },
        };
    }
    const angle = (0.05 + random() * 0.35) * (random() < 0.5 ? -1 : 1);
    return { kind: 'rotate', angle };
}

function rigidPoseAt(
    chain: ArticulationChain,
    selection: number[],
    pivotIndex: number,
    delta: TransformDelta,
    fraction: number,
): Vector2[] {
    const selectionSet = new Set(selection);
    if (delta.kind === 'rotate') {
        return rigidRotationPose(chain, selectionSet, chain.elements[pivotIndex], delta.angle * fraction);
    }
    return chain.elements.map((point, index) => (selectionSet.has(index)
        ? { x: point.x + delta.vector.x * fraction, y: point.y + delta.vector.y * fraction }
        : { ...point }));
}

/**
 * The elements participating in a constraint that is worsened one clamp
 * resolution past the accepted fraction -- the constraints that stopped the
 * solve, named through all of their participants: both endpoints of a link,
 * and all three elements forming a joint angle.
 */
function elementsBindingJustBeyond(chain: ArticulationChain, lookaheadPose: Vector2[]): number[] {
    const binding = new Set<number>();
    for (let lowerIndex = 0; lowerIndex < chain.elements.length - 1; lowerIndex++) {
        const base = linkDistanceViolation(chain.elements, chain.constraints, lowerIndex);
        const beyond = linkDistanceViolation(lookaheadPose, chain.constraints, lowerIndex);
        if (beyond > base + ARTICULATION_EPSILON) {
            binding.add(lowerIndex);
            binding.add(lowerIndex + 1);
        }
    }
    for (let index = 1; index < chain.elements.length - 1; index++) {
        const base = jointAngleViolation(chain.elements, chain.constraints, index);
        const beyond = jointAngleViolation(lookaheadPose, chain.constraints, index);
        if (beyond > base + ARTICULATION_EPSILON) {
            binding.add(index - 1);
            binding.add(index);
            binding.add(index + 1);
        }
    }
    return [...binding].sort((first, second) => first - second);
}

describe('property: the binding constraint of a clamped solve is always reported', () => {
    // Rigid is the strategy whose pose family a test can reproduce exactly, so
    // it is the one that can be asked what a fraction past the clamp would have
    // broken. Valid starting poses only: from an invalid start the clamp stops
    // where the violation stops growing, which may be nowhere near a limit.
    const TRIALS_PER_SEED = 200;
    for (const seed of [3, 5813, 20260804]) {
        it(`seed ${seed}: every binding selected element appears in the report`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let clampedTrials = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const chain = randomConstrainedChain(random);
                const selection = randomContiguousSelection(random, chain.elements.length);
                const pivotIndex = Math.floor(random() * chain.elements.length);
                const delta = randomModestDelta(random);
                if (!isPoseValid(chain.elements, chain.constraints)) continue;
                const result = solveArticulation({ chain, selection, pivotIndex, strategyId: 'rigid', delta });
                if (result.appliedFraction >= 1) continue;
                clampedTrials++;
                const lookaheadPose = rigidPoseAt(
                    chain,
                    selection,
                    pivotIndex,
                    delta,
                    Math.min(1, result.appliedFraction + CLAMP_RESOLUTION),
                );
                const reported = new Set(result.clampedElementIndices);
                const missing = elementsBindingJustBeyond(chain, lookaheadPose)
                    .filter((index) => selection.includes(index) && !reported.has(index));
                if (missing.length > 0) {
                    failures.push(`trial ${trial}: unreported binding elements ${missing} `
                        + `${JSON.stringify({ chain, selection, pivotIndex, delta, result })}`);
                }
                if (failures.length > 2) break;
            }
            expect(failures).toEqual([]);
            expect(clampedTrials).toBeGreaterThan(TRIALS_PER_SEED / 10);
        });
    }
});

/** Every gap between a value and one of a bound's two limits. */
function limitGaps(value: number, bounds: Array<MinMax | undefined>): number[] {
    return bounds.flatMap((bound) => (bound ? [Math.abs(value - bound.min), Math.abs(value - bound.max)] : []));
}

/** The gaps to the joint bound at `jointIndex`, empty where it is absent or unevaluable. */
function jointLimitGaps(chain: ArticulationChain, elements: Vector2[], jointIndex: number): number[] {
    if (jointIndex <= 0 || jointIndex >= elements.length - 1) return [];
    const angle = jointAngleAt(elements, jointIndex);
    if (angle === null) return [];
    return limitGaps(angle, [chain.constraints[jointIndex]?.jointAngle]);
}

/**
 * The at-bound rule re-derived straight from the constraint records, so an
 * off-by-one in which entries govern which link -- or in which elements a joint
 * names -- would show up here.
 */
function sitsAtSomeBound(chain: ArticulationChain, elements: Vector2[], index: number): boolean {
    const { constraints } = chain;
    const distanceGaps: number[] = [];
    if (index > 0) {
        distanceGaps.push(...limitGaps(
            distV(elements[index - 1], elements[index]),
            [constraints[index - 1]?.distanceToNext, constraints[index]?.distanceToPrev],
        ));
    }
    if (index < elements.length - 1) {
        distanceGaps.push(...limitGaps(
            distV(elements[index], elements[index + 1]),
            [constraints[index]?.distanceToNext, constraints[index + 1]?.distanceToPrev],
        ));
    }
    if (distanceGaps.some((gap) => gap <= DEFAULT_ELEMENT_CLAMP_TOLERANCE.distance)) return true;
    // The element participates in the joint at itself and in those at both
    // neighbours, whose angles its own position helps form.
    return [index - 1, index, index + 1]
        .flatMap((jointIndex) => jointLimitGaps(chain, elements, jointIndex))
        .some((gap) => gap <= DEFAULT_ELEMENT_CLAMP_TOLERANCE.angle);
}

describe('property: nothing is reported that is far from every bound it participates in', () => {
    const TRIALS_PER_SEED = 150;
    for (const seed of [11, 4242, 777001]) {
        it(`seed ${seed}: every reported element sits within tolerance of one of its own limits`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let reportingTrials = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const validChain = randomConstrainedChain(random);
                const chain = random() < 0.3 ? withOneElementDisplaced(validChain, random) : validChain;
                const selection = randomContiguousSelection(random, chain.elements.length);
                const pivotIndex = Math.floor(random() * chain.elements.length);
                const delta = randomModestDelta(random);
                const strategyId = EVERY_STRATEGY[Math.floor(random() * EVERY_STRATEGY.length)];
                const result = solveArticulation({ chain, selection, pivotIndex, strategyId, delta });
                if (result.clampedElementIndices.length > 0) reportingTrials++;
                let previous = -1;
                for (const index of result.clampedElementIndices) {
                    if (!selection.includes(index)) {
                        failures.push(`trial ${trial}: reported ${index} outside the selection`);
                    } else if (index <= previous) {
                        failures.push(`trial ${trial}: reported ${index} out of ascending order`);
                    } else if (!sitsAtSomeBound(chain, result.elements, index)) {
                        failures.push(`trial ${trial}: reported ${index} is far from every bound `
                            + `${JSON.stringify({ chain, selection, pivotIndex, delta, strategyId, result })}`);
                    }
                    previous = index;
                }
                if (failures.length > 2) break;
            }
            expect(failures).toEqual([]);
            expect(reportingTrials).toBeGreaterThan(TRIALS_PER_SEED / 10);
        });
    }
});
