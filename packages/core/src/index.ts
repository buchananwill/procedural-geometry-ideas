// ── Types ────────────────────────────────────────────────────────────────────
export type {
  Vector2,
  PolygonNode,
  PolygonEdge,
  PrimaryInteriorEdge,
  InteriorEdge,
  StraightSkeletonGraph,
  RayProjection,
  GraphHelpers,
  StraightSkeletonSolverContext,
  SplitOffsetResult,
  CollisionEvent,
  BisectionParams,
  AlgorithmStepInput,
  AlgorithmStepOutput,
  EdgeRank,
  IntersectionType,
  IntersectionResult,
  CollisionType,
  CollisionCacheEntry,
  CollisionCache,
  SkeletonDiagnosticKind,
  SkeletonDiagnostic,
  SkeletonSolveResult,
} from './straight-skeleton/types';
export { SkeletonDirection, CollisionTypePriority, NO_COLLISION_SENTINEL } from './straight-skeleton/types';

// ── Constants ────────────────────────────────────────────────────────────────
export { FLOATING_POINT_EPSILON, NO_COLLISION_RESULTS, TRIANGLE_INTERSECT_PAIRINGS } from './straight-skeleton/constants';

// ── Core math ────────────────────────────────────────────────────────────────
export {
  areEqual,
  vectorsAreEqual,
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
export { intersectRays } from './straight-skeleton/intersection-edges';

// ── Algorithm helpers ────────────────────────────────────────────────────────
export {
  ensureBisectionIsInterior,
  ensureDirectionNotReversed,
  addBisectionEdge,
  createBisectionInteriorEdge,
  bisectWithParams,
  initInteriorEdges,
  hasInteriorLoop,
  tryToAcceptExteriorEdge,
} from './straight-skeleton/algorithm-helpers';

// ── Collision ────────────────────────────────────────────────────────────────
export {
  bestNonPhantomCollision,
  collisionDistanceFromBasisUnits,
  sourceOffsetDistance,
  collideInteriorAndExteriorEdge,
  makeOffsetDistance,
  collideInteriorEdges,
  collideEdges,
  findOrComputeCollision,
  checkSharedParents,
} from './straight-skeleton/collision-helpers';

// ── Collision handling ───────────────────────────────────────────────────────
export { default as handleCollisionEvent } from './straight-skeleton/collision-handling';

// ── Split events ─────────────────────────────────────────────────────────────
export {
  generateSplitEvent,
  generateSplitEventViaBisector,
  generateSplitEventFromTheEdgeItself,
} from './straight-skeleton/generate-split-event';

// ── V5 algorithm ─────────────────────────────────────────────────────────────
export {
  handleInteriorEdgePair,
  handleInteriorEdgeTriangle,
  handleAlgorithmStepInput,
  stepAlgorithm,
  runAlgorithmV5,
  runAlgorithmV5Stepped,
  solveSkeleton,
} from './straight-skeleton/algorithm-termination-cases';
export type { SteppedAlgorithmResult, SolveSkeletonOptions } from './straight-skeleton/algorithm-termination-cases';

export { createCollisions, handleInteriorNGon } from './straight-skeleton/algorithm-complex-cases';

// ── Offset projection ────────────────────────────────────────────────────────
export {
  computeNodeOffsets,
  computeMaxOffset,
  computeOffsetRings,
} from './straight-skeleton/offset-projection';

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

// ── Parcel generation: offset provenance and strip decomposition ─────────────
export { computeOffsetRingsDetailed, requireProjectableResult } from './straight-skeleton/offset-projection';
export type {
    OffsetRing,
    OffsetRingSegment,
    OffsetRingVertex,
} from './straight-skeleton/offset-projection';
export { computeStrips } from './straight-skeleton/strip-decomposition';
export type {
    Strip,
    StripOptions,
    CornerContext,
    CornerAssignment,
} from './straight-skeleton/strip-decomposition';

// ── Parcel generation: slicing strips into parcels ───────────────────────────
export { sliceStrip, sliceStrips } from './straight-skeleton/parcel-slicing';
export type { Parcel, SliceOptions } from './straight-skeleton/parcel-slicing';
