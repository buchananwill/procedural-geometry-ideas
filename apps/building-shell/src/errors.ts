// Error helpers shared by every module of the app.

/**
 * Journal decision 146: a storey plan the pipeline refuses, as a named class. The plan refusals are a corner-only
 * pinch between two Ring rectangles, a degenerate loop, and a union wall that lies on no Ring side. The wire's
 * None-side probe skips exactly these (`isPlanRefusal`), leaving them to the build, and rethrows anything else.
 */
export class PlanRefusal extends Error {
  override name = 'PlanRefusal';
}

/** The message of anything thrown: one helper for every catch site. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
