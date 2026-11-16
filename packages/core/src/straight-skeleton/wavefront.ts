/**
 * THE OLD HOME OF THE WAVEFRONT'S LINKS, re-exporting what moved, so every import path into it still resolves. The
 * solver imports from the modules themselves, each of which answers one question:
 *
 *  - `wavefront-links.ts`: the stored links, their first rings, their readers and the one orbit that walks them.
 *  - `layer-links.ts`: one layer's link state, the pending births, and the events' two rewrites (a gap and a cut).
 *  - `ring-components.ts`: which child each ring a step of several rings leaves goes to.
 *  - `step-scope.ts`: the step being handled, and its refusal by name.
 *  - `wavefront-check.ts`: W1 to W4, and the standing gate's probe.
 */
export {
    areNeighbours,
    exteriorFaceIsClosed,
    linkGuardRefuses,
    linkInitialRing,
    linkInitialRings,
    makeWavefront,
    NOT_LIVE,
    openWavefrontSlot,
    orbit,
    pairCollapseSides,
    retireBisector,
    retireBisectors,
    ringsOfWavefront,
    wavefrontSegmentsOf,
} from "./wavefront-links";
export {
    birthsClosedAtOneNode,
    droppableBirths,
    LayerLinks,
    linkBirth,
    linkMergeGap,
    linkMergeGapOnWall,
    linkPairCollapse,
    linkSplit,
    linkVertexToVertex,
    partitionArc,
    settleLayerLinks,
} from "./layer-links";
export {beginStep, currentStepMembers, endStep, refuseStep} from "./step-scope";
export type {StepScope} from "./step-scope";
export type {StepRefusalKind} from "./types";
export {componentsOfRings, ringPolygonAt} from "./ring-components";
export type {RingComponent} from "./ring-components";
export {activeWavefrontProbe, checkWavefront, setWavefrontProbe} from "./wavefront-check";
export type {WavefrontProbe} from "./wavefront-check";
