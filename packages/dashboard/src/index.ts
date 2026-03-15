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
export { skeletonToScene, turtleToScene } from './scene/adapters';

// Components
/** @deprecated Use SceneCanvas + skeletonToScene + SkeletonInteractionOverlay instead. Will be removed in a future release. */
export { default as PolygonCanvas } from './components/PolygonCanvas';
export { SkeletonInteractionOverlay, useSkeletonStageClick } from './components/SkeletonInteractionOverlay';
export type { SkeletonInteractionOverlayProps } from './components/SkeletonInteractionOverlay';
export { default as RandomPolygonPanel } from './components/RandomPolygonPanel';
export { default as ControlsPanel } from './components/ControlsPanel';
export { default as AlgorithmPanel } from './components/AlgorithmPanel';
export { default as DebugPanel } from './components/DebugPanel';
export { default as PlaybackController } from './components/PlaybackController';

// D0L System
export { DOL_PRESETS } from './dol-system/presets';
export { useDolSystemStore } from './stores/useDolSystemStore';
export type { DolSystemStoreState } from './stores/useDolSystemStore';
export { useDolGeneration } from './hooks/useDolGeneration';
export type { DolGenerationState } from './hooks/useDolGeneration';
export { DolConfigPanel, DolGenerationPanel } from './components/dol-system';
