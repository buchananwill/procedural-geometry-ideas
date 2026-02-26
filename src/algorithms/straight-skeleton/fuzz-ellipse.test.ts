import {Vector2} from '@/algorithms/straight-skeleton/types';
import {ALL_TEST_POLYGONS} from './test-cases';
import {runAlgorithmV5} from './algorithm-termination-cases';
import {
    addVectors,
    subtractVectors,
    scaleVector,
    sizeOfVector,
} from './core-functions';

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
 * Generates ~20 points on a 5×5 grid inside the ellipse.
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
 * Runs the algorithm on the given vertices and checks all four regression criteria.
 * Returns null on success, or a failure reason string.
 */
function checkAlgorithmResult(vertices: Vector2[]): string | null {
    let ctx;
    try {
        ctx = runAlgorithmV5(vertices);
    } catch (e) {
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
    jest.setTimeout(120_000);

    const GRID_SIZE = 5;
    const allFailures: FuzzFailure[] = [];

    it.each(ALL_TEST_POLYGONS)(
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

            allFailures.push(...polygonFailures);

            if (polygonFailures.length > 0) {
                console.log(`\n[${name}] ${polygonFailures.length} failures:`);
                for (const f of polygonFailures) {
                    console.log(
                        `  vertex ${f.vertexIndex}: ` +
                        `(${f.originalPosition.x.toFixed(4)}, ${f.originalPosition.y.toFixed(4)}) -> ` +
                        `(${f.movedPosition.x.toFixed(4)}, ${f.movedPosition.y.toFixed(4)}): ` +
                        f.failureReason
                    );
                }
            }
        }
    );

    afterAll(() => {
        console.log('\n========================================');
        console.log(`FUZZ TEST SUMMARY: ${allFailures.length} total failures`);
        console.log('========================================');
        if (allFailures.length > 0) {
            const grouped = new Map<string, FuzzFailure[]>();
            for (const f of allFailures) {
                const list = grouped.get(f.polygonName) ?? [];
                list.push(f);
                grouped.set(f.polygonName, list);
            }
            for (const [name, failures] of grouped) {
                console.log(`  ${name}: ${failures.length} failures`);
            }
            console.log('\n--- Failure data (JSON) ---');
            console.log(JSON.stringify(allFailures, null, 2));
        }
    });
});
