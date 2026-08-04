import { solveArticulation } from '../../src/articulation/solve';
import { CLAMP_RESOLUTION } from '../../src/articulation/clamping';
import {
    ARTICULATION_EPSILON,
    isPoseValid,
    jointAngleAt,
    jointAngleViolation,
    linkDistanceViolation,
} from '../../src/articulation/validity';
import { distV } from '../../src/articulation/geometry';
import type { ArticulationChain, ElementConstraints, SolveInput } from '../../src/articulation/types';
import type { Vector2 } from '../../src/shared/types';

function chainAtAbscissae(abscissae: number[]): ArticulationChain {
    const elements: Vector2[] = abscissae.map((x) => ({ x, y: 0 }));
    return { elements, constraints: elements.map(() => ({})) };
}

function horizontalChain(length: number): ArticulationChain {
    return chainAtAbscissae(Array.from({ length }, (_, x) => x));
}

function input(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'spread',
        delta: { kind: 'translate', vector: { x: 0, y: 9 } },
        ...overrides,
    };
}

describe('spread translate ramp with the pivot outside the selection', () => {
    const chain = horizontalChain(6);
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('applies the whole vector when nothing is constrained', () => {
        expect(result.appliedFraction).toBe(1);
        expect(result.appliedStrategyId).toBe('spread');
        expect(result.clampedElementIndices).toEqual([]);
    });
    it('displaces each element in proportion to its arc length from the pivot', () => {
        expect(p[1].y).toBeCloseTo(3, 9);
        expect(p[2].y).toBeCloseTo(6, 9);
    });
    it('gives the furthest element exactly the whole vector', () => {
        expect(p[3].x).toBeCloseTo(3, 9);
        expect(p[3].y).toBeCloseTo(9, 9);
    });
    it('never moves the pivot or the unselected elements', () => {
        [0, 4, 5].forEach((index) => expect(p[index]).toEqual({ x: index, y: 0 }));
    });
    it('does not mutate the input chain', () => {
        expect(chain.elements[3]).toEqual({ x: 3, y: 0 });
    });
});

describe('spread translate ramp measured in arc length rather than index', () => {
    // Links of 1, 4 and 1: arc lengths 1, 5 and 6 give weights 1/6, 5/6 and 1,
    // where an index falloff would give 1/3, 2/3 and 1.
    const chain = chainAtAbscissae([0, 1, 5, 6]);
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: 0, y: 6 } } }));
    const p = result.elements;

    it('weights the near element by its short link, not by its index', () => {
        expect(p[1].y).toBeCloseTo(1, 9);
        expect(p[1].y).not.toBeCloseTo(2, 3);
    });
    it('weights the far interior element by the long link it sits beyond', () => {
        expect(p[2].y).toBeCloseTo(5, 9);
        expect(p[2].y).not.toBeCloseTo(4, 3);
    });
    it('still gives the furthest element the whole vector', () => {
        expect(p[3].y).toBeCloseTo(6, 9);
        expect(result.appliedFraction).toBe(1);
    });
});

describe('spread translate ramp with the pivot inside the selection', () => {
    const chain = horizontalChain(5);
    const result = solveArticulation(input(chain, {
        selection: [0, 1, 2, 3, 4],
        pivotIndex: 2,
        delta: { kind: 'translate', vector: { x: 0, y: 5 } },
    }));
    const p = result.elements;

    it('gives both spans their own ramp, each far end receiving the whole vector', () => {
        expect(p[0].y).toBeCloseTo(5, 9);
        expect(p[4].y).toBeCloseTo(5, 9);
    });
    it('halves the displacement of the elements halfway along each span', () => {
        expect(p[1].y).toBeCloseTo(2.5, 9);
        expect(p[3].y).toBeCloseTo(2.5, 9);
    });
    it('leaves the pivot exactly where it was, though it is selected', () => {
        expect(p[2]).toEqual({ x: 2, y: 0 });
        expect(result.appliedFraction).toBe(1);
    });
});

describe('spread translate of the pivot alone', () => {
    it('is the identity, unlike rigid translate of the same selection', () => {
        const chain = horizontalChain(4);
        const overrides: Partial<SolveInput> = {
            selection: [2],
            pivotIndex: 2,
            delta: { kind: 'translate', vector: { x: 0, y: 4 } },
        };
        const spread = solveArticulation(input(chain, overrides));
        const rigid = solveArticulation(input(chain, { ...overrides, strategyId: 'rigid' }));

        expect(spread.elements).toEqual(chain.elements);
        expect(spread.appliedFraction).toBe(1);
        expect(rigid.elements[2]).toEqual({ x: 2, y: 4 });
    });
});

describe('spread translate with one span collapsed onto the pivot', () => {
    it('scores the collapsed span vacuously complete instead of burning the badge', () => {
        // Elements 0 and 1 sit exactly on the pivot (zero arc length), so the
        // below-pivot span requests zero displacement; the above-pivot span is
        // free and fully achieves. The mean must report 1, not 0.5.
        const chain = chainAtAbscissae([2, 2, 2, 3, 4]);
        const result = solveArticulation(input(chain, {
            selection: [0, 1, 2, 3, 4],
            pivotIndex: 2,
            delta: { kind: 'translate', vector: { x: 0, y: 4 } },
        }));
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[4].y).toBeCloseTo(4, 9);
        expect(result.elements[0]).toEqual({ x: 2, y: 0 });
        expect(result.elements[1]).toEqual({ x: 2, y: 0 });
    });
});

describe('spread translate beyond the reach of the chain, with nothing outside the span', () => {
    // Links (0,1), (1,2) and (2,3) may not exceed their starting length of 1, so
    // element 3 can never leave the circle of radius 3 about the anchored
    // element 0. The relaxation absorbs the whole shortfall, so every fraction
    // yields a pose the clamp is happy with -- and the report has to come from
    // what the far element achieved, not from the clamp.
    const chain = horizontalChain(4);
    [1, 2, 3].forEach((index) => {
        chain.constraints[index] = { distanceToPrev: { min: 0, max: 1 } };
    });
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: 0, y: 10 } } }));
    const p = result.elements;

    it('ends on a valid pose', () => {
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
    it('straightens the span onto the reach circle', () => {
        expect(distV(p[0], p[3])).toBeCloseTo(3, 6);
        [0, 1, 2].forEach((lowerIndex) => {
            expect(distV(p[lowerIndex], p[lowerIndex + 1])).toBeCloseTo(1, 6);
        });
    });
    it('reports the fraction of the vector the far element actually achieved', () => {
        // Straightened, element 3 lands 3 along the unit vector toward its
        // target at (3, 10), so it climbs 30/sqrt(109) of the 10 it was asked for.
        const achievedFraction = 3 / Math.hypot(3, 10);
        expect(result.appliedFraction).toBeCloseTo(p[3].y / 10, 9);
        expect(result.appliedFraction).toBeCloseTo(achievedFraction, 6);
    });
    it('drives the badge although the clamp accepted the whole fraction', () => {
        // Every fraction relaxes to a valid pose here, so a report of clamp.t
        // would have said 1 while the cursor ran away from the chain.
        expect(result.appliedFraction).toBeLessThan(1);
    });
    it('never moves the pivot', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
    });
});

describe('spread translate beyond the reach of the chain', () => {
    // Links (0,1), (1,2) and (2,3) may not exceed their starting length of 1, so
    // element 3 can never leave the circle of radius 3 about the anchored
    // element 0. The link out to the unselected element 4 lies beyond the
    // relaxed span, so it is the clamp, not the relaxation, that answers for it.
    function reachChain(): ArticulationChain {
        const chain = horizontalChain(5);
        [1, 2, 3].forEach((index) => {
            chain.constraints[index] = { distanceToPrev: { min: 0, max: 1 } };
        });
        chain.constraints[4] = { distanceToPrev: { min: 0, max: 1.2 } };
        return chain;
    }
    const chain = reachChain();
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: 0, y: 10 } } }));
    const p = result.elements;

    it('starts from a valid pose and ends on one', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
    it('reports what the far element achieved, under both limits at once', () => {
        expect(result.appliedFraction).toBeCloseTo(p[3].y / 10, 9);
        expect(result.appliedFraction).toBeLessThan(1);
        expect(result.appliedFraction).toBeGreaterThan(0);
    });
    it('straightens the span toward the target instead of shearing its links', () => {
        [0, 1, 2].forEach((lowerIndex) => {
            expect(distV(p[lowerIndex], p[lowerIndex + 1])).toBeLessThanOrEqual(1 + ARTICULATION_EPSILON);
            expect(distV(p[lowerIndex], p[lowerIndex + 1])).toBeCloseTo(1, 6);
        });
    });
    it('leaves the far element short of the requested target, inside its reach', () => {
        expect(distV(p[0], p[3])).toBeLessThanOrEqual(3 + ARTICULATION_EPSILON);
        expect(p[3].y).toBeLessThan(10);
    });
    it('never moves the pivot or the unselected element', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
        expect(p[4]).toEqual({ x: 4, y: 0 });
    });
    it('reports the elements riding their bounds', () => {
        expect(result.clampedElementIndices).toEqual([1, 2, 3]);
    });
});

describe('spread translate against a joint angle at the pivot', () => {
    // Pivot 2 sits between the two spans, so both of their ramps open the joint
    // it owns. One global fraction covers both: they clamp together, at the same
    // fraction of the same vector, which is what the coupling requires.
    const JOINT_LIMIT = 0.2;
    const chain = horizontalChain(5);
    chain.constraints[2] = { jointAngle: { min: -JOINT_LIMIT, max: JOINT_LIMIT } };
    const result = solveArticulation(input(chain, {
        selection: [1, 2, 3],
        pivotIndex: 2,
        delta: { kind: 'translate', vector: { x: 0, y: 1 } },
    }));
    const p = result.elements;

    it('holds the joint inside its bound', () => {
        expect(Math.abs(jointAngleAt(p, 2)!)).toBeLessThanOrEqual(JOINT_LIMIT + ARTICULATION_EPSILON);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
    it('stops just short of the fraction the joint permits', () => {
        // Displacing both neighbours by h opens the joint to 2 * atan(h).
        const permittedFraction = Math.tan(JOINT_LIMIT / 2);
        expect(result.appliedFraction).toBeLessThanOrEqual(permittedFraction);
        expect(result.appliedFraction).toBeGreaterThan(permittedFraction - CLAMP_RESOLUTION);
    });
    it('clamps both spans jointly, each far end at the same single fraction', () => {
        expect(p[1].y).toBeCloseTo(result.appliedFraction, 12);
        expect(p[3].y).toBeCloseTo(result.appliedFraction, 12);
    });
    it('never moves the pivot', () => {
        expect(p[2]).toEqual({ x: 2, y: 0 });
    });
    it('names the three elements whose positions form the joint', () => {
        expect(result.clampedElementIndices).toEqual([1, 2, 3]);
    });
});

describe('spread translate toward the anchor', () => {
    // Every link may compress to 0.5 and no further. The ramp shortens all three
    // links equally, so the relaxation only has work to do once the ramp asks
    // for less than the minimum.
    const chain = horizontalChain(4);
    [1, 2, 3].forEach((index) => {
        chain.constraints[index] = { distanceToPrev: { min: 0.5, max: 1 } };
    });
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: -2, y: 0 } } }));
    const p = result.elements;

    it('ends on a valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
    it('compresses every link to its minimum and no further', () => {
        [0, 1, 2].forEach((lowerIndex) => {
            expect(distV(p[lowerIndex], p[lowerIndex + 1])).toBeGreaterThanOrEqual(0.5 - ARTICULATION_EPSILON);
            expect(distV(p[lowerIndex], p[lowerIndex + 1])).toBeCloseTo(0.5, 6);
        });
    });
    it('holds the span off the ramp target the minima cannot admit', () => {
        expect(p[3].x).toBeGreaterThan(1 + ARTICULATION_EPSILON);
    });
    it('reports how far along the vector the minima let the far element travel', () => {
        // Requested -2 in x, and element 3 comes to rest at x = 1.5: 1.5 of the 2.
        expect(result.appliedFraction).toBeCloseTo(0.75, 6);
    });
    it('never moves the pivot', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
    });
});

describe('spread translate over a violated link inside the span', () => {
    it('lets the relaxation pull the link back to its bound as the drag passes', () => {
        // Link (0,1) is 5 long against a maximum of 3, and it lies inside the
        // relaxed span, so the projection repairs it however the ramp shears it.
        const chain: ArticulationChain = {
            elements: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }],
            constraints: [{}, { distanceToPrev: { min: 1, max: 3 } }, {}],
        };
        const result = solveArticulation(input(chain, {
            selection: [1, 2],
            delta: { kind: 'translate', vector: { x: 2, y: 0 } },
        }));
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(false);
        expect(result.appliedFraction).toBe(1);
        expect(distV(result.elements[0], result.elements[1])).toBeCloseTo(3, 9);
        expect(result.elements[2].x).toBeCloseTo(8, 9);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('spread translate from an invalid starting pose', () => {
    /** Link (1,2) is 5 long against a maximum of 3, and lies beyond the far element. */
    function overstretchedChain(): ArticulationChain {
        const elements: Vector2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 6, y: 0 }];
        const constraints: ElementConstraints[] = [{}, {}, { distanceToPrev: { min: 1, max: 3 } }];
        return { elements, constraints };
    }

    it('applies a drag that repairs the violated link outright', () => {
        const chain = overstretchedChain();
        const result = solveArticulation(input(chain, {
            selection: [1],
            delta: { kind: 'translate', vector: { x: 2, y: 0 } },
        }));
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(false);
        expect(result.appliedFraction).toBe(1);
        expect(result.elements[1].x).toBeCloseTo(3, 9);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });

    it('refuses a drag that would stretch the violated link further', () => {
        const chain = overstretchedChain();
        const result = solveArticulation(input(chain, {
            selection: [1],
            delta: { kind: 'translate', vector: { x: -2, y: 0 } },
        }));
        expect(result.appliedFraction).toBe(0);
        expect(result.elements).toEqual(chain.elements);
    });

    it('shrinks a violation it cannot eliminate outright', () => {
        const chain = overstretchedChain();
        const before = linkDistanceViolation(chain.elements, chain.constraints, 1);
        const result = solveArticulation(input(chain, {
            selection: [1],
            delta: { kind: 'translate', vector: { x: 1, y: 0 } },
        }));
        expect(before).toBeCloseTo(2, 9);
        expect(result.appliedFraction).toBe(1);
        expect(linkDistanceViolation(result.elements, chain.constraints, 1)).toBeCloseTo(1, 9);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(false);
    });
});

describe('spread translate determinism', () => {
    function constrainedChain(): ArticulationChain {
        const chain = horizontalChain(6);
        [1, 2, 3].forEach((index) => {
            chain.constraints[index] = { distanceToPrev: { min: 0.7, max: 1.1 } };
        });
        chain.constraints[2] = { distanceToPrev: { min: 0.7, max: 1.1 }, jointAngle: { min: -0.4, max: 0.4 } };
        chain.constraints[4] = { distanceToPrev: { min: 0.5, max: 2 } };
        return chain;
    }

    it('produces the identical pose for identical inputs', () => {
        const delta = { kind: 'translate', vector: { x: 3, y: 7 } } as const;
        const first = solveArticulation(input(constrainedChain(), { delta }));
        const second = solveArticulation(input(constrainedChain(), { delta }));
        expect(second.elements).toEqual(first.elements);
        expect(second.appliedFraction).toBe(first.appliedFraction);
        expect(second.clampedElementIndices).toEqual(first.clampedElementIndices);
    });
});

/** mulberry32, so every fuzz case is reproducible from its seed. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/** A wandering chain whose bounds all admit its own starting pose. */
function randomChain(random: () => number): ArticulationChain {
    const length = 3 + Math.floor(random() * 5);
    const elements: Vector2[] = [{ x: 0, y: 0 }];
    let heading = random() * Math.PI * 2;
    for (let index = 1; index < length; index++) {
        heading += (random() - 0.5) * 1.5;
        const linkLength = 0.5 + random() * 1.5;
        elements.push({
            x: elements[index - 1].x + Math.cos(heading) * linkLength,
            y: elements[index - 1].y + Math.sin(heading) * linkLength,
        });
    }
    const constraints: ElementConstraints[] = elements.map(() => ({}));
    for (let index = 1; index < length; index++) {
        const linkLength = distV(elements[index - 1], elements[index]);
        const style = random();
        if (style < 0.3) {
            constraints[index].distanceToPrev = { min: linkLength * 0.85, max: linkLength * 1.1 };
        } else if (style < 0.75) {
            constraints[index].distanceToPrev = {
                min: linkLength * (0.2 + random() * 0.5),
                max: linkLength * (1.5 + random() * 3),
            };
        }
        if (random() < 0.3) {
            constraints[index - 1].distanceToNext = { min: 0, max: linkLength * (1 + random() * 2) };
        }
    }
    for (let index = 1; index < length - 1; index++) {
        const angle = jointAngleAt(elements, index);
        if (random() < 0.35 && angle !== null) {
            const slack = 0.05 + random() * 0.8;
            constraints[index].jointAngle = { min: angle - slack, max: angle + slack };
        }
    }
    return { elements, constraints };
}

function randomContiguousSelection(random: () => number, chainLength: number): number[] {
    const first = Math.floor(random() * chainLength);
    const last = Math.min(chainLength - 1, first + Math.floor(random() * chainLength));
    return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

/** The clamp report is only meaningful if it names distinct selected elements, ascending. */
function clampReportProblem(clampedElementIndices: number[], selection: number[]): string | null {
    const selected = new Set(selection);
    let previous = -1;
    for (const index of clampedElementIndices) {
        if (!selected.has(index)) return `clamped element ${index} is not in the selection`;
        if (index <= previous) return `clamped element ${index} is out of ascending order after ${previous}`;
        previous = index;
    }
    return null;
}

/**
 * Anchors -- every unselected element, and the pivot -- must come back bit for
 * bit unchanged, whatever pressure the constraints put on the relaxation.
 */
function anchorMovementProblem(
    basePose: Vector2[],
    resultPose: Vector2[],
    selection: number[],
    pivotIndex: number,
): string | null {
    const selected = new Set(selection);
    for (let index = 0; index < basePose.length; index++) {
        if (selected.has(index) && index !== pivotIndex) continue;
        if (resultPose[index].x !== basePose[index].x || resultPose[index].y !== basePose[index].y) {
            return `anchor ${index} moved from ${JSON.stringify(basePose[index])} `
                + `to ${JSON.stringify(resultPose[index])}`;
        }
    }
    return null;
}

/** Every constraint's violation magnitude, in a fixed order for pairwise comparison. */
function everyViolation(elements: Vector2[], constraints: ElementConstraints[]): number[] {
    const violations: number[] = [];
    for (let lowerIndex = 0; lowerIndex < elements.length - 1; lowerIndex++) {
        violations.push(linkDistanceViolation(elements, constraints, lowerIndex));
    }
    for (let index = 0; index < elements.length; index++) {
        violations.push(jointAngleViolation(elements, constraints, index));
    }
    return violations;
}

/** Displace one element far enough that the bounds fitted to the original pose break. */
function withOneElementDisplaced(chain: ArticulationChain, random: () => number): ArticulationChain {
    const displacedIndex = Math.floor(random() * chain.elements.length);
    const heading = random() * Math.PI * 2;
    const magnitude = 0.8 + random() * 3;
    const elements = chain.elements.map((point, index) => (index === displacedIndex
        ? { x: point.x + Math.cos(heading) * magnitude, y: point.y + Math.sin(heading) * magnitude }
        : { ...point }));
    return { elements, constraints: chain.constraints };
}

describe('spread translate fuzz (fixed seeds)', () => {
    const TRIALS_PER_SEED = 120;
    for (const seed of [3, 2411]) {
        it(`seed ${seed}: a valid input pose always yields a valid output pose`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let validInputs = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const chain = randomChain(random);
                const selection = randomContiguousSelection(random, chain.elements.length);
                const pivotIndex = Math.floor(random() * chain.elements.length);
                const heading = random() * Math.PI * 2;
                const magnitude = 0.2 + random() * 12;
                if (!isPoseValid(chain.elements, chain.constraints)) continue;
                validInputs++;
                const result = solveArticulation({
                    chain,
                    selection,
                    pivotIndex,
                    strategyId: 'spread',
                    delta: {
                        kind: 'translate',
                        vector: { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude },
                    },
                });
                if (!isPoseValid(result.elements, chain.constraints)) {
                    failures.push(`trial ${trial}: invalid output ${JSON.stringify({ chain, selection, result })}`);
                }
                if (!(result.appliedFraction >= 0 && result.appliedFraction <= 1 + 1e-9)) {
                    failures.push(`trial ${trial}: appliedFraction ${result.appliedFraction}`);
                }
                const clampProblem = clampReportProblem(result.clampedElementIndices, selection);
                if (clampProblem) failures.push(`trial ${trial}: ${clampProblem}`);
                const anchorProblem = anchorMovementProblem(chain.elements, result.elements, selection, pivotIndex);
                if (anchorProblem) failures.push(`trial ${trial}: ${anchorProblem}`);
                if (result.appliedStrategyId !== 'spread') {
                    failures.push(`trial ${trial}: appliedStrategyId ${result.appliedStrategyId}`);
                }
                if (failures.length > 2) break;
            }
            expect(validInputs).toBeGreaterThan(TRIALS_PER_SEED / 2);
            expect(failures).toEqual([]);
        });
    }
});

describe('spread translate fuzz from invalid starting poses (fixed seeds)', () => {
    const TRIALS_PER_SEED = 120;
    for (const seed of [11, 20260804]) {
        it(`seed ${seed}: no constraint ends more violated than it began`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let invalidInputs = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const chain = withOneElementDisplaced(randomChain(random), random);
                const selection = randomContiguousSelection(random, chain.elements.length);
                const pivotIndex = Math.floor(random() * chain.elements.length);
                const heading = random() * Math.PI * 2;
                const magnitude = 0.2 + random() * 12;
                if (isPoseValid(chain.elements, chain.constraints)) continue;
                invalidInputs++;
                const startingViolations = everyViolation(chain.elements, chain.constraints);
                const result = solveArticulation({
                    chain,
                    selection,
                    pivotIndex,
                    strategyId: 'spread',
                    delta: {
                        kind: 'translate',
                        vector: { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude },
                    },
                });
                const endingViolations = everyViolation(result.elements, chain.constraints);
                // Spread translate accepts a pose on one whole-pose predicate, so
                // the structural growth bound is a single epsilon per solve.
                endingViolations.forEach((violation, position) => {
                    if (violation > startingViolations[position] + ARTICULATION_EPSILON) {
                        failures.push(`trial ${trial}: violation ${position} rose `
                            + `${startingViolations[position]} -> ${violation} `
                            + `${JSON.stringify({ chain, selection, result })}`);
                    }
                });
                if (!(result.appliedFraction >= 0 && result.appliedFraction <= 1 + 1e-9)) {
                    failures.push(`trial ${trial}: appliedFraction ${result.appliedFraction}`);
                }
                const clampProblem = clampReportProblem(result.clampedElementIndices, selection);
                if (clampProblem) failures.push(`trial ${trial}: ${clampProblem}`);
                const anchorProblem = anchorMovementProblem(chain.elements, result.elements, selection, pivotIndex);
                if (anchorProblem) failures.push(`trial ${trial}: ${anchorProblem}`);
                if (result.appliedStrategyId !== 'spread') {
                    failures.push(`trial ${trial}: appliedStrategyId ${result.appliedStrategyId}`);
                }
                if (failures.length > 2) break;
            }
            expect(invalidInputs).toBeGreaterThan(TRIALS_PER_SEED / 4);
            expect(failures).toEqual([]);
        });
    }
});
