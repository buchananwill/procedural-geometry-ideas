import type {CompiledSystem, LinkedWord, GenerationResult} from './types';
import {NUM_KEYWORDS} from './types';

export function step(system: CompiledSystem, word: LinkedWord): LinkedWord {
    const result: LinkedWord = [];
    for (let i = 0; i < word.length; i++) {
        const token = word[i];
        const production = system.productions[token.opcode];
        for (const opcode of production) {
            result.push({opcode, parentIndex: i});
        }
    }
    return result;
}

export function generate(system: CompiledSystem, generations: number): GenerationResult {
    const gens: LinkedWord[] = [];
    let converged = false;

    // Gen 0: axiom
    const gen0: LinkedWord = system.axiom.map(opcode => ({opcode, parentIndex: -1}));
    gens.push(gen0);

    const isConverged = (word: LinkedWord): boolean =>
        word.every(t => t.opcode < NUM_KEYWORDS);

    if (isConverged(gen0)) {
        converged = true;
    } else {
        // Rewriting loop
        let current = gen0;
        for (let i = 1; i <= generations; i++) {
            current = step(system, current);
            gens.push(current);
            if (isConverged(current)) {
                converged = true;
                break;
            }
        }
    }

    return {generations: gens, system, converged};
}
