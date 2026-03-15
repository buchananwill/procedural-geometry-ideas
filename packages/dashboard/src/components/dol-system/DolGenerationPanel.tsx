import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    Slider, ActionIcon, NumberInput,
} from '@mantine/core';
import type { DolGenerationState } from '../../hooks/useDolGeneration';

interface DolGenerationPanelProps {
    generation: DolGenerationState;
    onSetMaxGeneration: (n: number) => void;
}

export default function DolGenerationPanel({ generation, onSetMaxGeneration }: DolGenerationPanelProps) {
    const [opened, setOpened] = useState(false);

    const {
        currentGeneration,
        setCurrentGeneration,
        maxGeneration,
        isPlaying,
        playDelay,
        setPlayDelay,
        play,
        pause,
        stepForward,
        stepBackward,
    } = generation;

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>D0L Generation</Title>
                        <Text size="xs" c="blue">{opened ? '\u25B2' : '\u25BC'}</Text>
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="xs">
                        <Text size="xs" c="dimmed" fw={600}>
                            Generation {currentGeneration} / {maxGeneration}
                        </Text>
                        <Slider
                            min={0}
                            max={Math.max(maxGeneration, 0)}
                            step={1}
                            value={currentGeneration}
                            onChange={(val) => {
                                if (isPlaying) pause();
                                setCurrentGeneration(val);
                            }}
                            size="sm"
                            label={(val) => `Gen ${val}`}
                        />
                        <Group grow gap="xs">
                            <ActionIcon
                                variant="light"
                                color="teal"
                                onClick={() => { pause(); setCurrentGeneration(0); }}
                                disabled={currentGeneration === 0}
                                title="Jump to start"
                            >
                                <Text size="xs">|&lt;</Text>
                            </ActionIcon>
                            <ActionIcon
                                variant="light"
                                color="teal"
                                onClick={stepBackward}
                                disabled={currentGeneration === 0}
                                title="Step backward"
                            >
                                <Text size="xs">&lt;</Text>
                            </ActionIcon>
                            <ActionIcon
                                variant={isPlaying ? 'filled' : 'light'}
                                color="teal"
                                onClick={isPlaying ? pause : play}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                <Text size="xs">{isPlaying ? '||' : '>'}</Text>
                            </ActionIcon>
                            <ActionIcon
                                variant="light"
                                color="teal"
                                onClick={stepForward}
                                disabled={currentGeneration >= maxGeneration}
                                title="Step forward"
                            >
                                <Text size="xs">&gt;</Text>
                            </ActionIcon>
                            <ActionIcon
                                variant="light"
                                color="teal"
                                onClick={() => { pause(); setCurrentGeneration(maxGeneration); }}
                                disabled={currentGeneration >= maxGeneration}
                                title="Jump to end"
                            >
                                <Text size="xs">&gt;|</Text>
                            </ActionIcon>
                        </Group>
                        <Text size="xs" c="dimmed">Delay: {playDelay}ms</Text>
                        <Slider
                            min={50}
                            max={2000}
                            step={50}
                            value={playDelay}
                            onChange={setPlayDelay}
                            size="sm"
                            label={(val) => `${val}ms`}
                        />
                        <NumberInput
                            size="xs"
                            label="Max Generations"
                            min={1}
                            max={20}
                            value={maxGeneration}
                            onChange={(v) => onSetMaxGeneration(typeof v === 'number' ? v : 1)}
                        />
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
