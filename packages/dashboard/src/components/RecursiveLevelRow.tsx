import {
    Box, Button, Group, NumberInput, Paper, SegmentedControl, Slider, Stack, Text,
} from '@mantine/core';
import { FULL_DEPTH_FRACTION } from '@proc-geo/core';
import type { LevelSpec, ResidueTreatment, SegmentTreatment, SpineStrategy } from '@proc-geo/core';
import { SPINE_COLOUR, styleForLevel } from '../scene/adapters/recursiveSubdivisionToScene';
import {
    DEFAULT_SPINE_STRATEGY,
    DEPTH_FRACTION_STEP,
    MAX_MERGE_GROUP_SIZE,
    MIN_PANEL_DEPTH_FRACTION,
    SPINE_FRACTION_STEP,
    spineFractionOf,
    useRecursiveSubdivisionStore,
    withSpineFraction,
    withSpineKind,
} from '../stores/useRecursiveSubdivisionStore';
import type { SpineStrategyKind } from '../stores/useRecursiveSubdivisionStore';

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

/** One choice of spine definition, as the segmented control lists it. */
export interface SpineOption {
    value: SpineStrategyKind;
    label: string;
}

/**
 * The three spine definitions, one click apart.
 *
 * All three are kept and none is privileged: which of them is the right definition of "the part that
 * carries a road" is the judgement this control exists to support, and it is not one the geometry
 * can make for itself.
 */
const SPINE_OPTIONS: SpineOption[] = [
    { value: 'diameter', label: 'Diameter' },
    { value: 'wavefront-time', label: 'Wavefront' },
    { value: 'whisker-prune', label: 'Whisker' },
];

/** What each definition keeps, in the one sentence there is room for under the control. */
const SPINE_DESCRIPTIONS: Record<SpineStrategyKind, string> = {
    'diameter': 'The longest leaf-to-leaf path: a through-route, always connected.',
    'wavefront-time': 'Arcs whose ends are deep in the region. May come back in pieces.',
    'whisker-prune': 'Short leaf arcs removed, and removed again, to a fixed point.',
};

/**
 * A dimensionless fraction as every slider on this row shows it: a whole percentage.
 *
 * ONE FORMATTER FOR BOTH CONTROLS, because every threshold this row sets is a fraction of the
 * region's OWN scale — that is the rule the depth control and both spine thresholds share, and the
 * only thing that differs between them is which scale, which is said in the text beside the slider
 * rather than in the number on it.
 */
function percentLabel(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}

/** What a level's spine threshold is a fraction OF, which differs by definition. */
function spineFractionDescription(kind: SpineStrategyKind): string {
    return kind === 'wavefront-time'
        ? 'of this region’s maximum offset'
        : 'of this region’s diameter length';
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
    const setSpineStrategy = useRecursiveSubdivisionStore((s) => s.setSpineStrategy);
    const spine: SpineStrategy = useRecursiveSubdivisionStore(
        (s) => s.spineStrategies[level]) ?? DEFAULT_SPINE_STRATEGY;
    const residueDisabled = residueDisabledReason(spec, isLastLevel);
    const spineFraction = spineFractionOf(spine);

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
                            {percentLabel(spec.depthFraction)} of this region&apos;s max offset
                        </Text>
                    </Group>
                    {/* NAMED FOR THE ACCESSIBILITY TREE, not only for the eye: the heading above
                        the slider is a sibling, not a label, so without this the control reaches a
                        screen reader — and any script driving the page — as an anonymous slider,
                        indistinguishable from the spine threshold below it (journal finding F35). */}
                    <Slider
                        size="xs"
                        aria-label={`Level ${level} depth fraction`}
                        min={MIN_PANEL_DEPTH_FRACTION}
                        max={FULL_DEPTH_FRACTION}
                        step={DEPTH_FRACTION_STEP}
                        value={spec.depthFraction}
                        label={percentLabel}
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
                    {/* WARNED RATHER THAN DEFAULTED AWAY (journal finding F35, trap 1). A
                        non-terminal level whose segments are leaves sends the next level nothing but
                        its residue rings — so a clean "Every region subdivided" downstream can be
                        vacuous, and a reader who has not noticed reads a starved recursion as a
                        healthy one. The default composition keeps `leaf` here on purpose: it is the
                        droste reading, the one setting the retired scalar options could not ask for,
                        and silently changing it would delete the demonstration this page opens on.
                        So the trap is made VISIBLE instead of removed. */}
                    {!isLastLevel && spec.segments === 'leaf' && (
                        <Text size="xs" c="yellow" mt={4}>
                            Level {level + 1} therefore sees only this level&apos;s residue rings —
                            no cell of this ring is subdivided further.
                        </Text>
                    )}
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

                <Box>
                    <Group gap={6} wrap="nowrap" mb={4}>
                        <Box w={12} h={12} style={{ background: SPINE_COLOUR, borderRadius: 2 }} />
                        <Text size="xs" fw={500}>
                            Spine
                        </Text>
                    </Group>
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        data={SPINE_OPTIONS}
                        value={spine.kind}
                        onChange={(value) =>
                            setSpineStrategy(level, withSpineKind(spine, value as SpineStrategyKind))}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                        {SPINE_DESCRIPTIONS[spine.kind]}
                    </Text>
                    {/* Shown only for the definitions that HAVE a threshold: `diameter` takes no
                        parameter, and a dead slider beside it would invite a reader to set one and
                        believe it had done something. */}
                    {spineFraction !== undefined && (
                        <Box mt={6}>
                            <Group justify="space-between" mb={4}>
                                <Text size="xs" fw={500}>
                                    Threshold
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {percentLabel(spineFraction)} {spineFractionDescription(spine.kind)}
                                </Text>
                            </Group>
                            <Slider
                                size="xs"
                                aria-label={`Level ${level} spine threshold`}
                                min={0}
                                max={1}
                                step={SPINE_FRACTION_STEP}
                                value={spineFraction}
                                label={percentLabel}
                                onChange={(fraction) =>
                                    setSpineStrategy(level, withSpineFraction(spine, fraction))}
                            />
                        </Box>
                    )}
                </Box>
            </Stack>
        </Paper>
    );
}
