import { Paper, Select, Stack, Text } from '@mantine/core';
import { usePenStrokeStore } from '../../stores/usePenStrokeStore';
import SliderNumberInput from './SliderNumberInput';

/**
 * One section per pipeline stage: a dropdown for the stage's variant, plus
 * slider + number input pairs for that variant's numerical parameters.
 * Every change hot-recomputes the full pipeline from the stored raw input.
 */
export default function PenStrokePipelinePanel() {
    const smoothing = usePenStrokeStore((s) => s.smoothing);
    const simplification = usePenStrokeStore((s) => s.simplification);
    const cornerDetection = usePenStrokeStore((s) => s.cornerDetection);
    const fitting = usePenStrokeStore((s) => s.fitting);
    const result = usePenStrokeStore((s) => s.result);
    const setSmoothing = usePenStrokeStore((s) => s.setSmoothing);
    const setSimplification = usePenStrokeStore((s) => s.setSimplification);
    const setCornerDetection = usePenStrokeStore((s) => s.setCornerDetection);
    const setFitting = usePenStrokeStore((s) => s.setFitting);

    return (
        <Paper withBorder p="sm">
            <Stack gap="md">
                <Text size="sm" fw={600}>Pipeline</Text>

                <Stack gap="xs">
                    <Select
                        size="xs"
                        label="Smoothing"
                        data={[
                            { value: 'pass-through', label: 'Pass-through' },
                            { value: 'moving-average', label: 'Moving average' },
                        ]}
                        value={smoothing.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v === 'pass-through') setSmoothing({ variant: 'pass-through' });
                            else if (v === 'moving-average') setSmoothing({ variant: 'moving-average', windowSize: 5 });
                        }}
                    />
                    {smoothing.variant === 'moving-average' && (
                        <SliderNumberInput
                            label="Window size"
                            value={smoothing.windowSize}
                            min={3}
                            max={21}
                            step={2}
                            onChange={(windowSize) => setSmoothing({ variant: 'moving-average', windowSize })}
                        />
                    )}
                </Stack>

                <Select
                    size="xs"
                    label="Simplification"
                    data={[{ value: 'pass-through', label: 'Pass-through' }]}
                    value={simplification.variant}
                    allowDeselect={false}
                    onChange={() => setSimplification({ variant: 'pass-through' })}
                />

                <Select
                    size="xs"
                    label="Corner detection"
                    data={[{ value: 'pass-through', label: 'Pass-through' }]}
                    value={cornerDetection.variant}
                    allowDeselect={false}
                    onChange={() => setCornerDetection({ variant: 'pass-through' })}
                />

                <Stack gap="xs">
                    <Select
                        size="xs"
                        label="Curve fitting"
                        data={[
                            { value: 'pass-through', label: 'Pass-through' },
                            { value: 'schneider', label: 'Schneider (least-squares Bezier)' },
                        ]}
                        value={fitting.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v === 'pass-through') setFitting({ variant: 'pass-through' });
                            else if (v === 'schneider') setFitting({ variant: 'schneider', errorTolerance: 4 });
                        }}
                    />
                    {fitting.variant === 'schneider' && (
                        <SliderNumberInput
                            label="Error tolerance (px)"
                            value={fitting.errorTolerance}
                            min={0.5}
                            max={30}
                            step={0.5}
                            onChange={(errorTolerance) => setFitting({ variant: 'schneider', errorTolerance })}
                        />
                    )}
                    {result?.fit && (
                        <Text size="xs" c="dimmed">
                            {result.raw.length} points → {result.fit.segments.length} segment
                            {result.fit.segments.length === 1 ? '' : 's'}, max error{' '}
                            {result.fit.maxError.toFixed(2)} px
                        </Text>
                    )}
                </Stack>
            </Stack>
        </Paper>
    );
}
