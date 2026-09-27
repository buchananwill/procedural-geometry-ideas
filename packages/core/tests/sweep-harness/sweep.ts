// The full-grid sweep harness (journal-5 F83): 642 root cells + the census-grid regions, per-cell signatures. See README.md.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {
    FULL_CORPUS,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_CIRCLE_48,
    NEAR_REGULAR_ROSETTE5_40,
} from '@proc-geo/test-fixtures';
import {
    buildSkeletonTree,
    computeMaxOffset,
    computeOffsetRings,
    computeStrips,
    denormaliseLength,
    flattenRecursiveTree,
    makeSkeletonNormalisation,
    normaliseLength,
    setSkeletonLogLevel,
    SkeletonSolveResult,
    solveSkeleton,
    SolveSkeletonOptions,
    Strip,
    subdivideRecursively,
    uniformLevelSpecs,
    Vector2,
} from '@proc-geo/core';
import {isClockwise} from '@proc-geo/core/random-polygon/geometry-helpers';
import {clockwise, JITTER_DOUBLE_REFLEX_PLUS, JITTER_K, JITTER_REFLEX_L, JITTER_SEEDS, jitteredSamples} from '../straight-skeleton/jitter-helpers';
import {place} from '../straight-skeleton/placement-helpers';
import {oracleCausalityCounts, rateViolations} from '../straight-skeleton/wavefront-measurement-helpers';

setSkeletonLogLevel('silent');

export interface Cell {
    name: string;
    group: string;
    vertices: Vector2[];
    options?: SolveSkeletonOptions;
}

function regularPolygon(n: number): Vector2[] {
    const vertices: Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        vertices.push({x: 300 + 150 * Math.cos(theta), y: 300 + 150 * Math.sin(theta)});
    }
    return isClockwise(vertices) ? vertices : vertices.reverse();
}

function jitterCell(vertices: Vector2[], multiple: number, seed: number): Vector2[] {
    const span = Math.max(
        Math.max(...vertices.map(v => v.x)) - Math.min(...vertices.map(v => v.x)),
        Math.max(...vertices.map(v => v.y)) - Math.min(...vertices.map(v => v.y)),
    );
    const amplitude = multiple * 1e-8 * span;
    let state = seed >>> 0;
    const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
    return vertices.map(vertex => ({
        x: vertex.x + (random() * 2 - 1) * amplitude,
        y: vertex.y + (random() * 2 - 1) * amplitude,
    }));
}

export const FINE_TRANSLATIONS: number[] = [];
for (const decade of [1e8, 1e9, 1e10, 1e11, 1e12]) {
    for (let multiple = 1; multiple <= 9; multiple++) {
        FINE_TRANSLATIONS.push(multiple * decade);
    }
}
FINE_TRANSLATIONS.push(1e13);

export function allCells(): Cell[] {
    const cells: Cell[] = [];
    for (const floor of [1e-6, 1e-5]) {
        for (const fixture of FULL_CORPUS) {
            cells.push({name: `corpus@${floor}:${fixture.name}`, group: 'corpus', vertices: fixture.vertices, options: {perceptualFloor: floor}});
        }
    }
    for (const [label, fixture] of [['circle48', NEAR_REGULAR_CIRCLE_48], ['rosette40', NEAR_REGULAR_ROSETTE5_40]] as const) {
        for (const t of FINE_TRANSLATIONS) {
            cells.push({name: `fine:${label}@${t}`, group: 'fine', vertices: place(fixture, 1, t)});
        }
    }
    for (const [label, polygon] of [['L', JITTER_REFLEX_L], ['plus', JITTER_DOUBLE_REFLEX_PLUS]] as const) {
        for (const k of JITTER_K) {
            for (const seed of JITTER_SEEDS) {
                cells.push({name: `offedge:${label}:k${k}:s${seed}`, group: 'offedge', vertices: jitteredSamples(clockwise(polygon), k, seed, 1e-3, true)});
                cells.push({name: `alongedge:${label}:k${k}:s${seed}`, group: 'alongedge', vertices: jitteredSamples(clockwise(polygon), k, seed, 1.0, false), options: {noiseFloor: 0}});
            }
        }
    }
    for (const multiple of [1, 3, 10, 15, 30, 100]) {
        for (let seed = 0; seed < 8; seed++) {
            cells.push({name: `ladder:${multiple}x:s${seed}`, group: 'ladder', vertices: jitterCell(NEAR_REGULAR_CIRCLE_32, multiple, seed)});
        }
    }
    for (let n = 3; n <= 64; n++) {
        cells.push({name: `regular:${n}`, group: 'regular', vertices: regularPolygon(n)});
    }
    return cells;
}

function serialise(result: SkeletonSolveResult): string {
    const g = result.graph;
    const parts: string[] = [result.complete ? '1' : '0'];
    for (const node of g.nodes) parts.push(`n${node.id}:${node.position.x}:${node.position.y}`);
    for (const edge of g.edges) parts.push(`e${edge.id}:${edge.source}:${edge.target ?? -1}:${edge.basisVector.x}:${edge.basisVector.y}`);
    for (const ie of g.interiorEdges) parts.push(`i${ie.id}:${ie.clockwiseExteriorEdgeIndex}:${ie.widdershinsExteriorEdgeIndex}:${ie.maxOffset}:${ie.culled ? 1 : 0}`);
    if (result.context) parts.push(result.context.acceptedEdges.map(f => (f ? 1 : 0)).join(''));
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

let ORIGIN: Vector2 = {x: 0, y: 0};

function ringArea(ring: Vector2[]): number {
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = {x: ring[i].x - ORIGIN.x, y: ring[i].y - ORIGIN.y};
        const next = ring[(i + 1) % ring.length];
        const b = {x: next.x - ORIGIN.x, y: next.y - ORIGIN.y};
        total += a.x * b.y - b.x * a.y;
    }
    return total / 2;
}

function stripArea(strip: Strip): number {
    return strip.holes.reduce((area, hole) => area - Math.abs(ringArea(hole)), Math.abs(ringArea(strip.boundary)));
}

export function tiling(result: SkeletonSolveResult): (number | string)[] {
    const g = result.graph;
    const solved = g.nodes.slice(0, g.numExteriorNodes).map(n => n.position);
    ORIGIN = solved[0];
    const solvedArea = Math.abs(ringArea(solved));
    let maxOffset: number;
    try {
        maxOffset = computeMaxOffset(result);
    } catch (e) {
        return [`throw:${(e as Error).message.slice(0, 40)}`];
    }
    return [0.2, 0.5, 1.0].map(fraction => {
        try {
            const depth = maxOffset * fraction;
            const covered = computeStrips(result, {depth}).reduce((t, s) => t + stripArea(s), 0)
                + computeOffsetRings(result, depth).reduce((t, r) => t + Math.abs(ringArea(r)), 0);
            return Math.abs(covered - solvedArea) / solvedArea;
        } catch (e) {
            return `throw:${(e as Error).message.slice(0, 40)}`;
        }
    });
}

export interface CellRecord {
    complete: boolean;
    nodes: number;
    edges?: number;
    digest: string;
    kinds: Record<string, number>;
    oracles: Record<string, number>;
    testOracles?: Record<string, number>;
    isTree?: boolean;
    tiling?: (number | string)[];
    guards?: Record<string, number>;
    stepFailures?: string[];
}

export function measureSolve(vertices: Vector2[], options: SolveSkeletonOptions | undefined): CellRecord {
    let result: SkeletonSolveResult;
    const probe: string[] = [];
    (globalThis as any).__c176 = probe;
    try {
        result = solveSkeleton(vertices, options);
    } catch (e) {
        return {complete: false, nodes: -1, digest: `throw:${(e as Error).message.slice(0, 60)}`, kinds: {}, oracles: {}};
    } finally {
        (globalThis as any).__c176 = undefined;
    }
    const guards: Record<string, number> = {};
    for (const tag of probe) guards[tag] = (guards[tag] ?? 0) + 1;
    const stepFailures = result.diagnostics.filter(d => d.kind === 'step-failure').map(d => d.detail.slice(0, 200));
    const kinds: Record<string, number> = {};
    const oracles: Record<string, number> = {offset: 0, clearance: 0, direction: 0, rate: 0};
    for (const d of result.diagnostics) {
        kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
        if (d.kind === 'causality-violation') oracles[d.oracle] += 1;
    }
    const floor = options?.perceptualFloor ?? 1e-6;
    const test = oracleCausalityCounts(result, floor);
    const testOracles = {...test, rate: rateViolations(result.graph, floor).length};
    const record: CellRecord = {
        complete: result.complete, nodes: result.graph.nodes.length, edges: result.graph.edges.length,
        digest: serialise(result), kinds, oracles, testOracles, guards, stepFailures,
    };
    if (result.complete) {
        try {
            record.isTree = buildSkeletonTree(result).isTree;
        } catch (e) {
            record.isTree = undefined;
        }
        record.tiling = tiling(result);
    } else {
        record.tiling = ['incomplete'];
    }
    return record;
}

export function runSweep(outPath: string, group: string): void {
    const out: Record<string, CellRecord> = {};
    for (const cell of allCells()) {
        if (cell.group !== group) continue;
        out[cell.name] = measureSolve(cell.vertices, cell.options);
    }
    writeFileSync(outPath, JSON.stringify(out, null, 1));
}

interface RegionRecord {
    outcome: string;
    level: number;
    failure?: string;
    solve?: CellRecord;
}

export function runRegions(outPath: string, depthFraction: number, tag: string): void {
    const regions: Record<string, RegionRecord> = {};
    const census: Record<string, number> = {};
    for (const fixture of FULL_CORPUS) {
        for (const mergeGroupSize of [1, 2, 3, 4]) {
            const levels = uniformLevelSpecs({levels: 3, mergeGroupSize, depthFraction, residue: 'recurse'});
            const root = subdivideRecursively(fixture.vertices, {levels});
            const rootFloor = denormaliseLength(makeSkeletonNormalisation(fixture.vertices), 1e-6);
            for (const node of flattenRecursiveTree(root)) {
                const key = `${fixture.name}|${tag}|m${mergeGroupSize}|${node.id}`;
                const record: RegionRecord = {outcome: node.outcome.kind, level: node.level};
                if (node.outcome.kind !== 'solved') {
                    record.failure = node.outcome.failure.slice(0, 160);
                    census[fixture.name] = (census[fixture.name] ?? 0) + 1;
                } else if (node.level > 0) {
                    const noiseFloor = normaliseLength(makeSkeletonNormalisation(node.boundary), rootFloor);
                    record.solve = measureSolve(node.boundary, {noiseFloor, perceptualFloor: 1e-6});
                }
                regions[key] = record;
            }
        }
    }
    writeFileSync(outPath, JSON.stringify({census, regions}, null, 1));
}
