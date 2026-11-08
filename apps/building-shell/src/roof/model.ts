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

export type Form = 'hip' | 'gable' | 'mono' | 'cut';

export interface Wall {
  id: number;
  comp: number;
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

export interface Comp { ring: Pt[]; walls: Wall[]; outer: Pt[]; holes: Pt[][] }

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

export function finishBuilding(rawComps: {ring: Pt[]; outer: Pt[]; holes: Pt[][]; attrs: Partial<Wall>[]}[]): Building {
  const walls: Wall[] = [];
  const comps: Comp[] = rawComps.map((rc, ci) => {
    const compWalls: Wall[] = rc.ring.map((a, i) => {
      const b = rc.ring[(i + 1) % rc.ring.length];
      const d = norm(sub(b, a));
      const w: Wall = {
        id: walls.length, comp: ci, a, b, dir: d, n: pt(-d.y, d.x), len: dist(a, b),
        tan: 1, form: 'hip', dead: false, plane: -1, ...rc.attrs[i],
      };
      walls.push(w);
      return w;
    });
    return {ring: rc.ring, walls: compWalls, outer: rc.outer, holes: rc.holes};
  });
  // The wall at a monopitch's high end is dead.
  for (const c of comps) {
    c.walls.forEach((w, i) => {
      if (w.form !== 'mono') return;
      const high = dist(w.a, w.low!) < 1e-6 ? w.b : w.a;
      const prev = c.walls[(i - 1 + c.walls.length) % c.walls.length];
      const next = c.walls[(i + 1) % c.walls.length];
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

export function buildFromRects(rects: Rect[], sels: Sel[], defaultTan = 1): Building {
  const loops = unionLoops(rects);
  const outers = loops.filter(l => polyArea(l) > 0);
  const holes = loops.filter(l => polyArea(l) < 0);
  const hits = sels.map(() => 0);
  const raw = outers.map(outer => {
    if (holes.length) throw new Error('holes need a cut: use buildCourtyard');
    const attrs = applySelectors(outer, sels, defaultTan);
    (attrs as unknown as {hits: number[]}).hits.forEach((h, i) => { hits[i] += h; });
    return {ring: outer, outer, holes: [] as Pt[][], attrs};
  });
  hits.forEach((h, i) => { if (!h) throw new Error(`selector ${JSON.stringify(sels[i])} matched no wall`); });
  return finishBuilding(raw);
}

/** A courtyard ring closed across one cut, A on the outer loop, B on the inner loop, slit width zero or `slit`. */
export function buildCourtyard(outerR: Rect, innerR: Rect, cutA: Pt, cutB: Pt, slit: number, defaultTan = 1): Building {
  const outer = [pt(outerR[0], outerR[1]), pt(outerR[2], outerR[1]), pt(outerR[2], outerR[3]), pt(outerR[0], outerR[3])];
  const inner = [pt(innerR[0], innerR[1]), pt(innerR[0], innerR[3]), pt(innerR[2], innerR[3]), pt(innerR[2], innerR[1])];
  const spliced = (loop: Pt[], at: Pt): Pt[] => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      const onEdge = Math.abs(cross(sub(b, a), sub(at, a))) < 1e-9 && dot(sub(at, a), sub(at, b)) <= 0;
      if (!onEdge) continue;
      const seq: Pt[] = [];
      for (let k = 1; k <= loop.length; k++) seq.push(loop[(i + k) % loop.length]);
      return dist(seq[seq.length - 1], at) < 1e-9 ? seq.slice(0, -1) : seq;
    }
    throw new Error('cut end is not on the loop');
  };
  const across = norm(sub(cutB, cutA));
  const side = pt(across.y, -across.x); // to the right of A->B
  const A1 = add(cutA, mul(side, slit / 2)), A2 = add(cutA, mul(side, -slit / 2));
  const B1 = add(cutB, mul(side, -slit / 2)), B2 = add(cutB, mul(side, slit / 2));
  const outerSeq = spliced(outer, cutA).filter(p => dist(p, cutA) > 1e-9);
  const innerSeq = spliced(inner, cutB).filter(p => dist(p, cutB) > 1e-9);
  // Ring: A1 (right of the cut), round the outer loop, A2, up the cut to B1, round the inner loop, B2, back to A1.
  const ring = [A1, ...outerSeq, A2, B1, ...innerSeq, B2];
  const attrs: Partial<Wall>[] = ring.map((_, i) => {
    const isUp = i === outerSeq.length + 1; // A2 -> B1
    const isDown = i === ring.length - 1; // B2 -> A1
    return {tan: defaultTan, form: isUp || isDown ? 'cut' : 'hip'};
  });
  return finishBuilding([{ring, outer, holes: [inner], attrs}]);
}

/** Mirrors or transposes a building; rings re-wound CCW so wall normals stay inward. */
export function transformBuilding(src: Building, f: (p: Pt) => Pt): Building {
  const raw = src.comps.map(c => {
    const ring = c.ring.map(f).reverse();
    const nRing = c.ring.length;
    const attrs: Partial<Wall>[] = ring.map((_, i) => {
      // New edge i runs from old vertex n-1-i to old vertex n-2-i, which is old edge n-2-i reversed.
      const old = c.walls[(nRing - 2 - i + nRing) % nRing];
      return {tan: old.tan, form: old.form, low: old.low ? f(old.low) : undefined};
    });
    return {ring, outer: c.outer.map(f).reverse(), holes: c.holes.map(h => h.map(f).reverse()), attrs};
  });
  return finishBuilding(raw);
}
