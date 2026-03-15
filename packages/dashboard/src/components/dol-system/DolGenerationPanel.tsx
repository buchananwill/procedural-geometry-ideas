import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    NumberInput, Button, Badge, Alert,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';

export default function DolGenerationPanel() {
    const [opened, setOpened] = useState(false);

    const generationCount = useDolSystemStore((s) => s.generationCount);
    const setGenerationCount = useDolSystemStore((s) => s.setGenerationCount);
    const maxWordLength = useDolSystemStore((s) => s.maxWordLength);
    const setMaxWordLength = useDolSystemStore((s) => s.setMaxWordLength);
    const triggerGeneration = useDolSystemStore((s) => s.triggerGeneration);
    const isStale = useDolSystemStore((s) => s.isStale);
    const wordTruncated = useDolSystemStore((s) => s.wordTruncated);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                    <Group justify="space-between">
                        <Group gap="xs">
                            <Title order={5}>D0L Generation</Title>
                            {isStale && <Badge color="yellow" size="sm">stale</Badge>}
                        </Group>
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
                            value={generationCount}
                            onChange={(v) => setGenerationCount(typeof v === 'number' ? v : 1)}
                        />
                        <NumberInput
                            size="xs"
                            label="Max Word Length"
                            min={1000}
                            step={1000}
                            value={maxWordLength}
                            onChange={(v) => setMaxWordLength(typeof v === 'number' ? v : 1000)}
                        />
                        <Button color="teal" fullWidth onClick={triggerGeneration}>
                            Generate
                        </Button>
                        {wordTruncated && (
                            <Alert color="yellow" title="Truncated">
                                Generation was halted because the word length exceeded the maximum.
                            </Alert>
                        )}
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
