// Algorithm B, projected intersection: the default hip over the footprint, plus one added piece per promoted line,
// the two end walls' planes clipped to the wall's side and band, composed with the higher surface winning.
import {IslandRefusal} from '../errors.ts';
import {Building, Comp, Pt, Wall, dot, sub} from './model.ts';
import {PlaneFace, Sample, Surface, emptyInfo, evalFaces, makeFace} from './surface.ts';
import {RawFace, SolveOk, SolveRefused, solveIsland} from './skeleton.ts';
import {along, atAlong, endWall, extentOf, farWall, fixedOf, spanOf} from './wall-line.ts';

export type FarEdge = 'plane' | 'none' | 'contact' | 'ridge';

export interface BOptions {
  /** How far inward the piece reaches. 'plane' is the chosen rule; the others exist for the trial table. */
  far: FarEdge;
}

export interface Piece {
  wall: Wall; // the side the piece stands on
  bandLo: number;
  bandHi: number;
  farDist: number; // how far along the inward normal it stands
  planes: number[];
  label: string;
}

const sameDir = (a: Pt, b: Pt): boolean => dot(a, b) > 0.5;

const planeUsable = (o: Wall | undefined): o is Wall => !!o && !o.dead;

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
  return pieces;
}

/** One island's default hip: the skeleton's solve and its faces as plane faces, or the skeleton's refusal. */
type IslandFaces = (SolveOk & {defaults: PlaneFace[]}) | SolveRefused;

/** One island solved by the skeleton (`solveIsland`), each face made a plane face on its wall's plane. */
function solveIslandFaces(b: Building, comp: Comp): IslandFaces {
  const solved = solveIsland(comp);
  if (!solved.ok) return solved;
  return {...solved, defaults: solved.faces.map(f => makeFace(f.poly, b.planes[f.wall.plane]))};
}

/** Every island's pieces, island by island, each piece `buildPieces` drops noted in `notes`. */
function piecesOf(b: Building, opt: BOptions, notes: string[]): Piece[] {
  const pieces: Piece[] = [];
  for (const comp of b.comps) pieces.push(...buildPieces(b, comp, opt, notes));
  return pieces;
}

/**
 * Algorithm B's surface, as roof-gable's research runs measure it. An island the skeleton refuses is noted and passed
 * over, its default hip missing; the surface is blocked where an island is refused and no piece stands. The building
 * shell's policy is `solveRoofParts`', below.
 */
export function runB(b: Building, opt: BOptions): Surface {
  const info = emptyInfo();
  const defaults: PlaneFace[] = [];
  let defaultRefused = false;
  for (const comp of b.comps) {
    const island = solveIslandFaces(b, comp);
    if (!island.ok) {
      defaultRefused = true;
      info.notes.push(`default hip refused by the skeleton: ${island.kind}: ${island.message.slice(0, 200)}`);
      continue;
    }
    info.diagnostics.push(...island.diagnostics);
    info.causality += island.causality;
    info.tilingError = Math.max(info.tilingError, island.tilingError);
    defaults.push(...island.defaults);
  }
  const pieces = piecesOf(b, opt, info.notes);
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
 * raw faces, which keep their wall), the pieces, and `buildPieces`' notes. An island the skeleton refuses throws, naming
 * the island, where it stands, its hole count and the cause (holed roof decision 17), since a storey with a missing roof
 * is not a shell (`IslandRefusal`). Added by the building-shell copy (spec decision 9); it shares `runB`'s island solve
 * (`solveIslandFaces`) and pieces (`piecesOf`), each keeping its own policy for a refused island. The caller turns a
 * NoPlane note into a hard error naming its fixture and storey (journal decision 64).
 */
export function solveRoofParts(b: Building, opt: BOptions): RoofParts {
  const defaults: PlaneFace[] = [];
  const faces: RawFace[] = [];
  for (const [ci, comp] of b.comps.entries()) {
    const island = solveIslandFaces(b, comp);
    if (!island.ok) {
      const {x, y} = comp.outer[0];
      throw new IslandRefusal(
        `solveRoofParts: island ${ci} at (${x}, ${y}) with ${comp.holes.length} holes cannot be roofed: ${island.cause} [${island.kind}: ${island.message}]`,
        {island: ci, at: {x, y}, holes: comp.holes.length, kind: island.kind, reason: island.cause, detail: island.message},
      );
    }
    faces.push(...island.faces);
    defaults.push(...island.defaults);
  }
  const notes: string[] = [];
  const pieces = piecesOf(b, opt, notes);
  return {defaults, faces, pieces, notes};
}
