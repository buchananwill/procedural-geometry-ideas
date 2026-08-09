import {
    GEOMETRY_PAYLOAD_FORMAT,
    GEOMETRY_PAYLOAD_VERSION,
    LEGACY_BARE_ARRAY_CLOSED,
    MAX_SERIALISED_LENGTH,
    makeVertexRun,
    parseGeometryPayload,
    runStrokePipeline,
    serialiseGeometryPayload,
    solveSkeleton,
    strokeToBudgetedPolygon,
    DEFAULT_VERTEX_BUDGET,
} from '@proc-geo/core';
import type {
    GeometryPayload,
    SkeletonSolveResult,
    StrokePipelineConfig,
    StrokePoint,
    Vector2,
} from '@proc-geo/core';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse without letting a throw escape: every hostile-input case asserts on this. */
function parseWithoutThrowing(input: unknown): ReturnType<typeof parseGeometryPayload> {
    let result: ReturnType<typeof parseGeometryPayload> | null = null;
    expect(() => {
        result = parseGeometryPayload(input);
    }).not.toThrow();
    if (result === null) throw new Error('unreachable: parse returned nothing without throwing');
    return result;
}

function ring(count: number, radius: number): Vector2[] {
    const out: Vector2[] = [];
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
    }
    return out;
}

// ── 1. Round-trip fidelity ───────────────────────────────────────────────────

describe('serialise → parse round-trip', () => {
    const cases: [string, GeometryPayload][] = [
        ['empty, open', makeVertexRun([], false)],
        ['empty, closed', makeVertexRun([], true)],
        ['one vertex', makeVertexRun([{ x: 1, y: 2 }], false)],
        ['two vertices, open', makeVertexRun([{ x: 0, y: 0 }, { x: 10, y: 0 }], false)],
        ['two vertices, closed', makeVertexRun([{ x: 0, y: 0 }, { x: 10, y: 0 }], true)],
        ['triangle, closed', makeVertexRun([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }], true)],
        ['triangle vertices, open', makeVertexRun([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }], false)],
        ['fractional and negative', makeVertexRun([{ x: -1.5, y: 0.25 }, { x: 1e-7, y: -2e8 }, { x: 0, y: 0 }], true)],
        ['large ring', makeVertexRun(ring(400, 250), true)],
    ];

    it.each(cases)('%s round-trips exactly', (_name, payload) => {
        const result = parseGeometryPayload(serialiseGeometryPayload(payload));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload).toEqual(payload);
        expect(result.encoding).toBe('versioned');
        expect(result.assumed).toEqual([]);
    });

    it.each(cases)('%s round-trips exactly when pretty-printed', (_name, payload) => {
        const text = serialiseGeometryPayload(payload, { indent: 2 });
        expect(text).toContain('\n');
        const result = parseGeometryPayload(text);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload).toEqual(payload);
    });

    it('is idempotent: serialising a parsed payload reproduces the text', () => {
        const payload = makeVertexRun(ring(12, 100), true);
        const text = serialiseGeometryPayload(payload);
        const parsed = parseGeometryPayload(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(serialiseGeometryPayload(parsed.payload)).toBe(text);
    });

    it('does not alias the caller\'s vertices', () => {
        const source: Vector2[] = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
        const payload = makeVertexRun(source, true);
        source[0].x = 999;
        expect(payload.vertices[0].x).toBe(1);
    });

    it('writes only x and y, so decorated points still round-trip', () => {
        const decorated = [
            { x: 0, y: 0, t: 5, pressure: 0.5 },
            { x: 4, y: 0, t: 6, pressure: 0.5 },
            { x: 2, y: 3, t: 7, pressure: 0.5 },
        ];
        const payload = makeVertexRun(decorated, true);
        const result = parseGeometryPayload(serialiseGeometryPayload(payload));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.vertices).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }]);
        expect(result.payload).toEqual(payload);
    });
});

describe('serialise refuses what it cannot represent', () => {
    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-Infinity', Number.NEGATIVE_INFINITY],
    ])('throws rather than writing null for %s', (_name, bad) => {
        const payload = makeVertexRun([{ x: 0, y: 0 }, { x: bad, y: 1 }, { x: 2, y: 2 }], true);
        expect(() => serialiseGeometryPayload(payload)).toThrow(TypeError);
    });
});

// ── 2. Hostile input: parse is total ─────────────────────────────────────────

describe('parse is total on hostile input', () => {
    const deeplyNestedArrays = '['.repeat(20000) + ']'.repeat(20000);
    const deeplyNestedObjects = '{"a":'.repeat(20000) + '1' + '}'.repeat(20000);

    const cases: [string, unknown][] = [
        ['empty string', ''],
        ['whitespace', '   \n\t '],
        ['null literal', 'null'],
        ['empty object', '{}'],
        ['empty array', '[]'],
        ['array of numbers', '[1,2,3]'],
        ['array of nulls', '[null,null,null]'],
        ['non-numeric x', JSON.stringify([{ x: 'a', y: 1 }])],
        ['NaN x (serialises to null)', JSON.stringify([{ x: Number.NaN }])],
        ['Infinity y', '[{"x":1,"y":1e999},{"x":2,"y":2},{"x":3,"y":3}]'],
        ['truncated JSON', '{"format":"proc-geo/geometry","version":1,'],
        ['bare word', 'not json at all'],
        ['a number', '42'],
        ['a string literal', '"hello"'],
        ['a boolean', 'true'],
        ['HTML', '<html><body>oops</body></html>'],
        ['deeply nested arrays', deeplyNestedArrays],
        ['deeply nested objects', deeplyNestedObjects],
        ['unparsed JS array', [{ x: 'a', y: 1 }]],
        ['unparsed JS object', { format: GEOMETRY_PAYLOAD_FORMAT, version: 1 }],
        ['undefined', undefined],
        ['null', null],
        ['a function', () => 1],
    ];

    it.each(cases)('%s fails without throwing', (_name, input) => {
        const result = parseWithoutThrowing(input);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(typeof result.reason).toBe('string');
        expect(result.detail.length).toBeGreaterThan(0);
    });

    it.each([
        ['', 'not-json'],
        ['null', 'unrecognised-shape'],
        ['{}', 'unrecognised-shape'],
        ['[]', 'unrecognised-shape'],
        ['[1,2,3]', 'malformed-payload'],
        [JSON.stringify([{ x: 'a', y: 1 }]), 'malformed-payload'],
        [JSON.stringify([{ x: Number.NaN }]), 'malformed-payload'],
    ])('reports a specific reason for %j', (input, reason) => {
        const result = parseWithoutThrowing(input);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe(reason);
    });

    it('rejects a 10 MB string on size, before parsing it', () => {
        const huge = 'x'.repeat(10 * 1024 * 1024);
        expect(huge.length).toBeGreaterThan(MAX_SERIALISED_LENGTH);
        const result = parseWithoutThrowing(huge);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('input-too-large');
    });

    it('rejects 10 MB of well-formed vertex JSON on size too', () => {
        const huge = '[' + '{"x":1,"y":1},'.repeat(800_000) + '{"x":1,"y":1}]';
        expect(huge.length).toBeGreaterThan(10 * 1024 * 1024);
        const result = parseWithoutThrowing(huge);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('input-too-large');
    });

    it('accepts a payload that sits just under the size limit', () => {
        const payload = makeVertexRun(ring(2000, 500), true);
        const text = serialiseGeometryPayload(payload);
        expect(text.length).toBeLessThan(MAX_SERIALISED_LENGTH);
        expect(parseGeometryPayload(text).ok).toBe(true);
    });
});

describe('parse rejects near-misses', () => {
    function envelope(overrides: Record<string, unknown>): string {
        return JSON.stringify({
            format: GEOMETRY_PAYLOAD_FORMAT,
            version: GEOMETRY_PAYLOAD_VERSION,
            kind: 'vertex-run',
            closed: true,
            vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
            ...overrides,
        });
    }

    it.each([
        ['wrong format marker', envelope({ format: 'some-other-tool/geometry' }), 'unrecognised-shape'],
        ['missing format marker', JSON.stringify({ version: 1, kind: 'vertex-run', closed: true, vertices: [] }), 'unrecognised-shape'],
        ['non-boolean closed', envelope({ closed: 'yes' }), 'malformed-payload'],
        ['missing closed', envelope({ closed: undefined }), 'malformed-payload'],
        ['vertices not an array', envelope({ vertices: { x: 0, y: 0 } }), 'malformed-payload'],
        ['missing vertices', envelope({ vertices: undefined }), 'malformed-payload'],
        ['a null vertex', envelope({ vertices: [{ x: 0, y: 0 }, null] }), 'malformed-payload'],
        ['a stringly-typed coordinate', envelope({ vertices: [{ x: '0', y: 0 }] }), 'malformed-payload'],
        ['unknown kind', envelope({ kind: 'bezier-run' }), 'unsupported-kind'],
        ['non-string kind', envelope({ kind: 7 }), 'malformed-payload'],
    ])('%s → %s', (_name, text, reason) => {
        const result = parseWithoutThrowing(text);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe(reason);
    });

    it('ignores unknown envelope fields rather than rejecting them', () => {
        const result = parseGeometryPayload(envelope({ source: 'some-future-module', units: 'metres' }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload).toEqual(makeVertexRun([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], true));
    });

    it('ignores unknown vertex fields', () => {
        const result = parseGeometryPayload(envelope({ vertices: [{ x: 3, y: 4, z: 5 }] }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.vertices).toEqual([{ x: 3, y: 4 }]);
    });
});

// ── 3. Version gating ────────────────────────────────────────────────────────

describe('unsupported versions are rejected whole', () => {
    it.each([2, 3, 99, 0, -1])('rejects version %s with a clear reason', (version) => {
        const result = parseWithoutThrowing(
            JSON.stringify({
                format: GEOMETRY_PAYLOAD_FORMAT,
                version,
                kind: 'vertex-run',
                closed: true,
                vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
            }),
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('unsupported-version');
        expect(result.detail).toContain(String(version));
        expect(result.detail).toContain(String(GEOMETRY_PAYLOAD_VERSION));
    });

    it.each([
        ['missing', undefined],
        ['a string', '1'],
        ['fractional', 1.5],
        ['null', null],
    ])('rejects a %s version', (_name, version) => {
        const result = parseWithoutThrowing(
            JSON.stringify({ format: GEOMETRY_PAYLOAD_FORMAT, version, kind: 'vertex-run', closed: true, vertices: [] }),
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('unsupported-version');
    });

    it('checks the version before any body field, so a future payload is never partially read', () => {
        // A version-2 envelope whose body is nonsense by version-1 rules. If the
        // version gate ran after the body checks this would report the body
        // problem, and a version-2 payload with a *valid-looking* body would be
        // read under the wrong rules.
        const result = parseWithoutThrowing(
            JSON.stringify({
                format: GEOMETRY_PAYLOAD_FORMAT,
                version: 2,
                kind: 'ring-set',
                closed: 'sometimes',
                rings: [[{ x: 0, y: 0 }]],
            }),
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('unsupported-version');
    });
});

// ── 4. Legacy bare-array compatibility ───────────────────────────────────────

describe('legacy bare Vector2[] input', () => {
    const legacyTriangle = JSON.stringify([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]);

    it('parses, exactly as the old clipboard format wrote it', () => {
        const result = parseGeometryPayload(legacyTriangle);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.vertices).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }]);
        expect(result.encoding).toBe('legacy-bare-array');
    });

    it('reports the closed flag as assumed rather than read', () => {
        const result = parseGeometryPayload(legacyTriangle);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.closed).toBe(LEGACY_BARE_ARRAY_CLOSED);
        expect(result.assumed).toEqual(['closed']);
    });

    it('defaults to closed, because every legacy producer copied a polygon', () => {
        expect(LEGACY_BARE_ARRAY_CLOSED).toBe(true);
    });

    it('accepts the pretty-printed form the old copy button produced', () => {
        const oldFormat = JSON.stringify([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], null, 2);
        const result = parseGeometryPayload(oldFormat);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.encoding).toBe('legacy-bare-array');
    });

    it('re-serialises into the versioned form, upgrading the payload in place', () => {
        const parsed = parseGeometryPayload(legacyTriangle);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const reparsed = parseGeometryPayload(serialiseGeometryPayload(parsed.payload));
        expect(reparsed.ok).toBe(true);
        if (!reparsed.ok) return;
        expect(reparsed.encoding).toBe('versioned');
        expect(reparsed.assumed).toEqual([]);
        expect(reparsed.payload).toEqual(parsed.payload);
    });

    it('rejects a bare array shorter than the legacy minimum of three', () => {
        const result = parseWithoutThrowing(JSON.stringify([{ x: 0, y: 0 }, { x: 1, y: 1 }]));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('malformed-payload');
        expect(result.detail).toContain('3');
    });

    it('versioned payloads carry no assumptions, unlike legacy ones', () => {
        const versioned = parseGeometryPayload(serialiseGeometryPayload(makeVertexRun(ring(5, 10), false)));
        expect(versioned.ok).toBe(true);
        if (!versioned.ok) return;
        expect(versioned.assumed).toEqual([]);
        expect(versioned.payload.closed).toBe(false);
    });
});

// ── 5. Integration: closed stroke → payload → straight skeleton ──────────────

/**
 * What a receiving module does with a payload. This is the whole point of the
 * format: the consumer decides from `closed` alone whether the run is a region
 * it can solve or a path it must refuse — a decision the bare `Vector2[]` made
 * impossible.
 */
type RegionImport =
    | { ok: true; solved: SkeletonSolveResult; vertexCount: number }
    | { ok: false; reason: string };

function importAsRegion(text: string): RegionImport {
    const parsed = parseGeometryPayload(text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (parsed.payload.kind !== 'vertex-run') return { ok: false, reason: 'unsupported-kind' };
    if (!parsed.payload.closed) return { ok: false, reason: 'not-a-region' };
    if (parsed.payload.vertices.length < 3) return { ok: false, reason: 'too-few-vertices' };
    return {
        ok: true,
        solved: solveSkeleton(parsed.payload.vertices),
        vertexCount: parsed.payload.vertices.length,
    };
}

/** A hand-drawn loop that returns to its start. Mirrors the closed-stroke fixture used elsewhere. */
function wobblyClosedStroke(sampleCount: number): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i < sampleCount; i++) {
        const a = (i / sampleCount) * Math.PI * 2;
        const r = 300 + 55 * Math.sin(3 * a + 0.4) + 28 * Math.sin(7 * a + 1.1) + 12 * Math.sin(11 * a);
        points.push({ x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a), t: i * 8 });
    }
    points.push({ ...points[0], t: sampleCount * 8 });
    return points;
}

/** An open arc: the hand never came back, so closure must not fire. */
function openArcStroke(sampleCount: number): StrokePoint[] {
    const points: StrokePoint[] = [];
    for (let i = 0; i < sampleCount; i++) {
        const a = (i / sampleCount) * Math.PI * 1.1;
        points.push({ x: 500 + 300 * Math.cos(a), y: 500 + 300 * Math.sin(a), t: i * 8 });
    }
    return points;
}

const CLOSING_PIPELINE_CONFIG: StrokePipelineConfig = {
    smoothing: { variant: 'chaikin', iterations: 3 },
    simplification: { variant: 'pass-through' },
    cornerDetection: { variant: 'pass-through' },
    fitting: { variant: 'schneider', errorTolerance: 4 },
    closure: { variant: 'distance-threshold', threshold: 20 },
};

describe('integration — closed stroke survives the format and solves as a region', () => {
    it('carries the closed flag from runStrokePipeline through to solveSkeleton', () => {
        const stroke = runStrokePipeline(wobblyClosedStroke(90), CLOSING_PIPELINE_CONFIG);
        expect(stroke.closed).toBe(true);

        const budgeted = strokeToBudgetedPolygon(stroke, DEFAULT_VERTEX_BUDGET);
        expect(budgeted.achieved).toBeLessThanOrEqual(DEFAULT_VERTEX_BUDGET);

        // The stroke pipeline is the only thing that knows this is a loop, and
        // this is where that knowledge enters the payload.
        const payload = makeVertexRun(budgeted.vertices, stroke.closed);
        const text = serialiseGeometryPayload(payload);

        const parsed = parseGeometryPayload(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.closed).toBe(true);
        expect(parsed.payload.vertices).toEqual(budgeted.vertices);

        const imported = importAsRegion(text);
        expect(imported.ok).toBe(true);
        if (!imported.ok) return;
        expect(imported.vertexCount).toBe(budgeted.achieved);
        expect(imported.solved.complete).toBe(true);
    }, 60_000);

    it('refuses the same vertices when the payload says they are a path', () => {
        const stroke = runStrokePipeline(wobblyClosedStroke(90), CLOSING_PIPELINE_CONFIG);
        const budgeted = strokeToBudgetedPolygon(stroke, DEFAULT_VERTEX_BUDGET);

        const asPath = serialiseGeometryPayload(makeVertexRun(budgeted.vertices, false));
        const imported = importAsRegion(asPath);
        expect(imported.ok).toBe(false);
        if (imported.ok) return;
        expect(imported.reason).toBe('not-a-region');
    }, 60_000);

    it('carries an open stroke through as a path, and the region consumer declines it', () => {
        const stroke = runStrokePipeline(openArcStroke(60), CLOSING_PIPELINE_CONFIG);
        expect(stroke.closed).toBe(false);

        const budgeted = strokeToBudgetedPolygon(stroke, DEFAULT_VERTEX_BUDGET);
        const text = serialiseGeometryPayload(makeVertexRun(budgeted.vertices, stroke.closed));

        const parsed = parseGeometryPayload(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.closed).toBe(false);
        expect(parsed.assumed).toEqual([]);

        const imported = importAsRegion(text);
        expect(imported.ok).toBe(false);
        if (imported.ok) return;
        expect(imported.reason).toBe('not-a-region');
    }, 60_000);

    it('a legacy bare array of the same polygon still solves, on the assumed flag', () => {
        const stroke = runStrokePipeline(wobblyClosedStroke(90), CLOSING_PIPELINE_CONFIG);
        const budgeted = strokeToBudgetedPolygon(stroke, DEFAULT_VERTEX_BUDGET);

        const legacyText = JSON.stringify(budgeted.vertices.map(({ x, y }) => ({ x, y })));
        const parsed = parseGeometryPayload(legacyText);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.encoding).toBe('legacy-bare-array');
        expect(parsed.assumed).toEqual(['closed']);

        const imported = importAsRegion(legacyText);
        expect(imported.ok).toBe(true);
        if (!imported.ok) return;
        expect(imported.solved.complete).toBe(true);
    }, 60_000);
});
