// Spec decision 23 as amended (journal decision 130): wall provenance, which the union otherwise drops. Every Wall and
// Gable Cell carries the Ring side its raw wall came from, read from the fixture's Ring rectangles alone, never from
// anything inside the mesh. Browser-safe.
import {RING_SIDES, ShellFixture, storeyRings} from './fixture.ts';
import type {ShellFace} from './faces.ts';
import {ringSideLines} from './ring-forms.ts';
import {SHELL_TOLERANCE_CM} from './constants.ts';

/**
 * One Cell's provenance: the Ring and the side its raw wall came from. `ringModelIndex` is the Ring's model index (its
 * index in the fixture's `rings`, or a wire file's own model index, mapped back by the adapter); `side` is the
 * decision 126 side index, side i running from corner i to corner i + 1 (S = 0, E = 1, N = 2, W = 3).
 */
export interface CellSource { ringModelIndex: number; side: number }

/** A stretch `[lo, hi]` of a face's lattice axis `s` over which one Ring side wins the face's line. */
export interface SourceSpan { lo: number; hi: number; source: CellSource }

/** Sources in the spec's order: ascending by model index, then by side. */
export const compareSources = (a: CellSource, b: CellSource): number => a.ringModelIndex - b.ringModelIndex || a.side - b.side;

const sameSource = (a: CellSource, b: CellSource): boolean => a.ringModelIndex === b.ringModelIndex && a.side === b.side;

/**
 * Journal decision 130: the Ring sides that win a Wall or Gable face's line, along the face's lattice axis `s` (world x
 * on a face facing ±y, world y on one facing ±x, as spec decision 22 lays them). A Wall Cell takes the Ring side whose
 * raw wall prism face it lies on; a Gable Cell takes the Ring side whose wall line its gable piece stands on (spec 8).
 * The candidates are the face's storey's Rings whose side lies on the face's line and faces out the face's way; where
 * several coincide, the lowest index wins (decision 128's total order), the same rule as the wall's form. Empty for
 * every other kind, which has no source.
 */
export function faceSourceSpans(face: ShellFace, fixture: ShellFixture): SourceSpan[] {
  const kind = face.tag.kind;
  if (kind !== 'Wall' && kind !== 'Gable') return [];
  const [nx, ny] = face.normal;
  const axis = Math.abs(ny) > Math.abs(nx) ? 'y' : 'x';
  const outward = axis === 'y' ? ny : nx;
  const at = face.offset * outward;
  const candidates = storeyRings(fixture, face.tag.storey).flatMap(({index, ring}) => {
    const lines = ringSideLines(ring.rect);
    return RING_SIDES.flatMap((side, k) => {
      const l = lines[side];
      // A side's inward normal is the opposite of the face's outward one.
      const facesOut = l.n === (outward > 0 ? `-${axis}` : `+${axis}`);
      return l.axis === axis && facesOut && Math.abs(l.at - at) <= SHELL_TOLERANCE_CM ? [{lo: l.lo, hi: l.hi, source: {ringModelIndex: index, side: k}}] : [];
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
  return kind === 'Gable' ? reachOut(spans) : spans;
}

/**
 * A gable piece's face stands over its whole band, which can reach past its wall's ends over the roof beside it
 * (measured on random courtyards: a band from y 100 to 750 over a wall from 300 to 650). Those parts still stand on
 * that wall's line, so a Gable face's spans reach out: the first to the line's one end, the last to its other, and each
 * gap between two spans is split at its middle, so a Gable Cell takes the Ring side of the nearest wall on its line.
 */
function reachOut(spans: SourceSpan[]): SourceSpan[] {
  if (!spans.length) return spans;
  const out = spans.map(s => ({...s}));
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].hi < out[i + 1].lo) { const mid = (out[i].hi + out[i + 1].lo) / 2; out[i].hi = mid; out[i + 1].lo = mid; }
  }
  out[0].lo = -Infinity;
  out[out.length - 1].hi = Infinity;
  return out;
}

/**
 * The source at `s` along a face's lattice axis: the span holding it. Cells are cut at every span's ends (decision
 * 130), so a Cell's interior lies in one span. Null where no span holds it, which the caller refuses.
 */
export const sourceAt = (spans: readonly SourceSpan[], s: number): CellSource | null => spans.find(x => x.lo - SHELL_TOLERANCE_CM <= s && s <= x.hi + SHELL_TOLERANCE_CM)?.source ?? null;
