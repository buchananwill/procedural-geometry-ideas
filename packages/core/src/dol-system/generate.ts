import type {CompiledSystem, LinkedWord, GenerationResult} from './types';

export function step(_system: CompiledSystem, _word: LinkedWord): LinkedWord {
    throw new Error('not implemented');
}

export function generate(_system: CompiledSystem, _generations: number): GenerationResult {
    throw new Error('not implemented');
}
