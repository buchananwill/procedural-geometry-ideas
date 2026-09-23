import {
    CLEAN_TEST_POLYGONS,
    FULL_CORPUS,
    KNOWN_DEFECT_POLYGONS,
    NEAR_REGULAR_CIRCLE_32,
    NEAR_REGULAR_ROSETTE5_40,
    PREMATURE_BISECTOR_SPLIT_FAILS,
    PREMATURE_BISECTOR_SPLIT_PASSES,
} from '@proc-geo/test-fixtures';
import {
    areEqual,
    crossProduct,
    FLOATING_POINT_EPSILON,
    runAlgorithmV5,
    Vector2,
} from '@proc-geo/core';
import {deriveNodeOffsets, distanceToSegment} from './wavefront-measurement-helpers';

/**
 * Causal consistency of the wavefront.
 *
 * The straight skeleton is the trace of a wavefront that moves inward from the
 * boundary at unit speed. Every skeleton node is an *event*: the moment two
 * wavefront elements meet. Its offset distance is the time that happened.
 *
 * A skeleton edge is the path a single wavefront vertex travels between two
 * events, so time must not run backwards along it: the event at the far end
 * cannot be earlier than the event that produced it. A decreasing offset means
 * the solver has claimed an event was caused by something that had not happened
 * yet, which is impossible regardless of how the solver is implemented.
 *
 * Why this is not a tautology, and not fiat:
 *
 *  - The offsets used here are *not* the solver's own bookkeeping. They are
 *    re-derived from raw geometry: the perpendicular distance from the node to
 *    the supporting line of one of the original polygon edges that defines it.
 *    Nothing the solver recorded about timing is trusted.
 *  - No expected coordinates, node counts or reference outputs appear anywhere.
 *    The assertion is a physical law about wavefront propagation, so it applies
 *    to any polygon and any correct implementation.
 *  - It is a genuine discriminator rather than a restatement of the fix. Several
 *    weaker invariants were tried against the fixture pair below and did *not*
 *    separate them: both outputs are planar, both keep every bisector exactly
 *    equidistant from its two parent edges, both have every node at or inside
 *    its clearance from the boundary, and in both the skeleton faces tile the
 *    polygon with zero area mismatch. The bad output is locally impeccable. Only
 *    its ordering in time is wrong.
 */

const TOLERANCE = 1e-6;

interface OffsetViolation {
    interiorEdgeId: number;
    sourceNode: number;
    targetNode: number;
    sourceOffset: number;
    targetOffset: number;
}

/*
 * The node-offset oracle both checks below are made against is `deriveNodeOffsets`, which lives in
 * `wavefront-measurement-helpers.ts` beside the distances it is written in. It moved there on
 * 2026-09-23 (journal decision 141) so that I2 in `graph-index-invariants.test.ts` could ask "are
 * these two nodes in one offset layer?" of the SAME derivation rather than of a second copy; its
 * doc comment there carries the reasoning that used to stand here, unchanged.
 */

/**
 * Check that no skeleton edge travels backwards in time.
 */
function findOffsetViolations(vertices: Vector2[]): OffsetViolation[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;
    const offsetOf = deriveNodeOffsets(graph);

    const violations: OffsetViolation[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;
        const sourceOffset = offsetOf.get(edge.source);
        const targetOffset = offsetOf.get(edge.target);
        if (sourceOffset === undefined || targetOffset === undefined) continue;
        if (targetOffset < sourceOffset - TOLERANCE) {
            violations.push({
                interiorEdgeId: interiorEdge.id,
                sourceNode: edge.source,
                targetNode: edge.target,
                sourceOffset,
                targetOffset,
            });
        }
    }
    return violations;
}

/**
 * The same law read off the bisector's DIRECTION rather than off its endpoints.
 *
 * `findOffsetViolations` can only speak about an edge that reached a target, and it re-derives its
 * verdict from node positions. This asks the prior question, of every bisector whether it ever
 * arrived anywhere: does travelling along it move the wavefront clock FORWARD? The rate is
 * `cross(basis, clockwiseParent.basis)` — the very factor `makeOffsetDistance` multiplies travel by
 * to price a collision — so a negative one means every offset computed for that bisector decreases
 * as it advances. The layer's lowest-offset selection then reaches its far end before its near end
 * and steps over whatever was waiting there.
 *
 * NOT A RESTATEMENT OF HOW THE BISECTOR IS BUILT, even though `addBisectionEdge` now chooses the
 * direction by this rate. Three other things assign a basis or a target that this sweep still
 * audits — `bisectionsForMerge`'s hint, `crossWireEdges`, and `tryAttachEdgeToNode`'s direct snap —
 * and the fixtures reach all of them. It caught nothing when it was written, which is the point: it
 * is the tripwire under a latent defect that had already shipped one silent wrong answer.
 *
 * ZERO IS ALLOWED AND IS NOT A LOOPHOLE. Two exactly anti-parallel parents give a bisector that
 * runs along a corridor at constant offset — a real ridge, not a violation — and 22 of the corpus's
 * 923 bisectors sit in that band. Only a rate that is negative BY MORE THAN the solver's own
 * tolerance is a violation.
 */
function findBackwardsRateViolations(vertices: Vector2[]): string[] {
    const {graph} = runAlgorithmV5(vertices);
    const violations: string[] = [];

    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge) continue;
        const clockwiseParent = graph.edges[interiorEdge.clockwiseExteriorEdgeIndex];
        const rate = crossProduct(edge.basisVector, clockwiseParent.basisVector);
        if (rate < 0 && !areEqual(rate, 0)) {
            violations.push(
                `e${interiorEdge.id} advances at offset rate ${rate} against its clockwise parent `
                + `${interiorEdge.clockwiseExteriorEdgeIndex}: it runs backwards through the wavefront`);
        }
    }

    return violations;
}

/**
 * One cell of `near-regular-polygons.test.ts`'s jitter ladder: `multiple` times the solver's
 * tolerance, expressed in caller units against the polygon's own span, at a fixed seed.
 */
function jitterCell(vertices: Vector2[], multiple: number, seed: number): Vector2[] {
    const span = Math.max(
        Math.max(...vertices.map(v => v.x)) - Math.min(...vertices.map(v => v.x)),
        Math.max(...vertices.map(v => v.y)) - Math.min(...vertices.map(v => v.y)),
    );
    const amplitude = multiple * FLOATING_POINT_EPSILON * span;

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

/**
 * A second, independent invariant: no node may outrun its own clearance.
 *
 * The mitered wavefront always covers at least as much ground as an eroding disc
 * of the same radius, so a point still unswept at time t is at least t away from
 * the boundary. A node whose offset exceeds its distance to the boundary has been
 * placed somewhere the wavefront had already passed.
 *
 * This is complementary to the causality check rather than a stronger form of it:
 * each catches a defect the other misses.
 */
function findClearanceViolations(vertices: Vector2[]): string[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;
    // The boundary the SOLVER was given, for the same reason `deriveNodeOffsets` reads it: the two
    // rings differ by whatever the boundary stage removed, and a clearance measured against a
    // boundary the solver never saw is not a statement about the solver.
    const boundary = graph.nodes.slice(0, graph.numExteriorNodes).map(node => node.position);
    const edgeCount = boundary.length;
    const offsetOf = deriveNodeOffsets(graph);

    const violations: string[] = [];
    for (let i = graph.numExteriorNodes; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        // Absent means the node has no interior edge to date it by; the causality check above
        // skips those for the same reason.
        const offset = offsetOf.get(i);
        if (offset === undefined) continue;

        let clearance = Infinity;
        for (let k = 0; k < edgeCount; k++) {
            clearance = Math.min(
                clearance,
                distanceToSegment(node.position, boundary[k], boundary[(k + 1) % edgeCount]));
        }
        if (offset > clearance + TOLERANCE) {
            violations.push(
                `node ${i} has offset ${offset.toFixed(3)} but is only ` +
                `${clearance.toFixed(3)} from the boundary (overshoot ` +
                `${(offset - clearance).toFixed(3)})`);
        }
    }
    return violations;
}

interface DirectionViolation {
    interiorEdgeId: number;
    sourceNode: number;
    targetNode: number;
    sourcePosition: Vector2;
    targetPosition: Vector2;
    basisVector: Vector2;
    dot: number;
}

/**
 * A third invariant, and the strictest of the three about direction: an interior edge must
 * end somewhere *ahead of* its own source, along its own basis vector.
 *
 * Every interior edge is a bisector ray. Its basis vector is not decoration — it is the
 * direction the wavefront vertex actually travels, fixed at the edge's birth by the two
 * original polygon edges that define it. Whatever node the solver eventually gives that
 * edge as a `target`, the vertex has to have reached it by walking forwards along that ray.
 * A target sitting behind the source means the solver wired the edge to a point the moving
 * vertex never visits, and the drawn segment runs the opposite way to the motion it claims
 * to depict.
 *
 * Why this is not subsumed by the offset check above. The offset check compares *when* the
 * two endpoint events happened; this one compares *where* they are relative to the direction
 * of travel. Those come apart. On `NEAR_REGULAR_PEANUT_32` the anti-parallel neck pair ran
 * from offset 94.35 to offset 98.60 — forward in time, and therefore invisible to the offset
 * check — while pointing (+1, 0) and terminating 36 units to the *left* of their own source.
 * Only a directional test separates that case.
 *
 * Derived from raw geometry: the source and target positions come from the graph's nodes and
 * the basis vector from the edge itself, so nothing about the solver's timing bookkeeping is
 * trusted.
 */
function findDirectionViolations(vertices: Vector2[]): DirectionViolation[] {
    const context = runAlgorithmV5(vertices);
    const {graph} = context;

    const violations: DirectionViolation[] = [];
    for (const interiorEdge of graph.interiorEdges) {
        const edge = graph.edges[interiorEdge.id];
        if (!edge || edge.target === undefined) continue;

        const source = graph.nodes[edge.source];
        const target = graph.nodes[edge.target];
        if (!source || !target) continue;

        const travel = {x: target.position.x - source.position.x, y: target.position.y - source.position.y};
        const length = Math.hypot(travel.x, travel.y);
        // A zero-length edge has no direction to disagree with; the offset and clearance
        // checks own that degeneracy.
        if (length <= TOLERANCE) continue;

        const dot = (travel.x / length) * edge.basisVector.x + (travel.y / length) * edge.basisVector.y;
        if (dot > 0) continue;

        violations.push({
            interiorEdgeId: interiorEdge.id,
            sourceNode: edge.source,
            targetNode: edge.target,
            sourcePosition: source.position,
            targetPosition: target.position,
            basisVector: edge.basisVector,
            dot,
        });
    }
    return violations;
}

function formatPoint(v: Vector2): string {
    return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`;
}

function describeDirectionViolations(violations: DirectionViolation[]): string {
    return violations
        .map(v =>
            `interior edge ${v.interiorEdgeId}: source node ${v.sourceNode} at ` +
            `${formatPoint(v.sourcePosition)} -> target node ${v.targetNode} at ` +
            `${formatPoint(v.targetPosition)}, but basis is ${formatPoint(v.basisVector)} ` +
            `(dot ${v.dot.toFixed(3)}, edge runs backwards along its own ray)`)
        .join('; ');
}

function describeViolations(violations: OffsetViolation[]): string {
    return violations
        .map(v =>
            `interior edge ${v.interiorEdgeId}: node ${v.sourceNode} at offset ` +
            `${v.sourceOffset.toFixed(3)} -> node ${v.targetNode} at offset ` +
            `${v.targetOffset.toFixed(3)} (time runs backwards by ` +
            `${(v.sourceOffset - v.targetOffset).toFixed(3)})`)
        .join('; ');
}

describe('wavefront causality', () => {
    describe('premature-bisector split fixture pair', () => {
        // These two polygons differ at a single vertex by about (1.05, 0.53).
        // Before the fix, the first produced a skeleton edge running from offset
        // 71.64 to offset 62.70 while the second was clean — a phase transition
        // in the output from a sub-pixel change in the input.
        it('holds for the variant that exposed the false split', () => {
            const violations = findOffsetViolations(PREMATURE_BISECTOR_SPLIT_FAILS);
            expect(describeViolations(violations)).toBe('');
        });

        it('holds for the adjusted variant', () => {
            const violations = findOffsetViolations(PREMATURE_BISECTOR_SPLIT_PASSES);
            expect(describeViolations(violations)).toBe('');
        });

        it('produces consistent topology across the perturbation', () => {
            const failing = runAlgorithmV5(PREMATURE_BISECTOR_SPLIT_FAILS).graph;
            const passing = runAlgorithmV5(PREMATURE_BISECTOR_SPLIT_PASSES).graph;
            // A sub-pixel change to one vertex must not change the combinatorial
            // size of the skeleton.
            expect(failing.nodes.length).toBe(passing.nodes.length);
            expect(failing.interiorEdges.length).toBe(passing.interiorEdges.length);
        });
    });

    /**
     * The clean roster at the full bar: all four checks, no violations of any of them.
     *
     * THE NEAR-REGULAR FIXTURES ARE WHY THIS SWEEP MATTERS MOST, and they are ordinary members of
     * the roster now rather than a block of their own. They are the corpus's densest, most
     * symmetric shapes, the ones that put many events on one point at one offset.
     * `NEAR_REGULAR_PEANUT_32` solved `complete` with no diagnostics while one of its interior
     * edges ran from offset 98.60 back to an *original polygon vertex* at offset 0, because
     * `tryAttachEdgeToNode` assigned that target directly and was therefore invisible to every
     * runtime causality check the solver had. Nothing in the suite noticed until a sweep covered
     * them.
     *
     * The peanut's waist is the reason the direction check exists at all, so the account stays
     * here. It pinches shut at (300, 300) at offset 94.35 — the wavefront reaches the neck before
     * it reaches anywhere wider — and the solver records that as node 32. The event emits one
     * bisector per lobe: e64, bounded by the two left-hand neck edges 7 and 22, and e65, bounded
     * by the two right-hand ones 6 and 23.
     *
     * Two successive defects lived there. First, each was cross-wired to the bisector born at
     * 98.60 in the *other* lobe on nothing better than `dot(basis1, basis2) === -1`.
     * Anti-parallel is not head-on: those pairs point directly away from each other, and the
     * cross-wire made all four run backwards along their own basis while, in two cases, still
     * running *forwards* in offset — which is why the offset check scored that damage at only
     * 4.25 and the direction check scored it as a clean reversal. Refusing the bogus cross-wire
     * made the checks pass vacuously instead: all four edges were left with no target, and an
     * edge without a target is audited by neither.
     *
     * Second, and the actual cause: `bisectionsForMerge` gave both new bisectors an
     * `approximateDirection` derived from the two annihilating arrivals, which are exactly
     * anti-parallel, so `makeBisectedBasis` fell through to `rotateCw90` of its first argument
     * — a perpendicular with no reference to the geometry — and `addBisectionEdge` flipped the
     * correct parent-derived basis on the strength of it. e64 pointed right into the wrong lobe
     * and e65 pointed left into the other. Anti-parallel arrivals now supply no hint, the parent
     * derivation stands, e64 runs left to node 33 and e65 runs right to node 34, and all four
     * checks hold on the peanut with every edge targeted.
     *
     * THAT SECOND DEFECT WAS FIXED AT THE CALLER AND IS NOW FIXED AT THE SOURCE TOO (journal
     * decision 70, 2026-08-28). Withholding the hint stopped `bisectionsForMerge` from flipping a
     * bisector, but `addBisectionEdge` still applied ANY hint it was given over a direction the
     * parents had already determined — so the same flip was available to every other caller, and a
     * deformed peanut waist duly found it. The direction is now decided by the bisector's offset
     * rate wherever that rate is determinate, and the hint breaks the anti-parallel tie only. The
     * rate check is the standing tripwire for it.
     */
    describe.each(CLEAN_TEST_POLYGONS)('$name', ({vertices}) => {
        it('never runs backwards in time along a skeleton edge', () => {
            const violations = findOffsetViolations(vertices);
            expect(describeViolations(violations)).toBe('');
        });

        it('never points a bisector backwards through the wavefront', () => {
            expect(findBackwardsRateViolations(vertices).join('; ')).toBe('');
        });

        it('never places a node beyond its own clearance', () => {
            expect(findClearanceViolations(vertices).join('; ')).toBe('');
        });

        it('never terminates an edge behind its own source', () => {
            expect(describeDirectionViolations(findDirectionViolations(vertices))).toBe('');
        });
    });

    /*
     * ========================================================================
     *  THE DEFECT ROSTER — journal decision 72. WHICH OF THESE FOUR IS UNIVERSAL, MEASURED.
     * ========================================================================
     *
     * Decision 72 enrolled the seven known-defect fixtures and required each invariant to be swept
     * over them and pinned at whatever really holds. Measured 2026-08-28, the four checks split:
     *
     *  - THE RATE CHECK IS UNIVERSAL. Not one bisector on any of the seven points backwards through
     *    the wavefront, so it is asserted at the clean bar below and is the one causality property
     *    the whole corpus shares. That is the invariant journal decision 70 installed, holding
     *    everywhere including on shapes the solver otherwise gets wrong.
     *
     *  - DIRECTION WAS NOT, AND IS AS OF 2026-08-29. Two of the four near-floor jitter fixtures
     *    terminated edges behind their own source; every one of those counts is now zero and the
     *    table below is all zeroes. It is kept, with its per-fixture rows, because it is the
     *    instrument that measured the cure and the one that will see a relapse — see
     *    {@link DEFECT_CAUSALITY_SIGNATURES} for what each row cost and what removed it.
     *
     *  - OFFSET AND CLEARANCE ARE UNIVERSAL AS OF 2026-08-28, and were not before. See below: they
     *    were never broken; the oracle that measured them was.
     *
     * ------------------------------------------------------------------------
     * SIX OF THE PINNED VIOLATIONS WERE THE ORACLE'S OWN, AND ARE WITHDRAWN
     * ------------------------------------------------------------------------
     *
     * Measured 2026-08-28 under journal decision 75. `deriveNodeOffsets` used to name the polygon
     * edge a node is dated against by indexing the CALLER'S vertex array with a parent index written
     * in the SOLVER'S. Those two index spaces are the same array only while the boundary stage
     * removes nothing — and it removes 3, 4 and 4 vertices respectively from
     * `Off-edge Jitter Reflex L (seed 15838)`, `Off-edge Jitter Plus (seed 7919)` and
     * `(seed 55433, k=4)`, whose jitter sits at the noise floor by construction. Every offset past
     * the first removal was therefore measured against the wrong supporting line, and the offset and
     * clearance counts those three carried — 1/2, 6/10 and 3/5 — were fabricated by the measurement.
     * They are zero against the polygon the solver actually solved.
     *
     * THE ATTRIBUTION IS EXACT, WHICH IS WHY THIS IS A WITHDRAWAL AND NOT A WEAKENING. Precisely the
     * three renumbered fixtures carried non-zero offset and clearance counts, and precisely the
     * un-renumbered fourth — `(seed 55433)` — carried none. Its two DIRECTION violations survive the
     * correction untouched, as do the plus seed's three: direction is measured from basis vectors and
     * never went through the mis-indexed oracle. So the check is not blinded, the decision-67 defect
     * is still visible here, and the three fixtures stay in `KNOWN_DEFECT_POLYGONS` on the census-grid
     * signatures that put them there.
     *
     * WHAT SURVIVED OF THE SILENT-WRONG-ANSWER FINDING, AND WHAT IS LEFT OF IT NOW. `(seed 55433)`,
     * `(seed 55433, k=4)` and `Off-edge Jitter Plus (seed 7919)` all reported `complete: true` while
     * terminating edges behind their own source, and this table was the only sweep besides I5 that
     * saw it. On 2026-08-29 all three went to zero here and to zero on I5 together — the two
     * instruments were reading ONE class from two directions, and the same two changes emptied both:
     * the earliest-arrival narrowing of `handleInteriorNGon`'s refused layer, and the leading-source
     * closure of a collinear same-direction pair in `handleInteriorEdgePair`. These three fixtures
     * stay enrolled on their census-grid signatures, which are decision-96 sliver declines.
     *
     * THE NUMBERS FIRE IN BOTH DIRECTIONS. A count that grows is a regression; a count that shrinks
     * is a partial cure that must be re-measured and, at zero across a fixture's whole signature —
     * the census grid included, not this table alone — promoted. Do not adjust one to make the suite
     * green.
     */

    /**
     * Offset, clearance and direction violation counts per defect fixture. Direction measured
     * 2026-08-28; offset and clearance re-measured the same day against the corrected oracle.
     */
    const DEFECT_CAUSALITY_SIGNATURES: Record<string, {offset: number; clearance: number; direction: number}> = {
        'Off-edge Jitter Reflex L (seed 15838)': {offset: 0, clearance: 0, direction: 0},
        // Direction was 2, and both violations were the second bisector of a duplicate ridge: the
        // arm's collapsing 4-ring closed at BOTH ends in one step, 2.5e-11 apart in the wavefront
        // clock, and the later closure's bisector was wired back to the earlier node. Either of the
        // 2026-08-29 changes takes this row to zero on its own — the narrowing of
        // `handleInteriorNGon`'s refused layer stops the second closure firing in the same step at
        // all, and the leading-source closure in `handleInteriorEdgePair` refuses to cross-wire the
        // collinear pair it leaves behind. Measured both ways by mutation.
        'Off-edge Jitter Reflex L (seed 55433)': {offset: 0, clearance: 0, direction: 0},
        // Direction was 3, and this row needs BOTH changes: reverting the leading-source closure
        // alone puts it back to 1, reverting the narrowing alone puts it back to 2. Two of the three
        // were the leading half of a collinear same-direction pair cross-wired by
        // `handleInteriorEdgePair` — a closure that always sends one of the two edges backwards
        // along its own basis. The third is the narrowing's.
        'Off-edge Jitter Plus (seed 7919)': {offset: 0, clearance: 0, direction: 0},
        // Direction was 1 until the split/partition pass gained render-floor position identity
        // (journal decision 85): the violating edge was one half of the degenerate pair joining two
        // split nodes 5.4e-7 apart, and with the pair resolved into one node the edge was a
        // zero-length self-loop with no direction to disagree with. It returned as a DIFFERENT edge
        // on 2026-08-29 under the arrival ordering (journal decision 102), and that cost is recorded
        // here in full rather than absorbed:
        //
        //   `ie57 [11,17]`, n34 (324.99888973985594, 174.99991546169252) -> n36
        //   (324.9993972498838, 174.99991546676625) — 5.08e-4 in caller units, 1.69e-6 of the
        //   fixture's 300-unit extent, so 1.69 times the render floor and 0.0065 px on a 4K render
        //   of the whole shape.
        //
        // WHAT PUT IT THERE, TRACED, AND WHAT REMOVED IT. The root's five-edge ring
        // `[32,42,54,38,52]` has three of its arrivals — 42, 52 and 54 — at ONE point, agreeing to
        // 4e-12, with pairwise offsets spread over 9e-11. `mergesShareAnEdge` sent the whole layer
        // to the pairwise fallback, so that three-way vertex event was resolved two edges at a time
        // however it was ordered; by arrival it became 42+54, leaving 52 to pair with 38 at a
        // genuinely later offset (1.6e-11 later, and BOTH parents agree that reading to 3.3e-16 —
        // there was no mis-computed offset in that decision). The near-degenerate triangle that
        // followed put n36 1.69 floors behind n34.
        //
        // IT WAS NEVER AN OFFSET DEFECT. The offsets that chose the pairing were sound; what was
        // unsound was resolving as ONE layer a set of arrivals the offsets separate by a million
        // ulps. `handleInteriorNGon` now narrows a refused layer to its earliest arrival moment, so
        // 42+54 resolve alone as a whole vertex event and 52 arrives at the node they built on the
        // next step instead of being paired away from it. Direction 1 -> 0, and this row is the
        // NARROWING'S OWN conviction: reverting it puts the row back to 1 with the leading-source
        // closure still in place.
        'Off-edge Jitter Reflex L (seed 55433, k=4)': {offset: 0, clearance: 0, direction: 0},
        // `Collinear Dumbbell` was here at {0, 0, 0} and left this table with the roster on
        // 2026-08-28 (journal decision 90). Its row is worth remembering: all three counts were
        // zero the whole time it was the corpus's one silent wrong answer, which is what
        // `strip-tiling.test.ts` and I4 exist for — causality never saw it.
        'Near Regular Circle 48': {offset: 0, clearance: 0, direction: 0},
        'Near Regular Rosette5 40': {offset: 0, clearance: 0, direction: 0},
    };

    describe.each(KNOWN_DEFECT_POLYGONS)('$name (known defect)', ({name, vertices}) => {
        const signature = DEFECT_CAUSALITY_SIGNATURES[name];

        it('never points a bisector backwards through the wavefront — the universal one', () => {
            expect(findBackwardsRateViolations(vertices).join('; ')).toBe('');
        });

        it('runs backwards in time along exactly its pinned number of skeleton edges', () => {
            expect(findOffsetViolations(vertices)).toHaveLength(signature.offset);
        });

        it('places exactly its pinned number of nodes beyond their own clearance', () => {
            expect(findClearanceViolations(vertices)).toHaveLength(signature.clearance);
        });

        it('terminates exactly its pinned number of edges behind their own source', () => {
            expect(findDirectionViolations(vertices)).toHaveLength(signature.direction);
        });
    });

    it('attributes a causality signature to every known-defect fixture, and to no one else', () => {
        // Without this, a fixture enrolled after today would have no entry, `signature` would be
        // undefined and its three pinned tests would throw rather than measure — or worse, a
        // defaulted zero would assert it CLEAN on invariants nobody had swept it against.
        expect(Object.keys(DEFECT_CAUSALITY_SIGNATURES).toSorted())
            .toEqual(KNOWN_DEFECT_POLYGONS.map(polygon => polygon.name).toSorted());
    });

    it('holds the rate invariant over the whole corpus, both rosters', () => {
        // The sweeps above take the two rosters separately, at different bars. This one states the
        // universal claim in one place, over the concatenation, so that a roster which stopped
        // being swept cannot take the rate check quietly with it.
        const violations = FULL_CORPUS.flatMap(polygon =>
            findBackwardsRateViolations(polygon.vertices).map(violation => `${polygon.name}: ${violation}`));
        expect(violations).toEqual([]);
        expect(FULL_CORPUS.length).toBe(CLEAN_TEST_POLYGONS.length + KNOWN_DEFECT_POLYGONS.length);
    });

    /**
     * The cells where the rate rule is a DISCRIMINATOR rather than a tripwire.
     *
     * The sweeps above are clean either way: no fixture at its native placement produced a backwards
     * bisector even before journal decision 70, which is why the defect stayed latent long enough to
     * ship a silent wrong answer. These three placements are where the previous code actually broke
     * the invariant, and each one reported `complete: true` while doing it — so without this block
     * the rate check would pass whatever `addBisectionEdge` did, and could not convict its own rule.
     *
     * Measured on the previous code: the jittered circle carries one backwards bisector at each of
     * these two rungs and the translated rosette carries three. All three now solve to a SIGNALLED
     * failure instead, which the suites that own those regimes assert
     * (`near-regular-polygons.test.ts`, `large-coordinate-known-failures.test.ts`); what is asserted
     * here is the narrower and more durable thing — that however the solve ends, no bisector in it
     * points backwards through the wavefront.
     *
     * The generator is `near-regular-polygons.test.ts`'s, repeated rather than shared because it is
     * six lines and importing it would make one suite's fixtures depend on another's helpers.
     */
    const BACKWARDS_BISECTOR_CELLS: [string, Vector2[]][] = [
        ['circle 32 jittered at 5x the tolerance, seed 12', jitterCell(NEAR_REGULAR_CIRCLE_32, 5, 12)],
        ['circle 32 jittered at 15x the tolerance, seed 2', jitterCell(NEAR_REGULAR_CIRCLE_32, 15, 2)],
        ['rosette5 40 translated to 2e11', NEAR_REGULAR_ROSETTE5_40.map(v => ({x: v.x + 2e11, y: v.y + 2e11}))],
    ];

    it.each(BACKWARDS_BISECTOR_CELLS)('%s points no bisector backwards', (_name, vertices) => {
        expect(findBackwardsRateViolations(vertices).join('; ')).toBe('');
    });

    /**
     * ONE MOVED AND FLAGGED CELL of this generator (journal decision 147): circle 32 jittered at 1x
     * the tolerance, seed 5. Attributed to `ensureBisectionIsInterior`'s "is this vertex straight?"
     * test moving from the retired 1e-8 to the angular resolution (journal decision 146), measured
     * by holding that one site at its old bar with every other site at its new one. The move reaches
     * this cell once and re-pairs it — 53 nodes to 52 — and its causality counts move MIXED:
     * offset 1 → 2, clearance 6 → 4, direction 2 → 1, still solving complete. Pinned with its counts
     * so a change that cures or worsens it is loud.
     */
    it('circle 32 jittered at 1x the tolerance, seed 5, carries its pinned causality counts', () => {
        const vertices = jitterCell(NEAR_REGULAR_CIRCLE_32, 1, 5);
        expect(runAlgorithmV5(vertices).graph.nodes).toHaveLength(52);
        expect({
            offset: findOffsetViolations(vertices).length,
            clearance: findClearanceViolations(vertices).length,
            direction: findDirectionViolations(vertices).length,
        }).toEqual({offset: 2, clearance: 4, direction: 1});
    });
});
