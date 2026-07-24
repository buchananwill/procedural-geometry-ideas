import { Paper, Select, Stack, Switch, Text } from '@mantine/core';
import {
    CORNER_DETECTION_VARIANT_DEFAULTS,
    FITTING_VARIANT_DEFAULTS,
    SIMPLIFICATION_VARIANT_DEFAULTS,
    SMOOTHING_VARIANT_DEFAULTS,
} from '@proc-geo/core';
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
    const smoothingPreviewEnabled = usePenStrokeStore((s) => s.smoothingPreviewEnabled);
    const setSmoothingPreviewEnabled = usePenStrokeStore((s) => s.setSmoothingPreviewEnabled);
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
                            { value: 'gaussian', label: 'Gaussian kernel' },
                            { value: 'one-euro', label: '1€ filter (velocity-adaptive)' },
                            { value: 'chaikin', label: 'Chaikin corner cutting' },
                        ]}
                        value={smoothing.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v && v in SMOOTHING_VARIANT_DEFAULTS) {
                                setSmoothing(SMOOTHING_VARIANT_DEFAULTS[v as keyof typeof SMOOTHING_VARIANT_DEFAULTS]);
                            }
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
                    {smoothing.variant === 'gaussian' && (
                        <SliderNumberInput
                            label="Sigma (points)"
                            value={smoothing.sigma}
                            min={0.5}
                            max={6}
                            step={0.1}
                            onChange={(sigma) => setSmoothing({ variant: 'gaussian', sigma })}
                        />
                    )}
                    {smoothing.variant === 'one-euro' && (
                        <>
                            <SliderNumberInput
                                label="Min cutoff (Hz)"
                                value={smoothing.minCutoff}
                                min={0.1}
                                max={10}
                                step={0.1}
                                onChange={(minCutoff) => setSmoothing({ ...smoothing, minCutoff })}
                            />
                            <SliderNumberInput
                                label="Beta (speed coefficient)"
                                value={smoothing.beta}
                                min={0}
                                max={0.05}
                                step={0.001}
                                onChange={(beta) => setSmoothing({ ...smoothing, beta })}
                            />
                        </>
                    )}
                    {smoothing.variant === 'chaikin' && (
                        <SliderNumberInput
                            label="Iterations"
                            value={smoothing.iterations}
                            min={1}
                            max={6}
                            step={1}
                            onChange={(iterations) => setSmoothing({ variant: 'chaikin', iterations })}
                        />
                    )}
                    <Switch
                        size="xs"
                        label="Live smoothing preview"
                        description="Ghost trail while hovering: raw cursor path vs. where this smoother would place it"
                        checked={smoothingPreviewEnabled}
                        onChange={(e) => setSmoothingPreviewEnabled(e.currentTarget.checked)}
                    />
                </Stack>

                <Stack gap="xs">
                    <Select
                        size="xs"
                        label="Simplification"
                        data={[
                            { value: 'pass-through', label: 'Pass-through' },
                            { value: 'rdp', label: 'Ramer–Douglas–Peucker' },
                            { value: 'resample', label: 'Arc-length resample' },
                        ]}
                        value={simplification.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v && v in SIMPLIFICATION_VARIANT_DEFAULTS) {
                                setSimplification(SIMPLIFICATION_VARIANT_DEFAULTS[v as keyof typeof SIMPLIFICATION_VARIANT_DEFAULTS]);
                            }
                        }}
                    />
                    {simplification.variant === 'rdp' && (
                        <SliderNumberInput
                            label="Epsilon (px)"
                            value={simplification.epsilon}
                            min={0.5}
                            max={20}
                            step={0.5}
                            onChange={(epsilon) => setSimplification({ variant: 'rdp', epsilon })}
                        />
                    )}
                    {simplification.variant === 'resample' && (
                        <SliderNumberInput
                            label="Spacing (px)"
                            value={simplification.spacing}
                            min={2}
                            max={50}
                            step={1}
                            onChange={(spacing) => setSimplification({ variant: 'resample', spacing })}
                        />
                    )}
                </Stack>

                <Stack gap="xs">
                    <Select
                        size="xs"
                        label="Corner detection"
                        data={[
                            { value: 'pass-through', label: 'Pass-through' },
                            { value: 'angle-threshold', label: 'Angle threshold' },
                        ]}
                        value={cornerDetection.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v && v in CORNER_DETECTION_VARIANT_DEFAULTS) {
                                setCornerDetection(CORNER_DETECTION_VARIANT_DEFAULTS[v as keyof typeof CORNER_DETECTION_VARIANT_DEFAULTS]);
                            }
                        }}
                    />
                    {cornerDetection.variant === 'angle-threshold' && (
                        <>
                            <SliderNumberInput
                                label="Threshold (deg)"
                                value={cornerDetection.thresholdDeg}
                                min={20}
                                max={150}
                                step={5}
                                onChange={(thresholdDeg) => setCornerDetection({ ...cornerDetection, thresholdDeg })}
                            />
                            <SliderNumberInput
                                label="Span (points)"
                                value={cornerDetection.span}
                                min={1}
                                max={8}
                                step={1}
                                onChange={(span) => setCornerDetection({ ...cornerDetection, span })}
                            />
                            {result && (
                                <Text size="xs" c="dimmed">
                                    {result.corners.cornerIndices.length} corner
                                    {result.corners.cornerIndices.length === 1 ? '' : 's'} detected
                                </Text>
                            )}
                        </>
                    )}
                </Stack>

                <Stack gap="xs">
                    <Select
                        size="xs"
                        label="Curve fitting"
                        data={[
                            { value: 'pass-through', label: 'Pass-through' },
                            { value: 'schneider', label: 'Schneider (least-squares Bezier)' },
                            { value: 'catmull-rom', label: 'Catmull–Rom (interpolating)' },
                        ]}
                        value={fitting.variant}
                        allowDeselect={false}
                        onChange={(v) => {
                            if (v && v in FITTING_VARIANT_DEFAULTS) {
                                setFitting(FITTING_VARIANT_DEFAULTS[v as keyof typeof FITTING_VARIANT_DEFAULTS]);
                            }
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
                    {fitting.variant === 'catmull-rom' && (
                        <SliderNumberInput
                            label="Alpha (0 uniform / 0.5 centripetal / 1 chordal)"
                            value={fitting.alpha}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(alpha) => setFitting({ variant: 'catmull-rom', alpha })}
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
