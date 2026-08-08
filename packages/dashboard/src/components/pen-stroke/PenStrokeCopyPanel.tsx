import { useState } from 'react';
import { Button, Paper, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';
import SliderNumberInput from './SliderNumberInput';
import type { StrokeReductionMode } from './stroke-clipboard';
import { MAX_VERTEX_BUDGET, MIN_VERTEX_BUDGET, STROKE_REDUCTION_MODES } from './stroke-clipboard';

/** Seam gap restored when the closure switch is turned back on. */
const DEFAULT_SEAM_THRESHOLD = 30;

/**
 * Click-targets on the budget slider. The interesting range for a shape you
 * intend to read as a handful of straight edges is the bottom of the track, so
 * the marks are geometric rather than evenly spaced.
 */
const BUDGET_MARKS = [
    { value: 4, label: '4' },
    { value: 8, label: '8' },
    { value: 16, label: '16' },
    { value: 32, label: '32' },
    { value: 64, label: '64' },
];

/**
 * Copies the current stroke to the clipboard as a shared geometry payload, so
 * it can be pasted into the straight skeleton page.
 *
 * The loop-closure control lives here rather than with the other pipeline
 * stages because closure is what decides whether the copied payload is a region
 * the skeleton can solve or a path it must refuse — the two readings sit next to
 * each other so the refusal is never a surprise.
 *
 * Budgeting runs ahead of the click rather than on it, so the panel can state up
 * front how many vertices the copy will carry and whether the budget cost
 * anything. That budgeting happens once, in the store, because the canvas
 * overlay draws the same vertices this button copies.
 */
export default function PenStrokeCopyPanel() {
    const closure = usePenStrokeStore((s) => s.closure);
    const setClosure = usePenStrokeStore((s) => s.setClosure);
    const vertexBudget = usePenStrokeStore((s) => s.vertexBudget);
    const setVertexBudget = usePenStrokeStore((s) => s.setVertexBudget);
    const reductionMode = usePenStrokeStore((s) => s.reductionMode);
    const setReductionMode = usePenStrokeStore((s) => s.setReductionMode);
    const budgetPreviewEnabled = usePenStrokeStore((s) => s.budgetPreviewEnabled);
    const setBudgetPreviewEnabled = usePenStrokeStore((s) => s.setBudgetPreviewEnabled);
    const summary = usePenStrokeStore((s) => s.copySummary);
    const [copied, setCopied] = useState(false);

    function copyStrokeToClipboard() {
        if (!summary) return;
        void navigator.clipboard.writeText(summary.text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    return (
        <Paper withBorder p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600}>Clipboard</Text>
                <Switch
                    size="xs"
                    label="Close the loop"
                    description="Treat the stroke as a closed region when it ends near where it started"
                    checked={closure.variant === 'distance-threshold'}
                    onChange={(e) => {
                        setClosure(
                            e.currentTarget.checked
                                ? { variant: 'distance-threshold', threshold: DEFAULT_SEAM_THRESHOLD }
                                : { variant: 'pass-through' },
                        );
                    }}
                />
                {closure.variant === 'distance-threshold' && (
                    <SliderNumberInput
                        label="Seam gap (px)"
                        value={closure.threshold}
                        min={5}
                        max={150}
                        step={5}
                        onChange={(threshold) => setClosure({ variant: 'distance-threshold', threshold })}
                    />
                )}
                <SliderNumberInput
                    label="Max vertices"
                    value={vertexBudget}
                    min={MIN_VERTEX_BUDGET}
                    max={MAX_VERTEX_BUDGET}
                    step={1}
                    marks={BUDGET_MARKS}
                    onChange={setVertexBudget}
                />
                <Stack gap={4}>
                    <Text size="xs" fw={500}>Reduction</Text>
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        name="stroke-reduction-mode"
                        value={reductionMode}
                        onChange={(value) => setReductionMode(value as StrokeReductionMode)}
                        data={STROKE_REDUCTION_MODES.map((m) => ({ value: m.value, label: m.label }))}
                    />
                    <Text size="xs" c="dimmed">
                        {STROKE_REDUCTION_MODES.find((m) => m.value === reductionMode)?.hint}
                    </Text>
                </Stack>
                <Switch
                    size="xs"
                    label="Show clamped polygon"
                    description="Draw the budgeted vertices — exactly what Copy will write — over the stroke"
                    checked={budgetPreviewEnabled}
                    onChange={(e) => setBudgetPreviewEnabled(e.currentTarget.checked)}
                />
                <Button
                    onClick={copyStrokeToClipboard}
                    variant="light"
                    color="teal"
                    fullWidth
                    disabled={summary === null}
                >
                    {copied ? 'Copied!' : 'Copy Polygon'}
                </Button>
                {summary ? (
                    <Text size="xs" c={summary.closed ? 'dimmed' : 'yellow'}>
                        {summary.description}
                    </Text>
                ) : (
                    <Text size="xs" c="dimmed">
                        Draw a stroke on the canvas to enable copying.
                    </Text>
                )}
            </Stack>
        </Paper>
    );
}
