import { useState } from 'react';
import {
    Badge,
    Box,
    Collapse,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Switch,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core';
import CollapseChevron from '../CollapseChevron';
import SliderNumberInput from '../pen-stroke/SliderNumberInput';
import { TERRAIN_SOURCES, useTerrainStore } from '../../stores/useTerrainStore';
import type { TerrainSourceId } from '../../stores/useTerrainStore';
import { slopeColour } from '../../scene/adapters/parcelsToScene';
import type { ParcelTerrainState } from '../../hooks/useParcelTerrain';

export interface TerrainPanelProps {
    terrain: ParcelTerrainState;
    parcelCount: number;
}

const THRESHOLD_MARKS = [
    { value: 10, label: '10°' },
    { value: 20, label: '20°' },
    { value: 30, label: '30°' },
    { value: 45, label: '45°' },
    { value: 60, label: '60°' },
];

function Row({ label, value }: { label: string; value: string }) {
    return (
        <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">{label}</Text>
            <Text size="sm" fw={600}>{value}</Text>
        </Group>
    );
}

/** The colour ramp, drawn as the thing it is, with the threshold marked on it. */
function SlopeLegend({ maxDegrees, thresholdDegrees }: { maxDegrees: number; thresholdDegrees: number }) {
    const stops = Array.from({ length: 24 }, (_, i) => (maxDegrees * i) / 23);
    const thresholdFraction = Math.min(1, Math.max(0, thresholdDegrees / maxDegrees));
    return (
        <Stack gap={2}>
            <Box style={{ position: 'relative' }}>
                <Group gap={0} wrap="nowrap" style={{ height: 12, borderRadius: 3, overflow: 'hidden' }}>
                    {stops.map((degrees) => (
                        <Box
                            key={degrees}
                            style={{ flex: 1, height: 12, background: slopeColour(degrees, maxDegrees) }}
                        />
                    ))}
                </Group>
                <Box
                    style={{
                        position: 'absolute',
                        left: `${thresholdFraction * 100}%`,
                        top: -2,
                        width: 2,
                        height: 16,
                        background: '#ffffff',
                    }}
                />
            </Box>
            <Group justify="space-between">
                <Text size="xs" c="dimmed">0°</Text>
                <Text size="xs" c="dimmed">threshold {thresholdDegrees.toFixed(0)}°</Text>
                <Text size="xs" c="dimmed">{maxDegrees.toFixed(0)}°+</Text>
            </Group>
        </Stack>
    );
}

/**
 * Terrain source, scale, and the buildability threshold — plus the verdict it produced.
 *
 * The readout above the controls is the point of the panel. A slope colouring alone cannot tell you
 * whether the numbers mean anything, because a colour ramp always produces a picture; the metres per
 * canvas unit, the patch relief and the count of rejected lots are what make it a measurement.
 */
export default function TerrainPanel({ terrain, parcelCount }: TerrainPanelProps) {
    const [opened, setOpened] = useState(true);

    const enabled = useTerrainStore((s) => s.enabled);
    const setEnabled = useTerrainStore((s) => s.setEnabled);
    const source = useTerrainStore((s) => s.source);
    const setSource = useTerrainStore((s) => s.setSource);
    const slopeThresholdDegrees = useTerrainStore((s) => s.slopeThresholdDegrees);
    const setSlopeThresholdDegrees = useTerrainStore((s) => s.setSlopeThresholdDegrees);
    const maxDisplaySlopeDegrees = useTerrainStore((s) => s.maxDisplaySlopeDegrees);
    const setMaxDisplaySlopeDegrees = useTerrainStore((s) => s.setMaxDisplaySlopeDegrees);
    const extentMetres = useTerrainStore((s) => s.extentMetres);
    const setExtentMetres = useTerrainStore((s) => s.setExtentMetres);
    const verticalScaleMetres = useTerrainStore((s) => s.verticalScaleMetres);
    const setVerticalScaleMetres = useTerrainStore((s) => s.setVerticalScaleMetres);
    const planeSlopeDegrees = useTerrainStore((s) => s.planeSlopeDegrees);
    const setPlaneSlopeDegrees = useTerrainStore((s) => s.setPlaneSlopeDegrees);
    const planeAspectDegrees = useTerrainStore((s) => s.planeAspectDegrees);
    const setPlaneAspectDegrees = useTerrainStore((s) => s.setPlaneAspectDegrees);
    const showSlopeField = useTerrainStore((s) => s.showSlopeField);
    const setShowSlopeField = useTerrainStore((s) => s.setShowSlopeField);
    const colourBySlope = useTerrainStore((s) => s.colourBySlope);
    const setColourBySlope = useTerrainStore((s) => s.setColourBySlope);

    const selected = TERRAIN_SOURCES.find((option) => option.id === source);
    const buildablePercent = parcelCount > 0 ? (terrain.buildableCount / parcelCount) * 100 : 0;

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Group gap={8}>
                            <Title order={5}>Terrain</Title>
                            {enabled && parcelCount > 0 && (
                                <Badge
                                    size="sm"
                                    variant="light"
                                    color={terrain.unbuildableCount === 0 ? 'teal' : 'orange'}
                                    data-testid="terrain-buildable-badge"
                                >
                                    {terrain.buildableCount}/{parcelCount} buildable
                                </Badge>
                            )}
                        </Group>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>

                <Collapse in={opened}>
                    <Stack gap="sm">
                        <Switch
                            size="xs"
                            label="Evaluate parcels against terrain"
                            description="Off restores the plain, terrain-free parcel view"
                            checked={enabled}
                            onChange={(event) => setEnabled(event.currentTarget.checked)}
                        />

                        {enabled && (
                            <>
                                <SegmentedControl
                                    size="xs"
                                    fullWidth
                                    value={source}
                                    onChange={(value) => setSource(value as TerrainSourceId)}
                                    data={TERRAIN_SOURCES.map((option) => ({
                                        value: option.id,
                                        label: option.label,
                                    }))}
                                />
                                <Text size="xs" c="dimmed">{selected?.description}</Text>

                                <Stack gap={4}>
                                    <Row
                                        label="Buildable lots"
                                        value={
                                            parcelCount > 0
                                                ? `${terrain.buildableCount} of ${parcelCount} (${buildablePercent.toFixed(0)}%)`
                                                : '—'
                                        }
                                    />
                                    <Row
                                        label="Mean slope (area-weighted)"
                                        value={`${terrain.meanSlopeDegrees.toFixed(1)}°`}
                                    />
                                    <Row label="Steepest sample" value={`${terrain.steepestSlopeDegrees.toFixed(1)}°`} />
                                    <Row label="Scale" value={`1 unit = ${terrain.metresPerUnit.toFixed(2)} m`} />
                                    <Row
                                        label="Patch"
                                        value={
                                            terrain.reliefMetres === null
                                                ? `${terrain.extentMetres.toFixed(0)} m across`
                                                : `${terrain.extentMetres.toFixed(0)} m across, ${terrain.reliefMetres.toFixed(0)} m relief`
                                        }
                                    />
                                </Stack>

                                <SlopeLegend
                                    maxDegrees={maxDisplaySlopeDegrees}
                                    thresholdDegrees={slopeThresholdDegrees}
                                />

                                <SliderNumberInput
                                    label="Buildable up to (°)"
                                    value={slopeThresholdDegrees}
                                    min={0}
                                    max={70}
                                    step={1}
                                    marks={THRESHOLD_MARKS}
                                    onChange={setSlopeThresholdDegrees}
                                />

                                <SliderNumberInput
                                    label="Terrain extent (m)"
                                    value={extentMetres}
                                    min={200}
                                    max={8000}
                                    step={100}
                                    onChange={setExtentMetres}
                                />

                                {source === 'mapgen4' && (
                                    <SliderNumberInput
                                        label="Vertical scale (m per elevation unit)"
                                        value={verticalScaleMetres}
                                        min={50}
                                        max={1500}
                                        step={25}
                                        onChange={setVerticalScaleMetres}
                                    />
                                )}

                                {source === 'plane' && (
                                    <>
                                        <SliderNumberInput
                                            label="Plane slope (°)"
                                            value={planeSlopeDegrees}
                                            min={0}
                                            max={70}
                                            step={0.5}
                                            onChange={setPlaneSlopeDegrees}
                                        />
                                        <SliderNumberInput
                                            label="Plane aspect (°)"
                                            value={planeAspectDegrees}
                                            min={-180}
                                            max={180}
                                            step={5}
                                            onChange={setPlaneAspectDegrees}
                                        />
                                    </>
                                )}

                                <SliderNumberInput
                                    label="Colour ramp top (°)"
                                    value={maxDisplaySlopeDegrees}
                                    min={10}
                                    max={90}
                                    step={1}
                                    onChange={setMaxDisplaySlopeDegrees}
                                />

                                <Switch
                                    size="xs"
                                    label="Colour parcels by slope"
                                    checked={colourBySlope}
                                    onChange={(event) => setColourBySlope(event.currentTarget.checked)}
                                />
                                <Switch
                                    size="xs"
                                    label="Draw the slope field"
                                    description="The terrain itself, sampled under the marked region"
                                    checked={showSlopeField}
                                    onChange={(event) => setShowSlopeField(event.currentTarget.checked)}
                                />

                                <Text size="xs" c="dimmed">
                                    Lots over the threshold are outlined in a white dash. Slope comes from the
                                    sampled surface normal, never from differencing heights.
                                </Text>
                            </>
                        )}
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
