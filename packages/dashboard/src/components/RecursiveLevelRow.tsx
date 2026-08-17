import {
    Box, Button, Group, NumberInput, Paper, SegmentedControl, Slider, Stack, Text,
} from '@mantine/core';
import { FULL_DEPTH_FRACTION } from '@proc-geo/core';
import type { LevelSpec, ResidueTreatment, SegmentTreatment } from '@proc-geo/core';
import { styleForLevel } from '../scene/adapters/recursiveSubdivisionToScene';
import {
    DEPTH_FRACTION_STEP,
    MAX_MERGE_GROUP_SIZE,
    MIN_PANEL_DEPTH_FRACTION,
    useRecursiveSubdivisionStore,
} from '../stores/useRecursiveSubdivisionStore';

/** One choice of {@link ResidueTreatment}, as the segmented control lists it. */
export interface ResidueOption {
    value: ResidueTreatment;
    label: string;
}

/** One choice of {@link SegmentTreatment}, as the segmented control lists it. */
export interface SegmentOption {
    value: SegmentTreatment;
    label: string;
}

/**
 * The two residue treatments, as one click apart as they are in the driver.
 *
 * The difference between a subdivided core and a courtyard is the whole boundary-versus-droste
 * question, and comparing them is what this control is for.
 */
const RESIDUE_OPTIONS: ResidueOption[] = [
    { value: 'recurse', label: 'Recurse' },
    { value: 'void', label: 'Void' },
];

/**
 * The two segment treatments.
 *
 * `leaf` is the setting the retired scalar options could not express at all — segments always
 * recursed — and it is half of the droste reading: a final ring around a courtyard that goes deeper.
 */
const SEGMENT_OPTIONS: SegmentOption[] = [
    { value: 'recurse', label: 'Recurse' },
    { value: 'leaf', label: 'Leaf' },
];

/** Depth as the control shows it: a percentage of each region's own maximum offset. */
function depthLabel(depthFraction: number): string {
    return `${Math.round(depthFraction * 100)}%`;
}

/** Why a level's residue control cannot do anything, or `undefined` when it can. */
function residueDisabledReason(level: LevelSpec, isLastLevel: boolean): string | undefined {
    if (level.depthFraction >= FULL_DEPTH_FRACTION) {
        return 'At full depth the wavefront is consumed, so this level has no residue to treat.';
    }
    if (isLastLevel) return 'The last level has nowhere to send its residue.';
    return undefined;
}

export interface RecursiveLevelRowProps {
    level: number;
    spec: LevelSpec;
    /** The last level's streams are terminal whatever the spec says, so its controls are disabled. */
    isLastLevel: boolean;
    /** Whether a row may be removed at all — one level is the fewest the driver runs. */
    removable: boolean;
}

/**
 * One level's spec, as a row.
 *
 * ROWS RATHER THAN GLOBALS. The panel is the only place a composition is legible, and a composition is
 * a list: which level cuts a shallow rim in coarse groups, which level is the droste level, which level
 * is terminal. Four dials shared by every level cannot show that, and cannot ask for it either.
 */
export default function RecursiveLevelRow({ level, spec, isLastLevel, removable }: RecursiveLevelRowProps) {
    const updateLevel = useRecursiveSubdivisionStore((s) => s.updateLevel);
    const removeLevel = useRecursiveSubdivisionStore((s) => s.removeLevel);
    const residueDisabled = residueDisabledReason(spec, isLastLevel);

    return (
        <Paper p="xs" withBorder>
            <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap">
                    <Group gap={6} wrap="nowrap">
                        <Box
                            w={12}
                            h={12}
                            style={{ background: styleForLevel(level).segmentColour, borderRadius: 2 }}
                        />
                        <Text size="xs" fw={600}>
                            Level {level}
                        </Text>
                    </Group>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        disabled={!removable}
                        onClick={() => removeLevel(level)}
                    >
                        Remove
                    </Button>
                </Group>

                <Box>
                    <Group justify="space-between" mb={4}>
                        <Text size="xs" fw={500}>
                            Depth
                        </Text>
                        <Text size="xs" c="dimmed">
                            {depthLabel(spec.depthFraction)} of this region&apos;s max offset
                        </Text>
                    </Group>
                    <Slider
                        size="xs"
                        min={MIN_PANEL_DEPTH_FRACTION}
                        max={FULL_DEPTH_FRACTION}
                        step={DEPTH_FRACTION_STEP}
                        value={spec.depthFraction}
                        label={depthLabel}
                        onChange={(depthFraction) => updateLevel(level, { depthFraction })}
                    />
                </Box>

                <NumberInput
                    size="xs"
                    label="Merge group size"
                    description="Adjacent edges fused into one segment at this level"
                    min={1}
                    max={MAX_MERGE_GROUP_SIZE}
                    step={1}
                    value={spec.mergeGroupSize}
                    onChange={(value) =>
                        updateLevel(level, { mergeGroupSize: typeof value === 'number' ? value : 1 })}
                />

                <Box>
                    <Text size="xs" fw={500} mb={4}>
                        Segments
                    </Text>
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        disabled={isLastLevel}
                        data={SEGMENT_OPTIONS}
                        value={spec.segments}
                        onChange={(value) => updateLevel(level, { segments: value as SegmentTreatment })}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                        {isLastLevel
                            ? 'The last level has nowhere to send its segments: they are leaves.'
                            : spec.segments === 'recurse'
                                ? 'Each segment becomes a region at the next level.'
                                : 'The ring of segments is final — only the residue can go deeper.'}
                    </Text>
                </Box>

                <Box>
                    <Text size="xs" fw={500} mb={4}>
                        Residue
                    </Text>
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        disabled={residueDisabled !== undefined}
                        data={RESIDUE_OPTIONS}
                        value={spec.residue}
                        onChange={(value) => updateLevel(level, { residue: value as ResidueTreatment })}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                        {residueDisabled ?? (spec.residue === 'recurse'
                            ? 'Each residue ring is subdivided in turn — the droste reading.'
                            : 'Residue rings are kept whole and undivided — the courtyard reading.')}
                    </Text>
                </Box>
            </Stack>
        </Paper>
    );
}
