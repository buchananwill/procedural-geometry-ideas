// Error helpers shared by every module of the app.

/** The message of anything thrown: one helper for every catch site. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
