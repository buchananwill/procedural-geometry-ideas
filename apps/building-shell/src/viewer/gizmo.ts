// The corner orientation gizmo's geometry (journal decision 98, F6; decision 105, L1): three axes from the origin, a label
// beyond each, seen by a perspective camera that looks down the main camera's view direction. Pure numbers, so a test can
// check that every label stays inside the gizmo's square in every view.

/** How far the gizmo camera stands from the origin, in axis lengths. */
export const GIZMO_DISTANCE = 6.5;
/** The gizmo camera's vertical field of view, degrees: the scene builds its camera with this. */
export const GIZMO_FOV = 30;
export const GIZMO_AXIS_LENGTH = 1;
/** How far along its axis a label sits. */
export const GIZMO_LABEL_AT = 1.25;
/** A label sprite's side, in axis lengths. */
export const GIZMO_LABEL_SIZE = 0.4;
/** The gizmo's square on the page, in CSS pixels, and its margin from the canvas corner. */
export const GIZMO_SIZE = 140;
export const GIZMO_MARGIN = 10;

/** The numbers the label extent depends on. */
export interface GizmoShape { fov: number; distance: number; axisLength: number; labelAt: number; labelSize: number }

export const GIZMO_SHAPE: Readonly<GizmoShape> = {
  fov: GIZMO_FOV, distance: GIZMO_DISTANCE, axisLength: GIZMO_AXIS_LENGTH, labelAt: GIZMO_LABEL_AT, labelSize: GIZMO_LABEL_SIZE,
};

/**
 * The largest distance from the gizmo square's centre, in half-widths (1 is the square's edge), that any label's
 * outer edge reaches, over every view direction. Under 1 means every label shows in every view. `overrides` replace
 * the scene's numbers, so a test can push a label out and see the same function read over 1.
 */
export function gizmoWorstExtent(overrides: Partial<GizmoShape> = {}): number {
  const s = {...GIZMO_SHAPE, ...overrides};
  const tan = Math.tan((s.fov * Math.PI) / 360);
  const at = s.labelAt * s.axisLength;
  let worst = 0;
  for (let i = 0; i <= 180; i++) {
    const theta = (i * Math.PI) / 180;
    // A label at angle `theta` from the direction to the camera: its sideways offset, and its depth from the camera.
    const side = at * Math.sin(theta);
    const depth = s.distance - at * Math.cos(theta);
    worst = Math.max(worst, (side + s.labelSize / 2) / (depth * tan));
  }
  return worst;
}
