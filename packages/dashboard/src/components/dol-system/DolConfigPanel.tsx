import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    Select, TextInput, ActionIcon, NumberInput, Badge, Button, Alert,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { DOL_PRESETS } from '../../dol-system/presets';
import type { Keyword } from '@proc-geo/core';

const VALID_KEYWORDS = new Set(['F', '+', '-', '[', ']']);

function parseSymbols(raw: string): string[] {
    return raw.split(/\s+/).filter(s => s.length > 0);
}

function symbolsToText(symbols: string[]): string {
    return symbols.join(' ');
}

function parseKeywords(raw: string): Keyword[] {
    return raw.split(/\s+/).filter(s => VALID_KEYWORDS.has(s)) as Keyword[];
}

export default function DolConfigPanel() {
    const [opened, setOpened] = useState(false);
    const [newLetterName, setNewLetterName] = useState('');
    const [newLetterKeywords, setNewLetterKeywords] = useState('');

    const config = useDolSystemStore((s) => s.config);
    const compilationError = useDolSystemStore((s) => s.compilationError);
    const loadPreset = useDolSystemStore((s) => s.loadPreset);
    const setAlphabet = useDolSystemStore((s) => s.setAlphabet);
    const addLetter = useDolSystemStore((s) => s.addLetter);
    const removeLetter = useDolSystemStore((s) => s.removeLetter);
    const setProduction = useDolSystemStore((s) => s.setProduction);
    const setAxiom = useDolSystemStore((s) => s.setAxiom);
    const setTurtleParam = useDolSystemStore((s) => s.setTurtleParam);

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

                        {/* Alphabet editor */}
                        <Text size="xs" c="dimmed" fw={600} mt={4}>Alphabet</Text>
                        {Object.keys(config.alphabet).map((letter) => (
                            <Group key={letter} gap="xs" align="flex-end">
                                <Badge size="sm" variant="light">{letter}</Badge>
                                <TextInput
                                    size="xs"
                                    style={{ flex: 1 }}
                                    defaultValue={symbolsToText(config.alphabet[letter])}
                                    onBlur={(e) => {
                                        const keywords = parseKeywords(e.currentTarget.value);
                                        setAlphabet(letter, keywords);
                                    }}
                                />
                                <ActionIcon
                                    size="sm"
                                    variant="light"
                                    color="red"
                                    onClick={() => removeLetter(letter)}
                                    title="Remove letter"
                                >
                                    <Text size="xs">x</Text>
                                </ActionIcon>
                            </Group>
                        ))}
                        <Group gap="xs" align="flex-end">
                            <TextInput
                                size="xs"
                                placeholder="Name"
                                style={{ width: 60 }}
                                value={newLetterName}
                                onChange={(e) => setNewLetterName(e.currentTarget.value)}
                            />
                            <TextInput
                                size="xs"
                                placeholder="Keywords (F + - [ ])"
                                style={{ flex: 1 }}
                                value={newLetterKeywords}
                                onChange={(e) => setNewLetterKeywords(e.currentTarget.value)}
                            />
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
                            <Group key={letter} gap="xs" align="flex-end">
                                <Text size="xs" fw={600} style={{ width: 40 }}>{letter} &rarr;</Text>
                                <TextInput
                                    size="xs"
                                    style={{ flex: 1 }}
                                    defaultValue={symbolsToText(config.productions[letter])}
                                    onBlur={(e) => {
                                        const symbols = parseSymbols(e.currentTarget.value);
                                        setProduction(letter, symbols);
                                    }}
                                />
                            </Group>
                        ))}

                        {/* Axiom editor */}
                        <Text size="xs" c="dimmed" fw={600} mt={4}>Axiom</Text>
                        <TextInput
                            size="xs"
                            defaultValue={symbolsToText(config.axiom)}
                            onBlur={(e) => {
                                const symbols = parseSymbols(e.currentTarget.value);
                                setAxiom(symbols);
                            }}
                        />

                        {/* Turtle params */}
                        <Text size="xs" c="dimmed" fw={600} mt={4}>Turtle Parameters</Text>
                        <NumberInput
                            size="xs"
                            label="Step Length"
                            value={config.turtle.stepLength}
                            onChange={(v) => setTurtleParam('stepLength', typeof v === 'number' ? v : 0)}
                        />
                        <NumberInput
                            size="xs"
                            label="Angle Delta (deg)"
                            value={config.turtle.angleDelta}
                            onChange={(v) => setTurtleParam('angleDelta', typeof v === 'number' ? v : 0)}
                        />
                        <NumberInput
                            size="xs"
                            label="Generation Scaling"
                            value={config.turtle.generationScaling}
                            onChange={(v) => setTurtleParam('generationScaling', typeof v === 'number' ? v : 1)}
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
                </Collapse>
            </Stack>
        </Paper>
    );
}
