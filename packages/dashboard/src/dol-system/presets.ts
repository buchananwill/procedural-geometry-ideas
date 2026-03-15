import type { SystemConfig } from '@proc-geo/core';

export const DOL_PRESETS: Array<{ name: string; config: SystemConfig }> = [
    {
        name: 'Koch Curve',
        config: {
            alphabet: { draw: ['F'] },
            productions: { draw: ['draw', '+', 'draw', '-', '-', 'draw', '+', 'draw'] },
            axiom: ['draw'],
            turtle: { stepLength: 100, angleDelta: 60, generationScaling: 1 / 3 },
            maxIterations: 6,
        },
    },
    {
        name: 'Sierpinski Triangle',
        config: {
            alphabet: { A: ['F'], B: ['F'] },
            productions: {
                A: ['A', '-', 'B', '+', 'A', '+', 'B', '-', 'A'],
                B: ['B', 'B'],
            },
            axiom: ['A'],
            turtle: { stepLength: 100, angleDelta: 60, generationScaling: 0.5 },
            maxIterations: 7,
        },
    },
    {
        name: 'Dragon Curve',
        config: {
            alphabet: { X: [], Y: [] },
            productions: {
                X: ['X', '+', 'Y', 'F', '+'],
                Y: ['-', 'F', 'X', '-', 'Y'],
            },
            axiom: ['F', 'X'],
            turtle: { stepLength: 50, angleDelta: 90, generationScaling: 1 },
            maxIterations: 12,
        },
    },
    {
        name: 'Fractal Plant',
        config: {
            alphabet: { X: [] },
            productions: {
                X: ['F', '+', '[', '[', 'X', ']', '-', 'X', ']', '-', 'F', '[', '-', 'F', 'X', ']', '+', 'X'],
            },
            axiom: ['X'],
            turtle: { stepLength: 25, angleDelta: 25, generationScaling: 1 },
            maxIterations: 6,
        },
    },
];
