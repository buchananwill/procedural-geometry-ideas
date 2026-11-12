// The three.js scene: the shell's layers, the OrbitControls rig (spec decision 27), picking, highlights and the corner
// orientation gizmo. Everything it draws is read off a `ShellBuild`; it computes no geometry of the pipeline's.
//
// Draw order (spec decision 28 as amended): faces, then the opt-in partial-Cell tint, then Cell outlines, then Edges.
// Outlines and Edges are depth-tested against the faces, but each is pulled toward the camera along its view ray by a
// small distance (`LINE_BIAS`), so an Edge lying in the crease between two faces is not buried in them, while a face
// that is really in front still hides it.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, FrontSide, Group, Material, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PerspectiveCamera, Points, PointsMaterial, Raycaster, SRGBColorSpace, Scene, Sprite, SpriteMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type {ShellBuild} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {
  DrawBuffers, cellOutlineSegments, cellTriangles, defectEdgeSegments, edgeSegments, faceTriangles, ghostSegments, ghostTriangles, linearRGB, meshBounds, vertexPoints,
} from './buffers.ts';
import {GIZMO_AXIS_LENGTH, GIZMO_FOV, GIZMO_LABEL_AT, GIZMO_LABEL_SIZE, GIZMO_MARGIN, GIZMO_SIZE, GIZMO_DISTANCE} from './gizmo.ts';
import {LineBiasRig} from './line-bias.ts';
import {sceneLights} from './lighting.ts';
import {LineMaterialOptions, makeBiasedLineMaterial} from './line-shader.ts';
import {DefectFocus} from './defect-cases.ts';
import type {RingBox} from './edit.ts';
import {
  AXIS_COLOURS, BACKGROUND, DEFECT_CASING_COLOUR, DEFECT_CASING_WIDTH, DEFECT_CORE_WIDTH, GHOST_OPACITY, GROUND_OPACITY, HOVER_COLOUR, MAGENTA, PIN_COLOUR,
  RAW_SHELL_OPACITY, cssColour,
} from './palette.ts';
import type {Hit} from './readout.ts';
import {ToggleState, visibleStoreys} from './toggles.ts';

export interface ScreenPoint { x: number; y: number }
/** Where and when the pointer went down, to tell a click from a drag. */
export interface PointerDown extends ScreenPoint { t: number }
/** The face under the cursor and how far along the ray it lies. */
export interface PickedFace { id: number; distance: number }

/** The drawn layers. */
export interface Layers {
  solid?: Mesh;
  ground?: Mesh;
  tint?: Mesh;
  cellPick?: Mesh;
  edges?: LineSegments2;
  /** The heavy mark of the `Unclassified` Edges (journal decision 169): a white casing under a magenta core. */
  defectCasing?: LineSegments2;
  defectCore?: LineSegments2;
  outlines?: LineSegments2;
  vertices?: Points;
  ghost?: Mesh;
  ghostLines?: LineSegments2;
}

/** The layers a cursor can pick from (derived from `Layers`, so a layer renamed there breaks here). */
export type PickLayer = keyof Pick<Layers, 'solid' | 'ground' | 'cellPick' | 'edges' | 'vertices'>;

/** The record id behind each drawn primitive of a pickable layer. */
export type LayerOwners = {[K in PickLayer]?: Int32Array};

export interface SceneEvents {
  /** The cursor moved over the canvas; `null` when over nothing. */
  onHover(hit: Hit | null): void;
  /** A click (not a drag): the hit under it, or `null` for empty space. */
  onClick(hit: Hit | null): void;
}

/** Anything three.js holds GPU memory for. */
export interface Disposable3D { geometry: BufferGeometry; material: Material | Material[] }
const isDisposable = (o: Object3D): o is Object3D & Disposable3D => 'geometry' in o && 'material' in o;
function dispose(o: Object3D): void {
  if (!isDisposable(o)) return;
  o.geometry.dispose();
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
}

/** How far a line is pulled toward the camera, as a fraction of the camera's distance to its target. */
const LINE_BIAS = {edges: 0.006, defectCore: 0.0075, outlines: 0.003, none: 0} as const;
const PICK_TOLERANCE = 0.009;
/** The selected Ring's box (viewer editing decision 15). Local to the scene: the palette is not part of this work. */
const RING_COLOUR = 0x4dd0e1;

function triGeometry(b: DrawBuffers, withColours: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(b.positions, 3));
  if (withColours) g.setAttribute('color', new BufferAttribute(b.colors, 3));
  g.computeVertexNormals();
  return g;
}

function segGeometry(b: DrawBuffers): LineSegmentsGeometry {
  const g = new LineSegmentsGeometry();
  g.setPositions(b.positions);
  g.setColors(b.colors);
  return g;
}

/** The index in `owner` of a hit primitive, or null when the hit carries no usable index. */
const ownerAt = (owner: Int32Array | undefined, index: number | null | undefined): number | null =>
  owner !== undefined && typeof index === 'number' && index < owner.length ? owner[index] : null;

function label(text: string, colour: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssColour(colour);
    ctx.fillText(text, 32, 34);
  }
  // The canvas holds sRGB pixels: say so, or the sprite shows the label brighter than the palette's colour.
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({map: texture, depthTest: false, transparent: true}));
  s.scale.setScalar(GIZMO_LABEL_SIZE);
  return s;
}

export class ShellScene {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(40, 1, 1, 10000);
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private readonly content = new Group();
  private readonly highlights = new Group();
  private readonly gizmoScene = new Scene();
  private readonly gizmoCamera = new PerspectiveCamera(GIZMO_FOV, 1, 0.1, 20);
  /** Every LineMaterial of the layers and of the highlights, kept apart so a layer rebuild leaves a pin's bias alone (see `line-bias.ts`). */
  private readonly lineBias = new LineBiasRig<LineMaterial>();
  private readonly raycaster = new Raycaster();
  private layers: Layers = {};
  private owners: LayerOwners = {};
  private build: ShellBuild | undefined;
  private focus: DefectFocus | undefined;
  private toggles: ToggleState | undefined;
  private builtKey = '';
  private hoverKey = '';
  private hoverHit: Hit | null = null;
  private pinned: Hit | null = null;
  private ringBox: RingBox | null = null;
  private down: PointerDown | undefined;
  private pending: ScreenPoint | undefined;

  constructor(private readonly host: HTMLElement, private readonly events: SceneEvents) {
    this.renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(new Color(BACKGROUND));
    host.appendChild(this.renderer.domElement);

    // The shell is z-up, in centimetres.
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    // The lights come from `sceneLights()`, which the palette's floors are measured against.
    const lights = sceneLights();
    this.scene.add(lights.ambient, ...lights.directional, this.content, this.highlights);

    this.buildGizmo();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', e => this.onMove(e));
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('pointerdown', e => { this.down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
    el.addEventListener('pointerup', e => this.onUp(e));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** The corner orientation gizmo: three axes in the legend's colours, each with its label beyond the tip. */
  private buildGizmo(): void {
    this.gizmoCamera.up.set(0, 0, 1);
    const L = GIZMO_AXIS_LENGTH;
    const axes = [
      {text: 'X', colour: AXIS_COLOURS.x, tip: [L, 0, 0]},
      {text: 'Y', colour: AXIS_COLOURS.y, tip: [0, L, 0]},
      {text: 'Z', colour: AXIS_COLOURS.z, tip: [0, 0, L]},
    ] as const;
    const g = new LineSegmentsGeometry();
    g.setPositions(axes.flatMap(a => [0, 0, 0, ...a.tip]));
    g.setColors(axes.flatMap(a => { const [r, gr, b] = linearRGB(a.colour); return [r, gr, b, r, gr, b]; }));
    const m = makeBiasedLineMaterial({width: 3});
    m.resolution.set(GIZMO_SIZE, GIZMO_SIZE);
    this.gizmoScene.add(new LineSegments2(g, m));
    for (const a of axes) {
      const s = label(a.text, a.colour);
      s.position.set(a.tip[0] * GIZMO_LABEL_AT, a.tip[1] * GIZMO_LABEL_AT, a.tip[2] * GIZMO_LABEL_AT);
      this.gizmoScene.add(s);
    }
  }

  // ---- Loading and layers ------------------------------------------------------------------------------------------

  /**
   * Shows a new build: rebuilds every layer and frames the camera on `focus` (a defect case's place), else on the whole shell.
   * With `keepView` (viewer editing decision 11) the camera stays where it is, and only its clipping planes are refitted to
   * the new shell. A scene that holds no build has no view to keep, so it frames the shell as usual.
   */
  setBuild(build: ShellBuild, toggles: ToggleState, focus?: DefectFocus, options: {keepView?: boolean} = {}): void {
    const keep = options.keepView === true && this.build !== undefined;
    this.clearBuild();
    this.build = build;
    this.focus = focus;
    this.toggles = toggles;
    this.rebuildLayers();
    this.setDimmed(false);
    if (keep) this.fitClipping();
    else this.resetView();
  }

  /** Decision 8: a build kept on screen while the draft that would replace it is refused is drawn dimmed. */
  setDimmed(dimmed: boolean): void {
    this.renderer.domElement.style.opacity = dimmed ? '0.35' : '';
  }

  /** Decision 15: outlines a Ring's box in the viewport, or nothing for `null`. The box comes from the fixture, not the build. */
  setRingBox(box: RingBox | null): void {
    this.ringBox = box;
    this.rebuildHighlights();
  }

  /** Empties the scene, as a failed build does (journal decision 98, F8). */
  clearBuild(): void {
    this.build = undefined;
    this.focus = undefined;
    this.pinned = null;
    this.hoverHit = null;
    this.hoverKey = '';
    this.builtKey = '';
    this.clearLayers();
    this.rebuildHighlights();
  }

  /** Applies toggles: a changed storey set or outline mode rebuilds the layers; anything else only shows or hides them. */
  setToggles(toggles: ToggleState): void {
    this.toggles = toggles;
    this.rebuildLayers();
  }

  /** Frames the defect when the build has a focus and `wholeShell` is false, else the whole shell. */
  resetView(wholeShell = false): void {
    if (!this.build) return;
    const {min, max} = meshBounds(this.build);
    const shellSize = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const focus = wholeShell ? undefined : this.focus;
    const c: Vec3 = focus ? focus.centre : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    // A focus is framed from 1.5 of its extent away, in the same direction the whole shell is.
    const size = focus ? focus.extent * 1.5 : shellSize;
    this.setClipping(Math.min(size, shellSize) * 0.01, shellSize * 30);
    this.controls.target.set(c[0], c[1], c[2]);
    this.camera.position.set(c[0] + size * 0.7, c[1] - size * 1.2, c[2] + size * 0.75);
    this.controls.update();
  }

  private setClipping(near: number, far: number): void {
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Refits the clipping planes to the shell without moving the camera. They are `resetView`'s: the near plane from the
   * shell's size alone (a focus is only ever framed by `resetView`), and the far plane 30 shell sizes out.
   */
  private fitClipping(): void {
    if (!this.build) return;
    const {min, max} = meshBounds(this.build);
    const shellSize = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.setClipping(shellSize * 0.01, shellSize * 30);
  }

  /** Puts the camera at `position`, looking at `target`: the page's test hook uses it to frame a known place. */
  setView(position: Readonly<Vec3>, target: Readonly<Vec3>): void {
    this.controls.target.set(target[0], target[1], target[2]);
    this.camera.position.set(position[0], position[1], position[2]);
    this.controls.update();
  }

  private clearLayers(): void {
    for (const o of Object.values(this.layers)) {
      if (!o) continue;
      this.content.remove(o);
      dispose(o);
    }
    this.lineBias.clearLayers();
    this.layers = {};
    this.owners = {};
  }

  /** A LineMaterial whose lines are pulled toward the camera by `bias` of the camera distance, tracked by `track`. */
  private lineMaterial(options: LineMaterialOptions, bias: number, track: 'layer' | 'highlight'): LineMaterial {
    const m = makeBiasedLineMaterial(options);
    if (track === 'layer') this.lineBias.trackLayer(m, bias);
    else this.lineBias.trackHighlight(m, bias);
    return m;
  }

  private rebuildLayers(): void {
    const build = this.build, toggles = this.toggles;
    if (!build || !toggles) return;
    const storeys = visibleStoreys(toggles);
    const key = `${[...storeys].sort().join(',')}|${toggles.netKindOutlines}`;
    if (key !== this.builtKey) {
      this.builtKey = key;
      this.clearLayers();
      this.buildLayers(build, storeys, toggles.netKindOutlines);
    }
    this.applyVisibility();
  }

  private buildLayers(build: ShellBuild, storeys: ReadonlySet<number>, netKindOutlines: boolean): void {
    const L = this.layers, owners = this.owners;
    const mesh = (b: DrawBuffers, mat: Material, order: number): Mesh => {
      const m = new Mesh(triGeometry(b, true), mat);
      m.renderOrder = order;
      return m;
    };
    const solid = faceTriangles(build, storeys, false);
    if (solid.owner.length) {
      L.solid = mesh(solid, new MeshLambertMaterial({vertexColors: true, side: FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1}), 0);
      owners.solid = solid.owner;
    }
    const ground = faceTriangles(build, storeys, true);
    if (ground.owner.length) {
      L.ground = mesh(ground, new MeshLambertMaterial({vertexColors: true, side: DoubleSide, transparent: true, opacity: GROUND_OPACITY, depthWrite: false}), 0);
      owners.ground = ground.owner;
    }
    const tint = cellTriangles(build, storeys, 'tint');
    if (tint.owner.length) {
      L.tint = mesh(tint, new MeshLambertMaterial({vertexColors: true, side: FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}), 1);
    }
    const pick = cellTriangles(build, storeys, 'pick');
    if (pick.owner.length) {
      // Never added to the scene: only raycast against.
      L.cellPick = new Mesh(triGeometry(pick, false), new MeshBasicMaterial({side: DoubleSide}));
      owners.cellPick = pick.owner;
    }
    const outlines = cellOutlineSegments(build, storeys, netKindOutlines);
    if (outlines.owner.length) {
      L.outlines = new LineSegments2(segGeometry(outlines), this.lineMaterial({width: 1.3}, LINE_BIAS.outlines, 'layer'));
      L.outlines.renderOrder = 2;
    }
    const edges = edgeSegments(build, storeys);
    if (edges.owner.length) {
      L.edges = new LineSegments2(segGeometry(edges), this.lineMaterial({width: 3.5}, LINE_BIAS.edges, 'layer'));
      L.edges.renderOrder = 3;
      owners.edges = edges.owner;
    }
    const casing = defectEdgeSegments(build, storeys, DEFECT_CASING_COLOUR);
    if (casing.owner.length) {
      L.defectCasing = new LineSegments2(segGeometry(casing), this.lineMaterial({width: DEFECT_CASING_WIDTH}, LINE_BIAS.edges, 'layer'));
      L.defectCasing.renderOrder = 3.1;
      L.defectCore = new LineSegments2(segGeometry(defectEdgeSegments(build, storeys, MAGENTA)), this.lineMaterial({width: DEFECT_CORE_WIDTH}, LINE_BIAS.defectCore, 'layer'));
      L.defectCore.renderOrder = 3.2;
    }
    const verts = vertexPoints(build, storeys);
    if (verts.owner.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(verts.positions, 3));
      g.setAttribute('color', new BufferAttribute(verts.colors, 3));
      L.vertices = new Points(g, new PointsMaterial({vertexColors: true, size: 7, sizeAttenuation: false}));
      L.vertices.renderOrder = 4;
      owners.vertices = verts.owner;
    }
    const ghost = ghostTriangles(build, storeys);
    if (ghost.owner.length) {
      L.ghost = mesh(ghost, new MeshBasicMaterial({vertexColors: true, side: DoubleSide, transparent: true, opacity: GHOST_OPACITY, depthWrite: false}), 5);
      const lines = ghostSegments(build, storeys);
      if (lines.owner.length) L.ghostLines = new LineSegments2(segGeometry(lines), this.lineMaterial({width: 1.5, opacity: 0.55}, LINE_BIAS.none, 'layer'));
    }
    for (const [name, o] of Object.entries(L)) if (o && name !== 'cellPick') this.content.add(o);
  }

  private applyVisibility(): void {
    const t = this.toggles;
    if (!t) return;
    const L = this.layers;
    for (const o of [L.solid, L.ground]) if (o) o.visible = t.layers.faces;
    if (L.tint) L.tint.visible = t.layers.faces && t.highlightPartial;
    for (const o of [L.edges, L.defectCasing, L.defectCore]) if (o) o.visible = t.layers.edges;
    if (L.outlines) L.outlines.visible = t.layers.cellOutlines;
    if (L.vertices) L.vertices.visible = t.layers.vertices;
    for (const o of [L.ghost, L.ghostLines]) if (o) o.visible = t.raw;
    // Journal decision 98, F5: in raw mode the shell's own faces turn translucent, so the removed parts show.
    const solid = L.solid?.material;
    if (solid instanceof MeshLambertMaterial) {
      solid.transparent = t.raw;
      solid.opacity = t.raw ? RAW_SHELL_OPACITY : 1;
      solid.depthWrite = !t.raw;
      solid.needsUpdate = true;
    }
  }

  // ---- Picking -------------------------------------------------------------------------------------------------------

  /** The nearest thing under the cursor, with the priority vertex, then Edge, then the surface's face and Cell. */
  pick(clientX: number, clientY: number): Hit | null {
    const t = this.toggles, build = this.build;
    if (!t || !build) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const worldPerPixel = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / rect.height;
    const tol = PICK_TOLERANCE * dist + 1;
    this.raycaster.params.Points.threshold = worldPerPixel * 7;
    this.raycaster.params.Line2 = {threshold: 5};
    const L = this.layers, owners = this.owners;

    let face: PickedFace | undefined;
    if (t.layers.faces) {
      const hit = this.raycaster.intersectObjects([L.solid, L.ground].filter((o): o is Mesh => o !== undefined))[0];
      const id = hit ? ownerAt(hit.object === L.solid ? owners.solid : owners.ground, hit.faceIndex) : null;
      if (hit && id !== null) face = {id, distance: hit.distance};
    }
    const unoccluded = (d: number): boolean => face === undefined || d <= face.distance + tol;

    if (t.layers.vertices && L.vertices) {
      for (const hit of this.raycaster.intersectObject(L.vertices)) {
        const id = ownerAt(owners.vertices, hit.index);
        if (id !== null && unoccluded(hit.distance)) return {kind: 'vertex', id};
      }
    }
    if (t.layers.edges && L.edges) {
      for (const hit of this.raycaster.intersectObject(L.edges)) {
        const id = ownerAt(owners.edges, hit.faceIndex);
        if (id !== null && unoccluded(hit.distance)) return {kind: 'edge', id};
      }
    }
    let cell: number | null = null;
    if ((t.layers.faces || t.layers.cellOutlines) && L.cellPick) {
      for (const hit of this.raycaster.intersectObject(L.cellPick)) {
        const id = ownerAt(owners.cellPick, hit.faceIndex);
        if (id !== null && unoccluded(hit.distance)) { cell = id; break; }
      }
    }
    const faceId = face?.id ?? (cell !== null ? build.shell.cells[cell].face : null);
    return faceId === null ? null : {kind: 'surface', face: faceId, cell};
  }

  private onMove(e: PointerEvent): void {
    if (e.buttons) return;
    const first = this.pending === undefined;
    this.pending = {x: e.clientX, y: e.clientY};
    if (first) requestAnimationFrame(() => {
      const p = this.pending;
      this.pending = undefined;
      if (p) this.setHover(this.pick(p.x, p.y));
    });
  }

  private onUp(e: PointerEvent): void {
    const d = this.down;
    this.down = undefined;
    if (!d || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || performance.now() - d.t > 600) return;
    const hit = this.pick(e.clientX, e.clientY);
    this.pinned = hit;
    this.rebuildHighlights();
    this.events.onClick(hit);
  }

  private setHover(hit: Hit | null): void {
    const key = hit ? JSON.stringify(hit) : '';
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.hoverHit = hit;
    this.rebuildHighlights();
    this.events.onHover(hit);
  }

  /** Clears the pin, as a click on empty space or Escape does. */
  unpin(): void {
    this.pinned = null;
    this.rebuildHighlights();
  }

  // ---- Highlights ----------------------------------------------------------------------------------------------------

  private rebuildHighlights(): void {
    for (const o of [...this.highlights.children]) {
      this.highlights.remove(o);
      dispose(o);
    }
    this.lineBias.clearHighlights();
    if (this.ringBox) this.highlights.add(this.ringBoxLines(this.ringBox));
    if (this.pinned) this.highlights.add(...this.highlightOf(this.pinned, PIN_COLOUR, 9));
    if (this.hoverHit) this.highlights.add(...this.highlightOf(this.hoverHit, HOVER_COLOUR, 6));
  }

  /** The twelve edges of a Ring's box, drawn with the other highlights, so a hover's rebuild keeps their bias in step. */
  private ringBoxLines(box: RingBox): Object3D {
    const [x0, y0, x1, y1] = box.rect;
    const {zLo, zHi} = box;
    const bottom: Vec3[] = [[x0, y0, zLo], [x1, y0, zLo], [x1, y1, zLo], [x0, y1, zLo]];
    const top: Vec3[] = bottom.map(([x, y]): Vec3 => [x, y, zHi]);
    const segments = bottom.flatMap((p, i) => [...p, ...bottom[(i + 1) % 4], ...top[i], ...top[(i + 1) % 4], ...p, ...top[i]]);
    const g = new LineSegmentsGeometry();
    g.setPositions(segments);
    const l = new LineSegments2(g, this.lineMaterial({width: 3, colour: RING_COLOUR}, LINE_BIAS.edges, 'highlight'));
    l.renderOrder = 9;
    return l;
  }

  /**
   * The emphasis for a hit, as outlines only (journal decision 105, L4): a white fill would read as the opt-in partial
   * tint. A face is outlined along its loops and a Cell along its polygon, depth-tested with the Edges' bias so
   * a face behind the building does not show through.
   */
  private highlightOf(hit: Hit, colour: number, width: number): Object3D[] {
    const build = this.build;
    if (!build) return [];
    const out: Object3D[] = [];
    const loop = (points: readonly Readonly<Vec3>[], w: number): void => {
      const g = new LineSegmentsGeometry();
      g.setPositions(points.flatMap((p, i) => [...p, ...points[(i + 1) % points.length]]));
      const m = this.lineMaterial({width: w, colour}, LINE_BIAS.edges, 'highlight');
      const l = new LineSegments2(g, m);
      l.renderOrder = 10;
      out.push(l);
    };
    switch (hit.kind) {
      case 'vertex': {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(Float32Array.from(build.shell.vertices[hit.id].p), 3));
        const p = new Points(g, new PointsMaterial({color: colour, size: 16, sizeAttenuation: false, depthTest: false}));
        p.renderOrder = 10;
        out.push(p);
        break;
      }
      case 'edge': {
        const e = build.shell.edges[hit.id];
        loop([e.a, e.b], width);
        break;
      }
      case 'surface': {
        for (const l of build.shell.faces[hit.face].loops) loop(l, width * 0.7);
        if (hit.cell !== null) loop(build.shell.cells[hit.cell].polygon, width * 0.55);
        break;
      }
    }
    return out;
  }

  // ---- Frame ---------------------------------------------------------------------------------------------------------

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lineBias.resize(w, h);
  }

  private frame(): void {
    this.controls.update();
    const dist = this.camera.position.distanceTo(this.controls.target);
    this.lineBias.update(dist);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    // The corner orientation gizmo: the same view direction, on a fresh depth buffer.
    this.gizmoCamera.position.copy(this.camera.position).sub(this.controls.target).setLength(GIZMO_DISTANCE);
    this.gizmoCamera.lookAt(0, 0, 0);
    this.renderer.clearDepth();
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(GIZMO_MARGIN, GIZMO_MARGIN, GIZMO_SIZE, GIZMO_SIZE);
    this.renderer.setScissor(GIZMO_MARGIN, GIZMO_MARGIN, GIZMO_SIZE, GIZMO_SIZE);
    this.renderer.render(this.gizmoScene, this.gizmoCamera);
  }

  /** Where a world point lands on the page, for tests that hover a known point. */
  project(p: Readonly<Vec3>): ScreenPoint {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const q = new Vector3(p[0], p[1], p[2]).project(this.camera);
    return {x: rect.left + ((q.x + 1) / 2) * rect.width, y: rect.top + ((1 - q.y) / 2) * rect.height};
  }
}
