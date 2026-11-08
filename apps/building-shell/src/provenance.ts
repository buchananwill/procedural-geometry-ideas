// Spec decision 23 as amended (journal decisions 130 and 156): wall provenance, which the union otherwise drops. Every
// Wall and Gable Cell carries the Ring side its raw wall came from, read from the fixture's Ring rectangles and the
// storey's union walls alone, never from anything inside the mesh. Browser-safe.
import {RING_SIDES, ShellFixture, storeyRings} from './fixture.ts';
import type {ShellFace} from './faces.ts';
import {WallLine, loopRuns, ringSideLines, storeyLoops} from './ring-forms.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';

/**
 * One Cell's provenance: the Ring and the side its raw wall came from. `ringModelIndex` is the Ring's model index (its
 * index in the fixture's `rings`, or, for a shell from `input@1`, the file's own model index); `side` is the side
 * index, side i running from corner i to corner i + 1. Spec 23 as amended (journal decision 156, F1) keeps the two
 * apart: a prototype-native fixture's side index is its compass order (S = 0, E = 1, N = 2, W = 3), and a shell from
 * `input@1` carries the file's own slots, mapped back by the adapter (`withFileModelIndices`).
 */
export interface CellSource { ringModelIndex: number; side: number }

/** A stretch `[lo, hi]` of a face's lattice axis `s` over which one Ring side's raw wall is visible on the face's line. */
export interface SourceSpan { lo: number; hi: number; source: CellSource }

/** Sources in the spec's order: ascending by model index, then by side. */
export const compareSources = (a: CellSource, b: CellSource): number => a.ringModelIndex - b.ringModelIndex || a.side - b.side;

const sameSource = (a: CellSource, b: CellSource): boolean => a.ringModelIndex === b.ringModelIndex && a.side === b.side;

/** A Ring side lying on a face's line and facing its way, with its stretch along the line. */
interface Candidate { lo: number; hi: number; source: CellSource }

/** Whether a straight line `l` is the face's line: its axis, its place, and an inward normal opposite the face's. */
function onFaceLine(l: WallLine, axis: 'x' | 'y', at: number, outward: number): boolean {
  return l.axis === axis && l.n === (outward > 0 ? `-${axis}` : `+${axis}`) && Math.abs(l.at - at) <= SHELL_TOLERANCE_CM;
}

/**
 * Journal decisions 130 and 156, F9: the Ring sides visible on a Wall or Gable face's line, along the face's lattice
 * axis `s` (world x on a face facing ±y, world y on one facing ±x, as spec decision 22 lays them). A span is a
 * stretch of a Ring side that lies on one of the storey's union walls, the visible stretch; where several Rings' sides
 * coincide there, the lowest index wins (decision 128's total order), the same rule as the wall's form. A Wall Cell
 * lies on such a stretch; a Gable Cell beyond them takes the nearest (`sourceAt`). Empty for every other kind.
 * One reader per fixture, so each storey's union walls are traced once.
 */
export function makeSourceSpans(fixture: ShellFixture): (face: ShellFace) => SourceSpan[] {
  const walls = new Map<number, WallLine[]>();
  const wallsOf = (storey: number): WallLine[] => {
    let w = walls.get(storey);
    if (!w) { w = storeyLoops(storeyRings(fixture, storey).map(r => r.ring.rect)).flatMap(loopRuns); walls.set(storey, w); }
    return w;
  };
  return face => {
    const kind = face.tag.kind;
    if (kind !== 'Wall' && kind !== 'Gable') return [];
    const [nx, ny] = face.normal;
    const axis = Math.abs(ny) > Math.abs(nx) ? 'y' : 'x';
    const outward = axis === 'y' ? ny : nx;
    const at = face.offset * outward;
    const visible = wallsOf(face.tag.storey).filter(l => onFaceLine(l, axis, at, outward));
    const candidates: Candidate[] = storeyRings(fixture, face.tag.storey).flatMap(({index, ring}) => {
      const lines = ringSideLines(ring.rect);
      return RING_SIDES.flatMap((side, k) => {
        const l = lines[side];
        if (!onFaceLine(l, axis, at, outward)) return [];
        // Only the stretches of the side that lie on a union wall (journal decision 156, F9).
        return visible.flatMap(w => {
          const lo = Math.max(l.lo, w.lo), hi = Math.min(l.hi, w.hi);
          return hi > lo ? [{lo, hi, source: {ringModelIndex: index, side: k}}] : [];
        });
      });
    });
    const stops = [...new Set(candidates.flatMap(c => [c.lo, c.hi]))].sort((a, b) => a - b);
    const spans: SourceSpan[] = [];
    for (let i = 0; i + 1 < stops.length; i++) {
      const mid = (stops[i] + stops[i + 1]) / 2;
      const winner = candidates.filter(c => c.lo <= mid && mid <= c.hi).sort((a, b) => compareSources(a.source, b.source))[0];
      if (!winner) continue;
      const last = spans[spans.length - 1];
      if (last && last.hi === stops[i] && sameSource(last.source, winner.source)) last.hi = stops[i + 1];
      else spans.push({lo: stops[i], hi: stops[i + 1], source: winner.source});
    }
    return spans;
  };
}

/**
 * Whether a face's Cells take the nearest span where none holds them: a Gable's, whose piece's band can reach past its
 * wall's ends over the roof beside it (measured on random courtyards: a band from y 100 to 750 over a wall from 300
 * to 650), and over a stretch the union buries (decision 156, F9's T probe). Those parts still stand on that line.
 */
export const reachesOut = (face: ShellFace): boolean => face.tag.kind === 'Gable';

/**
 * The source at `s` along a face's lattice axis: the span holding it, within `SHELL_TOLERANCE_CM`; with `reach`, the
 * nearest span where none holds it, so a gap between two spans is split at its middle. Null where none applies, which
 * the caller refuses.
 */
export function sourceAt(spans: readonly SourceSpan[], s: number, reach: boolean): CellSource | null {
  const held = spans.find(x => x.lo - SHELL_TOLERANCE_CM <= s && s <= x.hi + SHELL_TOLERANCE_CM);
  if (held || !reach || !spans.length) return held?.source ?? null;
  const gap = (x: SourceSpan): number => (s < x.lo ? x.lo - s : s - x.hi);
  return spans.reduce((best, x) => (gap(x) < gap(best) ? x : best)).source;
}

/**
 * Where a face's Cells are cut so that every Cell has one source (journal decision 130): between two consecutive
 * spans of different sources, at their shared end where they touch, and with `reach` at the middle of the gap between
 * them, where the nearest span changes.
 */
export function sourceBoundaries(spans: readonly SourceSpan[], reach: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < spans.length; i++) {
    const a = spans[i], b = spans[i + 1];
    if (sameSource(a.source, b.source)) continue;
    if (a.hi === b.lo) out.push(a.hi);
    else if (reach) out.push((a.hi + b.lo) / 2);
    else out.push(a.hi, b.lo);
  }
  return out;
}
