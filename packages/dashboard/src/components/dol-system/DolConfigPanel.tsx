import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    Select, TextInput, ActionIcon, NumberInput, Pill, Button, Alert, Tooltip,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { DOL_PRESETS } from '../../dol-system/presets';
import type { Keyword } from '@proc-geo/core';

const VALID_KEYWORDS = new Set(['F', '+', '-', '[', ']', 'f']);

function parseSymbols(raw: string): string[] {
    return raw.split(/\s+/).filter(s => s.length > 0);
}

function symbolsToText(symbols: string[]): string {
    return symbols.join(' ');
}

function parseKeywords(raw: string): Keyword[] {
    return raw.split(/\s+/).filter(s => VALID_KEYWORDS.has(s)) as Keyword[];
}

function AlphabetRow({ letter, keywords, onBlurChange, onRemove }: {
    letter: string;
    keywords: string;
    onBlurChange: (letter: string, value: string) => void;
    onRemove: (letter: string) => void;
}) {
    const [draft, setDraft] = useState(keywords);
    return (
        <Group gap="xs" align="flex-end">
            <Pill size="sm">{letter}</Pill>
            <TextInput
                size="xs"
                style={{ flex: 1 }}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                onBlur={() => onBlurChange(letter, draft)}
            />
            <ActionIcon
                size="sm"
                variant="light"
                color="red"
                onClick={() => onRemove(letter)}
                title="Remove letter"
            >
                <Text size="xs">x</Text>
            </ActionIcon>
        </Group>
    );
}

function ProductionRow({ letter, rhs, onBlurChange }: {
    letter: string;
    rhs: string;
    onBlurChange: (letter: string, value: string) => void;
}) {
    const [draft, setDraft] = useState(rhs);
    return (
        <Group gap="xs" align="flex-end">
            <Text size="xs" fw={600} style={{ width: 40 }}>{letter} &rarr;</Text>
            <TextInput
                size="xs"
                style={{ flex: 1 }}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                onBlur={() => onBlurChange(letter, draft)}
            />
        </Group>
    );
}

function ConfigFormContent() {
    const config = useDolSystemStore((s) => s.config);
    const compilationError = useDolSystemStore((s) => s.compilationError);
    const setAlphabet = useDolSystemStore((s) => s.setAlphabet);
    const addLetter = useDolSystemStore((s) => s.addLetter);
    const removeLetter = useDolSystemStore((s) => s.removeLetter);
    const setProduction = useDolSystemStore((s) => s.setProduction);
    const setAxiom = useDolSystemStore((s) => s.setAxiom);
    const setTurtleParam = useDolSystemStore((s) => s.setTurtleParam);

    const [newLetterName, setNewLetterName] = useState('');
    const [newLetterKeywords, setNewLetterKeywords] = useState('');
    const [axiomDraft, setAxiomDraft] = useState(symbolsToText(config.axiom));
    const [stepDraft, setStepDraft] = useState<string | number>(config.turtle.stepLength);
    const [angleDraft, setAngleDraft] = useState<string | number>(config.turtle.angleDelta);
    const [scalingDraft, setScalingDraft] = useState<string | number>(config.turtle.generationScaling);

    return (
        <Stack gap="xs">
            {/* Alphabet editor */}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Alphabet</Text>
            {Object.keys(config.alphabet).map((letter) => (
                <AlphabetRow
                    key={letter}
                    letter={letter}
                    keywords={symbolsToText(config.alphabet[letter])}
                    onBlurChange={(l, val) => {
                        const keywords = parseKeywords(val);
                        setAlphabet(l, keywords);
                    }}
                    onRemove={removeLetter}
                />
            ))}
            <Group gap="xs" align="flex-end">
                <TextInput
                    size="xs"
                    placeholder="Name"
                    style={{ width: 60 }}
                    value={newLetterName}
                    onChange={(e) => setNewLetterName(e.currentTarget.value)}
                />
                <Tooltip label="Keywords: F + - [ ] f" position="top">
                    <TextInput
                        size="xs"
                        placeholder="Keywords"
                        style={{ flex: 1 }}
                        value={newLetterKeywords}
                        onChange={(e) => setNewLetterKeywords(e.currentTarget.value)}
                    />
                </Tooltip>
                <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => {
                        const name = newLetterName.trim();
                        if (!name) return;
                        const keywords = parseKeywords(newLetterKeywords);
                        addLetter(name, keywords);
                        setNewLetterName('');
                        setNewLetterKeywords('');
                    }}
                >
                    Add
                </Button>
            </Group>

            {/* Productions editor */}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Productions</Text>
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

            {/* Axiom editor */}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Axiom</Text>
            <TextInput
                size="xs"
                value={axiomDraft}
                onChange={(e) => setAxiomDraft(e.currentTarget.value)}
                onBlur={() => {
                    const symbols = parseSymbols(axiomDraft);
                    setAxiom(symbols);
                }}
            />

            {/* Turtle params */}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Turtle Parameters</Text>
            <NumberInput
                size="xs"
                label="Step Length"
                value={stepDraft}
                onChange={(v) => setStepDraft(v)}
                onBlur={() => setTurtleParam('stepLength', typeof stepDraft === 'number' ? stepDraft : 0)}
            />
            <NumberInput
                size="xs"
                label="Angle Delta (deg)"
                value={angleDraft}
                onChange={(v) => setAngleDraft(v)}
                onBlur={() => setTurtleParam('angleDelta', typeof angleDraft === 'number' ? angleDraft : 0)}
            />
            <NumberInput
                size="xs"
                label="Generation Scaling"
                value={scalingDraft}
                onChange={(v) => setScalingDraft(v)}
                onBlur={() => setTurtleParam('generationScaling', typeof scalingDraft === 'number' ? scalingDraft : 1)}
                step={0.01}
                min={0.01}
                max={2}
                decimalScale={4}
            />

            {/* Error display */}
            {compilationError && (
                <Alert color="red" title="Compilation Error">
                    {compilationError}
                </Alert>
            )}
        </Stack>
    );
}

export default function DolConfigPanel() {
    const [opened, setOpened] = useState(false);
    const config = useDolSystemStore((s) => s.config);
    const loadPreset = useDolSystemStore((s) => s.loadPreset);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>D0L Configuration</Title>
                        <Text size="xs" c="blue">{opened ? '\u25B2' : '\u25BC'}</Text>
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="xs">
                        {/* Preset selector */}
                        <Select
                            size="xs"
                            label="Load preset"
                            placeholder="Select..."
                            data={DOL_PRESETS.map(p => p.name)}
                            value={null}
                            onChange={(name) => {
                                if (name) loadPreset(name);
                            }}
                            clearable
                        />
                        <ConfigFormContent key={JSON.stringify(config)} />
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
