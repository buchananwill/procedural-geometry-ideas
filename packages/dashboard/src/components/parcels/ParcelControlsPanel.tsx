import { useState } from 'react';
import {
    Button, Collapse, Group, NumberInput, Paper, Stack, Text, Title, UnstyledButton,
} from '@mantine/core';
import CollapseChevron from '../CollapseChevron';
import SliderNumberInput from '../pen-stroke/SliderNumberInput';
import { useParcelStore } from '../../stores/useParcelStore';
import type { DerivableSliceKey } from '../../stores/useParcelStore';

export interface ParcelControlsPanelProps {
    /** `computeMaxOffset` for the current polygon, shown so the depth percentage means something. */
    maxOffset: number;
    /** The absolute depth the percentage currently resolves to. */
    depth: number;
    vertexCount: number;
}

const DEPTH_MARKS = [
    { value: 1, label: '1%' },
    { value: 25, label: '25%' },
    { value: 50, label: '50%' },
    { value: 75, label: '75%' },
    { value: 100, label: '100%' },
];

/**
 * A slider range for a parameter whose natural scale came from the polygon.
 *
 * The derived value sits a quarter of the way along, so there is room to go both well below and
 * well above it without the track resolution collapsing on either side.
 */
function rangeAround(derivedValue: number): { min: number; max: number; step: number } {
    const max = Math.max(derivedValue * 4, 1e-4);
    return { min: 0, max, step: max / 200 };
}

function format(value: number): string {
    if (value === 0) return '0';
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 1) return value.toFixed(2);
    return value.toPrecision(3);
}

export default function ParcelControlsPanel({ maxOffset, depth, vertexCount }: ParcelControlsPanelProps) {
    const [opened, setOpened] = useState(true);

    const depthPercent = useParcelStore((s) => s.depthPercent);
    const setDepthPercent = useParcelStore((s) => s.setDepthPercent);
    const derived = useParcelStore((s) => s.derived);
    const overrides = useParcelStore((s) => s.overrides);
    const setSliceOption = useParcelStore((s) => s.setSliceOption);
    const clearOverrides = useParcelStore((s) => s.clearOverrides);
    const splitIrregularity = useParcelStore((s) => s.splitIrregularity);
    const setSplitIrregularity = useParcelStore((s) => s.setSplitIrregularity);
    const seed = useParcelStore((s) => s.seed);
    const setSeed = useParcelStore((s) => s.setSeed);
    const rerollSeed = useParcelStore((s) => s.rerollSeed);

    const overrideCount = Object.keys(overrides).length;

    function sliceSlider(key: DerivableSliceKey, label: string) {
        const value = overrides[key] ?? derived[key];
        const { min, max, step } = rangeAround(derived[key]);
        return (
            <SliderNumberInput
                label={`${label}${overrides[key] === undefined ? ' (derived)' : ''}`}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(next) => setSliceOption(key, next)}
            />
        );
    }

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Parcel Controls</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="sm">
                        <Text size="xs" c="dimmed">
                            Vertices: {vertexCount} &middot; max offset {format(maxOffset)} &middot; depth {format(depth)}
                        </Text>

                        <SliderNumberInput
                            label="Depth (% of max offset)"
                            value={depthPercent}
                            min={1}
                            max={100}
                            step={1}
                            marks={DEPTH_MARKS}
                            onChange={setDepthPercent}
                        />

                        <Text size="xs" c="dimmed" fw={600} mt={4}>Slice options</Text>
                        {sliceSlider('minWidth', 'Min width')}
                        {sliceSlider('maxWidth', 'Max width')}
                        {sliceSlider('minArea', 'Min area')}
                        {sliceSlider('maxArea', 'Max area')}
                        <SliderNumberInput
                            label="Split irregularity"
                            value={splitIrregularity}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={setSplitIrregularity}
                        />

                        <Group gap="xs" align="flex-end" wrap="nowrap">
                            <NumberInput
                                size="xs"
                                label="Seed"
                                style={{ flex: 1 }}
                                min={1}
                                step={1}
                                value={seed}
                                onChange={(v) => setSeed(typeof v === 'number' ? v : 1)}
                            />
                            <Button size="xs" variant="light" color="grape" onClick={rerollSeed}>
                                Re-roll
                            </Button>
                        </Group>

                        <Button
                            size="xs"
                            variant="light"
                            color="cyan"
                            onClick={clearOverrides}
                            disabled={overrideCount === 0}
                        >
                            {overrideCount === 0
                                ? 'All values derived from polygon'
                                : `Reset ${overrideCount} override${overrideCount === 1 ? '' : 's'}`}
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
