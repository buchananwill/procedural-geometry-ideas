import { useState } from 'react';
import { Collapse, Group, Paper, Stack, Switch, Title, UnstyledButton } from '@mantine/core';
import CollapseChevron from '../CollapseChevron';
import { useParcelStore } from '../../stores/useParcelStore';
import type { ParcelLayerVisibility } from '../../stores/useParcelStore';

const LAYERS: { key: keyof ParcelLayerVisibility; label: string; description: string }[] = [
    { key: 'skeleton', label: 'Skeleton', description: 'Interior bisector arcs the strips are cut from' },
    { key: 'offsetRings', label: 'Offset ring(s)', description: 'The inward contour at the current depth' },
    { key: 'strips', label: 'Strips', description: 'One clipped skeleton face per exterior edge' },
    { key: 'parcels', label: 'Parcels', description: 'Lots sliced out of each strip' },
    { key: 'frontage', label: 'Frontage', description: 'Each parcel’s street edge — its egress' },
];

export default function ParcelLayerPanel() {
    const [opened, setOpened] = useState(true);
    const layers = useParcelStore((s) => s.layers);
    const toggleLayer = useParcelStore((s) => s.toggleLayer);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Layers</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="xs">
                        {LAYERS.map((layer) => (
                            <Switch
                                key={layer.key}
                                size="xs"
                                label={layer.label}
                                description={layer.description}
                                checked={layers[layer.key]}
                                onChange={() => toggleLayer(layer.key)}
                            />
                        ))}
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
