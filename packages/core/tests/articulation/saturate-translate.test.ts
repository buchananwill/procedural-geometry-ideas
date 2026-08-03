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

function horizontalChain(length: number): ArticulationChain {
    const elements: Vector2[] = Array.from({ length }, (_, x) => ({ x, y: 0 }));
    return { elements, constraints: elements.map(() => ({})) };
}

function input(chain: ArticulationChain, overrides: Partial<SolveInput> = {}): SolveInput {
    return {
        chain,
        selection: [1, 2, 3],
        pivotIndex: 0,
        strategyId: 'saturate',
        delta: { kind: 'translate', vector: { x: 0, y: 10 } },
        ...overrides,
    };
}

describe('saturate translate without constraints', () => {
    const chain = horizontalChain(6);
    const result = solveArticulation(input(chain, { selection: [2, 3, 4] }));

    it('applies the whole vector', () => {
        expect(result.appliedFraction).toBe(1);
    });
    it('displaces every selected element by exactly the vector', () => {
        [2, 3, 4].forEach((i) => expect(result.elements[i]).toEqual({ x: i, y: 10 }));
    });
    it('leaves unselected elements untouched', () => {
        [0, 1, 5].forEach((i) => expect(result.elements[i]).toEqual({ x: i, y: 0 }));
    });
    it('does not mutate the input chain', () => {
        expect(chain.elements[2]).toEqual({ x: 2, y: 0 });
    });
    it('reports the saturate strategy and freezes nobody', () => {
        expect(result.appliedStrategyId).toBe('saturate');
        expect(result.frozenElementIndices).toEqual([]);
    });
});

describe('saturate translate spills past a single boundary', () => {
    // Chain 0-1-2-3 spaced 1 apart; element 1 may sit at most 2 from element 0.
    // Dragging [1,2,3] along +x by 5 lets element 1 travel only 1 before it
    // saturates; elements 2 and 3 then absorb the whole remainder.
    const chain = horizontalChain(4);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: 5, y: 0 } } }));
    const p = result.elements;

    it('saturates the boundary element at its maximum distance', () => {
        expect(distV(p[0], p[1])).toBeLessThanOrEqual(2 + 1e-6);
        expect(distV(p[0], p[1])).toBeGreaterThan(2 - 5 * CLAMP_RESOLUTION);
    });
    it('moves the interior elements further than the boundary element', () => {
        const boundaryDisplacement = p[1].x - 1;
        expect(p[2].x - 2).toBeGreaterThan(boundaryDisplacement);
        expect(p[3].x - 3).toBeGreaterThan(boundaryDisplacement);
    });
    it('gives the unfrozen elements the full requested displacement', () => {
        expect(p[2].x).toBeCloseTo(7, 9);
        expect(p[3].x).toBeCloseTo(8, 9);
        expect(result.appliedFraction).toBeCloseTo(1, 9);
    });
    it('leaves the unselected neighbour where it was', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
    });
    it('names the boundary element as the only frozen one', () => {
        expect(result.frozenElementIndices).toEqual([1]);
    });
    it('ends on a globally valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
});

describe('saturate translate boundary race', () => {
    // Both neighbours constrain, with different slack: link (0,1) may reach 2
    // (perpendicular travel sqrt(3)), link (3,4) may reach 5 (travel sqrt(24)).
    const chain = horizontalChain(5);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
    chain.constraints[3] = { distanceToNext: { min: 0, max: 5 } };
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('freezes the tighter boundary element first', () => {
        expect(p[1].y).toBeLessThanOrEqual(Math.sqrt(3) + 1e-6);
        expect(p[1].y).toBeGreaterThan(Math.sqrt(3) - 10 * CLAMP_RESOLUTION);
    });
    it('keeps the slacker boundary element moving until its own bound', () => {
        expect(p[3].y).toBeGreaterThan(p[1].y);
        expect(p[3].y).toBeLessThanOrEqual(Math.sqrt(24) + 1e-6);
        expect(p[3].y).toBeGreaterThan(Math.sqrt(24) - 10 * CLAMP_RESOLUTION);
    });
    it('lets the unbounded interior element absorb the whole vector', () => {
        expect(p[2].y).toBeCloseTo(10, 9);
        expect(result.appliedFraction).toBeCloseTo(1, 9);
    });
    it('never moves the unselected neighbours', () => {
        expect(p[0]).toEqual({ x: 0, y: 0 });
        expect(p[4]).toEqual({ x: 4, y: 0 });
    });
    it('reports both boundary elements, tighter one first', () => {
        expect(result.frozenElementIndices).toEqual([1, 3]);
    });
    it('ends on a globally valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
});

describe('saturate translate full saturation discards the remainder', () => {
    // Every link capped at 2, so perpendicular travel per element is sqrt(3):
    // elements 1 and 3 freeze together, then element 2 freezes on both links.
    const chain = horizontalChain(5);
    [1, 2, 3, 4].forEach((i) => {
        chain.constraints[i] = { distanceToPrev: { min: 0, max: 2 } };
    });
    const result = solveArticulation(input(chain));
    const p = result.elements;

    it('reports less than the whole delta absorbed', () => {
        expect(result.appliedFraction).toBeLessThan(1);
        expect(result.appliedFraction).toBeGreaterThan(0);
    });
    it('equals consumed over requested distance', () => {
        // Element 2 stayed active throughout, so its displacement is exactly
        // the consumed distance.
        expect(result.appliedFraction).toBeCloseTo(p[2].y / 10, 9);
        expect(p[2].y).toBeLessThanOrEqual(2 * Math.sqrt(3) + 1e-6);
        expect(p[2].y).toBeGreaterThan(2 * Math.sqrt(3) - 20 * CLAMP_RESOLUTION);
    });
    it('leaves every link within its bound', () => {
        [0, 1, 2, 3].forEach((i) => expect(distV(p[i], p[i + 1])).toBeLessThanOrEqual(2 + 1e-6));
    });
    it('names every selected element once, in freeze order', () => {
        // Elements 1 and 3 freeze in the same step, lower boundary first; element
        // 2 is then named by both of its boundary pairs but reported once.
        expect(result.frozenElementIndices).toEqual([1, 3, 2]);
    });
    it('ends on a globally valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(p, chain.constraints)).toBe(true);
    });
});

describe('saturate translate of the whole chain', () => {
    it('is free regardless of constraints, and stays valid', () => {
        const chain = horizontalChain(4);
        [1, 2, 3].forEach((i) => {
            chain.constraints[i] = { distanceToPrev: { min: 0.9, max: 1.1 }, jointAngle: { min: 0, max: 0 } };
        });
        const result = solveArticulation(input(chain, { selection: [0, 1, 2, 3] }));
        expect(result.appliedFraction).toBe(1);
        result.elements.forEach((point, i) => expect(point).toEqual({ x: i, y: 10 }));
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('saturate translate of a single element between constrained neighbours', () => {
    const chain = horizontalChain(3);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 }, distanceToNext: { min: 0, max: 2 } };
    const result = solveArticulation(input(chain, { selection: [1] }));

    it('names the single element once, though both of its links bind', () => {
        expect(result.frozenElementIndices).toEqual([1]);
    });
    it('stops at the tighter of the two links', () => {
        expect(result.elements[1].y).toBeLessThanOrEqual(Math.sqrt(3) + 1e-6);
        expect(result.elements[1].y).toBeGreaterThan(Math.sqrt(3) - 10 * CLAMP_RESOLUTION);
    });
    it('reports the stopped fraction, remainder discarded', () => {
        const stoppedFraction = Math.sqrt(3) / 10;
        expect(result.appliedFraction).toBeLessThanOrEqual(stoppedFraction + 1e-9);
        expect(result.appliedFraction).toBeGreaterThan(stoppedFraction - CLAMP_RESOLUTION);
    });
    it('does not move the neighbours', () => {
        expect(result.elements[0]).toEqual({ x: 0, y: 0 });
        expect(result.elements[2]).toEqual({ x: 2, y: 0 });
    });
    it('ends on a globally valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('saturate translate against a min-distance bound in the travel direction', () => {
    // Link (1,2) shortens to nothing and lengthens again as element 1 travels
    // +x, so the bound is satisfied at the full vector yet violated in between.
    // A per-pair minimum would step through that dip; the conjunction clamp
    // must stop in front of it.
    const chain = horizontalChain(3);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 1.2 } };
    chain.constraints[2] = { distanceToPrev: { min: 0.9, max: 3 } };
    const result = solveArticulation(input(chain, {
        selection: [1],
        delta: { kind: 'translate', vector: { x: 2, y: 0 } },
    }));

    it('starts from a valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
    });
    it('stops in front of the forbidden dip instead of tunnelling into it', () => {
        expect(distV(result.elements[1], result.elements[2])).toBeGreaterThanOrEqual(0.9 - 1e-6);
        expect(result.elements[1].x).toBeLessThan(1.2);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('saturate translate reaches a valid island beyond a min-distance dip', () => {
    // Element 1 (at x = 1) is dragged +x by 2 between fixed neighbours at x = 0
    // and x = 2. Link (0,1) may reach 2.5, so travel is capped at 1.5; link
    // (1,2) must stay at least 0.3, which forbids travel in (0.7, 1.3). The
    // valid set in step fraction is therefore [0, 0.35] u [0.65, 0.75]: an
    // island past a dip, with the full delta itself invalid.
    const DIP_NEAR_EDGE_FRACTION = 0.35;
    const ISLAND_TOP_FRACTION = 0.75;
    const chain = horizontalChain(3);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2.5 } };
    chain.constraints[2] = { distanceToPrev: { min: 0.3, max: 3 } };
    const result = solveArticulation(input(chain, {
        selection: [1],
        delta: { kind: 'translate', vector: { x: 2, y: 0 } },
    }));

    it('starts from a valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
    });
    it('applies more than the fraction in front of the dip', () => {
        // A plain depth-8 bisection of [0, 1] samples 0.5 (inside the dip),
        // then converges below 0.35; the coarse scan finds the island instead.
        expect(result.appliedFraction).toBeGreaterThan(DIP_NEAR_EDGE_FRACTION);
        expect(result.appliedFraction).toBeLessThanOrEqual(ISLAND_TOP_FRACTION);
        expect(result.appliedFraction).toBeGreaterThan(ISLAND_TOP_FRACTION - CLAMP_RESOLUTION);
    });
    it('tunnels the dragged element past its neighbour', () => {
        expect(result.elements[1].x).toBeGreaterThan(chain.elements[2].x);
    });
    it('ends on a globally valid pose', () => {
        expect(distV(result.elements[0], result.elements[1])).toBeLessThanOrEqual(2.5 + 1e-6);
        expect(distV(result.elements[1], result.elements[2])).toBeGreaterThanOrEqual(0.3 - 1e-6);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('saturate translate when a freeze would strand a later boundary in its dip', () => {
    // Link (0,1) clamps element 1 at t = 5/6, by which point dist(3,4) has
    // shrunk below its own minimum even though it recovers by t = 1.
    const chain = horizontalChain(5);
    chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
    chain.constraints[4] = { distanceToPrev: { min: 0.05, max: 2 } };
    const result = solveArticulation(input(chain, { delta: { kind: 'translate', vector: { x: 1.2, y: 0 } } }));

    it('ends on a globally valid pose', () => {
        expect(isPoseValid(chain.elements, chain.constraints)).toBe(true);
        expect(isPoseValid(result.elements, chain.constraints)).toBe(true);
    });
});

describe('saturate translate from an already-violated boundary', () => {
    function violatedBoundaryChain(): ArticulationChain {
        const chain = horizontalChain(4);
        chain.constraints[1] = { distanceToPrev: { min: 0, max: 0.5 } }; // link (0,1) is 1 long
        return chain;
    }

    it('holds the violated side still when the drag would stretch the link further', () => {
        const DRAG_DISTANCE = 5;
        const chain = violatedBoundaryChain();
        const result = solveArticulation(input(chain, {
            selection: [1, 2],
            delta: { kind: 'translate', vector: { x: 0, y: DRAG_DISTANCE } },
        }));
        expect(distV(result.elements[1], chain.elements[1]))
            .toBeLessThanOrEqual(DRAG_DISTANCE * CLAMP_RESOLUTION);
        expect(result.elements[2].y).toBeCloseTo(DRAG_DISTANCE, 9);
    });

    it('moves the violated side when the drag shortens the link toward its bound', () => {
        const chain = violatedBoundaryChain();
        const startingViolation = linkDistanceViolation(chain.elements, chain.constraints, 0);
        const result = solveArticulation(input(chain, {
            selection: [1, 2],
            delta: { kind: 'translate', vector: { x: -0.4, y: 0 } },
        }));
        expect(result.appliedFraction).toBeCloseTo(1, 9);
        expect(result.elements[1].x).toBeCloseTo(0.6, 9);
        expect(result.elements[2].x).toBeCloseTo(1.6, 9);
        expect(startingViolation).toBeCloseTo(0.5, 9);
        expect(linkDistanceViolation(result.elements, chain.constraints, 0)).toBeCloseTo(0.1, 9);
    });
});

describe('saturate translate ignores the pivot', () => {
    it('produces identical results for every pivot index', () => {
        const results = [0, 2, 4].map((pivotIndex) => {
            const chain = horizontalChain(5);
            chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
            chain.constraints[3] = { distanceToNext: { min: 0, max: 5 } };
            return solveArticulation(input(chain, { pivotIndex }));
        });
        results.slice(1).forEach((result) => {
            expect(result.elements).toEqual(results[0].elements);
            expect(result.appliedFraction).toBe(results[0].appliedFraction);
        });
    });
});

describe('saturate translate versus rigid translate', () => {
    function clampedChain(): ArticulationChain {
        const chain = horizontalChain(4);
        chain.constraints[1] = { distanceToPrev: { min: 0, max: 2 } };
        return chain;
    }
    const delta = { kind: 'translate', vector: { x: 5, y: 0 } } as const;
    const rigid = solveArticulation(input(clampedChain(), { strategyId: 'rigid', delta }));
    const saturate = solveArticulation(input(clampedChain(), { delta }));

    it('rigid clamps the whole group where saturate spills', () => {
        expect(rigid.appliedFraction).toBeLessThan(0.25);
        expect(saturate.appliedFraction).toBeGreaterThan(rigid.appliedFraction);
    });
    it('agrees on the boundary element but not on the interior ones', () => {
        expect(saturate.elements[1].x).toBeCloseTo(rigid.elements[1].x, 9);
        expect(saturate.elements[3].x).toBeGreaterThan(rigid.elements[3].x + 3);
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
            // Wide window with a real minimum: the non-monotone case.
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

/** The frozen report is only meaningful if it names distinct selected elements. */
function frozenReportProblem(frozenElementIndices: number[], selection: number[]): string | null {
    const selected = new Set(selection);
    const alreadyReported = new Set<number>();
    for (const index of frozenElementIndices) {
        if (!selected.has(index)) return `frozen element ${index} is not in the selection`;
        if (alreadyReported.has(index)) return `frozen element ${index} is reported twice`;
        alreadyReported.add(index);
    }
    return null;
}

describe('saturate translate fuzz (fixed seeds)', () => {
    const TRIALS_PER_SEED = 120;
    for (const seed of [1, 42, 1337, 99991]) {
        it(`seed ${seed}: a valid input pose always yields a valid output pose`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let validInputs = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const chain = randomChain(random);
                const selection = randomContiguousSelection(random, chain.elements.length);
                const heading = random() * Math.PI * 2;
                const magnitude = 0.2 + random() * 12;
                if (!isPoseValid(chain.elements, chain.constraints)) continue;
                validInputs++;
                const result = solveArticulation({
                    chain,
                    selection,
                    pivotIndex: 0,
                    strategyId: 'saturate',
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
                const frozenProblem = frozenReportProblem(result.frozenElementIndices, selection);
                if (frozenProblem) failures.push(`trial ${trial}: ${frozenProblem}`);
                if (result.appliedStrategyId !== 'saturate') {
                    failures.push(`trial ${trial}: appliedStrategyId ${result.appliedStrategyId}`);
                }
                if (failures.length > 2) break;
            }
            expect(validInputs).toBeGreaterThan(TRIALS_PER_SEED / 2);
            expect(failures).toEqual([]);
        });
    }
});

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

describe('saturate translate fuzz from invalid starting poses (fixed seeds)', () => {
    const TRIALS_PER_SEED = 120;
    for (const seed of [7, 20260803]) {
        it(`seed ${seed}: no constraint ends more violated than it began`, () => {
            const random = seededRandom(seed);
            const failures: string[] = [];
            let invalidInputs = 0;
            for (let trial = 0; trial < TRIALS_PER_SEED; trial++) {
                const chain = withOneElementDisplaced(randomChain(random), random);
                const selection = randomContiguousSelection(random, chain.elements.length);
                const heading = random() * Math.PI * 2;
                const magnitude = 0.2 + random() * 12;
                if (isPoseValid(chain.elements, chain.constraints)) continue;
                invalidInputs++;
                const startingViolations = everyViolation(chain.elements, chain.constraints);
                const result = solveArticulation({
                    chain,
                    selection,
                    pivotIndex: 0,
                    strategyId: 'saturate',
                    delta: {
                        kind: 'translate',
                        vector: { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude },
                    },
                });
                const endingViolations = everyViolation(result.elements, chain.constraints);
                // The cascade rebases per iteration and each accepted step may add up
                // to epsilon, so the structural growth bound is one epsilon per
                // element, not one per solve.
                const violationGrowthBudget = chain.elements.length * ARTICULATION_EPSILON;
                endingViolations.forEach((violation, position) => {
                    if (violation > startingViolations[position] + violationGrowthBudget) {
                        failures.push(`trial ${trial}: violation ${position} rose `
                            + `${startingViolations[position]} -> ${violation} `
                            + `${JSON.stringify({ chain, selection, result })}`);
                    }
                });
                if (!(result.appliedFraction >= 0 && result.appliedFraction <= 1 + 1e-9)) {
                    failures.push(`trial ${trial}: appliedFraction ${result.appliedFraction}`);
                }
                const frozenProblem = frozenReportProblem(result.frozenElementIndices, selection);
                if (frozenProblem) failures.push(`trial ${trial}: ${frozenProblem}`);
                if (result.appliedStrategyId !== 'saturate') {
                    failures.push(`trial ${trial}: appliedStrategyId ${result.appliedStrategyId}`);
                }
                if (failures.length > 2) break;
            }
            expect(invalidInputs).toBeGreaterThan(TRIALS_PER_SEED / 4);
            expect(failures).toEqual([]);
        });
    }
});
