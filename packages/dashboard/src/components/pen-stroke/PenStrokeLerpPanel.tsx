import { Button, Group, Paper, Slider, Stack, Text } from '@mantine/core';
import { ArrowsLeftRight } from '@phosphor-icons/react';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';

/**
 * Flagship control: morphs the drawn line between the raw pointer capture
 * (0) and the fitted spline (1). View-level only — never recomputes.
 */
export default function PenStrokeLerpPanel() {
    const lerpAlpha = usePenStrokeStore((s) => s.lerpAlpha);
    const setLerpAlpha = usePenStrokeStore((s) => s.setLerpAlpha);
    const clearStroke = usePenStrokeStore((s) => s.clearStroke);
    const hasResult = usePenStrokeStore((s) => s.result !== null);

    return (
        <Paper withBorder p="sm">
            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600}>Raw</Text>
                        <ArrowsLeftRight size={14} />
                        <Text size="sm" fw={600}>Spline</Text>
                    </Group>
                    <Button size="compact-xs" variant="light" color="gray" onClick={clearStroke}>
                        Clear
                    </Button>
                </Group>
                <Slider
                    value={lerpAlpha}
                    onChange={setLerpAlpha}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={!hasResult}
                    label={(v) => v.toFixed(2)}
                    marks={[
                        { value: 0, label: 'Raw' },
                        { value: 1, label: 'Spline' },
                    ]}
                    mb="md"
                />
                {!hasResult && (
                    <Text size="xs" c="dimmed">
                        Draw a line on the canvas (hold LMB and drag) to enable the morph.
                    </Text>
                )}
            </Stack>
        </Paper>
    );
}
