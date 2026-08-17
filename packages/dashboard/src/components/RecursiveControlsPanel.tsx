import { useMemo, useState } from 'react';
import {
    Box, Button, Collapse, Divider, Group, NumberInput, Paper, SegmentedControl, Select, Slider,
    Stack, Switch, Text, Title, UnstyledButton,
} from '@mantine/core';
import { flattenRecursiveTree, FULL_DEPTH_FRACTION, MAX_RECURSION_LEVELS, MIN_RECURSION_LEVELS } from '@proc-geo/core';
import type { LevelSpec, RecursiveNode, ResidueTreatment, SegmentTreatment } from '@proc-geo/core';
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import CollapseChevron from './CollapseChevron';
import { residueRingStyle, styleForLevel } from '../scene/adapters/recursiveSubdivisionToScene';
import {
    DEPTH_FRACTION_STEP,
    MAX_MERGE_GROUP_SIZE,
    MIN_PANEL_DEPTH_FRACTION,
    summariseRecursiveTree,
    useRecursiveSubdivisionStore,
} from '../stores/useRecursiveSubdivisionStore';
import type {
    RecursiveLevelSummary,
    RecursiveStreamReport,
} from '../stores/useRecursiveSubdivisionStore';

export interface RecursiveControlsPanelProps {
    /** The tree currently drawn, so the counts reported are the counts on the canvas. */
    tree: RecursiveNode;
}

const FIXTURE_OPTIONS = ALL_TEST_POLYGONS.map((polygon) => polygon.name);

/** How many distinct failure reasons to spell out before falling back to a count. */
const REASONS_SHOWN = 3;

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

/**
 * `n` followed by `word`, given an -s plural.
 *
 * Every count this panel reports is a count of something the canvas drew, so they all read the
 * same way; saying that once keeps "1 regions" from creeping into whichever line is edited next.
 */
function pluralize(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * What one stream's report reads as: what it produced, and what became of it.
 *
 * The one place a spec and a tree are said in the same sentence, which is the point of the readout —
 * `2 rings → recursed` and `2 rings → void (overridden)` are the two facts a reader has to be able to
 * tell apart, and a level that quietly ignored its setting looks identical to one that was obeyed.
 */
function streamLine<TTreatment extends string>(
    produced: number,
    noun: string,
    report: RecursiveStreamReport<TTreatment>,
): string {
    const became = report.recursed ? 'recursed' : report.requested;
    const overridden = report.overridden ? ' — overridden: the last level has nowhere to send it' : '';
    return `${pluralize(produced, noun)} → ${became}${overridden}`;
}

/** Why a level's residue control cannot do anything, or `undefined` when it can. */
function residueDisabledReason(level: LevelSpec, isLastLevel: boolean): string | undefined {
    if (level.depthFraction >= FULL_DEPTH_FRACTION) {
        return 'At full depth the wavefront is consumed, so this level has no residue to treat.';
    }
    if (isLastLevel) return 'The last level has nowhere to send its residue.';
    return undefined;
}

interface RecursiveLevelRowProps {
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
function RecursiveLevelRow({ level, spec, isLastLevel, removable }: RecursiveLevelRowProps) {
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

interface RecursiveLevelReadoutProps {
    summary: RecursiveLevelSummary;
    visible: boolean;
}

/** One level's counts, and what each of its two streams actually did. */
function RecursiveLevelReadout({ summary, visible }: RecursiveLevelReadoutProps) {
    const toggleLevel = useRecursiveSubdivisionStore((s) => s.toggleLevel);

    return (
        <Stack gap={2}>
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <Box
                        w={12}
                        h={12}
                        style={{
                            background: styleForLevel(summary.level).segmentColour,
                            borderRadius: 2,
                        }}
                    />
                    <Switch
                        size="xs"
                        checked={visible}
                        onChange={() => toggleLevel(summary.level)}
                        label={`Level ${summary.level}`}
                    />
                </Group>
                <Text size="xs" c="dimmed">
                    {pluralize(summary.nodes, 'region')}
                    {summary.failures > 0 ? ` / ${summary.failures} failed` : ''}
                </Text>
            </Group>
            <Text size="xs" c="dimmed" ml={18}>
                {streamLine(summary.segments, 'segment', summary.segmentStream)}
            </Text>
            <Text size="xs" c="dimmed" ml={18}>
                {summary.residueInert
                    ? 'no residue at full depth'
                    : streamLine(summary.residueRings, 'residue ring', summary.residueStream)}
                {summary.discardedResidueRings > 0
                    ? ` (${summary.discardedResidueRings} discarded as degenerate)`
                    : ''}
            </Text>
        </Stack>
    );
}

/**
 * Controls and counts for the recursive subdivision.
 *
 * The per-level visibility switches carry more weight than they look: one pass and two are hard to
 * tell apart when both are drawn, and turning the root off is how you check that the children are
 * real geometry rather than the parent redrawn. The counts are here for the same reason — a picture
 * that looks subdivided while reporting a single leaf is a bug the eye does not catch, and a level
 * whose setting the driver overrode is a bug of exactly that kind.
 */
export default function RecursiveControlsPanel({ tree }: RecursiveControlsPanelProps) {
    const [opened, setOpened] = useState(true);

    const fixtureName = useRecursiveSubdivisionStore((s) => s.fixtureName);
    const setFixtureName = useRecursiveSubdivisionStore((s) => s.setFixtureName);
    const levels = useRecursiveSubdivisionStore((s) => s.levels);
    const addLevel = useRecursiveSubdivisionStore((s) => s.addLevel);
    const levelVisibility = useRecursiveSubdivisionStore((s) => s.levelVisibility);
    const showLeafFills = useRecursiveSubdivisionStore((s) => s.showLeafFills);
    const setShowLeafFills = useRecursiveSubdivisionStore((s) => s.setShowLeafFills);
    const showAllLevels = useRecursiveSubdivisionStore((s) => s.showAllLevels);

    const summary = useMemo(() => summariseRecursiveTree(tree, levels), [tree, levels]);
    const reasons = useMemo(() => {
        const failures = flattenRecursiveTree(tree)
            .map((node) => node.failure)
            .filter((failure): failure is string => failure !== undefined);
        return [...new Set(failures)];
    }, [tree]);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Recursive Subdivision</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="sm">
                        <Select
                            size="xs"
                            label="Fixture"
                            data={FIXTURE_OPTIONS}
                            value={fixtureName}
                            searchable
                            allowDeselect={false}
                            onChange={(value) => setFixtureName(value ?? fixtureName)}
                        />

                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Text size="xs" fw={500}>
                                    Levels — one spec each, outermost first
                                </Text>
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    onClick={addLevel}
                                    disabled={levels.length >= MAX_RECURSION_LEVELS}
                                >
                                    Add level
                                </Button>
                            </Group>
                            {levels.map((spec, level) => (
                                <RecursiveLevelRow
                                    key={level}
                                    level={level}
                                    spec={spec}
                                    isLastLevel={level + 1 >= levels.length}
                                    removable={levels.length > MIN_RECURSION_LEVELS}
                                />
                            ))}
                        </Stack>

                        <Switch
                            size="xs"
                            checked={showLeafFills}
                            onChange={(event) => setShowLeafFills(event.currentTarget.checked)}
                            label="Fills"
                            description="Tints each final cell by its level-0 ancestor, and each residue ring by its own colour"
                        />

                        <Divider />

                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Text size="xs" fw={500}>
                                    Levels drawn
                                </Text>
                                <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    onClick={showAllLevels}
                                    disabled={levelVisibility.every((visible) => visible)}
                                >
                                    Show all
                                </Button>
                            </Group>
                            {summary.levels.map((level) => (
                                <RecursiveLevelReadout
                                    key={level.level}
                                    summary={level}
                                    visible={levelVisibility[level.level] ?? true}
                                />
                            ))}
                        </Stack>

                        <Stack gap={2}>
                            <Text size="xs" c="dimmed">
                                {pluralize(summary.totalSegments, 'segment')} in total
                                &middot; {pluralize(summary.leafSegments, 'leaf cell')}
                            </Text>
                            <Group gap={6} wrap="nowrap">
                                <Box
                                    w={12}
                                    h={12}
                                    style={{ background: residueRingStyle(0, 0).colour, borderRadius: 2 }}
                                />
                                <Text size="xs" c="dimmed">
                                    {summary.totalResidueRings === 0
                                        ? 'No residue: the segments tile every region.'
                                        : `${pluralize(summary.totalResidueRings, 'residue ring')}`
                                            + `${summary.totalDiscardedResidueRings > 0
                                                ? `, ${summary.totalDiscardedResidueRings} discarded as degenerate`
                                                : ''}.`}
                                </Text>
                            </Group>
                            <Text size="xs" c={summary.totalFailures > 0 ? 'pink' : 'dimmed'}>
                                {summary.totalFailures === 0
                                    ? 'Every region subdivided.'
                                    : `${pluralize(summary.totalFailures, 'region')} did not subdivide.`}
                            </Text>
                            {reasons.slice(0, REASONS_SHOWN).map((reason) => (
                                <Text key={reason} size="xs" c="pink" lineClamp={3}>
                                    {reason}
                                </Text>
                            ))}
                            {reasons.length > REASONS_SHOWN && (
                                <Text size="xs" c="pink">
                                    …and {pluralize(reasons.length - REASONS_SHOWN, 'more distinct reason')}.
                                </Text>
                            )}
                        </Stack>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
