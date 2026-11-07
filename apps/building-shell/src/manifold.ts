// The one place manifold-3d's WASM is loaded. Every module that needs Manifold awaits `getManifold()`.
import Module, {type ManifoldToplevel} from 'manifold-3d';

export type Wasm = ManifoldToplevel;

let loading: Promise<Wasm> | undefined;

/** Loads and sets up manifold-3d once per process. */
export function getManifold(): Promise<Wasm> {
  loading ??= Module().then(w => { w.setup(); return w; });
  return loading;
}
