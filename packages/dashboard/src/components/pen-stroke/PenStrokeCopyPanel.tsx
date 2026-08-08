import { useMemo, useState } from 'react';
import { Button, Paper, Stack, Switch, Text } from '@mantine/core';
import { DEFAULT_VERTEX_BUDGET } from '@proc-geo/core';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';
import SliderNumberInput from './SliderNumberInput';
import { summariseStrokeCopy } from './stroke-clipboard';

/** Seam gap restored when the closure switch is turned back on. */
const DEFAULT_SEAM_THRESHOLD = 30;

/**
 * Copies the current stroke to the clipboard as a shared geometry payload, so
 * it can be pasted into the straight skeleton page.
 *
 * The loop-closure control lives here rather than with the other pipeline
 * stages because closure is what decides whether the copied payload is a region
 * the skeleton can solve or a path it must refuse — the two readings sit next to
 * each other so the refusal is never a surprise.
 *
 * Budgeting runs on render rather than on click so the panel can state up front
 * how many vertices the copy will carry and whether the budget cost anything.
 * The reduction is a binary search over RDP tolerances, so it is memoised on the
 * pipeline result.
 */
export default function PenStrokeCopyPanel() {
    const result = usePenStrokeStore((s) => s.result);
    const closure = usePenStrokeStore((s) => s.closure);
    const setClosure = usePenStrokeStore((s) => s.setClosure);
    const [copied, setCopied] = useState(false);

    const summary = useMemo(
        () => (result ? summariseStrokeCopy(result, DEFAULT_VERTEX_BUDGET) : null),
        [result],
    );

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
