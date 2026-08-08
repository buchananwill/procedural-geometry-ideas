import { useEffect, useRef, useState } from 'react';
import { Group, NumberInput, Slider, Stack, Text } from '@mantine/core';

export interface SliderNumberInputProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    /**
     * Optional labelled ticks on the slider track. Worth adding when the values
     * a user actually reaches for are unevenly spread along the range, so the
     * interesting ones get a click-target instead of a pixel to aim at.
     */
    marks?: { value: number; label?: string }[];
}

/**
 * Slider + number input pair for a numerical pipeline parameter.
 *
 * The number input keeps a local draft while it has focus, because the owner is
 * entitled to refuse or clamp what is typed and a fully controlled input cannot
 * survive that: if `onChange(8200)` comes back as `value = 64`, the prop never
 * changed from the input's point of view and it goes on displaying `8200` — a
 * number the app is not using. The draft is therefore resynced from `value` on
 * blur, so a refused entry never outlives the caret.
 *
 * A draft below `min` is treated as a half-typed prefix and withheld — `1` on
 * the way to `12` is not a request for the minimum — while a draft above `max`
 * is passed on as a genuine overshoot for the owner to clamp. Either way the
 * value the owner settles on is what is displayed once focus leaves.
 */
export default function SliderNumberInput({
    label,
    value,
    min,
    max,
    step,
    onChange,
    disabled,
    marks,
}: SliderNumberInputProps) {
    const [draft, setDraft] = useState<string | number>(value);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (!focusedRef.current) setDraft(value);
    }, [value]);

    return (
        <Stack gap={2}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Group gap="xs" wrap="nowrap" align={marks ? 'flex-start' : 'center'}>
                <Slider
                    style={{ flex: 1 }}
                    size="sm"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    marks={marks}
                    onChange={onChange}
                    disabled={disabled}
                    label={null}
                />
                <NumberInput
                    size="xs"
                    w={72}
                    value={draft}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(v) => {
                        setDraft(v);
                        if (typeof v === 'number' && v >= min) onChange(v);
                    }}
                    onFocus={() => {
                        focusedRef.current = true;
                    }}
                    onBlur={() => {
                        focusedRef.current = false;
                        setDraft(value);
                    }}
                    disabled={disabled}
                />
            </Group>
        </Stack>
    );
}
