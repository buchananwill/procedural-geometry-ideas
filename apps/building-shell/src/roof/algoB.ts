// Algorithm B, projected intersection: the default hip over the footprint, plus one added piece per promoted line,
// the two end walls' planes clipped to the wall's side and band, composed with the higher surface winning.
import {Building, Comp, Pt, Wall, dot, sub} from './model.ts';
import {PlaneFace, Sample, Surface, emptyInfo, evalFaces, makeFace} from './surface.ts';
import {RawFace, solveFaces} from './skeleton.ts';

export type FarEdge = 'plane' | 'none' | 'contact' | 'ridge';

export interface BOptions {
  /** How far inward the piece reaches. 'plane' is the chosen rule; the others exist for the trial table. */
  far: FarEdge;
  /** Cut sides read their own line's ends, not the shorter of the pair's. For the corner-cut side by side. */
  literalCut?: boolean;
}

export interface Piece {
  wall: Wall; // the side the piece stands on
  bandLo: number;
  bandHi: number;
  farDist: number; // how far along the inward normal it stands
  planes: number[];
  label: string;
}

const EPS = 0.01;
const sameDir = (a: Pt, b: Pt): boolean => dot(a, b) > 0.5;
const along = (w: Wall, p: Pt): number => (Math.abs(w.dir.x) > 0.5 ? p.x : p.y);
const fixedOf = (w: Wall): number => (Math.abs(w.dir.x) > 0.5 ? w.a.y : w.a.x);
const atAlong = (w: Wall, s: number, d: number): Pt => (Math.abs(w.dir.x) > 0.5
  ? {x: s, y: w.a.y + w.n.y * d}
  : {x: w.a.x + w.n.x * d, y: s});
const spanOf = (w: Wall): [number, number] => {
  const a = along(w, w.a), b = along(w, w.b);
  return [Math.min(a, b), Math.max(a, b)];
};

/** The wall's straight line, walked along its inward side until it leaves the footprint. */
function extentOf(b: Building, comp: Comp, w: Wall): [number, number] {
  const breaks = [...new Set(comp.ring.map(p => along(w, p)))].sort((p, q) => p - q);
  let [lo, hi] = spanOf(w);
  for (;;) {
    const prev = breaks.filter(s => s < lo).pop();
    if (prev === undefined || !b.inside(atAlong(w, (prev + lo) / 2, EPS))) break;
    lo = prev;
  }
  for (;;) {
    const next = breaks.find(s => s > hi);
    if (next === undefined || !b.inside(atAlong(w, (next + hi) / 2, EPS))) break;
    hi = next;
  }
  return [lo, hi];
}

/** The wall standing across the line's end at coordinate `s`, its inward normal pointing back along the line. */
function endWall(comp: Comp, w: Wall, s: number, intoLine: number): Wall | undefined {
  const point = atAlong(w, s, EPS);
  const axis: Pt = Math.abs(w.dir.x) > 0.5 ? {x: 1, y: 0} : {x: 0, y: 1};
  return comp.walls.find(o => {
    if (Math.abs(dot(o.n, axis)) < 0.5) return false;
    if (dot(o.n, axis) * intoLine < 0) return false;
    if (Math.abs(along(w, o.a) - s) > 1e-6) return false;
    const t = dot(sub(point, o.a), o.dir);
    return t >= -1e-6 && t <= o.len + 1e-6;
  });
}

const planeUsable = (o: Wall | undefined): o is Wall => !!o && !o.dead && o.form !== 'cut';

function endPlanes(comp: Comp, w: Wall, ext: [number, number]): number[] {
  const out: number[] = [];
  if (w.form === 'mono') {
    const lowAt = along(w, w.low!);
    const e = endWall(comp, w, lowAt, lowAt === ext[0] ? 1 : -1);
    if (planeUsable(e)) out.push(e.plane);
    return out;
  }
  const a = endWall(comp, w, ext[0], 1), b = endWall(comp, w, ext[1], -1);
  if (planeUsable(a)) out.push(a.plane);
  if (planeUsable(b)) out.push(b.plane);
  return out;
}

/** The nearest wall facing back at this one across the band. */
function farWall(comp: Comp, w: Wall, lo: number, hi: number): Wall | undefined {
  let best: Wall | undefined;
  let bestD = Infinity;
  for (const o of comp.walls) {
    if (dot(o.n, w.n) > -0.5) continue;
    const d = dot(sub(o.a, w.a), w.n);
    if (d <= EPS) continue;
    const [p, q] = spanOf(o);
    if (Math.min(q, hi) - Math.max(p, lo) <= EPS) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function buildPieces(b: Building, comp: Comp, opt: BOptions, notes: string[]): Piece[] {
  const pieces: Piece[] = [];
  const done = new Set<number>();
  const addPiece = (w: Wall, lo: number, hi: number, planes: number[], label: string): void => {
    if (!planes.length) { notes.push(`${label}: NoPlane, no end wall offers a slope`); return; }
    let farDist = Infinity;
    const all = [...planes];
    if (opt.far === 'plane' || opt.far === 'ridge') {
      // 'ridge' reads only the wall the ridge itself runs into, 'plane' the nearest wall facing back anywhere across the band.
      let at: [number, number] = [lo, hi];
      if (opt.far === 'ridge') {
        let best = -Infinity;
        for (let k = 0; k <= 400; k++) {
          const t = lo + ((hi - lo) * k) / 400;
          const q = atAlong(w, t, 0);
          const hh = Math.min(...planes.map(id => b.planes[id].gx * q.x + b.planes[id].gy * q.y + b.planes[id].c));
          if (hh > best) { best = hh; at = [t - 1, t + 1]; }
        }
      }
      const far = farWall(comp, w, at[0], at[1]);
      if (far) {
        farDist = dot(sub(far.a, w.a), w.n);
        if (far.form === 'hip' && !far.dead) all.push(far.plane);
      }
    }
    pieces.push({wall: w, bandLo: lo, bandHi: hi, farDist, planes: all, label});
  };

  for (const w of comp.walls) {
    if (done.has(w.id) || (w.form !== 'gable' && w.form !== 'mono')) continue;
    const ext = extentOf(b, comp, w);
    const onLine = comp.walls.filter(o => sameDir(o.n, w.n) && Math.abs(fixedOf(o) - fixedOf(w)) < 1e-9 && Math.abs(o.dir.x) === Math.abs(w.dir.x)
      && spanOf(o)[0] >= ext[0] - 1e-9 && spanOf(o)[1] <= ext[1] + 1e-9);
    const hips = onLine.filter(o => o.form === 'hip');
    const promoted = onLine.filter(o => o.form === 'gable' || o.form === 'mono');
    promoted.forEach(o => done.add(o.id));
    const planes = endPlanes(comp, w, ext);
    if (!hips.length) {
      addPiece(w, ext[0], ext[1], planes, `line ${w.a.x === w.b.x ? `x=${w.a.x}` : `y=${w.a.y}`} whole [${ext[0]},${ext[1]}]`);
      continue;
    }
    // A segment of a line not promoted whole: the whole line's planes over the segment's own band.
    const sorted = promoted.map(spanOf).sort((p, q) => p[0] - q[0]);
    for (const [lo, hi] of sorted) addPiece(w, lo, hi, planes, `segment [${lo},${hi}] of line ${w.a.x === w.b.x ? `x=${w.a.x}` : `y=${w.a.y}`}`);
  }

  // The two sides of a cut stand one rake, read from whichever side's line actually ends at walls either side of the cut.
  const cuts = comp.walls.filter(w => w.form === 'cut');
  if (cuts.length === 2) {
    const exts = cuts.map(w => extentOf(b, comp, w));
    const shorter = exts[0][1] - exts[0][0] <= exts[1][1] - exts[1][0] ? 0 : 1;
    cuts.forEach((w, i) => {
      const source = opt.literalCut ? i : shorter;
      const planes = endPlanes(comp, cuts[source], exts[source]);
      const [lo, hi] = spanOf(w);
      addPiece(w, lo, hi, planes, `cut side ${i} planes from side ${source}, extent [${exts[source][0]},${exts[source][1]}]`);
    });
  }
  return pieces;
}

export function runB(b: Building, opt: BOptions): Surface {
  const info = emptyInfo();
  const defaults: PlaneFace[] = [];
  let defaultRefused = false;
  for (const comp of b.comps) {
    // A cut has no pitch of its own: its side takes the default slope of a collinear neighbour, or 45 degrees.
    const weights = comp.walls.map(w => 1 / w.tan);
    const solved = solveFaces(comp, weights);
    if (!solved.ok) {
      defaultRefused = true;
      info.notes.push(`default hip refused by the skeleton: ${solved.kind}: ${solved.message.slice(0, 200)}`);
      continue;
    }
    info.diagnostics.push(...solved.diagnostics);
    info.causality += solved.causality;
    info.tilingError = Math.max(info.tilingError, solved.tilingError);
    for (const f of solved.faces) defaults.push(makeFace(f.poly, b.planes[f.wall.plane]));
  }
  const pieces: Piece[] = [];
  for (const comp of b.comps) pieces.push(...buildPieces(b, comp, opt, info.notes));
  for (const p of pieces) info.notes.push(`piece ${p.label}: planes ${p.planes.map(id => b.planes[id].label).join(' & ')}`);
  if (defaultRefused && !pieces.length) {
    info.blocked = {stage: 'default hip', kind: 'refused', message: info.notes.join(' | ')};
  }

  const evalPiece = (piece: Piece, p: Pt): Sample | null => {
    const d = dot(sub(p, piece.wall.a), piece.wall.n);
    if (d < 0 || d > piece.farDist) return null;
    const s = along(piece.wall, p);
    if (s < piece.bandLo || s > piece.bandHi) return null;
    let best: Sample | null = null;
    for (const id of piece.planes) {
      const pl = b.planes[id];
      const h = pl.gx * p.x + pl.gy * p.y + pl.c;
      if (!best || h < best.h) best = {h, plane: id};
    }
    return best && best.h >= 0 ? best : null;
  };

  /** The trial rule: the piece stands only until its ray from the wall first falls to the default. */
  const contactStopped = (piece: Piece, p: Pt): boolean => {
    const d = dot(sub(p, piece.wall.a), piece.wall.n);
    const s = along(piece.wall, p);
    for (let t = 2; t < d; t += 4) {
      const q = atAlong(piece.wall, s, t);
      const base = evalFaces(defaults, q);
      const own = evalPiece(piece, q);
      if (base && own && base.h >= own.h - 1e-6) return true;
    }
    return false;
  };

  return {
    info,
    eval(p: Pt): Sample | null {
      let best = evalFaces(defaults, p);
      for (const piece of pieces) {
        const s = evalPiece(piece, p);
        if (!s) continue;
        if (opt.far === 'contact' && contactStopped(piece, p)) continue;
        if (!best || s.h > best.h) best = s;
      }
      return best;
    },
  };
}

/** What `solveRoofParts` returns: the parts `runB` composes, and `buildPieces`' notes. */
export interface RoofParts {
  defaults: PlaneFace[];
  faces: RawFace[];
  pieces: Piece[];
  /** `buildPieces`' notes, among them every piece it dropped as NoPlane (journal decision 64). */
  notes: string[];
}

/**
 * The parts `runB` composes, for the building shell: the default hip faces (as plane faces and as the skeleton's
 * raw faces, which keep their wall), the pieces, and `buildPieces`' notes. A component the skeleton refuses throws,
 * since a storey with a missing roof is not a shell. Added by the building-shell copy (spec decision 9); `runB` above
 * is unchanged. The caller turns a NoPlane note into a hard error naming its fixture and storey (journal decision 64).
 */
export function solveRoofParts(b: Building, opt: BOptions): RoofParts {
  const defaults: PlaneFace[] = [];
  const faces: RawFace[] = [];
  for (const comp of b.comps) {
    const weights = comp.walls.map(w => 1 / w.tan);
    const solved = solveFaces(comp, weights);
    if (!solved.ok) throw new Error(`solveRoofParts: default hip refused by the skeleton: ${solved.kind}: ${solved.message}`);
    for (const f of solved.faces) {
      faces.push(f);
      defaults.push(makeFace(f.poly, b.planes[f.wall.plane]));
    }
  }
  const notes: string[] = [];
  const pieces: Piece[] = [];
  for (const comp of b.comps) pieces.push(...buildPieces(b, comp, opt, notes));
  return {defaults, faces, pieces, notes};
}
