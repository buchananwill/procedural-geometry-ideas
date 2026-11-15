// Geometry helpers, the footprint model (rings, walls, planes) and the case definition DSL.

export interface Pt { x: number; y: number }
export const pt = (x: number, y: number): Pt => ({x, y});
export const sub = (a: Pt, b: Pt): Pt => pt(a.x - b.x, a.y - b.y);
export const add = (a: Pt, b: Pt): Pt => pt(a.x + b.x, a.y + b.y);
export const mul = (a: Pt, s: number): Pt => pt(a.x * s, a.y * s);
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const norm = (a: Pt): Pt => mul(a, 1 / (len(a) || 1));
export const dist = (a: Pt, b: Pt): number => len(sub(a, b));

export function polyArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface BBox { x0: number; y0: number; x1: number; y1: number }
export function bboxOf(poly: Pt[]): BBox {
  const b = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
  for (const p of poly) {
    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
  }
  return b;
}

export type Rect = [number, number, number, number]; // x0, y0, x1, y1

/** Traces the union of rectangles into CCW outer loops and CW hole loops, breaking edges at every rectangle corner. */
export function unionLoops(rects: Rect[]): Pt[][] {
  const xs = [...new Set(rects.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
  const cellIn = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some(r => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]);
  };
  const key = (p: Pt): string => `${p.x},${p.y}`;
  const nextOf = new Map<string, Pt>();
  const addEdge = (a: Pt, b: Pt): void => {
    if (nextOf.has(key(a))) throw new Error(`pinch at ${key(a)}: corner-only contact is not a footprint`);
    nextOf.set(key(a), b);
  };
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (!cellIn(i, j)) continue;
      if (!cellIn(i, j - 1)) addEdge(pt(xs[i], ys[j]), pt(xs[i + 1], ys[j]));
      if (!cellIn(i + 1, j)) addEdge(pt(xs[i + 1], ys[j]), pt(xs[i + 1], ys[j + 1]));
      if (!cellIn(i, j + 1)) addEdge(pt(xs[i + 1], ys[j + 1]), pt(xs[i], ys[j + 1]));
      if (!cellIn(i - 1, j)) addEdge(pt(xs[i], ys[j + 1]), pt(xs[i], ys[j]));
    }
  }
  const corners = new Set(rects.flatMap(r => [key(pt(r[0], r[1])), key(pt(r[2], r[1])), key(pt(r[2], r[3])), key(pt(r[0], r[3]))]));
  const loops: Pt[][] = [];
  const seen = new Set<string>();
  for (const startKey of nextOf.keys()) {
    if (seen.has(startKey)) continue;
    const raw: Pt[] = [];
    let k = startKey;
    while (!seen.has(k)) {
      seen.add(k);
      const [x, y] = k.split(',').map(Number);
      raw.push(pt(x, y));
      k = key(nextOf.get(k)!);
    }
    const kept = raw.filter((p, i) => {
      const a = raw[(i - 1 + raw.length) % raw.length], b = raw[(i + 1) % raw.length];
      return cross(sub(p, a), sub(b, p)) !== 0 || corners.has(key(p));
    });
    loops.push(kept);
  }
  return loops;
}

export type Form = 'hip' | 'gable' | 'mono';

export interface Wall {
  id: number;
  comp: number;
  /** Holed roof roster: the loop the wall stands on, 0 the outer loop and `k` the comp's hole `k - 1`. */
  loop: number;
  /** Its index in that loop: the prism side from the loop's vertex `edge` to `edge + 1`. */
  edge: number;
  a: Pt;
  b: Pt;
  dir: Pt;
  n: Pt; // inward unit normal
  len: number;
  tan: number;
  form: Form;
  low?: Pt; // monopitch only: the corner the rake rises from
  dead: boolean; // the wall at a monopitch's high end
  plane: number; // canonical plane id
}

/**
 * One island (holed roof decisions 4 and 5): its walls, the outer loop's edges in loop order from vertex 0 and then each
 * hole's from its vertex 0; the outer loop counter-clockwise and each hole clockwise, so every wall's left normal is
 * inward. There is no slit ring: the island is its loops.
 */
export interface Comp { walls: Wall[]; outer: Pt[]; holes: Pt[][] }

/** An island's loops, the outer loop first and then its holes. */
export const compLoops = (c: Comp): Pt[][] => [c.outer, ...c.holes];

export interface Plane { id: number; gx: number; gy: number; c: number; walls: number[]; label: string }

export interface Building {
  comps: Comp[];
  walls: Wall[];
  planes: Plane[];
  bbox: BBox;
  /** Strictly the footprint: outer loop less holes. */
  inside(p: Pt): boolean;
}

export const planeAt = (pl: Plane, p: Pt): number => pl.gx * p.x + pl.gy * p.y + pl.c;

export function wallLabel(w: Wall): string {
  const vertical = w.a.x === w.b.x;
  const lo = vertical ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x);
  const hi = vertical ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
  return vertical ? `x=${w.a.x} y[${lo},${hi}]` : `y=${w.a.y} x[${lo},${hi}]`;
}

/** One island before it is finished: its loops, and `attrs[k][j]` for loop `k`'s edge `j`. */
export interface RawComp { outer: Pt[]; holes: Pt[][]; attrs: Partial<Wall>[][] }

export function finishBuilding(rawComps: RawComp[]): Building {
  const walls: Wall[] = [];
  const comps: Comp[] = rawComps.map((rc, ci) => {
    const compWalls: Wall[] = [];
    [rc.outer, ...rc.holes].forEach((loop, k) => loop.forEach((a, i) => {
      const b = loop[(i + 1) % loop.length];
      const d = norm(sub(b, a));
      const w: Wall = {
        id: walls.length, comp: ci, loop: k, edge: i, a, b, dir: d, n: pt(-d.y, d.x), len: dist(a, b),
        tan: 1, form: 'hip', dead: false, plane: -1, ...rc.attrs[k][i],
      };
      walls.push(w);
      compWalls.push(w);
    }));
    return {walls: compWalls, outer: rc.outer, holes: rc.holes};
  });
  // The wall at a monopitch's high end is dead: the previous or next edge of its own loop.
  for (const c of comps) {
    c.walls.forEach(w => {
      if (w.form !== 'mono') return;
      const loop = c.walls.filter(o => o.loop === w.loop);
      const i = w.edge;
      const high = dist(w.a, w.low!) < 1e-6 ? w.b : w.a;
      const prev = loop[(i - 1 + loop.length) % loop.length];
      const next = loop[(i + 1) % loop.length];
      (dist(w.b, high) < 1e-6 ? next : prev).dead = true;
    });
  }
  const planes: Plane[] = [];
  const byKey = new Map<string, Plane>();
  for (const w of walls) {
    const g = mul(w.n, w.tan);
    const c = -dot(g, w.a);
    const k = `${w.comp}|${g.x.toFixed(9)}|${g.y.toFixed(9)}|${c.toFixed(6)}`;
    let pl = byKey.get(k);
    if (!pl) {
      pl = {id: planes.length, gx: g.x, gy: g.y, c, walls: [], label: ''};
      planes.push(pl);
      byKey.set(k, pl);
    }
    pl.walls.push(w.id);
    w.plane = pl.id;
  }
  for (const pl of planes) pl.label = wallLabel(walls[pl.walls[0]]);
  const bbox = bboxOf(comps.flatMap(c => c.outer));
  return {
    comps, walls, planes, bbox,
    inside(p: Pt): boolean {
      for (const c of comps) {
        if (pointInPoly(p, c.outer) && !c.holes.some(h => pointInPoly(p, h))) return true;
      }
      return false;
    },
  };
}

/** One selector picks walls by line, optional span overlap and optional inward normal. */
export interface Sel {
  x?: number;
  y?: number;
  from?: number;
  to?: number;
  n?: '+x' | '-x' | '+y' | '-y';
  form?: Form;
  low?: [number, number];
  deg?: number;
  tan?: number;
}

function matches(sel: Sel, a: Pt, b: Pt, n: Pt): boolean {
  const vertical = a.x === b.x;
  if (sel.x !== undefined && (!vertical || a.x !== sel.x)) return false;
  if (sel.y !== undefined && (vertical || a.y !== sel.y)) return false;
  const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
  const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  if (sel.from !== undefined && hi <= sel.from) return false;
  if (sel.to !== undefined && lo >= sel.to) return false;
  if (sel.n) {
    const want = {'+x': pt(1, 0), '-x': pt(-1, 0), '+y': pt(0, 1), '-y': pt(0, -1)}[sel.n];
    if (dot(n, want) < 0.5) return false;
  }
  return true;
}

function applySelectors(ring: Pt[], sels: Sel[], defaultTan: number): Partial<Wall>[] {
  const attrs: Partial<Wall>[] = ring.map(() => ({tan: defaultTan}));
  const hits = sels.map(() => 0);
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const d = norm(sub(b, a));
    const n = pt(-d.y, d.x);
    sels.forEach((s, si) => {
      if (!matches(s, a, b, n)) return;
      hits[si]++;
      if (s.form) attrs[i].form = s.form;
      if (s.low) attrs[i].low = pt(s.low[0], s.low[1]);
      if (s.deg !== undefined) attrs[i].tan = Math.tan((s.deg * Math.PI) / 180);
      if (s.tan !== undefined) attrs[i].tan = s.tan;
    });
  });
  (attrs as unknown as {hits: number[]}).hits = hits;
  return attrs;
}

/**
 * The union of `rects` as one Comp per outer loop, with its holes (holed roof decisions 7, 8 and 30): each hole joins
 * the outer loop of least area that contains its vertex 0, by `pointInPoly`, so an island inside another's courtyard
 * holds its own holes. Every loop's walls take their attributes from `sels`. A hole no outer loop contains is a hard
 * error.
 */
export function buildFromRects(rects: Rect[], sels: Sel[], defaultTan = 1): Building {
  const loops = unionLoops(rects);
  const outers = loops.filter(l => polyArea(l) > 0);
  const holes = loops.filter(l => polyArea(l) < 0);
  const owner = holes.map(h => {
    let best = -1;
    outers.forEach((o, i) => { if (pointInPoly(h[0], o) && (best < 0 || polyArea(o) < polyArea(outers[best]))) best = i; });
    if (best < 0) throw new Error(`the hole at (${h[0].x}, ${h[0].y}) lies in no outer loop`);
    return best;
  });
  const hits = sels.map(() => 0);
  const raw = outers.map((outer, i): RawComp => {
    const own = holes.filter((_, k) => owner[k] === i);
    const attrs = [outer, ...own].map(loop => {
      const a = applySelectors(loop, sels, defaultTan);
      (a as unknown as {hits: number[]}).hits.forEach((h, j) => { hits[j] += h; });
      return a;
    });
    return {outer, holes: own, attrs};
  });
  hits.forEach((h, i) => { if (!h) throw new Error(`selector ${JSON.stringify(sels[i])} matched no wall`); });
  return finishBuilding(raw);
}

/**
 * Holed roof decision 36: a courtyard, one Comp, the outer rectangle counter-clockwise with the inner one as its hole,
 * clockwise, every wall a hip at `defaultTan`.
 */
export function buildCourtyard(outerR: Rect, innerR: Rect, defaultTan = 1): Building {
  const outer = [pt(outerR[0], outerR[1]), pt(outerR[2], outerR[1]), pt(outerR[2], outerR[3]), pt(outerR[0], outerR[3])];
  const inner = [pt(innerR[0], innerR[1]), pt(innerR[0], innerR[3]), pt(innerR[2], innerR[3]), pt(innerR[2], innerR[1])];
  const hips = (loop: Pt[]): Partial<Wall>[] => loop.map(() => ({tan: defaultTan, form: 'hip'}));
  return finishBuilding([{outer, holes: [inner], attrs: [hips(outer), hips(inner)]}]);
}

/** Mirrors or transposes a building; each loop mapped and reversed alone, so wall normals stay inward (decision 5). */
export function transformBuilding(src: Building, f: (p: Pt) => Pt): Building {
  const raw = src.comps.map((c): RawComp => {
    const loops = compLoops(c).map(l => l.map(f).reverse());
    const attrs = loops.map((loop, k) => {
      const own = c.walls.filter(w => w.loop === k);
      const n = loop.length;
      return loop.map((_, i): Partial<Wall> => {
        // New edge i runs from old vertex n-1-i to old vertex n-2-i, which is old edge n-2-i reversed.
        const old = own[(n - 2 - i + n) % n];
        return {tan: old.tan, form: old.form, low: old.low ? f(old.low) : undefined};
      });
    });
    return {outer: loops[0], holes: loops.slice(1), attrs};
  });
  return finishBuilding(raw);
}
