// Spec decision 29: the viewer's toggles as plain immutable state. Layers, one switch per storey, raw mode, and the two
// drawing options journal decision 98 adds (partial-Cell tint, outline colouring).

export const LAYER_KEYS = ['faces', 'edges', 'vertices', 'cellOutlines'] as const;
export type LayerKey = typeof LAYER_KEYS[number];

export interface ToggleState {
  layers: Readonly<Record<LayerKey, boolean>>;
  /** Spec decision 29's raw mode: every raw part before the union, drawn as a translucent ghost. */
  raw: boolean;
  /** Spec decision 28 as amended: tint the partial Cells. Off by default, so the exact cut shows. */
  highlightPartial: boolean;
  /** Interpretation: colour Cell outlines by their NetEdge's kind instead of one neutral colour. */
  netKindOutlines: boolean;
  /** Storey index to shown. */
  storeys: Readonly<Record<number, boolean>>;
}

export const DEFAULT_LAYERS: Readonly<Record<LayerKey, boolean>> = {faces: true, edges: true, vertices: false, cellOutlines: false};

const allShown = (storeys: readonly number[]): Record<number, boolean> => Object.fromEntries(storeys.map(s => [s, true]));

/** Every layer at its default, raw and the tint off, every storey in `storeys` shown. */
export function makeToggles(storeys: readonly number[]): ToggleState {
  return {layers: {...DEFAULT_LAYERS}, raw: false, highlightPartial: false, netKindOutlines: false, storeys: allShown(storeys)};
}

/** The same layer, raw and outline choices over a new fixture's storeys, every storey shown. */
export const withStoreys = (state: ToggleState, storeys: readonly number[]): ToggleState => ({...state, storeys: allShown(storeys)});

export const setLayer = (state: ToggleState, key: LayerKey, on: boolean): ToggleState =>
  ({...state, layers: {...state.layers, [key]: on}});

export const setRaw = (state: ToggleState, on: boolean): ToggleState => ({...state, raw: on});

export const setHighlightPartial = (state: ToggleState, on: boolean): ToggleState => ({...state, highlightPartial: on});

export const setNetKindOutlines = (state: ToggleState, on: boolean): ToggleState => ({...state, netKindOutlines: on});

/** A storey this fixture does not hold is ignored. */
export function setStorey(state: ToggleState, storey: number, on: boolean): ToggleState {
  if (!(storey in state.storeys)) return state;
  return {...state, storeys: {...state.storeys, [storey]: on}};
}

/** The storeys currently shown. */
export const visibleStoreys = (state: Pick<ToggleState, 'storeys'>): Set<number> =>
  new Set(Object.entries(state.storeys).filter(([, on]) => on).map(([s]) => Number(s)));
