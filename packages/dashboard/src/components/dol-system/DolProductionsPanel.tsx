import { useState } from 'react';
import {
    Stack, UnstyledButton, Text, Group, Collapse, SegmentedControl,
} from '@mantine/core';
import DolProductionsSection from './DolProductionsSection';
import DolProductionComposer from './DolProductionComposer';

type Mode = 'text' | 'visual';

export default function DolProductionsPanel() {
    const [opened, setOpened] = useState(true);
    const [mode, setMode] = useState<Mode>('text');

    return (
        <Stack gap="xs">
            <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                <Group justify="space-between">
                    <Text size="xs" c="dimmed" fw={600}>Production Rules</Text>
                    <Text size="xs" c="blue">{opened ? '\u25B2' : '\u25BC'}</Text>
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>
                <Stack gap="xs">
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        value={mode}
                        onChange={(v) => setMode(v as Mode)}
                        data={[
                            { label: 'Text', value: 'text' },
                            { label: 'Visual', value: 'visual' },
                        ]}
                    />
                    {mode === 'text'
                        ? <DolProductionsSection key={mode} />
                        : <DolProductionComposer key={mode} />
                    }
                </Stack>
            </Collapse>
        </Stack>
    );
}
