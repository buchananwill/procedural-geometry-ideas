import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    NumberInput,
} from '@mantine/core';

interface DolGenerationPanelProps {
    maxGeneration: number;
    onSetMaxGeneration: (n: number) => void;
}

export default function DolGenerationPanel({ maxGeneration, onSetMaxGeneration }: DolGenerationPanelProps) {
    const [opened, setOpened] = useState(false);

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
