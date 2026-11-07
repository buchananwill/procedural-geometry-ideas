// The three.js scene: the shell's layers, the OrbitControls rig (spec decision 27), picking and highlights. Everything
// it draws is read off a `ShellBuild`; it computes no geometry of the pipeline's.
import {
  AmbientLight, AxesHelper, BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PerspectiveCamera, Points, PointsMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type {ShellBuild} from '../shell.ts';
import type {Vec3} from '../tags.ts';
import {
  PointBuffers, SegBuffers, TriBuffers, cellOutlineSegments, cellTriangles, edgeSegments, faceTriangles, ghostSegments, ghostTriangles,
  meshBounds, singleCellTriangles, singleFaceTriangles, vertexPoints,
} from './buffers.ts';
import {GHOST_OPACITY, GROUND_OPACITY} from './palette.ts';
import type {Hit} from './readout.ts';
import {ToggleState, visibleStoreys} from './toggles.ts';

const BACKGROUND = 0x14181f;
const HOVER_COLOUR = 0xffffff;
const PIN_COLOUR = 0xfff176;

interface Layers {
  solid?: Mesh;
  ground?: Mesh;
  partial?: Mesh;
  cellPick?: Mesh;
  edges?: LineSegments2;
  outlines?: LineSegments2;
  vertices?: Points;
  ghost?: Mesh;
  ghostLines?: LineSegments2;
}



export interface SceneEvents {
  /** The cursor moved over the canvas; `null` when over nothing. */
  onHover(hit: Hit | null): void;
  /** A click (not a drag): the hit under it, or `null` for empty space. */
  onClick(hit: Hit | null): void;
}

function triGeometry(b: TriBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(b.positions, 3));
  g.setAttribute('color', new BufferAttribute(b.colors, 3));
  g.computeVertexNormals();
  return g;
}

function segGeometry(b: SegBuffers): LineSegmentsGeometry {
  const g = new LineSegmentsGeometry();
  g.setPositions(b.positions);
  g.setColors(b.colors);
  return g;
}

export class ShellScene {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(40, 1, 1, 10000);
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private readonly content = new Group();
  private readonly highlights = new Group();
  private readonly lineMaterials = new Set<LineMaterial>();
  private readonly highlightMaterials = new Set<LineMaterial>();
  private readonly raycaster = new Raycaster();
  private layers: Layers = {};
  private build: ShellBuild | undefined;
  private toggles: ToggleState | undefined;
  private builtKey = '';
  private hoverKey = '';
  private hoverHit: Hit | null = null;
  private pinned: Hit | null = null;
  private down: {x: number; y: number; t: number} | undefined;
  private pending: {x: number; y: number} | undefined;
  private size = 1000;

  constructor(private readonly host: HTMLElement, private readonly events: SceneEvents) {
    this.renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.background = new Color(BACKGROUND);
    host.appendChild(this.renderer.domElement);

    // The shell is z-up, in centimetres.
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-1, -2, 3);
    const fill = new DirectionalLight(0xffffff, 0.9);
    fill.position.set(2, 1, 1);
    this.scene.add(key, fill, new AxesHelper(120), this.content, this.highlights);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', e => this.onMove(e));
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('pointerdown', e => { this.down = {x: e.clientX, y: e.clientY, t: performance.now()}; });
    el.addEventListener('pointerup', e => this.onUp(e));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---- Loading and layers ------------------------------------------------------------------------------------------

  /** Shows a new build: rebuilds every layer and frames the camera on it. */
  setBuild(build: ShellBuild, toggles: ToggleState): void {
    this.build = build;
    this.toggles = toggles;
    this.builtKey = '';
    this.setHover(null);
    this.pinned = null;
    this.rebuildHighlights();
    this.rebuildLayers();
    this.resetView();
  }

  /** Applies toggles: a changed storey set or outline mode rebuilds the layers; anything else only shows or hides them. */
  setToggles(toggles: ToggleState): void {
    this.toggles = toggles;
    this.rebuildLayers();
  }

  resetView(): void {
    if (!this.build) return;
    const {min, max} = meshBounds(this.build);
    const c = [0, 1, 2].map(a => (min[a] + max[a]) / 2);
    const size = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.size = size;
    this.camera.near = size * 0.01;
    this.camera.far = size * 30;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(c[0], c[1], c[2]);
    this.camera.position.set(c[0] + size * 0.7, c[1] - size * 1.2, c[2] + size * 0.75);
    this.controls.update();
  }

  private clearLayers(): void {
    for (const o of Object.values(this.layers)) {
      if (!o) continue;
      this.content.remove(o);
      o.geometry.dispose();
    }
    for (const m of this.lineMaterials) m.dispose();
    this.lineMaterials.clear();
    this.layers = {};
  }

  private lineMaterial(width: number, opacity = 1): LineMaterial {
    const m = new LineMaterial({vertexColors: true, linewidth: width, transparent: opacity < 1, opacity});
    m.resolution.set(this.host.clientWidth, this.host.clientHeight);
    this.lineMaterials.add(m);
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
      const L = this.layers;
      const solid = faceTriangles(build, storeys, false);
      const ground = faceTriangles(build, storeys, true);
      const partial = cellTriangles(build, storeys, true);
      const pick = cellTriangles(build, storeys, false);
      const ghost = ghostTriangles(build, storeys);
      const owned = (g: BufferGeometry, owner: Int32Array, mat: MeshBasicMaterial | MeshLambertMaterial): Mesh => {
        const m = new Mesh(g, mat);
        m.userData.owner = owner;
        return m;
      };
      if (solid.owner.length) L.solid = owned(triGeometry(solid), solid.owner, new MeshLambertMaterial({vertexColors: true, side: FrontSide}));
      if (ground.owner.length) {
        L.ground = owned(triGeometry(ground), ground.owner,
          new MeshLambertMaterial({vertexColors: true, side: DoubleSide, transparent: true, opacity: GROUND_OPACITY, depthWrite: false}));
      }
      if (partial.owner.length) {
        L.partial = owned(triGeometry(partial), partial.owner,
          new MeshLambertMaterial({vertexColors: true, side: FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
      }
      if (pick.owner.length) L.cellPick = owned(triGeometry(pick), pick.owner, new MeshBasicMaterial({side: DoubleSide}));
      const edges = edgeSegments(build, storeys);
      if (edges.owner.length) {
        L.edges = new LineSegments2(segGeometry(edges), this.lineMaterial(3.5));
        L.edges.userData.owner = edges.owner;
      }
      const outlines = cellOutlineSegments(build, storeys, toggles.netKindOutlines);
      if (outlines.owner.length) L.outlines = new LineSegments2(segGeometry(outlines), this.lineMaterial(1.2));
      const verts = vertexPoints(build, storeys);
      if (verts.owner.length) {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(verts.positions, 3));
        g.setAttribute('color', new BufferAttribute(verts.colors, 3));
        L.vertices = new Points(g, new PointsMaterial({vertexColors: true, size: 7, sizeAttenuation: false}));
        L.vertices.userData.owner = verts.owner;
      }
      if (ghost.owner.length) {
        L.ghost = owned(triGeometry(ghost), ghost.owner,
          new MeshBasicMaterial({vertexColors: true, side: DoubleSide, transparent: true, opacity: GHOST_OPACITY, depthWrite: false}));
        const lines = ghostSegments(build, storeys);
        if (lines.owner.length) L.ghostLines = new LineSegments2(segGeometry(lines), this.lineMaterial(1.5, 0.55));
      }
      for (const [name, o] of Object.entries(L)) if (o && name !== 'cellPick') this.content.add(o);
    }
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const t = this.toggles;
    if (!t) return;
    const L = this.layers;
    for (const o of [L.solid, L.ground, L.partial]) if (o) o.visible = t.layers.faces;
    if (L.edges) L.edges.visible = t.layers.edges;
    if (L.outlines) L.outlines.visible = t.layers.cellOutlines;
    if (L.vertices) L.vertices.visible = t.layers.vertices;
    for (const o of [L.ghost, L.ghostLines]) if (o) o.visible = t.raw;
  }

  // ---- Picking -------------------------------------------------------------------------------------------------------

  /** The nearest thing under the cursor, with the priority vertex, then Edge, then the surface's face and Cell. */
  pick(clientX: number, clientY: number): Hit | null {
    const t = this.toggles;
    if (!t) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const worldPerPixel = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / rect.height;
    const tol = 0.004 * dist + 1;
    this.raycaster.params.Points.threshold = worldPerPixel * 7;
    (this.raycaster.params as unknown as {Line2: {threshold: number}}).Line2 = {threshold: 5};
    const L = this.layers;

    let face: {id: number; distance: number} | undefined;
    if (t.layers.faces) {
      const hit = this.raycaster.intersectObjects([L.solid, L.ground].filter((o): o is Mesh => !!o))[0];
      if (hit) face = {id: (hit.object.userData.owner as Int32Array)[hit.faceIndex!], distance: hit.distance};
    }
    const unoccluded = (d: number): boolean => !face || d <= face.distance + tol;

    if (t.layers.vertices && L.vertices) {
      const hit = this.raycaster.intersectObject(L.vertices).find(h => unoccluded(h.distance));
      if (hit) return {vertex: (L.vertices.userData.owner as Int32Array)[hit.index!]};
    }
    if (t.layers.edges && L.edges) {
      const hit = this.raycaster.intersectObject(L.edges).find(h => unoccluded(h.distance));
      if (hit) return {edge: (L.edges.userData.owner as Int32Array)[hit.faceIndex!]};
    }
    let cell: number | undefined;
    if ((t.layers.faces || t.layers.cellOutlines) && L.cellPick) {
      const hit = this.raycaster.intersectObject(L.cellPick).find(h => unoccluded(h.distance));
      if (hit) cell = (L.cellPick.userData.owner as Int32Array)[hit.faceIndex!];
    }
    if (face === undefined && cell === undefined) return null;
    return {face: face?.id ?? (cell !== undefined ? this.build!.shell.cells[cell].face : undefined), cell};
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
      (o as Mesh).geometry?.dispose();
    }
    for (const m of this.highlightMaterials) m.dispose();
    this.highlightMaterials.clear();
    if (this.pinned) this.highlights.add(...this.highlightOf(this.pinned, PIN_COLOUR, 9));
    if (this.hoverHit) this.highlights.add(...this.highlightOf(this.hoverHit, HOVER_COLOUR, 6));
  }

  private highlightOf(hit: Hit, colour: number, width: number): Object3D[] {
    const build = this.build;
    if (!build) return [];
    const out: Object3D[] = [];
    const overlay = (b: TriBuffers): Mesh => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(b.positions, 3));
      return new Mesh(g, new MeshBasicMaterial({
        color: colour, transparent: true, opacity: 0.4, side: DoubleSide, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }));
    };
    const line = (a: Vec3, b: Vec3): LineSegments2 => {
      const g = new LineSegmentsGeometry();
      g.setPositions([...a, ...b]);
      const m = new LineMaterial({color: colour, linewidth: width, depthTest: false});
      m.resolution.set(this.host.clientWidth, this.host.clientHeight);
      this.highlightMaterials.add(m);
      const l = new LineSegments2(g, m);
      l.renderOrder = 10;
      return l;
    };
    if (hit.vertex !== undefined) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(Float32Array.from(build.shell.vertices[hit.vertex].p), 3));
      const p = new Points(g, new PointsMaterial({color: colour, size: 16, sizeAttenuation: false, depthTest: false}));
      p.renderOrder = 10;
      out.push(p);
    } else if (hit.edge !== undefined) {
      const e = build.shell.edges[hit.edge];
      out.push(line(e.a, e.b));
    } else {
      if (hit.face !== undefined) out.push(overlay(singleFaceTriangles(build, hit.face)));
      if (hit.cell !== undefined) {
        const cell = build.shell.cells[hit.cell];
        out.push(overlay(singleCellTriangles(build, hit.cell)));
        for (let i = 0; i < cell.polygon.length; i++) out.push(line(cell.polygon[i], cell.polygon[(i + 1) % cell.polygon.length]));
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
    for (const m of [...this.lineMaterials, ...this.highlightMaterials]) m.resolution.set(w, h);
  }

  private frame(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Where a world point lands on the page, for tests that hover a known point. */
  project(p: Vec3): {x: number; y: number} {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const q = new Vector3(p[0], p[1], p[2]).project(this.camera);
    return {x: rect.left + ((q.x + 1) / 2) * rect.width, y: rect.top + ((1 - q.y) / 2) * rect.height};
  }

  get sceneSize(): number { return this.size; }
}
