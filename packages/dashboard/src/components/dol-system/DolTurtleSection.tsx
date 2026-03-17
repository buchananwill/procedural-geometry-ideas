import { useState } from 'react';
import {
    Stack, UnstyledButton, Text, Group, Collapse,
    NumberInput, Alert, Tooltip,
} from '@mantine/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';

export default function DolTurtleSection() {
    const [opened, setOpened] = useState(true);
    const config = useDolSystemStore((s) => s.config);
    const compilationError = useDolSystemStore((s) => s.compilationError);
    const setTurtleParam = useDolSystemStore((s) => s.setTurtleParam);

    const [stepDraft, setStepDraft] = useState<string | number>(config.turtle.stepLength);
    const [angleDraft, setAngleDraft] = useState<string | number>(config.turtle.angleDelta);
    const [scalingDraft, setScalingDraft] = useState<string | number>(config.turtle.generationScaling);

    return (
        <Stack gap="xs">
            <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                <Group justify="space-between">
                    <Text size="xs" c="dimmed" fw={600}>Turtle Parameters</Text>
                    <Text size="xs" c="blue">{opened ? '\u25B2' : '\u25BC'}</Text>
                </Group>
            </UnstyledButton>
            <Collapse in={opened}>
                <Stack gap="xs">
                    <Tooltip label="Base forward distance for each F command. Scaled per-generation by Generation Scaling." maw={300} multiline>
                        <NumberInput
                            size="xs"
                            label="Step Length"
                            value={stepDraft}
                            onChange={(v) => setStepDraft(v)}
                            onBlur={() => setTurtleParam('stepLength', typeof stepDraft === 'number' ? stepDraft : 0)}
                        />
                    </Tooltip>
                    <Tooltip label="Turn angle in degrees for + and - commands. 90 gives square grids, 60 gives hexagonal." maw={300} multiline>
                        <NumberInput
                            size="xs"
                            label="Angle Delta (deg)"
                            value={angleDraft}
                            onChange={(v) => setAngleDraft(v)}
                            onBlur={() => setTurtleParam('angleDelta', typeof angleDraft === 'number' ? angleDraft : 0)}
                        />
                    </Tooltip>
                    <Tooltip label="Multiplier applied to Step Length each generation. Values < 1 shrink older branches for fractal self-similarity." maw={300} multiline>
                        <NumberInput
                            size="xs"
                            label="Generation Scaling"
                            value={scalingDraft}
                            onChange={(v) => setScalingDraft(v)}
                            onBlur={() => setTurtleParam('generationScaling', typeof scalingDraft === 'number' ? scalingDraft : 1)}
                            step={0.01}
                            min={0.01}
                            max={2}
                            decimalScale={4}
                        />
                    </Tooltip>
                    {compilationError && (
                        <Alert color="red" title="Compilation Error">
                            {compilationError}
                        </Alert>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
}
