/*
 * ============================================================================
 *  @proc-geo/core — THE BARREL
 * ============================================================================
 *
 * The straight skeleton comes first, in four groups:
 *  - SOLVE: the entries, their options and results, the graph they return, the loops of one input, and the boundary
 *    transforms and bars a caller reads to stay inside the solver's contract.
 *  - CONSUMERS: what reads a solved skeleton: offsets, strips, the tree and its spine, regions, recursive subdivision
 *    and parcels.
 *  - DIAGNOSTICS: what a solve reports, and refuses, and the checks and views that inspect one.
 *  - INTERNALS: the step machinery, public for tests and the dashboard's step-through and debug views.
 * The library's other modules follow.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  SOLVE
// ═════════════════════════════════════════════════════════════════════════════

// ── The solve entries (`runAlgorithmV5` and `runAlgorithmV5Stepped` are legacy) ──
export {
  runAlgorithmV5,
  runAlgorithmV5Stepped,
  solveSkeleton,
  solveSkeletonStepped,
} from './straight-skeleton/solve-entry';
export { assertWeightsChangeOnlyAtVisibleCorners, canonicaliseForSolve } from './straight-skeleton/boundary-stage';

// ── Options and results ──────────────────────────────────────────────────────
export type {
  SolveSkeletonOptions,
  HoleOptions,
  SkeletonHole,
  WeightOptions,
  PerceptualFloorOptions,
  SkeletonSolveResult,
  SteppedSkeletonSolveResult,
  SteppedAlgorithmResult,
} from './straight-skeleton/types';

// ── The solved graph ─────────────────────────────────────────────────────────
export type {
  Vector2,
  PolygonNode,
  PolygonEdge,
  PrimaryInteriorEdge,
  Arrival,
  InteriorEdge,
  StraightSkeletonGraph,
  RayProjection,
  GraphHelpers,
  StraightSkeletonSolverContext,
} from './straight-skeleton/types';
export { SkeletonDirection } from './straight-skeleton/types';

// ── The loops of one input: an outline and its holes (skeleton loops-input spec) ──
export type { SkeletonLoop, SkeletonLoopMap } from './straight-skeleton/types';
export { findLoopConflict, groupLoopsByNesting } from './straight-skeleton/skeleton-loops';
export type { LoopConflict, LoopConflictKind, LoopGroup } from './straight-skeleton/skeleton-loops';
export { adjacentExteriorEdge, loopOfExteriorEdge, skeletonHoleCount } from './straight-skeleton/graph-helpers';

// ── Unit-extent normalisation (the solver's boundary transform) ──────────────
export type { SkeletonNormalisation } from './straight-skeleton/normalisation';
export {
  SMALLEST_NORMAL_DOUBLE,
  makeSkeletonNormalisation,
  normalisePosition,
  denormalisePosition,
  normaliseLength,
  denormaliseLength,
  normaliseArea,
  denormaliseArea,
  normalisePolygon,
  denormaliseGraph,
  denormaliseCollisionCache,
} from './straight-skeleton/normalisation';

// ── Input canonicalisation (the render-scale noise floor) ────────────────────
export type { CanonicalPolygon } from './straight-skeleton/canonicalisation';
export { REMOVED_VERTEX_INDEX, SKELETON_NOISE_FLOOR, canonicalisePolygon, resolvePerceptualFloor } from './straight-skeleton/canonicalisation';

// ── Tolerances and bars ──────────────────────────────────────────────────────
export {
  angularResolution,
  ARRIVAL_MOMENT_ULPS,
  coaxialityFloor,
  conditioningBound,
  CROSS_PRODUCT_ROUNDING_UNITS,
  degenerateAreaBar,
  maxWeightRatio,
  minWeightTurnSine,
  perceptualBound,
  simultaneityWindow,
  UNIT_ROUNDOFF,
} from './straight-skeleton/constants';

// ═════════════════════════════════════════════════════════════════════════════
//  CONSUMERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Offset projection ────────────────────────────────────────────────────────
export {
  computeNodeOffsets,
  computeMaxOffset,
  computeOffsetRings,
  computeOffsetRingsDetailed,
  projectOffsetWavefront,
  requireProjectableResult,
  requireSingleLoopResult,
} from './straight-skeleton/offset-projection';
export type {
  DegenerateCycle,
  OffsetProjection,
  OffsetRing,
  OffsetRingSegment,
  OffsetRingVertex,
  UnclosedChain,
  UnclosedChainReason,
} from './straight-skeleton/offset-projection';

// ── Strip decomposition ──────────────────────────────────────────────────────
export { computeStrips } from './straight-skeleton/strip-decomposition';
export type {
  Strip,
  StripOptions,
  CornerContext,
  CornerAssignment,
} from './straight-skeleton/strip-decomposition';

// ── Skeleton tree substrate ──────────────────────────────────────────────────
export { buildSkeletonTree, skeletonTreeDiameter } from './straight-skeleton/skeleton-tree';
export type { SkeletonTree, SkeletonTreeEdge } from './straight-skeleton/skeleton-tree';

// ── Spine extraction ─────────────────────────────────────────────────────────
export { extractSpine } from './straight-skeleton/spine';
export type { Spine, SpineStrategy } from './straight-skeleton/spine';

// ── Regions and boundary provenance ──────────────────────────────────────────
export type { BoundaryProvenance, BoundaryRun, Region } from './straight-skeleton/region';
export {
  ACCESS_PROVENANCES,
  accessRuns,
  assertBoundaryPartition,
  assertRunPartition,
  isAccessProvenance,
  makeRootRegion,
  remapRuns,
  runBoundaryVertexIndices,
  runEdgeCount,
} from './straight-skeleton/region';

// ── Recursive segment subdivision ────────────────────────────────────────────
export {
    FALLBACK_LEVEL_SPEC,
    FULL_DEPTH_FRACTION,
    MAX_RECURSION_LEVELS,
    MIN_RECURSION_LEVELS,
    ROOT_REGION_ID,
    childRegionId,
    clampDepthFraction,
    clampLevelSpecs,
    clampLevels,
    clampMergeGroupSize,
    findRegionById,
    flattenRecursiveTree,
    isLastLevel,
    makeMergeGroupPredicate,
    subdivideRecursively,
    uniformLevelSpecs,
} from './straight-skeleton/recursive-subdivision';
export type {
    LevelPolicy,
    LevelSpec,
    RecursiveNode,
    RecursiveOptions,
    RecursiveRun,
    RegionOutcome,
    RegionProvenance,
    ResidueTreatment,
    SameLogicalStreetPredicate,
    SegmentOutcome,
    SegmentTreatment,
    UniformLevelSpecsInput,
} from './straight-skeleton/recursive-subdivision';

// ── Parcel slicing ───────────────────────────────────────────────────────────
export { sliceStrip, sliceStrips } from './straight-skeleton/parcel-slicing';
export type { Parcel, SliceOptions } from './straight-skeleton/parcel-slicing';

// ═════════════════════════════════════════════════════════════════════════════
//  DIAGNOSTICS
// ═════════════════════════════════════════════════════════════════════════════

// ── What a solve reports, and which kinds block ──────────────────────────────
export type {
  SkeletonDiagnosticKind,
  SkeletonDiagnostic,
  GeneralSkeletonDiagnosticKind,
  GeneralSkeletonDiagnostic,
  CausalityOracle,
  CausalityViolationDiagnostic,
  StepRefusalKind,
} from './straight-skeleton/types';
export {
  INFORMATIONAL_DIAGNOSTIC_KINDS,
  isBlockingDiagnosticKind,
  STEP_REFUSAL_KINDS,
} from './straight-skeleton/diagnostic-kinds';
export type { BlockingDiagnosticKind, InformationalDiagnosticKind } from './straight-skeleton/diagnostic-kinds';

// ── What a solve refuses outright ────────────────────────────────────────────
export { SkeletonInputRefusal } from './straight-skeleton/input-refusal';
export type { SkeletonInputRefusalKind } from './straight-skeleton/types';

// ── Post-solve wavefront causality check (journal-5 decision 148) ────────────
export { checkWavefrontCausality } from './straight-skeleton/causality-check';

// ── The wavefront's stored order (skeleton wavefront-order spec, stage 1) ────
export type { Wavefront, WavefrontSegment } from './straight-skeleton/types';
export { ringsOfWavefront } from './straight-skeleton/wavefront-links';
export { checkWavefront } from './straight-skeleton/wavefront-check';

// ── Debug helpers ────────────────────────────────────────────────────────────
export {
  generateCollisionSweep,
  computeNodeOffsetDistances,
  computePrimaryInteriorEdges,
  computePrimaryEdgeIntersections,
} from './straight-skeleton/debug-helpers';
export type { CollisionSweepEvent } from './straight-skeleton/debug-helpers';

// ── Logger ───────────────────────────────────────────────────────────────────
export { solverLog, collisionLog, splitLog, complexLog, stepLog, setSkeletonLogLevel } from './straight-skeleton/logger';
export type { LogLevel } from './straight-skeleton/logger';

// ═════════════════════════════════════════════════════════════════════════════
//  INTERNALS
// ═════════════════════════════════════════════════════════════════════════════

// ── Step machinery types ─────────────────────────────────────────────────────
export type {
  SplitOffsetResult,
  CollisionEvent,
  PairEvent,
  SplitEvent,
  UnresolvableEvent,
  ResolvableEvent,
  BisectionParams,
  AlgorithmStepInput,
  AlgorithmStepOutput,
  EdgeRank,
  IntersectionType,
  IntersectionResult,
  CollisionType,
  CollisionCacheEntry,
  CollisionCache,
} from './straight-skeleton/types';
export { CollisionTypePriority } from './straight-skeleton/types';

// ── Core math ────────────────────────────────────────────────────────────────
export {
  areEqual,
  vectorsAreEqual,
  sineIsBelow,
  directionsAreSame,
  assertIsNumber,
  fp_compare,
  addVectors,
  subtractVectors,
  scaleVector,
  rotateCw90,
  rotateWs90,
  sizeOfVector,
  normalize,
  makeBasis,
  makeBisectedBasis,
  makeWeightedBisectedBasis,
  negateVector,
  findPositionAlongRay,
  makeRay,
  crossProduct,
  dotProduct,
  projectToPerpendicular,
  projectFromPerpendicular,
} from './straight-skeleton/core-functions';

// ── Graph construction ───────────────────────────────────────────────────────
export { addNode, interiorEdgeIndex, initBoundingPolygon } from './straight-skeleton/graph-helpers';

// ── Solver context ───────────────────────────────────────────────────────────
export { makeStraightSkeletonSolverContext } from './straight-skeleton/solver-context';

// ── Intersection ─────────────────────────────────────────────────────────────
export {
  intersectRays,
  lateralOffset,
  symmetricLateralOffset,
} from './straight-skeleton/intersection-edges';

// ── Algorithm helpers ────────────────────────────────────────────────────────
export {
  ensureBisectionIsInterior,
  ensureDirectionNotReversed,
  addBisectionEdge,
  createBisectionInteriorEdge,
  bisectWithParams,
  initInteriorEdges,
  tryToAcceptExteriorEdge,
} from './straight-skeleton/algorithm-helpers';

// ── Collision ────────────────────────────────────────────────────────────────
export {
  arrivalOf,
  arrivalsAreEqual,
  bestNonPhantomCollision,
  birthArrivalOf,
  collisionDistanceFromBasisUnits,
  compareArrivals,
  laterArrival,
  pairSimultaneityWindow,
  compareArrivalsAtPairWindow,
  arrivalsAreSimultaneous,
  rayIntersectionUncertainty,
  sourceOffsetDistance,
  timeOf,
  collideInteriorAndExteriorEdge,
  makeOffsetDistance,
  collideInteriorEdges,
  collideEdges,
  findOrComputeCollision,
  checkSharedParents,
  NO_COLLISION_RESULTS,
} from './straight-skeleton/collision-helpers';

// ── Collision handling ───────────────────────────────────────────────────────
export { default as handleCollisionEvent } from './straight-skeleton/collision-handling';
// The link state of the layer an event belongs to, which `handleCollisionEvent` writes its pending births into.
export { LayerLinks } from './straight-skeleton/layer-links';

// ── Split events ─────────────────────────────────────────────────────────────
export {
  generateSplitEvent,
  generateSplitEventViaBisector,
  generateSplitEventFromTheEdgeItself,
} from './straight-skeleton/generate-split-event';

// ── V5 algorithm: the handlers and the step driver ───────────────────────────
export {
  handleInteriorEdgePair,
  handleInteriorEdgeTriangle,
  TRIANGLE_INTERSECT_PAIRINGS,
} from './straight-skeleton/algorithm-termination-cases';
export { createCollisions, handleInteriorNGon } from './straight-skeleton/algorithm-complex-cases';
export { driveSteps, handleAlgorithmStepInput, stepAlgorithm } from './straight-skeleton/step-driver';

// ── Graph merge (polygon decomposition) ──────────────────────────────────────
export { mergeSkeletonGraphs, makeMergedSolverContext } from './straight-skeleton/graph-merge';
export type { SubPolygonResult, MergedGraphResult } from './straight-skeleton/graph-merge';

export {
  findFirstCrossing,
  splitAtCrossing,
  decomposePolygon,
  ensureClockwise as ensureClockwiseSkeleton,
} from './straight-skeleton/polygon-decomposition';
export type { CrossingPoint, DecompositionResult } from './straight-skeleton/polygon-decomposition';

// ═════════════════════════════════════════════════════════════════════════════
//  THE LIBRARY'S OTHER MODULES
// ═════════════════════════════════════════════════════════════════════════════

// ── Random polygon ──────────────────────────────────────────────────────────
export type {
  RangeParams,
  RandomPolygonParams,
  SegmentIntersection,
  GeneratorState,
  GeneratorStatus,
} from './random-polygon/types';

export {
  DEFAULT_PARAMS,
  randomInRange,
  randomEdgeLength,
  randomAngleDelta,
  basisFromAngle,
  initGeneratorState,
  step as randomPolygonStep,
  ensureClockwise,
  generate as generateRandomPolygon,
} from './random-polygon/generator';

export {
  segmentSegmentIntersection,
  signedArea,
  ringPerimeter,
  isClockwise,
  findSelfIntersection,
  findClosingIntersection,
} from './random-polygon/geometry-helpers';

// ── Stroke → spline ──────────────────────────────────────────────────────────
export type {
    StrokePoint,
    CubicBezier,
    SmoothingConfig,
    SimplificationConfig,
    CornerDetectionConfig,
    FittingConfig,
    StrokePipelineConfig,
    CornerDetectionResult,
    SplineParameterization,
    FitResult,
    StrokePipelineResult,
} from './stroke-spline';
export {
    evaluateCubicBezier,
    cubicBezierDerivative,
    cubicBezierSecondDerivative,
    smoothStroke,
    simplifyStroke,
    detectCorners,
    fitStrokeSpline,
    fitCatmullRom,
    fitStroke,
    mapByArcLengthFraction,
    flattenSpline,
    mapRawToSpline,
    runStrokePipeline,
    lerpStroke,
    DEFAULT_STROKE_PIPELINE_CONFIG,
    SMOOTHING_VARIANT_DEFAULTS,
    SIMPLIFICATION_VARIANT_DEFAULTS,
    CORNER_DETECTION_VARIANT_DEFAULTS,
    FITTING_VARIANT_DEFAULTS,
} from './stroke-spline';

// ── Stroke → spline: closed loops ────────────────────────────────────────────
export type { ClosureConfig, SeamNeighbours } from './stroke-spline';
export { isStrokeClosed, isSeamCorner, closeFittedChain, CLOSURE_VARIANT_DEFAULTS } from './stroke-spline';

// ── D0L system ────────────────────────────────────────────────────────────────
export {
    compile as compileDolSystem,
    generate as generateDolSystem,
    interpret as interpretDolSystem,
} from './dol-system';
export type {
    Keyword,
    Letter,
    DolSymbol,
    TurtleConfig,
    SystemConfig,
    CompiledSystem,
    LinkedToken,
    LinkedWord,
    GenerationResult,
    Segment as DolSegment,
    TurtleOutput,
    ValidationError as DolValidationError,
} from './dol-system';
export {KEYWORD_OPCODES, NUM_KEYWORDS, DolSystemValidationError} from './dol-system';

// ── Articulation constraint solver ───────────────────────────────────────────
export type {
    MinMax,
    ElementConstraints,
    ArticulationChain,
    TransformDelta,
    StrategyId,
    ElementClampTolerance,
    SolveInput,
    StrategyResult,
    SolveResult,
    StrategyInput,
    ConstraintStrategy,
} from './articulation';
export {
    ARTICULATION_EPSILON,
    DEFAULT_ELEMENT_CLAMP_TOLERANCE,
    jointAngleAt,
    isPoseValid,
    isPoseNoWorse,
    makePoseNoWorsePredicate,
    linkDistanceViolation,
    jointAngleViolation,
    measureClampedElementIndices,
    isContiguous,
    solveArticulation,
    STRATEGIES,
    CLAMP_COARSE_SAMPLE_COUNT,
    CLAMP_REFINEMENT_DEPTH,
    CLAMP_RESOLUTION,
    SPREAD_RELAXATION_ITERATIONS,
    SPREAD_REFINEMENT_SAMPLE_COUNT,
} from './articulation';

// ── Stroke → spline: vertex budgeting ────────────────────────────────────────
export type { VertexBudgetResult } from './stroke-spline';
export {
    reduceToVertexBudget,
    reduceRingToVertexBudget,
    strokeToBudgetedPolygon,
    strokeToRing,
    hasRedundantSeam,
    DEFAULT_VERTEX_BUDGET,
} from './stroke-spline';

// ── Stroke → spline: least-squares straightening ─────────────────────────────
export type { StraightenedBudgetResult, StraightenOptions } from './stroke-spline';
export { straightenToVertexBudget, strokeToStraightenedPolygon } from './stroke-spline';

// ── Shared geometry interchange payload ──────────────────────────────────────
export type {
    GeometryPayload,
    GeometryPayloadBody,
    GeometryPayloadEnvelope,
    GeometryPayloadKind,
    VertexRunBody,
} from './shared/geometry-payload';
export { GEOMETRY_PAYLOAD_FORMAT, GEOMETRY_PAYLOAD_VERSION, makeVertexRun } from './shared/geometry-payload';

export type {
    AssumedField,
    ParseFailureReason,
    ParseGeometryPayloadFailure,
    ParseGeometryPayloadResult,
    ParseGeometryPayloadSuccess,
    PayloadEncoding,
    SerialiseOptions,
} from './shared/geometry-payload-codec';
export {
    LEGACY_BARE_ARRAY_CLOSED,
    LEGACY_BARE_ARRAY_MIN_VERTICES,
    MAX_SERIALISED_LENGTH,
    parseGeometryPayload,
    serialiseGeometryPayload,
} from './shared/geometry-payload-codec';

// ── Terrain seam: batch point sampling, slope helpers, synthetic + mapgen4 sources ────────────
export type {
    AnalyticField,
    Bounds2,
    FitPlacementOptions,
    HemisphereSamplerOptions,
    Mapgen4PatchData,
    Mapgen4SamplerMetrics,
    Mapgen4SamplerOptions,
    Mapgen4TerrainSampler,
    PlaneSamplerOptions,
    PolygonSlopeOptions,
    PolygonSlopeStatistics,
    RidgeSamplerOptions,
    TerrainDomain,
    TerrainPlacement,
    TerrainSample,
    TerrainSampler,
    Vector3,
} from './terrain';
export {
    ASPECT_FLAT_TOLERANCE,
    DEFAULT_HORIZONTAL_EXTENT_METRES,
    DEFAULT_INTERIOR_SAMPLES,
    DEFAULT_VERTICAL_SCALE_METRES,
    MAPGEN4_PATCH,
    MAPGEN4_PATCH_ELEVATION_RANGE,
    MAPGEN4_PATCH_WINDOW_UNITS,
    TERRAIN_NORMAL_TOLERANCE,
    UNBOUNDED_DOMAIN,
    aspectDegrees,
    aspectRadians,
    bearingDegrees,
    bearingRadians,
    boundsOfPoints,
    clampToDomain,
    createAnalyticSampler,
    createFlatSampler,
    createHemisphereSampler,
    createMapgen4Sampler,
    createPlaneSampler,
    createRidgeSampler,
    createSlopeAspectPlaneSampler,
    downhillDirection,
    evaluatePolygonSlopes,
    fitPlacementToDomain,
    isInDomain,
    isPointInPolygon,
    isValidTerrainNormal,
    mapgen4ReliefMetres,
    normalFromGradient,
    normaliseUpward,
    slopeDegrees,
    slopeGrade,
    slopeRadians,
    squareDomain,
    uphillDirection,
} from './terrain';
