import { Box, Group, Stack, Switch, Text } from '@mantine/core';
import { styleForLevel } from '../scene/adapters/recursiveSubdivisionToScene';
import { useRecursiveSubdivisionStore } from '../stores/useRecursiveSubdivisionStore';
import type { RecursiveLevelSummary } from '../stores/useRecursiveSubdivisionStore';
import { pluralize, residueLine, streamLine } from './recursive-readout-text';

export interface RecursiveLevelReadoutProps {
    summary: RecursiveLevelSummary;
    visible: boolean;
}

/** One level's counts, and what each of its two streams actually did. */
export default function RecursiveLevelReadout({ summary, visible }: RecursiveLevelReadoutProps) {
    const toggleLevel = useRecursiveSubdivisionStore((s) => s.toggleLevel);

    return (
        <Stack gap={2}>
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <Box
                        w={12}
                        h={12}
                        style={{
                            background: styleForLevel(summary.level).segmentColour,
                            borderRadius: 2,
                        }}
                    />
                    <Switch
                        size="xs"
                        checked={visible}
                        onChange={() => toggleLevel(summary.level)}
                        label={`Level ${summary.level}`}
                    />
                </Group>
                <Text size="xs" c="dimmed">
                    {pluralize(summary.nodes, 'region')}
                    {summary.failures > 0 ? ` / ${summary.failures} failed` : ''}
                </Text>
            </Group>
            <Text size="xs" c="dimmed" ml={18}>
                {streamLine(summary.segments, 'segment', summary.segmentStream)}
            </Text>
            <Text size="xs" c="dimmed" ml={18}>
                {residueLine(summary)}
            </Text>
        </Stack>
    );
}
