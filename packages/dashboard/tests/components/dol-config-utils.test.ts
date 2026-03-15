import {
    VALID_KEYWORDS,
    parseSymbols,
    symbolsToText,
    parseKeywords,
} from '../../src/components/dol-system/dol-config-utils';

// ── VALID_KEYWORDS ──────────────────────────────────────────────────────────

describe('VALID_KEYWORDS', () => {
    it('contains all six turtle keywords', () => {
        for (const k of ['F', 'f', '+', '-', '[', ']']) {
            expect(VALID_KEYWORDS.has(k)).toBe(true);
        }
    });

    it('has exactly six entries', () => {
        expect(VALID_KEYWORDS.size).toBe(6);
    });

    it('does not contain arbitrary strings', () => {
        expect(VALID_KEYWORDS.has('X')).toBe(false);
        expect(VALID_KEYWORDS.has('foo')).toBe(false);
    });
});

// ── parseKeywords ───────────────────────────────────────────────────────────

describe('parseKeywords', () => {
    it('returns empty array for empty string', () => {
        expect(parseKeywords('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
        expect(parseKeywords('   ')).toEqual([]);
    });

    it('parses all valid keywords', () => {
        expect(parseKeywords('F f + - [ ]')).toEqual(['F', 'f', '+', '-', '[', ']']);
    });

    it('filters out invalid tokens', () => {
        expect(parseKeywords('F X + bad -')).toEqual(['F', '+', '-']);
    });

    it('handles extra whitespace between tokens', () => {
        expect(parseKeywords('F   +   -')).toEqual(['F', '+', '-']);
    });

    it('filters out all tokens when none are valid', () => {
        expect(parseKeywords('X Y Z hello')).toEqual([]);
    });
});

// ── symbolsToText ───────────────────────────────────────────────────────────

describe('symbolsToText', () => {
    it('returns empty string for empty array', () => {
        expect(symbolsToText([])).toBe('');
    });

    it('joins single element without extra spaces', () => {
        expect(symbolsToText(['F'])).toBe('F');
    });

    it('joins multiple symbols with spaces', () => {
        expect(symbolsToText(['F', '+', 'A', '-', 'F'])).toBe('F + A - F');
    });
});

// ── parseSymbols ────────────────────────────────────────────────────────────

describe('parseSymbols', () => {
    it('returns empty array for empty string', () => {
        expect(parseSymbols('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
        expect(parseSymbols('   ')).toEqual([]);
    });

    it('splits space-separated tokens', () => {
        expect(parseSymbols('F + A')).toEqual(['F', '+', 'A']);
    });

    it('handles multiple spaces between tokens', () => {
        expect(parseSymbols('F   A   +')).toEqual(['F', 'A', '+']);
    });

    it('preserves all tokens including non-keywords', () => {
        expect(parseSymbols('X F Y')).toEqual(['X', 'F', 'Y']);
    });
});

// ── round-trip ──────────────────────────────────────────────────────────────

describe('parseSymbols / symbolsToText round-trip', () => {
    it('round-trips cleanly formatted text', () => {
        const text = 'F + A - [ F ] B';
        expect(symbolsToText(parseSymbols(text))).toBe(text);
    });

    it('normalizes extra whitespace on round-trip', () => {
        expect(symbolsToText(parseSymbols('F   +   A'))).toBe('F + A');
    });
});
