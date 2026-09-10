import {createHash} from 'node:crypto';
import {FULL_CORPUS, NamedTestPolygon} from '@proc-geo/test-fixtures';
import {
    InteriorEdge,
    PolygonEdge,
    PolygonNode,
    SkeletonSolveResult,
    StraightSkeletonGraph,
    Vector2,
    solveSkeleton,
} from '@proc-geo/core';

/**
 * THE FULL-GRAPH DIGEST — 112(d)'s INSTRUMENT (W-spec W51, arc journal decision 116).
 *
 * This is the committed baseline that decision 116 requires to exist BEFORE any weighted-offsets
 * change lands: a SHA-256 over the denormalised graph of every `FULL_CORPUS` fixture, pinned on
 * tip `f3bc733`. It is not a correctness assertion — several fixtures in `FULL_CORPUS` carry a
 * measured defect and are pinned on their defective output like everything else — it is a
 * bit-identity tripwire. The weighted branch (decision 112(d)) must leave every one of these 59
 * pins untouched, because weight-1 input is defined to reproduce today's arithmetic exactly.
 *
 * A MOVED PIN IS NEVER SILENTLY UPDATED. If a change legitimately moves one or more of these
 * digests, the commit that updates `PINNED_DIGESTS` says which pins moved and why — a re-pin is an
 * attributed decision, not a rubber stamp on whatever the solver currently emits.
 *
 * Regenerate with `DIGEST_PRINT=1` (see below) after any attributed change; never hand-edit a
 * single hex string.
 */

/** Add 1 to a float64's raw bit pattern — a minimal, deliberate perturbation for the sensitivity check. */
function bumpOneUlp(value: number): number {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, false);
    const bits = view.getBigUint64(0, false);
    view.setBigUint64(0, bits + 1n, false);
    return view.getFloat64(0, false);
}

class ByteWriter {
    private readonly bytes: number[] = [];

    uint8(value: number): void {
        this.bytes.push(value & 0xff);
    }

    int32(value: number): void {
        const buffer = new ArrayBuffer(4);
        new DataView(buffer).setInt32(0, value, false);
        this.bytes.push(...new Uint8Array(buffer));
    }

    uint32(value: number): void {
        const buffer = new ArrayBuffer(4);
        new DataView(buffer).setUint32(0, value, false);
        this.bytes.push(...new Uint8Array(buffer));
    }

    /** Big-endian Float64, written through a DataView so the raw bit pattern (including -0 and NaN) survives. */
    float64(value: number): void {
        const buffer = new ArrayBuffer(8);
        new DataView(buffer).setFloat64(0, value, false);
        this.bytes.push(...new Uint8Array(buffer));
    }

    toUint8Array(): Uint8Array {
        return Uint8Array.from(this.bytes);
    }
}

/**
 * Canonical byte serialisation of a solved graph, per W-spec W51 / decision 116.
 *
 * Order: (a) `complete`; (b) nodes in id order (id, position bits); (c) exterior edges in id order
 * (id, source, target, basis bits); (d) interior edges in id order (id, source, target, basis bits,
 * clockwise parent id, widdershins parent id, maxOffset bits, culled flag); (e) `acceptedEdges`.
 *
 * INTERPRETATION — node topology excluded. `PolygonNode.inEdges`/`outEdges` are per-node incidence
 * lists, not per-edge numeric state, and they are fully redundant with the source/target already
 * serialised on every edge (both exterior and interior). They are left out rather than included as
 * "extra state": the spec's per-edge-state clause does not reach per-node bookkeeping, and node
 * insertion order matters far more to interior-node discovery than the sorted `inEdges`/`outEdges`
 * arrays would add on top of it.
 *
 * EXTRA PER-EDGE NUMERIC STATE FOUND — `InteriorEdge.length`. It is included (see below) because
 * the instructions say to include any extra per-edge numeric state the graph exposes, but it is
 * worth flagging that `normalisation.ts` documents it as a permanent `Number.MAX_VALUE` sentinel
 * that is never updated to an actual length ("`interiorEdge.length` is the `Number.MAX_VALUE`
 * sentinel, not a length. Left alone."). It is therefore constant across every interior edge of
 * every fixture and contributes no discriminative power to the digest — it is real state the type
 * exposes, so it is not silently dropped, but it is dead weight, not a signal.
 *
 * INTERPRETATION — `context === null`. `SkeletonSolveResult.context` is `null` exactly when the
 * input was self-intersecting and solved via decompose-and-merge, in which case there is no single
 * `acceptedEdges` array to serialise. No `FULL_CORPUS` fixture takes that path today (none is
 * self-intersecting), so this branch is unexercised by the pinned table, but the serialisation
 * still has to name the case explicitly (a leading presence byte) rather than silently emitting a
 * zero-length `acceptedEdges` section that would be indistinguishable from "context present, zero
 * exterior edges".
 *
 * INTERPRETATION — sentinel on exterior edge targets. The spec calls for the `-1` sentinel only on
 * interior edges, because only interior edges can legitimately finish a solve unterminated. Every
 * exterior edge gets its `target` at construction (`initBoundingPolygon`) and it is never cleared,
 * so the sentinel is applied there too purely for uniformity/defensiveness; it is never expected to
 * fire.
 */
function serialiseGraph(result: SkeletonSolveResult): Uint8Array {
    const writer = new ByteWriter();
    const graph: StraightSkeletonGraph = result.graph;
    const numExteriorNodes = graph.numExteriorNodes;

    // (a) complete flag
    writer.uint8(result.complete ? 1 : 0);

    // (b) nodes, id order
    const nodes: PolygonNode[] = [...graph.nodes].sort((a, b) => a.id - b.id);
    writer.uint32(nodes.length);
    for (const node of nodes) {
        writer.int32(node.id);
        writer.float64(node.position.x);
        writer.float64(node.position.y);
    }

    // (c) exterior edges, id order
    const exteriorEdges: PolygonEdge[] = graph.edges
        .filter(edge => edge.id < numExteriorNodes)
        .sort((a, b) => a.id - b.id);
    writer.uint32(exteriorEdges.length);
    for (const edge of exteriorEdges) {
        writer.int32(edge.id);
        writer.int32(edge.source);
        writer.int32(edge.target ?? -1);
        writer.float64(edge.basisVector.x);
        writer.float64(edge.basisVector.y);
    }

    // (d) interior edges, id order
    const interiorEdges: InteriorEdge[] = [...graph.interiorEdges].sort((a, b) => a.id - b.id);
    writer.uint32(interiorEdges.length);
    for (const interiorEdge of interiorEdges) {
        const edgeData = graph.edges[interiorEdge.id];
        writer.int32(interiorEdge.id);
        writer.int32(edgeData.source);
        writer.int32(edgeData.target ?? -1);
        writer.float64(edgeData.basisVector.x);
        writer.float64(edgeData.basisVector.y);
        writer.int32(interiorEdge.clockwiseExteriorEdgeIndex);
        writer.int32(interiorEdge.widdershinsExteriorEdgeIndex);
        // maxOffset is genuinely optional (an interior edge that never resolved). A presence byte
        // disambiguates "unresolved" from any legitimate float value, including 0 and NaN.
        if (interiorEdge.maxOffset === undefined) {
            writer.uint8(0);
        } else {
            writer.uint8(1);
            writer.float64(interiorEdge.maxOffset);
        }
        writer.uint8(interiorEdge.culled ? 1 : 0);
        // Extra per-edge numeric state found beyond the spec's list — see the function header.
        writer.float64(interiorEdge.length);
    }

    // (e) acceptedEdges, from the solver context
    if (result.context === null) {
        writer.uint8(0);
    } else {
        writer.uint8(1);
        const accepted = result.context.acceptedEdges;
        writer.uint32(accepted.length);
        for (const flag of accepted) {
            writer.uint8(flag ? 1 : 0);
        }
    }

    return writer.toUint8Array();
}

function digestBytes(bytes: Uint8Array): string {
    return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function digestOf(vertices: Vector2[]): string {
    const result = solveSkeleton(vertices);
    return digestBytes(serialiseGraph(result));
}

/**
 * PINNED DIGESTS — measured on tip `f3bc733`, before any weighted-offsets change.
 *
 * This table is decision 116's instrument for the weighted-offsets branch's bit-identity claim
 * (arc decision 112(d)): every one of these 59 digests must survive that branch unchanged for
 * weight-1 input. A pin that moves is attributed and re-pinned by a commit that says which pin
 * moved and why — it is never silently updated to whatever the solver currently emits.
 *
 * Regenerate with `DIGEST_PRINT=1 <run this test file>`, which logs a copy-pasteable table.
 *
 * ── FOURTEEN PINS RE-PINNED FOR THE WEIGHTED SOLVER CORE — W-spec W21, arc decision 115 ──
 *
 * The weighted branch left 45 of the 59 untouched and moved exactly the fourteen marked below, all
 * of them at ONE named site: `findOffsetViaIncenter` in `generate-split-event.ts`. That function's
 * old temporary-node-plus-two-ray incenter construction is replaced OUTRIGHT by the linear
 * equi-time form, because keeping the construction "when both weights are one" would be a branch on
 * unit weights, which W-spec W36 forbids on journal decision 105's ground. Arc decision 115 amends
 * 112(d) to make this the single named exception to bit-identity, with the movement bounded by ulps
 * by construction — the two routes reach the same point — and measured pin by pin.
 *
 * MEASURED, against a full graph snapshot of the pre-change tip (node positions, edge sources,
 * targets and basis bits, interior-edge parents, `maxOffset` and `culled`) taken by solving both
 * ways. WORST MOVEMENT ANYWHERE IS 3 ULPS. Nothing structural moved on any fixture: no node count,
 * no edge target, no parent pair, no `culled` flag, and no `complete` flag changed anywhere in the
 * corpus. The per-fixture measurements are recorded above each moved entry.
 *
 * NOTHING ELSE MOVED A PIN. In particular W-spec W33's new equi-time check on the `co-linear-from-1`
 * closure — the other site the spec named as able to move the digest at unit weights — is reached on
 * `Off-edge Jitter Plus (seed 7919)` and the large-coordinate cells and PASSES there, so that
 * fixture's pin is unchanged.
 */
const PINNED_DIGESTS: Record<string, string> = {
    'Triangle': '54e3232fcce97c6daec3f47f3aaabea5664606c506cd07a7a937c650447439c9',
    'Square': 'a8ca919e5f391aa39a154f9440c8b136f34b57682e3c7179746440450c12d1c4',
    'Rectangle': 'f4540a171f784104e10f41016f4013840988c0ca4ccd94ca751b63e1c779b429',
    'Pentagon House': '1fc45dc28ef535259e9f9cf2f1d86586b268f2e350839a7a0f9e1a7a8d132eb3',
    'Default Pentagon': '9e96fcd15b0b69db1474d4f45e886ebe326ab0703a214fecef610dd6c1e6ec29',
    'Symmetrical Octagon': 'af4357dc82567bd6ad77bbccfe3be0c9b18e186967be6424aa840f401c38f2d5',
    'Awkward Hexagon': '089d4fa3050c80ecdcd83432f67ec722fa49341c259ae37a45964876f830e34a',
    'Awkward Heptagon': '47a148a0ea55317ff00f3d1f8cf8fab355654fcd81c73a3e57f5662d344a36d3',
    'Impossible Octagon': '576484dc6777e3930ddcff6e1a7766c2278b630487bcba5baf96b74645d24b03',
    'Broken Polygon': 'd5731eb56d4fdb37d46f229d904084eaab2b847363caa8e555b79d2bfac0f812',
    'Crazy Polygon': '1c6dde9c72968c9b364ad91ff50081f1012b7ea3f753ee9aef104746b82b8889',
    // W21 / decision 115: 3 node coordinates moved by 1 ulp, 2 `maxOffset` values by 2 ulps.
    'Duck Octagon (fails)': '72bad157e5a3a7ec1f0482aacafeecc4f60746abb59a5976d59bd37a1a2a8ca9',
    // W21 / decision 115: 2 node coordinates moved by 1 ulp; nothing else.
    'Duck Octagon (passes)': 'aad5eb98e804de77527ad8969f29492090b95ecb98dff30c4b1db0365e258df4',
    // W21 / decision 115: 2 node coordinates moved by 1 ulp; nothing else.
    'Moorhen (fails)': '3df1ed66812bd350ac29b350c14f682c129d3d4706a57e1aca54080d68aa1666',
    // W21 / decision 115: 2 node coordinates moved by 1 ulp; nothing else.
    'Moorhen (passes)': '6bf6ea9a60e5527c9927b2d57e7329bc2d47e804e49ea2e2a530a27bd1607500',
    // W21 / decision 115: 1 node coordinate moved by 1 ulp, 3 `maxOffset` values by up to 3 ulps —
    // the worst movement anywhere in the corpus.
    'V2 Double Reflex Spaceship (fails)': 'cd9980a9cd59e0bd734c6122ece436de4d4ea05a735d18b04addac8c7df7d410',
    'Previously failed Double Reflex Spaceship (passes)': '85b7b7d3fefc9e18d29e1454e2eace20cb6d838079a4b0a1fb2db893f79fed62',
    'Double Reflex Spaceship (passes)': 'ca66dd1f473f47bf455e252ccdca9b337484f44db863bee33a21db7967ac9cc8',
    'Convergence Towards Isthmus (succeeds)': 'dae4883ef800143a1457b40bd19fa08cac05f7e766e8abb2b84258ae223fc494',
    'Divergence Towards Isthmus (fails node 7)': '8c64f5237f4104cc747ff4aea058a3e2ee8f916e2762ec2ae76005dc2d1674f8',
    'Divergence Towards Isthmus (fails node 4)': '07c963cbcbdaaa44ea3d48971fae12737b1c7ba5ccd2d0c3afe703d45dbcdabe',
    'Long Octagon': 'e036ee11128f59297d22a831076efb39e71e757c61b0b1e1409953c2e516a554',
    // W21 / decision 115: 2 `maxOffset` values moved by 2 ulps; no node moved.
    'Failing Long Octagon': '1bfaaddda53b05ff850a240a843c0c12d396b1ec981ebf4a6a5671637a78f143',
    // W21 / decision 115: 2 `maxOffset` values moved by 2 ulps; no node moved.
    'Failing Gentle Reflex Pentagon': 'fd146cd98bc632465585a3201c618d17915c286d566e4f4c375c0f6cc3141341',
    'Mid-case Success Outer': '082ef07d8388a9efbddafd732a69aabdc4e33a8b4e9abddcb6e64037d1962ab3',
    // W21 / decision 115: 1 node coordinate moved by 1 ulp, 2 `maxOffset` values by 2 ulps.
    'Mid-case Failure Start': 'a01bd2e060b84c7416c6f30ebb3363b4e6929b3ed860f26f92dd88c58e425648',
    'Mid-case Failure End': '57307ed7d39ec9461945e7d7d4a88b788b36de26e8ef3b48181798fb037038d0',
    'Mid-case Success Inner': '0f304802fb5a183caa11e9f7374f9e633ec735195057aa5efe048a397ca9e3d7',
    'Missing Edge at Node 11': '940ebaa76dc7cb52927ebb9215ccb209bf9899b40f62ec01700de88db0d9f664',
    'Causes Missing Secondary Edge': '2436c92e1a531ef810a865e166e75596b51a5543c0b92ddb3f867953d2b99fb1',
    'Wacky Octagon': 'c99421c304c990b0db4b93c9d8dc23a7d25f70e056d291ce7ad49b6dcd43efc2',
    'Not Solvable Heptagon': '3f8abeb6dbf9ea9ae90667fd815f47cf8252a251d3a0d9cb65283126b3a69d24',
    'Wrong Collision at Node 10': '1453d305ff64d38d2349df517e42a7efb40fc8125753fdebccfd14ce99ca757c',
    'Premature Split Octagon': '940ebaa76dc7cb52927ebb9215ccb209bf9899b40f62ec01700de88db0d9f664',
    // W21 / decision 115: 2 node coordinates moved by 1 ulp, 5 `maxOffset` values by up to 2 ulps.
    'Long Unbroken Side Then Extreme Acute Angle': '487615a03a0d7cb35a1e3fb5bbde715d854e422ac230832b112b303ff51c72f5',
    // W21 / decision 115: 3 node coordinates moved by 1 ulp, 5 `maxOffset` values by up to 2 ulps.
    'Incorrect Ordering e38-e30 Collision': 'da4c684f3aea565b4f3abda865bd55378d8ee45da8e0172c31d5514558b24e14',
    // W21 / decision 115: 2 `maxOffset` values moved by 1 ulp; no node moved.
    'Premature Bisector Split (fails)': '3c41045af803511c7285f41288b54931c4acc171f0d870c52b6e2adbd55efd4e',
    // W21 / decision 115: 2 `maxOffset` values moved by 2 ulps; no node moved.
    'Premature Bisector Split (passes)': '3874bc693484cae1d97ebf7a4ceaaca9c1ec16a49743085099e4c691453b12dc',
    // W21 / decision 115: 2 `maxOffset` values moved by 1 ulp; no node moved.
    'Short Edge Promontory': '34bba7ce2171182ac1009a8bd12c1c7529254c715383c4de23a83fb672897caa',
    'Cross': '8e53e88015c87fa7def33b28b730cd1cbfb847c3528b555eb938067ee9e45b75',
    'T-Shape': '649c0f5f0075e184ca91b33447492e699dcf881e51ba672405519e1fe91f5b48',
    'Golf Cart': '251c2db4de2a20e46f4adad3e7fbdce58eb2110b2835aeb080d09470e23b8217',
    'Collinear Dumbbell': 'd0562786d84ccc7b66bb06129df9dacffcd2d616a32c4f5b8bb128ade5ea8c0f',
    'Asymmetric Dumbbell': '145e06b22c60052f8f67435720e88d37f0b263e43020970b325fd29f046f9f9e',
    'Three Globe Chain': 'a2fdccf859b47d9b2911c5891905637e7a81a01d4a563a5beed623fb0e5eecd6',
    'Near Regular Circle 16': '2a97dee78cb69ed567fe2f0711f6c79d4165a1133976cbbc2866bce434d96ba1',
    'Near Regular Circle 32': '29fafec73902228e5243feb976d115fea6485df59a3e7285c0db98f110b140ca',
    'Near Regular Peanut 32': '054ca3247f86e9ee34bcf523f46656c742106b94528f25a25b552a73b9de1610',
    'Near Regular Ellipse 16': 'ba2f57c8b5f1922d1b57911aa8ec5a8a8ee903ef690b59248c24b161333fea8b',
    'Near Regular Ellipse 32': 'ee83919494e56a490df37f4b7fd8d76eef23dab2e6622819807a08fffa248629',
    'Invisible Vertex Rectangle': 'bba80538691c5f598296108074654a43092a4cc5fb0814f478a2a4dae825963f',
    'Slightly Deformed Peanut 1': '51d86b7886d514fe05ee23d2a1838e92f11ae4a7fcc32a01dd172e5a60f1ff93',
    'Slightly Deformed Peanut 2': 'eb7fdaa7028ff7226f691f9b302f8ffa901e4422a4af755abc380c26dd7b1215',
    'Off-edge Jitter Reflex L (seed 15838)': '965a41110901f1f6167b251c309ba25e3013d3fe4ed06520cd039de8c276a4a8',
    'Off-edge Jitter Reflex L (seed 55433)': '434f124f04bdeb6ad082a843582bbd8c04bc029a28fa7f3b4dfef1fa5417286c',
    'Off-edge Jitter Plus (seed 7919)': '9e2c7d53d92548ce3af8950cab8466f39ebb35f7c2a6dcbde522cd05be13a7a3',
    // W21 / decision 115: 3 node coordinates moved by 1 ulp, 5 `maxOffset` values by 1 ulp.
    'Off-edge Jitter Reflex L (seed 55433, k=4)': '051808c645fce7466a0566881be7f458e7d9d08630568b9775af65f418c29886',
    'Near Regular Circle 48': '1c160f93b47ea00b09858d67fe00d502524130faa603ad62e0acfd5120bed1dc',
    'Near Regular Rosette5 40': 'cdc02b004eab1e13bef32a266d5f9313dd770161e0131beb26b0be3f435184f0',
};

if (process.env.DIGEST_PRINT === '1') {
    describe('full-graph digest (print mode)', () => {
        it('logs the pinned-digest table in copy-pasteable TypeScript form', () => {
            const lines = FULL_CORPUS.map(fixture => {
                const digest = digestOf(fixture.vertices);
                const escapedName = fixture.name.replace(/'/g, "\\'");
                return `    '${escapedName}': '${digest}',`;
            });
            // eslint-disable-next-line no-console
            console.log(
                '\n----- PINNED_DIGESTS (paste below) -----\n'
                + 'const PINNED_DIGESTS: Record<string, string> = {\n'
                + lines.join('\n')
                + '\n};\n'
                + '----- end PINNED_DIGESTS -----\n',
            );
        });
    });
}

describe('full-graph digest', () => {
    describe('per-fixture pins', () => {
        it.each(FULL_CORPUS.map((fixture): [string, Vector2[]] => [fixture.name, fixture.vertices]))(
            '%s matches its pinned digest',
            (name, vertices) => {
                expect(PINNED_DIGESTS[name]).toBeDefined();
                expect(digestOf(vertices)).toBe(PINNED_DIGESTS[name]);
            },
        );
    });

    describe('determinism', () => {
        it.each(FULL_CORPUS.map((fixture): [string, Vector2[]] => [fixture.name, fixture.vertices]))(
            '%s solves to the same digest twice',
            (_name, vertices) => {
                expect(digestOf(vertices)).toBe(digestOf(vertices));
            },
        );
    });

    describe('sensitivity to a one-ulp node perturbation', () => {
        const SAMPLE_FIXTURES: NamedTestPolygon[] = FULL_CORPUS.filter(fixture =>
            ['Triangle', 'Square', 'Near Regular Circle 48'].includes(fixture.name));

        it('samples exactly the three intended fixtures', () => {
            expect(SAMPLE_FIXTURES.map(fixture => fixture.name).sort()).toEqual(
                ['Near Regular Circle 48', 'Square', 'Triangle'],
            );
        });

        it.each(SAMPLE_FIXTURES.map((fixture): [string, Vector2[]] => [fixture.name, fixture.vertices]))(
            '%s: perturbing one node coordinate by one ulp changes the digest',
            (_name, vertices) => {
                const result = solveSkeleton(vertices);
                const originalDigest = digestBytes(serialiseGraph(result));

                // Perturb node 0's x coordinate by one ulp (bit pattern +1), leaving every other
                // field of the graph untouched.
                const perturbedNodes: PolygonNode[] = result.graph.nodes.map((node, index) =>
                    index === 0
                        ? {...node, position: {x: bumpOneUlp(node.position.x), y: node.position.y}}
                        : node);
                const perturbedResult: SkeletonSolveResult = {
                    ...result,
                    graph: {...result.graph, nodes: perturbedNodes},
                };
                const perturbedDigest = digestBytes(serialiseGraph(perturbedResult));

                expect(perturbedDigest).not.toBe(originalDigest);
            },
        );
    });

    describe('coverage', () => {
        it('pins exactly the FULL_CORPUS names, no more and no fewer', () => {
            const pinnedNames = Object.keys(PINNED_DIGESTS).sort();
            const corpusNames = FULL_CORPUS.map(fixture => fixture.name).sort();
            expect(pinnedNames).toEqual(corpusNames);
            expect(pinnedNames).toHaveLength(59);
        });
    });
});
