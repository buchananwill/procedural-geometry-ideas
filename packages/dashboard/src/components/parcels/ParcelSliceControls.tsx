import { Text } from '@mantine/core';
import SliderNumberInput from '../pen-stroke/SliderNumberInput';
import { useParcelStore } from '../../stores/useParcelStore';
import type { DerivableSliceKey } from '../../stores/useParcelStore';

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

/**
 * The slice-shaping sliders of the parcel controls: the four polygon-derived bounds and the
 * corner-angle threshold. Extracted from `ParcelControlsPanel`, which stays the layout shell.
 */
export default function ParcelSliceControls() {
    const derived = useParcelStore((s) => s.derived);
    const overrides = useParcelStore((s) => s.overrides);
    const setSliceOption = useParcelStore((s) => s.setSliceOption);
    const mitreToleranceDeg = useParcelStore((s) => s.mitreToleranceDeg);
    const setMitreToleranceDeg = useParcelStore((s) => s.setMitreToleranceDeg);

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
        <>
            <Text size="xs" c="dimmed" fw={600} mt={4}>Slice options</Text>
            {sliceSlider('minWidth', 'Min width')}
            {sliceSlider('maxWidth', 'Max width')}
            {sliceSlider('minArea', 'Min area')}
            {sliceSlider('maxArea', 'Max area')}
            <SliderNumberInput
                label="Mitre tolerance (°, 180 = off)"
                value={mitreToleranceDeg}
                min={0}
                max={180}
                step={1}
                onChange={setMitreToleranceDeg}
            />
        </>
    );
}
