import { Group, NumberInput, Slider, Stack, Text } from '@mantine/core';

export interface SliderNumberInputProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}

/** Slider + number input pair for a numerical pipeline parameter. */
export default function SliderNumberInput({ label, value, min, max, step, onChange, disabled }: SliderNumberInputProps) {
    return (
        <Stack gap={2}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Group gap="xs" wrap="nowrap">
                <Slider
                    style={{ flex: 1 }}
                    size="sm"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={onChange}
                    disabled={disabled}
                    label={null}
                />
                <NumberInput
                    size="xs"
                    w={72}
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(v) => {
                        if (typeof v === 'number') onChange(v);
                    }}
                    disabled={disabled}
                />
            </Group>
        </Stack>
    );
}
