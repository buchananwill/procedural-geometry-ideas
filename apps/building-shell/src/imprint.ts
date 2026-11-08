// Spec decision 15 as amended (journal decision 111, F41): before any tag is decided, the boundaries between coplanar
// raw faces whose winners differ are imprinted onto the output mesh. Manifold can merge coplanar regions of different
// identity into one output triangle, and the re-tag pass reads one point per triangle, so a triangle must first lie
// wholly within one winning region.
// - A boundary is a stretch of a raw triangle's edge with different winners (`regions.ts`) on its two sides, both held.
// - Every output triangle a boundary crosses is cut along the boundary's line into convex pieces.
// - Every new vertex on an output edge splits the triangle across that edge too, as the weld's T-junction split does,
//   so the mesh stays closed; `union.ts` then re-validates it through `Manifold.ofMesh`.
// - Each piece is triangulated and keeps its triangle's faceID; the re-tag pass then tags it.
import {CLEAN_TOLERANCE_CM} from './clean.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';
import {RETAG_SLACK_CM, RegionModel} from './regions.ts';
import {Vec3, identityKey} from './tags.ts';
import type {ShellMesh} from './union.ts';
import {add3, cross3, dist3, dot3, scale3, sub3, unit3} from './vec3.ts';

/**
 * How far a vertex may lie from a cut line and count as on it, how far inside a piece a boundary must run to cut it,
 * and how short a stretch of boundary is ignored: the shell's tolerance, in cm.
 */
export const IMPRINT_TOLERANCE_CM = SHELL_TOLERANCE_CM;

/**
 * How far either side of a raw edge its two winners are read, in cm: beyond `RETAG_SLACK_CM`, so each side point is
 * held only by the faces truly on its side, and under half of `SHELL_TOLERANCE_CM`, the thinnest genuine face.
 */
export const IMPRINT_SIDE_CM = 4 * RETAG_SLACK_CM;

/** New vertices nearer than this to one already made on the same edge, or in the same triangle, are that vertex. */
export const IMPRINT_MERGE_CM = CLEAN_TOLERANCE_CM;

export interface ImprintStats {
  /** Output triangles cut along a boundary. */
  split: number;
  /** Output triangles not cut themselves, split only at a new vertex on one of their edges. */
  neighbours: number;
  /** Vertices the imprint added. */
  added: number;
  /** Boundary stretches found across every plane the mesh touches. */
  boundaries: number;
}

export interface ImprintResult { mesh: ShellMesh; stats: ImprintStats }

/** A stretch of winner boundary on one plane, from `p` to `q`. */
interface Boundary { p: Vec3; q: Vec3 }

/** A convex piece of an output triangle: vertex indices counter-clockwise about its plane's normal, and per side the
 * output edge it lies on (`edgeKey`), or null for a side along a cut. */
interface Piece { vs: number[]; sides: (string | null)[] }

/**
 * One vertex of a piece being split: its index, whether it is one of the piece's own corners (`orig`) or a crossing of
 * the cut line, and the piece side it sits on (an original vertex starts side `i`; a crossing lies on it).
 */
interface PieceVertex { v: number; orig: boolean; i: number }

const edgeKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * The winner boundaries among faceID `f`'s peers: every stretch of a peer's raw triangle edge whose two sides, read
 * `IMPRINT_SIDE_CM` off it, are both held and won by different identities. A stretch ends wherever another raw edge
 * crosses or touches it, so the winners are constant along each side of it.
 */
function boundariesOf(model: RegionModel, f: number): Boundary[] {
  const {tags, raw} = model;
  const n = tags.planes[f].n;
  const edges: [Vec3, Vec3][] = [];
  const seen = new Set<string>();
  for (const g of model.peersOf(f)) {
    for (const r of raw[g]) {
      for (let i = 0; i < 3; i++) {
        const a = r.edges[i].o, b = r.edges[(i + 1) % 3].o;
        const ka = a.join(','), kb = b.join(',');
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push([a, b]);
      }
    }
  }
  const winner = (x: Vec3): string | null => {
    const w = model.holdersAt(f, x)[0];
    return w ? identityKey(w, tags.planes[f], tags.clusters) : null;
  };
  const tol = IMPRINT_TOLERANCE_CM;
  const out: Boundary[] = [];
  for (const [p, q] of edges) {
    const L = dist3(p, q);
    if (L <= tol) continue;
    const dir = scale3(sub3(q, p), 1 / L);
    const side = unit3(cross3(n, dir));
    const ts = [0, 1];
    for (const [r, s] of edges) {
      const dr = dot3(side, sub3(r, p)), ds = dot3(side, sub3(s, p));
      const tr = dot3(dir, sub3(r, p)) / L, tsv = dot3(dir, sub3(s, p)) / L;
      if (Math.abs(dr) <= tol) ts.push(tr);
      if (Math.abs(ds) <= tol) ts.push(tsv);
      if ((dr > tol && ds < -tol) || (dr < -tol && ds > tol)) ts.push(tr + (dr / (dr - ds)) * (tsv - tr));
    }
    const cuts = [...new Set(ts.filter(t => t >= 0 && t <= 1))].sort((x, y) => x - y);
    let open: number | null = null;
    let close = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i], t1 = cuts[i + 1];
      if ((t1 - t0) * L <= tol) continue;
      const m = add3(p, scale3(dir, ((t0 + t1) / 2) * L));
      const wa = winner(add3(m, scale3(side, IMPRINT_SIDE_CM)));
      const wb = winner(add3(m, scale3(side, -IMPRINT_SIDE_CM)));
      const differs = wa !== null && wb !== null && wa !== wb;
      if (differs && open === null) open = t0;
      if (differs) close = t1;
      if (!differs && open !== null) {
        out.push({p: add3(p, scale3(dir, open * L)), q: add3(p, scale3(dir, close * L))});
        open = null;
      }
    }
    if (open !== null) out.push({p: add3(p, scale3(dir, open * L)), q: add3(p, scale3(dir, close * L))});
  }
  return out;
}

/** Imprints every winner boundary onto the mesh. Returns the mesh itself, untouched, when no boundary crosses it. */
export function imprintRegions(mesh: ShellMesh, model: RegionModel): ImprintResult {
  const {table, planes} = model.tags;
  const nTri = mesh.tris.length / 3;
  const stats: ImprintStats = {split: 0, neighbours: 0, added: 0, boundaries: 0};
  const pos: number[] = Array.from(mesh.positions);
  const at = (v: number): Vec3 => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
  const tol = IMPRINT_TOLERANCE_CM;

  // Boundaries per peer set: faces with the same peers share them.
  const bySet = new Map<string, Boundary[]>();
  const boundaries = (f: number): Boundary[] => {
    if (model.identitiesOn(f) < 2) return [];
    const k = model.peersOf(f).join(',');
    let got = bySet.get(k);
    if (!got) { got = boundariesOf(model, f); bySet.set(k, got); stats.boundaries += got.length; }
    return got;
  };

  /** New vertices per output edge, and per cut triangle. */
  const onEdge = new Map<string, number[]>();
  const inTri = new Map<number, number[]>();
  const vertexAt = (x: Vec3, edge: string | null, t: number): number => {
    const mine = inTri.get(t) ?? [];
    const pool = edge === null ? mine : onEdge.get(edge) ?? [];
    for (const v of pool) if (dist3(at(v), x) <= IMPRINT_MERGE_CM) return v;
    const v = pos.length / 3;
    pos.push(x[0], x[1], x[2]);
    stats.added++;
    if (edge !== null) { const l = onEdge.get(edge); if (l) l.push(v); else onEdge.set(edge, [v]); }
    mine.push(v);
    inTri.set(t, mine);
    return v;
  };

  /** Whether boundary `b` runs more than `tol` through the piece's interior, `tol` clear of its sides. */
  const crosses = (pc: Piece, b: Boundary, n: Vec3): boolean => {
    const d = sub3(b.q, b.p);
    let s0 = 0, s1 = 1;
    for (let i = 0; i < pc.vs.length; i++) {
      const A = at(pc.vs[i]), B = at(pc.vs[(i + 1) % pc.vs.length]);
      const w = unit3(cross3(n, sub3(B, A)));
      const num = dot3(w, sub3(b.p, A)) - tol, den = dot3(w, d);
      if (Math.abs(den) < 1e-12) { if (num < 0) return false; continue; }
      const s = -num / den;
      if (den > 0) s0 = Math.max(s0, s); else s1 = Math.min(s1, s);
      if (s0 >= s1) return false;
    }
    return (s1 - s0) * Math.hypot(...d) > tol;
  };

  /** Splits a convex piece along boundary `b`'s line into the parts on either side. */
  const split = (pc: Piece, b: Boundary, n: Vec3, t: number): Piece[] => {
    const side = unit3(cross3(n, sub3(b.q, b.p)));
    const ds = pc.vs.map(v => { const d = dot3(side, sub3(at(v), b.p)); return Math.abs(d) <= tol ? 0 : d; });
    if (!ds.some(d => d > 0) || !ds.some(d => d < 0)) return [pc];
    const pos0: PieceVertex[] = [], neg: PieceVertex[] = [];
    const m = pc.vs.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const e: PieceVertex = {v: pc.vs[i], orig: true, i};
      if (ds[i] >= 0) pos0.push(e);
      if (ds[i] <= 0) neg.push(e);
      if ((ds[i] > 0 && ds[j] < 0) || (ds[i] < 0 && ds[j] > 0)) {
        const A = at(pc.vs[i]), B = at(pc.vs[j]);
        const x = add3(A, scale3(sub3(B, A), ds[i] / (ds[i] - ds[j])));
        const c: PieceVertex = {v: vertexAt(x, pc.sides[i], t), orig: false, i};
        pos0.push(c);
        neg.push(c);
      }
    }
    const make = (es: PieceVertex[]): Piece => {
      const sides = es.map((e, k) => {
        const nx = es[(k + 1) % es.length];
        const along = (e.orig && !nx.orig && nx.i === e.i) || (!e.orig && nx.orig && nx.i === (e.i + 1) % m)
          || (e.orig && nx.orig && nx.i === (e.i + 1) % m);
        return along ? pc.sides[e.i] : null;
      });
      return {vs: es.map(e => e.v), sides};
    };
    return [make(pos0), make(neg)];
  };

  // Cut every triangle a boundary crosses.
  const cut = new Map<number, Piece[]>();
  const T = mesh.tris;
  for (let t = 0; t < nTri; t++) {
    const f = mesh.faceIDs[t];
    if (table[f].kind === 'Internal') continue;
    const bs = boundaries(f);
    if (!bs.length) continue;
    const n = planes[f].n;
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    let pieces: Piece[] = [{vs: [a, b, c], sides: [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]}];
    for (const bd of bs) pieces = pieces.flatMap(pc => (crosses(pc, bd, n) ? split(pc, bd, n, t) : [pc]));
    if (pieces.length > 1) { cut.set(t, pieces); stats.split++; }
  }
  if (stats.added === 0) return {mesh, stats};

  // Split every piece side, and every untouched triangle's edge, at the new vertices lying on it; then triangulate.
  const tris: number[] = [];
  const faceIDs: number[] = [];
  for (let t = 0; t < nTri; t++) {
    const f = mesh.faceIDs[t];
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const own = cut.get(t);
    const pieces = own ?? [{vs: [a, b, c], sides: [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]}];
    let grew = false;
    for (const pc of pieces) {
      const vs: number[] = [];
      for (let i = 0; i < pc.vs.length; i++) {
        const u = pc.vs[i], w = pc.vs[(i + 1) % pc.vs.length];
        vs.push(u);
        const key = pc.sides[i];
        const pool = key === null ? inTri.get(t) ?? [] : onEdge.get(key) ?? [];
        const U = at(u), W = at(w);
        const UW = sub3(W, U);
        const L2 = dot3(UW, UW), L = Math.sqrt(L2);
        const inner: [number, number][] = [];
        for (const v of pool) {
          if (pc.vs.includes(v) || vs.includes(v)) continue;
          const UV = sub3(at(v), U);
          const s = dot3(UV, UW) / L2;
          if (s * L <= IMPRINT_MERGE_CM || (1 - s) * L <= IMPRINT_MERGE_CM) continue;
          if (dist3(at(v), add3(U, scale3(UW, s))) <= IMPRINT_MERGE_CM) inner.push([s, v]);
        }
        inner.sort((x, y) => x[0] - y[0]);
        for (const [, v] of inner) vs.push(v);
        if (inner.length) grew = true;
      }
      for (const tri of triangulate(vs, at, planes[f].n, t)) { tris.push(...tri); faceIDs.push(f); }
    }
    if (!own && grew) stats.neighbours++;
  }
  return {mesh: {positions: Float32Array.from(pos), tris: Uint32Array.from(tris), faceIDs: Uint32Array.from(faceIDs)}, stats};
}

/**
 * Triangulates a convex polygon that may carry collinear vertices on its sides, counter-clockwise about `n`, by
 * clipping ears: each ear is a strictly convex corner whose triangle has area and leaves area behind, the fattest
 * first. A polygon with no such ear is a hard error naming its output triangle.
 */
function triangulate(poly: number[], at: (v: number) => Vec3, n: Vec3, t: number): [number, number, number][] {
  const vs = poly.filter((v, i) => v !== poly[(i + 1) % poly.length]);
  const twiceArea = (a: number, b: number, c: number): number => dot3(n, cross3(sub3(at(b), at(a)), sub3(at(c), at(a))));
  const out: [number, number, number][] = [];
  let total = 0;
  for (let i = 1; i + 1 < vs.length; i++) total += twiceArea(vs[0], vs[i], vs[i + 1]);
  const tiny = 1e-9;
  while (vs.length > 3) {
    let best = -1, bestH = 0, bestA = 0;
    for (let i = 0; i < vs.length; i++) {
      const p = vs[(i + vs.length - 1) % vs.length], c = vs[i], q = vs[(i + 1) % vs.length];
      const A = twiceArea(p, c, q);
      if (A <= tiny || total - A <= tiny) continue;
      const h = A / Math.max(dist3(at(p), at(c)), dist3(at(c), at(q)), dist3(at(p), at(q)));
      if (h > bestH) { best = i; bestH = h; bestA = A; }
    }
    if (best < 0) throw new Error(`imprint: output triangle ${t}'s piece (${vs.join(' ')}) has no ear to clip`);
    const p = vs[(best + vs.length - 1) % vs.length], q = vs[(best + 1) % vs.length];
    out.push([p, vs[best], q]);
    total -= bestA;
    vs.splice(best, 1);
  }
  if (vs.length === 3) {
    if (twiceArea(vs[0], vs[1], vs[2]) <= tiny) throw new Error(`imprint: output triangle ${t}'s piece (${vs.join(' ')}) has no area`);
    out.push([vs[0], vs[1], vs[2]]);
  }
  return out;
}
