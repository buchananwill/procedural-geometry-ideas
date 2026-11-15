/*
 * A WEIGHTED SKELETON'S EDGES NEVER RUN BACKWARDS IN TIME (docs/notes/ISSUE-skeleton-weighted-edge-runs-backwards-in-time.md;
 * BSA.F101, BSA.F102, BSA.D309). THESE TESTS ARE RED BY DESIGN (BSA.D266): each is one of the node 4 reviewer's smallest
 * reproducers of a defect in the solver on weighted input, which predates holes, and each asserts the property the
 * solver should meet. The cure would change how single-loop events resolve, which the user has reserved; until it
 * lands these stay red, and none of them is ever made green by asserting the defect.
 *
 * THE PROPERTY, stated independently of any script: for an interior node `p`, `W(p)` is the clockwise and widdershins
 * parents over every interior edge incident to `p`; `d(p, e)` is the perpendicular distance from `p` to the line
 * through exterior edge `e`'s own source and target, and `w_e` its weight in `graph.exteriorWeights`. The node's time
 * is `T(p) = d(p, e) / w_e` for an `e` in `W(p)` (here the clockwise parent of its lowest-id incident interior edge);
 * an exterior node has `T = 0`. Every interior edge with a target has `T(target) >= T(source) - 1e-9 * extent`, with
 * `extent` the largest absolute outline coordinate, or 1 if smaller.
 *
 * The coordinates are the reviewer's, verbatim (fuzz seeds named after each). Outlines are clockwise, holes
 * counter-clockwise; every other option is the default.
 */
import type {SkeletonHole, StraightSkeletonGraph, Vector2} from '@proc-geo/core';
import {setSkeletonLogLevel, solveSkeleton} from '@proc-geo/core';

setSkeletonLogLevel('silent');

interface Reproducer {
    name: string;
    outline: Vector2[];
    holes: SkeletonHole[];
    weights?: number[];
}

/** Each node's time, `d(p, e) / w_e`, by the definition in the header. */
function nodeTimes(graph: StraightSkeletonGraph): Map<number, number> {
    const times = new Map<number, number>();
    for (let node = 0; node < graph.numExteriorNodes; node++) {
        times.set(node, 0);
    }
    const dating = new Map<number, {edge: number; wall: number}>();
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        for (const node of [edge.source, edge.target]) {
            if (node === undefined || node < graph.numExteriorNodes) {
                continue;
            }
            const held = dating.get(node);
            if (held === undefined || interior.id < held.edge) {
                dating.set(node, {edge: interior.id, wall: interior.clockwiseExteriorEdgeIndex});
            }
        }
    }
    for (const [node, {wall}] of dating) {
        const a = graph.nodes[graph.edges[wall].source].position;
        const b = graph.nodes[graph.edges[wall].target!].position;
        const p = graph.nodes[node].position;
        const distance = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        times.set(node, distance / graph.exteriorWeights[wall]);
    }
    return times;
}

/** Every interior edge whose target is earlier than its source by more than the tolerance, described. */
function edgesBackwardsInTime(graph: StraightSkeletonGraph, tolerance: number): string[] {
    const times = nodeTimes(graph);
    const found: string[] = [];
    for (const interior of graph.interiorEdges) {
        const edge = graph.edges[interior.id];
        if (edge.target === undefined) {
            continue;
        }
        const from = times.get(edge.source)!;
        const to = times.get(edge.target)!;
        if (to < from - tolerance) {
            found.push(`edge ${interior.id} (cw ${interior.clockwiseExteriorEdgeIndex}, ws ${interior.widdershinsExteriorEdgeIndex}): `
                + `node ${edge.source} at T ${from} -> node ${edge.target} at T ${to}`);
        }
    }
    return found;
}

const extentOf = (outline: Vector2[]) => Math.max(1, ...outline.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]));

function solve(reproducer: Reproducer) {
    return solveSkeleton(reproducer.outline, {holes: reproducer.holes, weights: reproducer.weights});
}

/** 1. Weighted holed, complete but wrong ("fuzz 199"). */
const FUZZ_199: Reproducer = {
    name: '1. weighted holed, complete with an edge backwards in time (fuzz 199)',
    outline: [{"x":4.644951381349675,"y":-6.755622066955957},{"x":-4.676706086567728,"y":-1.8051107689625472},{"x":-5.856314077244432,"y":4.453583238847551},{"x":-7.110811353116291,"y":6.3960198401196955},{"x":-4.502168286839199,"y":5.304885333975109}],
    holes: [{vertices: [{"x":-2.3583155490914054,"y":-0.9530021836380875},{"x":-3.4866321902198325,"y":-0.4669003737703935},{"x":-4.160980778008071,"y":-1.220304781069897},{"x":-2.7476422531883373,"y":-1.851482057156852},{"x":-2.1273971586308535,"y":-1.3570563212188393}],
        weights: [1.3717782009392976,0.8257213525474071,0.9963533831760287,1.449862015619874,0.7138404082506895]}],
};

/** 2a. Weighted holed, a step failure "Unable to generate any collisions" ("fuzz 800"). */
const FUZZ_800: Reproducer = {
    name: '2a. weighted holed, a step failure (fuzz 800)',
    outline: [{"x":-6.602335913977526,"y":-6.668006139997473},{"x":-3.9093524745943293,"y":-3.878506030517579},{"x":-2.9418017942056904,"y":7.4402662313086765},{"x":7.43598864339516,"y":4.6463272407510114},{"x":8.884075923577859,"y":0.19246328079157604}],
    holes: [{vertices: [{"x":0.2036690305547324,"y":1.9084273014829778},{"x":0.46946680657551365,"y":2.3683546680153773},{"x":-1.1255716930776942,"y":2.8056253542568053},{"x":-1.4397061894934629,"y":2.8790860196263273},{"x":0.26703867470469356,"y":1.4037669775484787}],
        weights: [0.9728379851207136,1.2841023184359073,1.1056124160066247,0.8931953536346554,1.1638014920055866]}],
};

/**
 * 2b. Weighted holed, refused at ring assignment after a missed corridor event ("fuzz 139"). The ring the missed event
 * leaves crosses itself, and is refused as such (BSA.D309): this is the specimen of that refusal on a real solve.
 */
const FUZZ_139: Reproducer = {
    name: '2b. weighted holed, refused after a missed corridor event (fuzz 139)',
    outline: [{"x":7.77980530363758,"y":-4.37250839351537},{"x":-2.0839613812627804,"y":-9.418724644114338},{"x":-4.0776719242663475,"y":-5.033886572358891},{"x":-5.669201715626355,"y":-1.0269455579234053},{"x":-7.625427329999916,"y":0.8879481266712327},{"x":-7.972155331377354,"y":2.062775843180972},{"x":-6.117117137536095,"y":5.299566350670847},{"x":8.60694939356697,"y":0.5832995238042615}],
    holes: [
        {vertices: [{"x":-5.510333638428296,"y":2.958206949707184},{"x":-5.57826028224894,"y":3.1355792519887378},{"x":-5.718861317723843,"y":3.0875843365772186},{"x":-6.085686817520632,"y":3.0113902513344666},{"x":-6.1481470210383,"y":2.78184923994022}],
            weights: [0.9488593719899654,1.1206445002928376,0.7394697891548275,0.8585677253082394,0.997987462207675]},
        {vertices: [{"x":-0.8471440851927066,"y":-5.228484662841618},{"x":-1.885711451656845,"y":-4.2538578999393515},{"x":-2.271765642524117,"y":-4.353280087751914},{"x":-3.4228926739023375,"y":-4.480785690271183},{"x":-3.313875482078866,"y":-5.135688543205228},{"x":-1.6332965112443547,"y":-7.112023584187958}],
            weights: [1.3525788301602006,1.3293772913515567,1.3454960988834501,0.869056830741465,1.0938364401459695,0.8600298138335347]},
    ],
};

/** 3a. Weighted single loop, complete but wrong ("fuzz 147"). */
const FUZZ_147: Reproducer = {
    name: '3a. weighted single loop, complete with an edge backwards in time (fuzz 147)',
    outline: [{"x":5.923079498004734,"y":-0.1713378555338003},{"x":2.401883588600462,"y":-1.2806078059524135},{"x":1.3022974957801552,"y":-1.5867918178415665},{"x":3.0108975486652887,"y":-7.76956801766187},{"x":-2.6442745993218235,"y":-8.964820521275756},{"x":0.09005796436641586,"y":2.595975424656179},{"x":6.619116675708805,"y":4.326486552930545}],
    holes: [],
    weights: [1.4820723602548243,1.1649640571326016,1.1237987250089645,1.059144739806652,1.4333649205043912,0.9666668130084872,1.438003096729517],
};

/** 3b. Weighted single loop, incomplete ("fuzz 138"). */
const FUZZ_138: Reproducer = {
    name: '3b. weighted single loop, incomplete (fuzz 138)',
    outline: [{"x":0.15787535625951496,"y":-4.804208917022127},{"x":-2.062023612171879,"y":-1.9386386163760727},{"x":-8.41758414381089,"y":-1.955849803234976},{"x":-7.195861956604123,"y":4.411866299047293},{"x":1.7786980909564174,"y":4.557528821571131},{"x":0.7720089168703295,"y":1.896508598321967},{"x":2.7148462647050873,"y":2.5401482210520556},{"x":6.936145514102714,"y":3.894288976340948}],
    holes: [],
    weights: [0.7998054536059498,0.9329725854098796,1.3161114612594247,0.9600393081083893,1.4540400480851532,1.1018779234960676,1.2871540801599621,1.3080091727897525],
};

describe('a weighted skeleton never runs backwards in time (red until the issue is cured)', () => {
    it.each([FUZZ_199, FUZZ_147].map(reproducer => [reproducer.name, reproducer] as const))(
        '%s: no interior edge runs backwards in time', (_name, reproducer) => {
            const result = solve(reproducer);
            expect(result.complete).toBe(true);
            expect(edgesBackwardsInTime(result.graph, 1e-9 * extentOf(reproducer.outline))).toEqual([]);
        });

    it.each([FUZZ_800, FUZZ_139, FUZZ_138].map(reproducer => [reproducer.name, reproducer] as const))(
        '%s: completes, and no interior edge runs backwards in time', (_name, reproducer) => {
            const result = solve(reproducer);
            expect(result.diagnostics.filter(diagnostic => diagnostic.kind === 'step-failure'
                || diagnostic.kind === 'multi-ring-step-refused' || diagnostic.kind === 'simultaneous-across-rings')
                .map(diagnostic => `${diagnostic.kind}: ${diagnostic.detail}`)).toEqual([]);
            expect(result.complete).toBe(true);
            expect(edgesBackwardsInTime(result.graph, 1e-9 * extentOf(reproducer.outline))).toEqual([]);
        });
});
