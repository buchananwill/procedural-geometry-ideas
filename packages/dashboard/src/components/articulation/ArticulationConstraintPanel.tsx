import { Button, Group, NumberInput, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import type { ElementConstraints, MinMax } from '@proc-geo/core';
import { useArticulationStore } from '../../stores/useArticulationStore';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

type AxisKey = 'distanceToPrev' | 'distanceToNext' | 'jointAngle';

const AXES: Array<{ key: AxisKey; label: string; isAngle: boolean; defaultBound: MinMax }> = [
    { key: 'distanceToPrev', label: 'Distance to previous', isAngle: false, defaultBound: { min: 20, max: 200 } },
    { key: 'distanceToNext', label: 'Distance to next', isAngle: false, defaultBound: { min: 20, max: 200 } },
    { key: 'jointAngle', label: 'Joint angle (deg)', isAngle: true, defaultBound: { min: -Math.PI / 2, max: Math.PI / 2 } },
];

function CommittedNumberInput({
    label,
    value,
    onCommit,
}: {
    label: string;
    value: number;
    onCommit: (committedValue: number) => void;
}) {
    const [draft, setDraft] = useState<string | number>(value);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setDraft(value);
    }, [value, focused]);

    return (
        <NumberInput
            size="xs"
            label={label}
            value={draft}
            onChange={setDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => {
                setFocused(false);
                const parsed = typeof draft === 'number' ? draft : parseFloat(draft);
                if (Number.isFinite(parsed)) {
                    onCommit(parsed);
                } else {
                    setDraft(value);
                }
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            }}
        />
    );
}

function AxisRow({
    axis,
    elementIndex,
    constraints,
}: {
    axis: (typeof AXES)[number];
    elementIndex: number;
    constraints: ElementConstraints;
}) {
    const setConstraints = useArticulationStore((s) => s.setConstraints);
    const bound = constraints[axis.key];
    const toDisplay = (v: number) => (axis.isAngle ? Math.round(v * RAD_TO_DEG * 1e4) / 1e4 : v);
    const fromDisplay = (v: number) => (axis.isAngle ? v * DEG_TO_RAD : v);
    const setBound = (nextBound: MinMax | undefined) => {
        const latest = useArticulationStore.getState().constraints[elementIndex] ?? {};
        setConstraints(elementIndex, { ...latest, [axis.key]: nextBound });
    };
    /**
     * Read at commit time rather than from the render closure, so the cross-clamp sees
     * every prior synchronous store write regardless of when React re-renders this row.
     */
    const currentBound = (): MinMax | undefined =>
        useArticulationStore.getState().constraints[elementIndex]?.[axis.key];

    return (
        <Stack gap={4}>
            <Switch
                size="xs"
                label={axis.label}
                checked={bound !== undefined}
                onChange={(e) => setBound(e.currentTarget.checked ? { ...axis.defaultBound } : undefined)}
            />
            {bound && (
                <Group gap="xs" grow>
                    <CommittedNumberInput
                        label="min"
                        value={toDisplay(bound.min)}
                        onCommit={(committedValue) => {
                            const latestBound = currentBound();
                            if (!latestBound) return;
                            const min = fromDisplay(committedValue);
                            setBound({ min, max: Math.max(min, latestBound.max) });
                        }}
                    />
                    <CommittedNumberInput
                        label="max"
                        value={toDisplay(bound.max)}
                        onCommit={(committedValue) => {
                            const latestBound = currentBound();
                            if (!latestBound) return;
                            const max = fromDisplay(committedValue);
                            setBound({ min: Math.min(latestBound.min, max), max });
                        }}
                    />
                </Group>
            )}
        </Stack>
    );
}

export function ArticulationConstraintPanel() {
    const selection = useArticulationStore((s) => s.selection);
    const constraints = useArticulationStore((s) => s.constraints);
    const applyConstraintsTo = useArticulationStore((s) => s.applyConstraintsTo);

    const single = selection.length === 1 ? selection[0] : null;
    const active: ElementConstraints | null = single !== null ? (constraints[single] ?? {}) : null;

    const copy = async () => {
        if (active === null) return;
        await navigator.clipboard.writeText(JSON.stringify(active));
    };
    const warnPasteIgnored = () => {
        notifications.show({
            color: 'yellow',
            title: 'Paste ignored',
            message: 'The clipboard did not contain valid constraint data.',
        });
    };
    const paste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const parsed: unknown = JSON.parse(text);
            if (typeof parsed !== 'object' || parsed === null) {
                warnPasteIgnored();
                return;
            }
            const sanitized: ElementConstraints = {};
            for (const key of ['distanceToPrev', 'distanceToNext', 'jointAngle'] as const) {
                const bound = (parsed as Record<string, unknown>)[key];
                if (
                    typeof bound === 'object' &&
                    bound !== null &&
                    Number.isFinite((bound as { min?: unknown }).min) &&
                    Number.isFinite((bound as { max?: unknown }).max)
                ) {
                    const { min, max } = bound as { min: number; max: number };
                    sanitized[key] = { min, max };
                }
            }
            if (Object.keys(sanitized).length === 0) {
                warnPasteIgnored();
                return;
            }
            applyConstraintsTo(selection, sanitized);
        } catch {
            // unreadable clipboard or unparseable JSON: nothing to apply
            warnPasteIgnored();
        }
    };

    return (
        <Paper p="sm" withBorder>
            <Stack gap="sm">
                <Title order={5}>Constraints</Title>
                {single === null ? (
                    <Text size="xs" c="dimmed">
                        {selection.length === 0
                            ? 'Select an element to edit its constraints.'
                            : `${selection.length} elements selected — Paste applies to all of them.`}
                    </Text>
                ) : (
                    <>
                        <Text size="xs" c="dimmed">Element #{single}</Text>
                        {AXES.map((axis) => (
                            // Keyed by element too: a selection change must remount the inputs so
                            // any focused draft dies with them instead of landing on the new element.
                            <AxisRow
                                key={`${single}:${axis.key}`}
                                axis={axis}
                                elementIndex={single}
                                constraints={active!}
                            />
                        ))}
                    </>
                )}
                <Group gap="xs">
                    <Button size="xs" variant="default" disabled={single === null} onClick={copy}>
                        Copy
                    </Button>
                    <Button size="xs" variant="default" disabled={selection.length === 0} onClick={paste}>
                        Paste
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
}
