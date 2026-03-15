import type {GenerationResult, LinkedToken, Segment, TurtleConfig, TurtleOutput} from './types';
import {NUM_KEYWORDS} from './types';

function resolveLetter(result: GenerationResult, startGenIdx: number, startTokenIdx: number): { letter: string; generation: number } {
    let genIdx = startGenIdx;
    let tokenIdx = startTokenIdx;

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
        `resolveLetter: exhausted generation chain without resolution (startGenIdx=${startGenIdx}, startTokenIdx=${startTokenIdx}). This indicates a bug in the generation or provenance data.`
    );
}

export function interpret(result: GenerationResult, config: TurtleConfig): TurtleOutput {
    let position = {x: 0, y: 0};
    let dx = 1;  // initial heading east: cos(0) = 1
    let dy = 0;  //                        sin(0) = 0
    const stack: Array<{ position: { x: number; y: number }; dx: number; dy: number }> = [];
    let currentPath: Segment[] = [];
    const paths: Segment[][] = [];

    const min = {x: 0, y: 0};
    const max = {x: 0, y: 0};

    const rewritingGenerations = result.generations.length - 1;
    const effectiveStep = config.stepLength * Math.pow(config.generationScaling, rewritingGenerations);

    const deltaRad = config.angleDelta * Math.PI / 180;
    const cosD = Math.cos(deltaRad);
    const sinD = Math.sin(deltaRad);

    // Terminal expansion — expand remaining Letters in the last rewriting generation
    // to their keyword definitions before turtle-walking.
    const lastGen = result.generations[result.generations.length - 1];
    const terminalWord: LinkedToken[] = [];
    for (let i = 0; i < lastGen.length; i++) {
        const token = lastGen[i];
        if (token.opcode < NUM_KEYWORDS) {
            terminalWord.push({ opcode: token.opcode, parentIndex: i });
        } else {
            const definition = result.system.definitions[token.opcode];
            for (const opcode of definition) {
                terminalWord.push({ opcode, parentIndex: i });
            }
        }
    }

    for (let i = 0; i < terminalWord.length; i++) {
        const token = terminalWord[i];
        switch (token.opcode) {
            case 0: { // F
                const newPos = {
                    x: position.x + dx * effectiveStep,
                    y: position.y + dy * effectiveStep,
                };
                const {letter, generation} = resolveLetter(result, result.generations.length - 1, terminalWord[i].parentIndex);
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
            case 1: { // +
                const ndx = dx * cosD - dy * sinD;
                const ndy = dx * sinD + dy * cosD;
                dx = ndx;
                dy = ndy;
                break;
            }
            case 2: { // -
                const ndx = dx * cosD + dy * sinD;
                const ndy = -dx * sinD + dy * cosD;
                dx = ndx;
                dy = ndy;
                break;
            }
            case 3: // [
                stack.push({position: {...position}, dx, dy});
                break;
            case 4: { // ]
                const state = stack.pop()!;
                position = state.position;
                dx = state.dx;
                dy = state.dy;
                if (currentPath.length > 0) {
                    paths.push(currentPath);
                }
                currentPath = [];
                break;
            }
            case 5: { // f (move without drawing)
                const newPos = {
                    x: position.x + dx * effectiveStep,
                    y: position.y + dy * effectiveStep,
                };
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
                // f lifts the pen: advance position without drawing, then start a new polyline.
                // This ensures F f F produces two visually separate line segments with a gap between them.
                if (currentPath.length > 0) {
                    paths.push(currentPath);
                    currentPath = [];
                }
                break;
            }
        }
    }

    if (currentPath.length > 0) {
        paths.push(currentPath);
    }

    return {paths, bounds: {min, max}};
}
