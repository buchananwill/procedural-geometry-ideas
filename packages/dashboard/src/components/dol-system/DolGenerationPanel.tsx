import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse,
    NumberInput, Button, Badge, Alert, Switch,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';

export function DolGenerateButton() {
    const triggerGeneration = useDolSystemStore((s) => s.triggerGeneration);
    const isStale = useDolSystemStore((s) => s.isStale);

    return (
        <Group gap="xs">
            <Button color="teal" onClick={triggerGeneration}>Generate</Button>
            {isStale && <Badge color="yellow" size="sm">stale</Badge>}
        </Group>
    );
}

export default function DolGenerationPanel() {
    const [opened, setOpened] = useState(false);

    const generationCount = useDolSystemStore((s) => s.generationCount);
    const setGenerationCount = useDolSystemStore((s) => s.setGenerationCount);
    const maxWordLength = useDolSystemStore((s) => s.maxWordLength);
    const setMaxWordLength = useDolSystemStore((s) => s.setMaxWordLength);
    const wordTruncated = useDolSystemStore((s) => s.wordTruncated);
    const skipProvenance = useDolSystemStore((s) => s.skipProvenance);
    const setSkipProvenance = useDolSystemStore((s) => s.setSkipProvenance);

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
                        <Switch
                            size="xs"
                            label="Skip provenance (faster)"
                            description="Color by letter/generation unavailable when on"
                            checked={skipProvenance}
                            onChange={(e) => setSkipProvenance(e.currentTarget.checked)}
                        />
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
