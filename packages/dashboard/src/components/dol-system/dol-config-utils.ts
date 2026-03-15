import type { Keyword } from '@proc-geo/core';

export const VALID_KEYWORDS = new Set(['F', '+', '-', '[', ']', 'f']);

export function parseSymbols(raw: string): string[] {
    return raw.split(/\s+/).filter(s => s.length > 0);
}

export function symbolsToText(symbols: string[]): string {
    return symbols.join(' ');
}

export function parseKeywords(raw: string): Keyword[] {
    return raw.split(/\s+/).filter(s => VALID_KEYWORDS.has(s)) as Keyword[];
}
