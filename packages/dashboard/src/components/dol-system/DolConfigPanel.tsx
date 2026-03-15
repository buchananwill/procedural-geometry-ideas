import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse, Select, Divider,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { DOL_PRESETS } from '../../dol-system/presets';
import DolAlphabetSection from './DolAlphabetSection';
import DolProductionsPanel from './DolProductionsPanel';
import DolTurtleSection from './DolTurtleSection';

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
                        <DolAlphabetSection key={JSON.stringify(config.alphabet)} />
                        <Divider />
                        <DolProductionsPanel />
                        <Divider />
                        <DolTurtleSection key={JSON.stringify(config.turtle)} />
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
