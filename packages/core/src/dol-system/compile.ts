import type {SystemConfig, CompiledSystem, ValidationError, Keyword} from './types';
import {DolSystemValidationError, KEYWORD_OPCODES, KEYWORD_NAMES, NUM_KEYWORDS} from './types';

const KEYWORDS: Set<string> = new Set(KEYWORD_NAMES);

const KEYWORD_OPCODE_MAP: Record<string, number> = Object.fromEntries(
    KEYWORD_NAMES.map((name, i) => [name, i])
);

export function compile(config: SystemConfig): CompiledSystem {
    const errors: ValidationError[] = [];

    // Validate letter names
    for (const name of Object.keys(config.alphabet)) {
        if (name.length > 16) {
            errors.push({field: 'letterName', message: `Letter name "${name}" exceeds 16 characters`});
        }
    }

    // Validate alphabet values (must contain only keywords)
    for (const [name, definition] of Object.entries(config.alphabet)) {
        for (const sym of definition) {
            if (!KEYWORDS.has(sym)) {
                errors.push({field: 'alphabet', message: `Alphabet entry "${name}" contains non-keyword symbol "${sym}"`});
            }
        }
    }

    const declaredLetters = new Set(Object.keys(config.alphabet));

    // Validate production values
    for (const [name, rhs] of Object.entries(config.productions)) {
        for (const sym of rhs) {
            if (!KEYWORDS.has(sym) && !declaredLetters.has(sym)) {
                errors.push({field: 'productions', message: `Production "${name}" references undeclared symbol "${sym}"`});
            }
        }
    }

    // Validate axiom
    for (const sym of config.axiom) {
        if (!KEYWORDS.has(sym) && !declaredLetters.has(sym)) {
            errors.push({field: 'axiom', message: `Axiom references undeclared symbol "${sym}"`});
        }
    }

    if (errors.length > 0) {
        throw new DolSystemValidationError(errors);
    }

    // Opcode assignment
    const sortedLetters = Object.keys(config.alphabet).sort();
    const opcodeTable = new Map<string, number>();
    for (let i = 0; i < sortedLetters.length; i++) {
        opcodeTable.set(sortedLetters[i], NUM_KEYWORDS + i);
    }

    const reverseTable: string[] = [...KEYWORD_NAMES];
    for (const letter of sortedLetters) {
        reverseTable.push(letter);
    }

    // Symbol resolver
    function resolve(sym: string): number {
        if (KEYWORDS.has(sym)) return KEYWORD_OPCODE_MAP[sym];
        return opcodeTable.get(sym)!;
    }

    // Productions
    const totalOpcodes = NUM_KEYWORDS + sortedLetters.length;
    const productions: number[][] = [];
    for (let k = 0; k < NUM_KEYWORDS; k++) {
        productions[k] = [k];
    }
    for (const letter of sortedLetters) {
        const opcode = opcodeTable.get(letter)!;
        if (config.productions[letter]) {
            productions[opcode] = config.productions[letter].map(resolve);
        } else {
            productions[opcode] = [opcode];
        }
    }

    // Definitions
    const definitions: number[][] = [];
    for (let k = 0; k < NUM_KEYWORDS; k++) {
        definitions[k] = [];
    }
    for (const letter of sortedLetters) {
        const opcode = opcodeTable.get(letter)!;
        definitions[opcode] = config.alphabet[letter].map(sym => KEYWORD_OPCODE_MAP[sym]);
    }

    // Axiom
    const axiom = config.axiom.map(resolve);

    return {
        opcodeTable,
        reverseTable,
        productions,
        definitions,
        axiom,
        numKeywords: NUM_KEYWORDS as typeof NUM_KEYWORDS,
    };
}
