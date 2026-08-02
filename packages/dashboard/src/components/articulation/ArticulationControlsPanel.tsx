import { Badge, Button, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { STRATEGIES } from '@proc-geo/core';
import type { StrategyId } from '@proc-geo/core';
import { useArticulationStore } from '../../stores/useArticulationStore';

const STRATEGY_OPTIONS = (Object.keys(STRATEGIES) as StrategyId[]).map((id) => ({
    value: id,
    label: STRATEGIES[id]!.label,
}));

export function ArticulationControlsPanel() {
    const strategyId = useArticulationStore((s) => s.strategyId);
    const transformMode = useArticulationStore((s) => s.transformMode);
    const selection = useArticulationStore((s) => s.selection);
    const appliedFraction = useArticulationStore((s) => s.appliedFraction);
    const setStrategy = useArticulationStore((s) => s.setStrategy);
    const setTransformMode = useArticulationStore((s) => s.setTransformMode);
    const deleteSelected = useArticulationStore((s) => s.deleteSelected);
    const clearAll = useArticulationStore((s) => s.clearAll);

    return (
        <Paper p="sm" withBorder>
            <Stack gap="sm">
                <Title order={5}>Solver</Title>
                <SegmentedControl
                    fullWidth
                    data={STRATEGY_OPTIONS}
                    value={strategyId}
                    onChange={(v) => setStrategy(v as StrategyId)}
                />
                <SegmentedControl
                    fullWidth
                    data={[
                        { value: 'rotate', label: 'Rotate' },
                        { value: 'translate', label: 'Translate' },
                    ]}
                    value={transformMode}
                    onChange={(v) => setTransformMode(v as 'rotate' | 'translate')}
                />
                {appliedFraction < 1 && (
                    <Badge color="red" variant="light">
                        Clamped to {(appliedFraction * 100).toFixed(0)}%
                    </Badge>
                )}
                <Group gap="xs">
                    <Button size="xs" color="red" variant="light" disabled={selection.length === 0} onClick={deleteSelected}>
                        Delete selected
                    </Button>
                    <Button size="xs" variant="default" onClick={clearAll}>
                        Clear all
                    </Button>
                </Group>
                <Text size="xs" c="dimmed">
                    Click empty space to add an element. Drag empty space to marquee-select. Shift-click toggles
                    selection, Ctrl-click sets the pivot, drag a selected element to transform.
                </Text>
            </Stack>
        </Paper>
    );
}
