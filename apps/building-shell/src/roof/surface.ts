// What every algorithm returns: a height at a plan point, and the plane it came from. Heights come from planes only.
import {BBox, Building, Plane, Pt, bboxOf, planeAt, pointInPoly} from './model.ts';

export interface Sample { h: number; plane: number }

export interface Info {
  /** Why nothing stands, when something in the upstream skeleton refused. */
  blocked?: {stage: string; kind: string; message: string};
  /** Why nothing stands, when the algorithm itself had no answer. */
  noAnswer?: string;
  diagnostics: string[];
  causality: number;
  tilingError: number;
  weakWeight?: number;
  ratio?: number;
  passes?: number;
  sliverCm: number;
  postSnapDeflectionCm: number;
  nodeDisagreeCm: number;
  notes: string[];
}

export const emptyInfo = (): Info => ({diagnostics: [], causality: 0, tilingError: 0, sliverCm: 0, postSnapDeflectionCm: 0, nodeDisagreeCm: 0, notes: []});

export interface Surface { eval(p: Pt): Sample | null; info: Info }

export interface PlaneFace { poly: Pt[]; box: BBox; plane: Plane }

export function makeFace(poly: Pt[], plane: Plane): PlaneFace {
  return {poly, box: bboxOf(poly), plane};
}

/** The highest plane face holding the point. */
export function evalFaces(faces: PlaneFace[], p: Pt): Sample | null {
  let best: Sample | null = null;
  for (const f of faces) {
    if (p.x < f.box.x0 || p.x > f.box.x1 || p.y < f.box.y0 || p.y > f.box.y1) continue;
    if (!pointInPoly(p, f.poly)) continue;
    const h = planeAt(f.plane, p);
    if (!best || h > best.h) best = {h, plane: f.plane.id};
  }
  return best;
}

export const blockedSurface = (info: Info): Surface => ({eval: () => null, info});

export function planeById(b: Building, id: number): Plane { return b.planes[id]; }
