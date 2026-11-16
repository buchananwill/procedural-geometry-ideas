// The viewer's listed roster, stated once (R10, BSA.D356): every fixture the selector lists by name, and the refused
// layouts it marks with their causes. The page and the viewer's tests import these, so what a test lists is what the
// page lists.
import {
  GABLE_SETTING_FIXTURES, HOLED_FIXTURES, HOLED_REFUSALS, PORT_FIXTURES, RING_CONFLICT_FIXTURES, RISE_FIXTURES, SHELL_FIXTURES,
} from '../fixture.ts';
import type {ShellFixture} from '../fixture.ts';
import {HOLED_CAUSES} from '../roof/skeleton.ts';
import type {RefusedLayout} from './catalogue.ts';
import {RESEARCH_FIXTURES} from './research-cases.ts';

/** Holed roof decision 58: every layout the holed solve refuses, with its cause, so it can be loaded and its error read. */
export const REFUSED_LAYOUTS: readonly RefusedLayout[] = HOLED_REFUSALS.map(r => ({fixture: r.fixture, cause: HOLED_CAUSES[r.kind]}));

/**
 * Every fixture the selector lists by name: the roster, the gable rises and settings, the Ring conflicts, the port's,
 * the holed fixtures and refusals, the research cases.
 */
export const LISTED_FIXTURES: readonly ShellFixture[] = [
  ...SHELL_FIXTURES, ...RISE_FIXTURES, ...GABLE_SETTING_FIXTURES, ...RING_CONFLICT_FIXTURES, ...PORT_FIXTURES, ...HOLED_FIXTURES,
  ...REFUSED_LAYOUTS.map(r => r.fixture), ...RESEARCH_FIXTURES,
];
