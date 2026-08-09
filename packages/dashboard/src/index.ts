// Types
export type { DebugDisplayOptions, CollisionSweepLine } from './types';

// Stores
export { usePolygonStore } from './stores/usePolygonStore';
export type { Vertex } from './stores/usePolygonStore';
export { useRandomPolygonStore } from './stores/useRandomPolygonStore';
export { usePlaybackStore } from './stores/usePlaybackStore';
export type { PlaybackStoreState } from './stores/usePlaybackStore';

// Hooks
export { useSkeletonAnimation } from './hooks/useSkeletonAnimation';
export type { SkeletonAnimationState } from './hooks/useSkeletonAnimation';
export { useCollisionSweep } from './hooks/useCollisionSweep';
export type { CollisionSweepState } from './hooks/useCollisionSweep';
export type { PlaybackControllerState } from './hooks/PlaybackControllerState';

// Scene DSL
export type { StrokeStyle, FillStyle, TextStyle, SceneLine, ScenePoint, SceneLabel, SceneGroup, ScenePrimitive } from './scene/types';
export { SceneCanvas } from './scene/SceneCanvas';
export type { SceneCanvasProps } from './scene/SceneCanvas';
export { skeletonToScene, turtleToScene, parcelColour, parcelsToScene, stripColour } from './scene/adapters';
export type { ParcelsToSceneParams } from './scene/adapters';

// Components
/** @deprecated Use SceneCanvas + skeletonToScene + SkeletonInteractionOverlay instead. Will be removed in a future release. */
export { default as PolygonCanvas } from './components/PolygonCanvas';
export { SkeletonInteractionOverlay, useSkeletonStageClick } from './components/SkeletonInteractionOverlay';
export type { SkeletonInteractionOverlayProps } from './components/SkeletonInteractionOverlay';
export { default as RandomPolygonPanel } from './components/RandomPolygonPanel';
export { default as ControlsPanel } from './components/ControlsPanel';
export { interpretGeometryPaste, MIN_POLYGON_VERTICES } from './components/geometry-clipboard';
export type { GeometryPasteAccepted, GeometryPasteOutcome, GeometryPasteRejected } from './components/geometry-clipboard';
export { default as AlgorithmPanel } from './components/AlgorithmPanel';
export { default as DebugPanel } from './components/DebugPanel';
export { default as PlaybackController } from './components/PlaybackController';
export { default as CollapseChevron } from './components/CollapseChevron';
export type { CollapseChevronProps } from './components/CollapseChevron';

// Pen Stroke → Spline
export { usePenStrokeStore } from './stores/usePenStrokeStore';
export type { PenStrokeStoreState } from './stores/usePenStrokeStore';
export { clampVertexBudget, DEFAULT_STROKE_REDUCTION_MODE, MAX_VERTEX_BUDGET, MIN_VERTEX_BUDGET, PenStrokeCanvas, PenStrokeCopyPanel, PenStrokeLerpPanel, PenStrokePipelinePanel, SliderNumberInput, STROKE_REDUCTION_MODES, summariseStrokeCopy } from './components/pen-stroke';
export type { SliderNumberInputProps, StrokeClipboardSummary, StrokeReductionMode } from './components/pen-stroke';

// D0L System
export { DOL_PRESETS } from './dol-system/presets';
export { useDolSystemStore } from './stores/useDolSystemStore';
export type { DolSystemStoreState } from './stores/useDolSystemStore';
export { useDolGeneration } from './hooks/useDolGeneration';
export type { DolGenerationState } from './hooks/useDolGeneration';
export { DolConfigPanel, DolGenerateButton, DolGenerationPanel, DolInstructionsPanel } from './components/dol-system';

// Parcel generation (strips → parcels)
export { useParcelStore, deriveSliceDefaults, effectiveSliceOptions, polygonArea, polygonPerimeter } from './stores/useParcelStore';
export type { DerivableSliceKey, DerivedSliceOptions, ParcelLayerVisibility, ParcelStoreState, SliceOptionSources } from './stores/useParcelStore';
export { useParcelPipeline } from './hooks/useParcelPipeline';
export type { ParcelPipelineFailure, ParcelPipelineResult, ParcelPipelineStage } from './hooks/useParcelPipeline';
export { ParcelControlsPanel, ParcelLayerPanel, ParcelReportPanel } from './components/parcels';
export type { ParcelControlsPanelProps, ParcelReportPanelProps } from './components/parcels';

// Articulation constraint solver
export { useArticulationStore } from './stores/useArticulationStore';
export type { ArticulationStoreState, TransformMode } from './stores/useArticulationStore';
export { ArticulationCanvas, ArticulationControlsPanel, ArticulationConstraintPanel } from './components/articulation';
