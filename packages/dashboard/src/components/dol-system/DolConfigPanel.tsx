import { useState } from 'react';
import {
    Paper, Stack, Title, UnstyledButton, Text, Group, Collapse, Select, Divider, Button,
} from '@mantine/core';
import type { SystemConfig } from '@proc-geo/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';
import { DOL_PRESETS } from '../../dol-system/presets';
import DolAlphabetSection from './DolAlphabetSection';
import DolProductionsPanel from './DolProductionsPanel';
import DolTurtleSection from './DolTurtleSection';

export default function DolConfigPanel() {
    const [opened, setOpened] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pasted, setPasted] = useState<'ok' | 'fail' | null>(null);
    const config = useDolSystemStore((s) => s.config);
    const loadPreset = useDolSystemStore((s) => s.loadPreset);
    const loadConfig = useDolSystemStore((s) => s.loadConfig);

    function copyConfig() {
        navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    function pasteConfig() {
        navigator.clipboard.readText().then((text) => {
            try {
                const parsed = JSON.parse(text);
                if (
                    typeof parsed !== 'object' || parsed === null ||
                    !('alphabet' in parsed) ||
                    !('productions' in parsed) ||
                    !('axiom' in parsed) ||
                    !('turtle' in parsed)
                ) throw new Error();
                loadConfig(parsed as SystemConfig);
                setPasted('ok');
            } catch {
                setPasted('fail');
            }
            setTimeout(() => setPasted(null), 1500);
        }).catch(() => {
            setPasted('fail');
            setTimeout(() => setPasted(null), 1500);
        });
    }

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
                        <Group grow>
                            <Button onClick={copyConfig} variant="light" color="teal" size="compact-sm">
                                {copied ? 'Copied!' : 'Copy Config'}
                            </Button>
                            <Button onClick={pasteConfig} variant="light" color="teal" size="compact-sm">
                                {pasted === 'ok' ? 'Pasted!' : pasted === 'fail' ? 'Invalid Data' : 'Paste Config'}
                            </Button>
                        </Group>
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
