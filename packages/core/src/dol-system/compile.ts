import type {SystemConfig, CompiledSystem, ValidationError, Keyword} from './types';
import {DolSystemValidationError, KEYWORD_OPCODES} from './types';

const KEYWORDS: Set<string> = new Set(['F', '+', '-', '[', ']']);

const KEYWORD_OPCODE_MAP: Record<string, number> = {
    'F': KEYWORD_OPCODES.F,
    '+': KEYWORD_OPCODES.PLUS,
    '-': KEYWORD_OPCODES.MINUS,
    '[': KEYWORD_OPCODES.PUSH,
    ']': KEYWORD_OPCODES.POP,
};

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
        opcodeTable.set(sortedLetters[i], 5 + i);
    }

    // TODO 14/3/26: Violates DRY principle. Derived init array from global constants.
    const reverseTable: string[] = ['F', '+', '-', '[', ']'];
    for (const letter of sortedLetters) {
        reverseTable.push(letter);
    }

    // Symbol resolver
    function resolve(sym: string): number {
        if (KEYWORDS.has(sym)) return KEYWORD_OPCODE_MAP[sym];
        return opcodeTable.get(sym)!;
    }

    // Productions
    const totalOpcodes = 5 + sortedLetters.length;
    const productions: number[][] = [];
    for (let k = 0; k < 5; k++) {
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
    for (let k = 0; k < 5; k++) {
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
        numKeywords: 5 as const,
    };
}
