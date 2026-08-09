import { Alert, Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ParcelPipelineResult, ParcelPipelineStage } from '../../hooks/useParcelPipeline';

export interface ParcelReportPanelProps {
    result: ParcelPipelineResult;
}

const STAGE_LABELS: Record<ParcelPipelineStage, string> = {
    solve: 'skeleton solve',
    offset: 'offset projection',
    strips: 'strip decomposition',
    slice: 'parcel slicing',
};

function Row({ label, value }: { label: string; value: string }) {
    return (
        <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">{label}</Text>
            <Text size="sm" fw={600}>{value}</Text>
        </Group>
    );
}

/**
 * The live account of what the pipeline produced, and — the part that matters — what it did not.
 *
 * `complete` and the diagnostics are given the same prominence as the counts because they are the
 * difference between "this block yields no lots" and "the solver never finished". A page that only
 * showed counts would report both as zero and look identical.
 */
export default function ParcelReportPanel({ result }: ParcelReportPanelProps) {
    const { complete, diagnostics, failure, strips, parcels, coverage, stale } = result;
    const coveragePercent = (coverage * 100).toFixed(1);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <Group justify="space-between">
                    <Title order={5}>Report</Title>
                    <Group gap={6}>
                        {stale && <Badge size="sm" color="yellow" variant="light">computing</Badge>}
                        <Badge size="sm" color={complete ? 'teal' : 'red'} variant="light">
                            {complete ? 'solve complete' : 'solve incomplete'}
                        </Badge>
                    </Group>
                </Group>

                {!complete && (
                    <Alert color="red" title="Incomplete solve">
                        The straight skeleton did not resolve, so no strips or parcels were computed.
                        Nothing below the solve is drawn — the canvas shows the polygon only.
                    </Alert>
                )}

                {failure !== null && (
                    <Alert color="red" title={`Failed at ${STAGE_LABELS[failure.stage]}`}>
                        {failure.message}
                    </Alert>
                )}

                <Row label="Vertices" value={String(result.vertices.length)} />
                <Row label="Strips" value={String(strips.length)} />
                <Row label="Parcels" value={String(parcels.length)} />
                <Row label="Coverage" value={`${coveragePercent}%`} />

                {complete && failure === null && parcels.length === 0 && (
                    <Alert color="yellow" title="No parcels">
                        The strips at this depth are too small to hold a lot. Raise the depth, or lower
                        the minimum width and area.
                    </Alert>
                )}

                {diagnostics.length > 0 && (
                    <Stack gap={4}>
                        <Text size="xs" c="dimmed" fw={600}>Diagnostics</Text>
                        {diagnostics.map((diagnostic, index) => (
                            <Text key={index} size="xs" c="dimmed">
                                <Text span fw={600} c="orange">{diagnostic.kind}</Text>: {diagnostic.detail}
                            </Text>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}
