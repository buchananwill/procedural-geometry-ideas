import { useState } from 'react';
import { Badge, Button, Divider, Group, Paper, SegmentedControl, Select, Stack, Text, Title } from '@mantine/core';
import { STRATEGIES } from '@proc-geo/core';
import type { StrategyId, Vector2 } from '@proc-geo/core';
import { useArticulationStore } from '../../stores/useArticulationStore';
import { indicatesClamping } from './clamp-indication';

// Presentation order: the axis runs from interpreting the input against the
// selection as one rigid assembly toward interpreting it per element.
const STRATEGY_DISPLAY_ORDER: StrategyId[] = ['rigid', 'saturate', 'spread'];

const STRATEGY_OPTIONS = STRATEGY_DISPLAY_ORDER
    .filter((id) => STRATEGIES[id] !== undefined)
    .map((id) => ({ value: id, label: STRATEGIES[id]!.label }));

/**
 * Exact-coordinate fixtures for probing behaviour the pointer cannot reproduce,
 * such as floating-point-exact collinear chains.
 */
const DEBUG_SHAPES: Record<string, { label: string; elements: Vector2[] }> = {
    verticalLine: {
        label: 'Vertical line, six elements at 100',
        elements: Array.from({ length: 6 }, (_, index) => ({ x: 400, y: 100 + index * 100 })),
    },
    horizontalLine: {
        label: 'Horizontal line, six elements at 100',
        elements: Array.from({ length: 6 }, (_, index) => ({ x: 150 + index * 100, y: 300 })),
    },
};

const DEBUG_SHAPE_OPTIONS = Object.entries(DEBUG_SHAPES)
    .map(([value, shape]) => ({ value, label: shape.label }));

export interface ArticulationControlsPanelProps {
    onResetView: () => void;
}

export function ArticulationControlsPanel({ onResetView }: ArticulationControlsPanelProps) {
    const strategyId = useArticulationStore((s) => s.strategyId);
    const transformMode = useArticulationStore((s) => s.transformMode);
    const selection = useArticulationStore((s) => s.selection);
    const appliedFraction = useArticulationStore((s) => s.appliedFraction);
    const appliedStrategyId = useArticulationStore((s) => s.appliedStrategyId);
    const setStrategy = useArticulationStore((s) => s.setStrategy);
    const setTransformMode = useArticulationStore((s) => s.setTransformMode);
    const deleteSelected = useArticulationStore((s) => s.deleteSelected);
    const clearAll = useArticulationStore((s) => s.clearAll);
    const replaceChain = useArticulationStore((s) => s.replaceChain);
    const [debugShapeKey, setDebugShapeKey] = useState<string>('verticalLine');

    return (
        <Paper p="sm" withBorder>
            <Stack gap="sm">
                <Title order={5}>Solver</Title>
                <SegmentedControl
                    fullWidth
                    orientation="vertical"
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
                {indicatesClamping(appliedFraction) && (
                    <Badge color="red" variant="light">
                        {appliedStrategyId === 'saturate' ? 'Absorbed' : 'Clamped to'}{' '}
                        {Math.floor(appliedFraction * 100)}%
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
                <Button size="xs" variant="light" color="cyan" fullWidth onClick={onResetView}>
                    Reset View
                </Button>
                <Text size="xs" c="dimmed">
                    Click empty space to add an element. Drag empty space to marquee-select. Shift-click toggles
                    selection, Ctrl-click sets the pivot, drag a selected element to transform. Middle-drag or
                    Alt+left-drag to pan.
                </Text>
                <Divider label="Debug shapes" labelPosition="center" />
                <Select
                    size="xs"
                    data={DEBUG_SHAPE_OPTIONS}
                    value={debugShapeKey}
                    onChange={(value) => {
                        if (value !== null) setDebugShapeKey(value);
                    }}
                    allowDeselect={false}
                />
                <Button
                    size="xs"
                    variant="default"
                    onClick={() => replaceChain(DEBUG_SHAPES[debugShapeKey].elements)}
                >
                    Replace shape
                </Button>
            </Stack>
        </Paper>
    );
}
