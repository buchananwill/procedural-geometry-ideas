// The page's `#hash` names a fixture, a defect case, a fixture read from a committed input file, or a draft (journal
// decision 98, F8; type review B8; decision 169; viewer editing decisions 18 and 20; WP-V1).
import type {ShellFixture} from '../fixture.ts';
import {writeInput} from '../wire/input-adapter.ts';
import type {InputFile} from './catalogue.ts';
import type {DefectCase} from './defect-cases.ts';
import {parseDraftJson} from './draft.ts';
import type {ParsedDraft} from './draft.ts';

/** The name a `#hash` spells, or '' when it is empty or malformed (`#%`). */
export function hashName(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    // A malformed escape: it names nothing.
    return '';
  }
}

/** The fixture a `#hash` names; a missing, unknown or malformed hash (`#%`) names the first fixture. */
export function fixtureFromHash(hash: string, fixtures: readonly ShellFixture[]): ShellFixture {
  const name = hashName(hash);
  const found = fixtures.find(f => f.name === name) ?? fixtures[0];
  if (!found) throw new Error('fixtureFromHash: no fixtures');
  return found;
}

/** Decision 18: the hash of the draft the page keeps in `localStorage`. */
export const DRAFT_HASH = '#draft';

/** Decision 20: a hash that carries a draft, `#draft=` then the draft's `input@1` JSON in base64url. */
export const DRAFT_LINK_PREFIX = '#draft=';

/**
 * What the page shows: a roster fixture, a defect case replayed from `golden/`, or a draft (decision 18). A draft is `saved`
 * when it is the one kept in `localStorage`, and a `link` when a hash carried it. A fixture selection may carry the
 * `refusal` that sent a link back to the first fixture (decision 20).
 */
export type Selection =
  | {kind: 'fixture'; fixture: ShellFixture; refusal?: string[]}
  | {kind: 'case'; defect: DefectCase}
  | {kind: 'file'; file: InputFile}
  | {kind: 'draft'; fixture: ShellFixture; origin: DraftOrigin};

/** Where a draft on show came from: the one kept in `localStorage`, or a link's. */
export type DraftOrigin = 'saved' | 'link';

/** The name a selection is listed under. */
export const selectionName = (s: Selection): string => (s.kind === 'case' ? s.defect.name : s.kind === 'file' ? s.file.name : s.fixture.name);

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // In chunks: spreading a long array into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const fromBase64Url = (payload: string): string => {
  const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
  return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
};

/** Decision 20: the hash that carries `f` as `input@1` JSON, compact, in base64url. */
export const draftLinkHash = (f: ShellFixture): string => `${DRAFT_LINK_PREFIX}${toBase64Url(JSON.stringify(writeInput(f)))}`;

/**
 * Decision 20: the draft a link hash carries, read through `readInput`; undefined when the hash is not a link, and the
 * wire's refusal (or the decoding's) when it is one that fails.
 */
export function draftFromLinkHash(hash: string): ParsedDraft | undefined {
  if (!hash.startsWith(DRAFT_LINK_PREFIX)) return undefined;
  let text: string;
  try {
    text = fromBase64Url(hash.slice(DRAFT_LINK_PREFIX.length));
  } catch {
    return {ok: false, errors: ['the link is not base64url-encoded UTF-8 text']};
  }
  return parseDraftJson(text, 'link');
}

/**
 * The selection a `#hash` names. A link (`#draft=...`) is a draft read through `readInput`; one the wire refuses names the
 * first fixture, with the refusal (decision 20). `#draft` is the `saved` draft, or the first fixture when there is none.
 * Otherwise the roster is looked in first, so a case that shares a roster name never shadows it; then the defect cases;
 * then the fixtures read from committed input files (WP-V1); an empty, unknown or malformed hash names the roster's first
 * fixture.
 */
export function selectionFromHash(
  hash: string, fixtures: readonly ShellFixture[], cases: readonly DefectCase[], saved?: ShellFixture, files: readonly InputFile[] = [],
): Selection {
  const link = draftFromLinkHash(hash);
  if (link) {
    return link.ok
      ? {kind: 'draft', fixture: link.fixture, origin: 'link'}
      : {kind: 'fixture', fixture: fixtureFromHash('', fixtures), refusal: link.errors};
  }
  if (hash === DRAFT_HASH) {
    return saved
      ? {kind: 'draft', fixture: saved, origin: 'saved'}
      : {kind: 'fixture', fixture: fixtureFromHash('', fixtures), refusal: ['There is no saved draft to show.']};
  }
  const name = hashName(hash);
  const fixture = fixtures.find(f => f.name === name);
  if (fixture) return {kind: 'fixture', fixture};
  const defect = cases.find(c => c.name === name);
  if (defect) return {kind: 'case', defect};
  const file = files.find(f => f.name === name);
  if (file) return {kind: 'file', file};
  return {kind: 'fixture', fixture: fixtureFromHash(hash, fixtures)};
}
