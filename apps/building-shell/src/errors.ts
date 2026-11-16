// Error helpers shared by every module of the app.
import type {Pt} from './roof/model.ts';
import type {RefusalKind} from './roof/skeleton.ts';

/**
 * Journal decision 146: a storey plan the pipeline refuses, as a named class. The plan refusals are a corner-only
 * pinch between two Ring rectangles, a degenerate loop, and a union wall that lies on no Ring side. The wire's
 * None-side probe skips exactly these (`isPlanRefusal`), leaving them to the build, and rethrows anything else.
 */
export class PlanRefusal extends Error {
  override name = 'PlanRefusal';
}

/** What an island refusal names: the island, where it stands, its hole count, and the seam's refusal of it. */
export interface IslandRefusalFields {
  /** The island's index in its Building's `comps`. */
  island: number;
  /** The island's outer loop's vertex 0. */
  at: Pt;
  /** How many holes the island has. */
  holes: number;
  /** The seam's refusal kind (`roof/skeleton.ts`). */
  kind: RefusalKind;
  /** The refusal's cause in the user's terms (holed roof decision 16). Not `cause`, which an error keeps for its chain. */
  reason: string;
  /** The solver's own message, or the seam's check's. */
  detail: string;
}

/**
 * Holed roof decision 17: an island the skeleton refuses, as a named class carrying the refusal's fields. Its message is
 * the hard error's text, and a label prefixed to it (`relabelled`) keeps the class and the fields.
 */
export class IslandRefusal extends Error implements IslandRefusalFields {
  override name = 'IslandRefusal';
  readonly island: number;
  readonly at: Pt;
  readonly holes: number;
  readonly kind: RefusalKind;
  readonly reason: string;
  readonly detail: string;

  constructor(message: string, fields: IslandRefusalFields, options?: ErrorOptions) {
    super(message, options);
    this.island = fields.island;
    this.at = fields.at;
    this.holes = fields.holes;
    this.kind = fields.kind;
    this.reason = fields.reason;
    this.detail = fields.detail;
  }
}

/** The message of anything thrown: one helper for every catch site. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * `e` re-thrown under `label`: its message prefixed `label: `, `e` its cause. A `PlanRefusal` (journal decisions 146
 * and 206) and an `IslandRefusal` keep their class, and an island refusal its fields; anything else is an `Error`.
 */
export function relabelled(label: string, e: unknown): Error {
  const message = `${label}: ${errorMessage(e)}`;
  if (e instanceof PlanRefusal) return new PlanRefusal(message, {cause: e});
  if (e instanceof IslandRefusal) return new IslandRefusal(message, e, {cause: e});
  return new Error(message, {cause: e});
}
