// Spec decision 29: the viewer's toggles as plain immutable state. Layers, one switch per storey, and raw mode.

export const LAYER_KEYS = ['faces', 'edges', 'vertices', 'cellOutlines'] as const;
export type LayerKey = typeof LAYER_KEYS[number];

export interface ToggleState {
  layers: Readonly<Record<LayerKey, boolean>>;
  /** Spec decision 29's raw mode: every raw part before the union, drawn as a translucent ghost. */
  raw: boolean;
  /** Interpretation: colour Cell outlines by their NetEdge's kind instead of one neutral grey. */
  netKindOutlines: boolean;
  /** Storey index to shown. */
  storeys: Readonly<Record<number, boolean>>;
}

export const DEFAULT_LAYERS: Readonly<Record<LayerKey, boolean>> = {faces: true, edges: true, vertices: false, cellOutlines: false};

/** Every layer at its default, raw off, every storey in `storeys` shown. */
export function makeToggles(storeys: readonly number[]): ToggleState {
  return {layers: {...DEFAULT_LAYERS}, raw: false, netKindOutlines: false, storeys: Object.fromEntries(storeys.map(s => [s, true]))};
}

/** The same layer, raw and outline choices over a new fixture's storeys, every storey shown. */
export function withStoreys(state: ToggleState, storeys: readonly number[]): ToggleState {
  return {...state, storeys: Object.fromEntries(storeys.map(s => [s, true]))};
}

export const setLayer = (state: ToggleState, key: LayerKey, on: boolean): ToggleState =>
  ({...state, layers: {...state.layers, [key]: on}});

export const setRaw = (state: ToggleState, on: boolean): ToggleState => ({...state, raw: on});

export const setNetKindOutlines = (state: ToggleState, on: boolean): ToggleState => ({...state, netKindOutlines: on});

/** A storey this fixture does not hold is ignored. */
export function setStorey(state: ToggleState, storey: number, on: boolean): ToggleState {
  if (!(storey in state.storeys)) return state;
  return {...state, storeys: {...state.storeys, [storey]: on}};
}

/** The storeys currently shown. */
export const visibleStoreys = (state: ToggleState): Set<number> =>
  new Set(Object.entries(state.storeys).filter(([, on]) => on).map(([s]) => Number(s)));
