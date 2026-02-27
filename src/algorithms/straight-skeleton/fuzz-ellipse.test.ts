import {AlgorithmStepInput, Vector2} from '@/algorithms/straight-skeleton/types';
import {NamedTestPolygon} from './test-cases';
import {
    TRIANGLE, SQUARE, DEFAULT_PENTAGON,
    AWKWARD_HEXAGON, AWKWARD_HEPTAGON,
    IMPOSSIBLE_OCTAGON, CRAZY_POLYGON,
} from './test-cases/test-constants';
import {LONG_OCTAGON} from './test-cases/long-octagon';
import {WACKY_OCTAGON} from './test-cases/more-edge-cases';
import {CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS} from './test-cases/isthmus-failure';
import {SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP} from './test-cases/double-reflex-spaceship';
import {StepAlgorithm} from './algorithm-termination-cases';
import {makeStraightSkeletonSolverContext} from './solver-context';
import {initInteriorEdges, tryToAcceptExteriorEdge} from './algorithm-helpers';
import {
    addVectors,
    subtractVectors,
    scaleVector,
    sizeOfVector,
} from './core-functions';

const PER_RUN_TIMEOUT_MS = 2_000;

/** Geometrically distinct subset — one representative per shape category. */
const FUZZ_POLYGONS: NamedTestPolygon[] = [
    // Convex
    {name: 'Triangle', vertices: TRIANGLE},
    {name: 'Square', vertices: SQUARE},
    {name: 'Default Pentagon', vertices: DEFAULT_PENTAGON},
    // Simple reflex
    {name: 'Awkward Hexagon', vertices: AWKWARD_HEXAGON},
    {name: 'Awkward Heptagon', vertices: AWKWARD_HEPTAGON},
    // Complex reflex
    {name: 'Impossible Octagon', vertices: IMPOSSIBLE_OCTAGON},
    {name: 'Crazy Polygon', vertices: CRAZY_POLYGON},
    // Near-degenerate
    {name: 'Long Octagon', vertices: LONG_OCTAGON},
    {name: 'Wacky Octagon', vertices: WACKY_OCTAGON},
    // Isthmus / split
    {name: 'Convergence Towards Isthmus', vertices: CONVERGENCE_TOWARDS_ISTHMUS_SUCCEEDS},
    // Reflex spaceship
    {name: 'Double Reflex Spaceship', vertices: SUCCESS_CASE_DOUBLE_REFLEX_SPACESHIP},
];

class AlgorithmTimeoutError extends Error {
    constructor(ms: number) {
        super(`Timed out after ${ms}ms (algorithm hung)`);
    }
}

/**
 * Equivalent to runAlgorithmV5 but checks a deadline between each iteration
 * of the main loop, throwing AlgorithmTimeoutError if exceeded.
 */
function runAlgorithmV5WithDeadline(nodes: Vector2[], deadlineMs: number) {
    if (nodes.length < 3) {
        throw new Error("Must have at least three nodes to perform algorithm");
    }
    const context = makeStraightSkeletonSolverContext(nodes);
    const exteriorEdges = [...context.graph.edges];

    initInteriorEdges(context);

    let inputs: AlgorithmStepInput[] = [{interiorEdges: context.graph.interiorEdges.map(e => e.id)}];
    const deadline = Date.now() + deadlineMs;

    while (inputs.length > 0) {
        if (Date.now() > deadline) {
            throw new AlgorithmTimeoutError(deadlineMs);
        }
        inputs = StepAlgorithm(context, inputs).childSteps;
        exteriorEdges.forEach(e => tryToAcceptExteriorEdge(context, e.id));
    }

    return context;
}

interface FuzzFailure {
    polygonName: string;
    vertexIndex: number;
    originalPosition: Vector2;
    movedPosition: Vector2;
    failureReason: string;
}

interface EllipseParams {
    center: Vector2;
    semiMajor: number;
    semiMinor: number;
    rotation: number;
}

/**
 * Reflects point V across the perpendicular bisector of segment AB.
 * This swaps V's distances to A and B: |reflected(V)→A| = |V→B| and vice versa.
 */
function reflectInPerpendicularBisector(V: Vector2, A: Vector2, B: Vector2): Vector2 {
    const M = scaleVector(addVectors(A, B), 0.5);
    const d = subtractVectors(B, A);
    const VM = subtractVectors(V, M);
    const dLenSq = d.x * d.x + d.y * d.y;
    if (dLenSq < 1e-12) return V;
    const proj = (VM.x * d.x + VM.y * d.y) / dLenSq;
    return {
        x: V.x - 2 * proj * d.x,
        y: V.y - 2 * proj * d.y,
    };
}

/**
 * Computes an ellipse for vertex i such that:
 * - Focus F1 = V (the vertex itself)
 * - Focus F2 = reflection of V in the perpendicular bisector of the segment joining its two neighbours
 * - Both neighbours lie on the ellipse circumference
 */
function computeEllipseForVertex(vertices: Vector2[], i: number): EllipseParams | null {
    const n = vertices.length;
    const V = vertices[i];
    const A = vertices[(i - 1 + n) % n];
    const B = vertices[(i + 1) % n];

    const F1 = V;
    const F2 = reflectInPerpendicularBisector(V, A, B);

    const distAV = sizeOfVector(subtractVectors(A, V));
    const distBV = sizeOfVector(subtractVectors(B, V));
    const a = (distAV + distBV) / 2;

    const focalVec = subtractVectors(F2, F1);
    const c = sizeOfVector(focalVec) / 2;

    if (c >= a - 1e-9) return null;

    const b = Math.sqrt(a * a - c * c);
    if (b < 1e-6) return null;

    const center = scaleVector(addVectors(F1, F2), 0.5);
    const rotation = Math.atan2(focalVec.y, focalVec.x);

    return {center, semiMajor: a, semiMinor: b, rotation};
}

/**
 * Generates grid points inside the ellipse.
 * Points are placed at cell centres in normalised [-1,1]² then filtered by u²+v² ≤ 1.
 */
function generateGridPointsInEllipse(ellipse: EllipseParams, gridSize: number = 5): Vector2[] {
    const {center, semiMajor: a, semiMinor: b, rotation} = ellipse;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const points: Vector2[] = [];

    for (let xi = 0; xi < gridSize; xi++) {
        for (let yi = 0; yi < gridSize; yi++) {
            const u = -1 + (2 * (xi + 0.5)) / gridSize;
            const v = -1 + (2 * (yi + 0.5)) / gridSize;

            if (u * u + v * v > 1) continue;

            const localX = u * a;
            const localY = v * b;

            points.push({
                x: center.x + localX * cosR - localY * sinR,
                y: center.y + localX * sinR + localY * cosR,
            });
        }
    }

    return points;
}

/**
 * Runs the algorithm on the given vertices and checks regression criteria.
 * Returns null on success, or a failure reason string.
 *
 * Uses runAlgorithmV5WithDeadline so that a hung algorithm is caught by
 * a Date.now() check between loop iterations rather than blocking forever.
 */
function checkAlgorithmResult(vertices: Vector2[]): string | null {
    let ctx;
    try {
        ctx = runAlgorithmV5WithDeadline(vertices, PER_RUN_TIMEOUT_MS);
    } catch (e) {
        if (e instanceof AlgorithmTimeoutError) {
            return e.message;
        }
        return `Threw: ${e instanceof Error ? e.message : String(e)}`;
    }

    const {graph} = ctx;

    for (let i = 0; i < graph.numExteriorNodes; i++) {
        if (!ctx.acceptedEdges[i]) {
            return `Exterior edge ${i} not accepted`;
        }
    }

    if (graph.edges.length !== graph.numExteriorNodes + graph.interiorEdges.length) {
        return `Edge count invariant: ${graph.edges.length} !== ${graph.numExteriorNodes} + ${graph.interiorEdges.length}`;
    }

    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    for (const node of graph.nodes.slice(graph.numExteriorNodes)) {
        if (node.position.x < minX - 1 || node.position.x > maxX + 1 ||
            node.position.y < minY - 1 || node.position.y > maxY + 1) {
            return `Interior node outside bounding box at (${node.position.x.toFixed(4)}, ${node.position.y.toFixed(4)})`;
        }
    }

    return null;
}

describe('Ellipse fuzz test', () => {
    jest.setTimeout(10_000);

    const GRID_SIZE = 3;

    it.each(FUZZ_POLYGONS)(
        '$name: perturb each vertex within its ellipse',
        ({name, vertices}) => {
            const polygonFailures: FuzzFailure[] = [];

            for (let i = 0; i < vertices.length; i++) {
                const ellipse = computeEllipseForVertex(vertices, i);
                if (ellipse === null) continue;

                const perturbedPoints = generateGridPointsInEllipse(ellipse, GRID_SIZE);

                for (const point of perturbedPoints) {
                    const modified = vertices.map(v => ({...v}));
                    modified[i] = {x: point.x, y: point.y};

                    const failureReason = checkAlgorithmResult(modified);
                    if (failureReason !== null) {
                        polygonFailures.push({
                            polygonName: name,
                            vertexIndex: i,
                            originalPosition: {...vertices[i]},
                            movedPosition: {x: point.x, y: point.y},
                            failureReason,
                        });
                    }
                }
            }

            expect(polygonFailures).toEqual([]);
        }
    );
});
