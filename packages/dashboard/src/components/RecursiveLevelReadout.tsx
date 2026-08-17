import { Box, Group, Stack, Switch, Text } from '@mantine/core';
import { SPINE_COLOUR, styleForLevel } from '../scene/adapters/recursiveSubdivisionToScene';
import { useRecursiveSubdivisionStore } from '../stores/useRecursiveSubdivisionStore';
import type { RecursiveLevelSummary, SpineLevelSummary } from '../stores/useRecursiveSubdivisionStore';
import { pluralize, residueLine, spineLine, streamLine } from './recursive-readout-text';

export interface RecursiveLevelReadoutProps {
    summary: RecursiveLevelSummary;
    visible: boolean;
    /** What this level's spines came to. Absent where no strategy is set for the level. */
    spine?: SpineLevelSummary;
}

/** One level's counts, what each of its two streams did, and what its spines came to. */
export default function RecursiveLevelReadout({ summary, visible, spine }: RecursiveLevelReadoutProps) {
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
            {spine !== undefined && (
                <Group gap={6} wrap="nowrap" ml={18}>
                    <Box w={8} h={8} style={{ background: SPINE_COLOUR, borderRadius: 2 }} />
                    {/* Pink where a spine came back in pieces: that is the difference between a
                        definition that works on this region and one that does not, and it is the
                        one thing in this readout a reader must not scroll past. */}
                    <Text size="xs" c={spine.disconnected > 0 ? 'pink' : 'dimmed'}>
                        {spineLine(spine)}
                    </Text>
                </Group>
            )}
        </Stack>
    );
}
