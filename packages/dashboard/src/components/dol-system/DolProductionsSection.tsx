import { useState } from 'react';
import {
    Stack, Text, Group,
    TextInput, Tooltip,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { symbolsToText, parseSymbols } from './dol-config-utils';

function ProductionRow({ letter, rhs, onBlurChange }: {
    letter: string;
    rhs: string;
    onBlurChange: (letter: string, value: string) => void;
}) {
    const [draft, setDraft] = useState(rhs);

    return (
        <Group gap="xs" align="flex-end">
            <Text size="xs" fw={600} style={{ width: 40 }}>{letter} &rarr;</Text>
            <Tooltip label="Rewriting rule: each generation, this letter is replaced by this sequence. Space-separate symbols.">
                <TextInput
                    size="xs"
                    style={{ flex: 1 }}
                    value={draft}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    onBlur={() => onBlurChange(letter, draft)}
                />
            </Tooltip>
        </Group>
    );
}

export default function DolProductionsSection() {
    const config = useDolSystemStore((s) => s.config);
    const setProduction = useDolSystemStore((s) => s.setProduction);
    const setAxiom = useDolSystemStore((s) => s.setAxiom);

    const [axiomDraft, setAxiomDraft] = useState(symbolsToText(config.axiom));

    return (
        <Stack gap="xs">
            {Object.keys(config.productions).map((letter) => (
                <ProductionRow
                    key={letter}
                    letter={letter}
                    rhs={symbolsToText(config.productions[letter])}
                    onBlurChange={(l, val) => {
                        const symbols = parseSymbols(val);
                        setProduction(l, symbols);
                    }}
                />
            ))}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Axiom</Text>
            <Tooltip label="The starting word. The L-System begins here and applies production rules to expand it each generation. Space-separate symbols.">
                <TextInput
                    size="xs"
                    value={axiomDraft}
                    onChange={(e) => setAxiomDraft(e.currentTarget.value)}
                    onBlur={() => {
                        const symbols = parseSymbols(axiomDraft);
                        setAxiom(symbols);
                    }}
                />
            </Tooltip>
        </Stack>
    );
}
