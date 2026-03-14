import type {GenerationResult, Segment, TurtleConfig, TurtleOutput} from './types';
import {NUM_KEYWORDS} from './types';

function resolveLetter(result: GenerationResult, terminalIndex: number): { letter: string; generation: number } {
    let genIdx = result.generations.length - 1;
    let tokenIdx = terminalIndex;

    while (genIdx >= 0) {
        const token = result.generations[genIdx][tokenIdx];

        // Found a Letter — this is the nearest non-terminal ancestor
        if (token.opcode >= NUM_KEYWORDS) {
            return { letter: result.system.reverseTable[token.opcode], generation: genIdx };
        }

        // Reached the axiom with only keywords — return the keyword itself
        if (token.parentIndex === -1) {
            return { letter: result.system.reverseTable[token.opcode], generation: genIdx };
        }

        tokenIdx = token.parentIndex;
        genIdx--;
    }

    throw new Error(
        `resolveLetter: exhausted generation chain without resolution (terminalIndex=${terminalIndex}). This indicates a bug in the generation or provenance data.`
    );
}

export function interpret(result: GenerationResult, config: TurtleConfig): TurtleOutput {
    let position = {x: 0, y: 0};
    let heading = 0;
    const stack: Array<{ position: { x: number; y: number }; heading: number }> = [];
    let currentPath: Segment[] = [];
    const paths: Segment[][] = [];

    const min = {x: 0, y: 0};
    const max = {x: 0, y: 0};

    const rewritingGenerations = result.generations.length - 2;
    const effectiveStep = config.stepLength * Math.pow(config.generationScaling, rewritingGenerations);

    const finalGen = result.generations[result.generations.length - 1];

    for (let i = 0; i < finalGen.length; i++) {
        const token = finalGen[i];
        switch (token.opcode) {
            case 0: { // F
                // TODO: If we pre-computed rotation matrices from the rotation delta, and stored a basis vector for the turtle state, we could drop the trig functions.
                const headingRad = heading * Math.PI / 180;
                const newPos = {
                    x: position.x + Math.cos(headingRad) * effectiveStep,
                    y: position.y + Math.sin(headingRad) * effectiveStep,
                };
                const {letter, generation} = resolveLetter(result, i);
                const segment: Segment = {
                    from: {...position},
                    to: newPos,
                    opcodeIndex: i,
                    opcode: 0,
                    letter,
                    generation,
                };
                currentPath.push(segment);

                // Update bounds with from
                if (position.x < min.x) min.x = position.x;
                if (position.y < min.y) min.y = position.y;
                if (position.x > max.x) max.x = position.x;
                if (position.y > max.y) max.y = position.y;
                // Update bounds with to
                if (newPos.x < min.x) min.x = newPos.x;
                if (newPos.y < min.y) min.y = newPos.y;
                if (newPos.x > max.x) max.x = newPos.x;
                if (newPos.y > max.y) max.y = newPos.y;

                position = newPos;
                break;
            }
            case 1: // +
                heading += config.angleDelta;
                break;
            case 2: // -
                heading -= config.angleDelta;
                break;
            case 3: // [
                stack.push({position: {...position}, heading});
                break;
            case 4: { // ]
                const state = stack.pop()!;
                position = state.position;
                heading = state.heading;
                if (currentPath.length > 0) {
                    paths.push(currentPath);
                }
                currentPath = [];
                break;
            }
        }
    }

    if (currentPath.length > 0) {
        paths.push(currentPath);
    }

    return {paths, bounds: {min, max}};
}
