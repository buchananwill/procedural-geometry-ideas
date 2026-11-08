// Which thick-line materials get their depth bias and resolution kept current (journal decision 114, L-b). The rig keeps
// two sets: the materials of the drawn layers, dropped when the layers are rebuilt, and the materials of the hover and
// pin outlines, dropped when the highlights are rebuilt. A layer rebuild (a storey toggle) leaves a pin standing, so its
// material must survive it: one set for both would drop the pin's bias at the toggle and leave it stale at every later zoom.
//
// A material is given the current bias and size the moment it is tracked, not at the next frame, so a rebuild between
// frames never shows one with the shader's initial values.

/** The parts of a `LineMaterial` the rig drives; a test can pass a plain object of this shape. */
export interface BiasedLine {
  uniforms: Readonly<Record<string, {value: unknown} | undefined>>;
  resolution: {set(width: number, height: number): unknown};
}

/** Sets the material's `uBias` uniform; throws when it has none, as a material not made by `makeBiasedLineMaterial` would. */
function setBias(m: BiasedLine, value: number): void {
  const uniform = m.uniforms.uBias;
  if (!uniform) throw new Error('LineBiasRig: the material has no uBias uniform; make it with makeBiasedLineMaterial');
  uniform.value = value;
}

/** One set of materials, each with its bias as a fraction of the camera's distance to its target. */
class BiasSet<M extends BiasedLine> {
  private readonly fractions = new Map<M, number>();
  add(m: M, fraction: number): void { this.fractions.set(m, fraction); }
  clear(): void { this.fractions.clear(); }
  has(m: M): boolean { return this.fractions.has(m); }
  setBias(distance: number): void { for (const [m, f] of this.fractions) setBias(m, f * distance); }
  setResolution(w: number, h: number): void { for (const m of this.fractions.keys()) m.resolution.set(w, h); }
}

export class LineBiasRig<M extends BiasedLine> {
  private readonly layers = new BiasSet<M>();
  private readonly highlights = new BiasSet<M>();
  private distance = 0;
  private size: readonly [number, number] = [1, 1];

  private prime(m: M, fraction: number): void {
    setBias(m, fraction * this.distance);
    m.resolution.set(this.size[0], this.size[1]);
  }

  /** Tracks a material of the drawn layers. */
  trackLayer(m: M, fraction: number): void { this.prime(m, fraction); this.layers.add(m, fraction); }
  /** Tracks a material of a hover or pin outline. */
  trackHighlight(m: M, fraction: number): void { this.prime(m, fraction); this.highlights.add(m, fraction); }
  /** The drawn layers were rebuilt: their materials go. The highlights' stay. */
  clearLayers(): void { this.layers.clear(); }
  /** The highlights were rebuilt: their materials go. The layers' stay. */
  clearHighlights(): void { this.highlights.clear(); }
  tracks(m: M): boolean { return this.layers.has(m) || this.highlights.has(m); }

  /** Each frame: every tracked material is pulled toward the camera by its fraction of `distance`. */
  update(distance: number): void {
    this.distance = distance;
    this.layers.setBias(distance);
    this.highlights.setBias(distance);
  }

  /** The canvas changed size: every tracked material takes the new resolution. */
  resize(width: number, height: number): void {
    this.size = [width, height];
    this.layers.setResolution(width, height);
    this.highlights.setResolution(width, height);
  }
}
