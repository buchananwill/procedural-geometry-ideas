import { useMemo, useState } from 'react';
import {
    Box, Button, Collapse, Group, NumberInput, Paper, SegmentedControl, Select, Slider, Stack,
    Switch, Text, Title, UnstyledButton,
} from '@mantine/core';
import { flattenRecursiveTree, FULL_DEPTH_FRACTION, MAX_RECURSION_LEVELS } from '@proc-geo/core';
import type { RecursiveNode, ResidueTreatment } from '@proc-geo/core';
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

export interface RecursiveControlsPanelProps {
    /** The tree currently drawn, so the counts reported are the counts on the canvas. */
    tree: RecursiveNode;
}

const FIXTURE_OPTIONS = ALL_TEST_POLYGONS.map((polygon) => polygon.name);

const LEVEL_OPTIONS = Array.from({ length: MAX_RECURSION_LEVELS }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
}));

/** How many distinct failure reasons to spell out before falling back to a count. */
const REASONS_SHOWN = 3;

/**
 * The two residue treatments, as one click apart as they are in the driver.
 *
 * The difference between a subdivided core and a courtyard is the whole boundary-versus-droste
 * question, and comparing them is what this control is for.
 */
const RESIDUE_OPTIONS: { value: ResidueTreatment; label: string }[] = [
    { value: 'recurse', label: 'Recurse' },
    { value: 'void', label: 'Void' },
];

/** Depth as the control shows it: a percentage of each region's own maximum offset. */
function depthLabel(depthFraction: number): string {
    return `${Math.round(depthFraction * 100)}%`;
}

/**
 * Controls and counts for the recursive subdivision.
 *
 * The per-level visibility switches carry more weight than they look: one pass and two are hard to
 * tell apart when both are drawn, and turning the root off is how you check that the children are
 * real geometry rather than the parent redrawn. The counts are here for the same reason — a picture
 * that looks subdivided while reporting a single leaf is a bug the eye does not catch.
 */
export default function RecursiveControlsPanel({ tree }: RecursiveControlsPanelProps) {
    const [opened, setOpened] = useState(true);

    const fixtureName = useRecursiveSubdivisionStore((s) => s.fixtureName);
    const setFixtureName = useRecursiveSubdivisionStore((s) => s.setFixtureName);
    const levels = useRecursiveSubdivisionStore((s) => s.levels);
    const setLevels = useRecursiveSubdivisionStore((s) => s.setLevels);
    const mergeGroupSize = useRecursiveSubdivisionStore((s) => s.mergeGroupSize);
    const setMergeGroupSize = useRecursiveSubdivisionStore((s) => s.setMergeGroupSize);
    const depthFraction = useRecursiveSubdivisionStore((s) => s.depthFraction);
    const setDepthFraction = useRecursiveSubdivisionStore((s) => s.setDepthFraction);
    const residue = useRecursiveSubdivisionStore((s) => s.residue);
    const setResidue = useRecursiveSubdivisionStore((s) => s.setResidue);
    const levelVisibility = useRecursiveSubdivisionStore((s) => s.levelVisibility);
    const showLeafFills = useRecursiveSubdivisionStore((s) => s.showLeafFills);
    const setShowLeafFills = useRecursiveSubdivisionStore((s) => s.setShowLeafFills);
    const toggleLevel = useRecursiveSubdivisionStore((s) => s.toggleLevel);
    const showAllLevels = useRecursiveSubdivisionStore((s) => s.showAllLevels);

    const summary = useMemo(() => summariseRecursiveTree(tree), [tree]);
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

                        <Box>
                            <Text size="xs" fw={500} mb={4}>
                                Levels
                            </Text>
                            <SegmentedControl
                                size="xs"
                                fullWidth
                                data={LEVEL_OPTIONS}
                                value={String(levels)}
                                onChange={(value) => setLevels(Number(value))}
                            />
                        </Box>

                        <NumberInput
                            size="xs"
                            label="Merge group size"
                            description="Adjacent edges fused into one segment at every level"
                            min={1}
                            max={MAX_MERGE_GROUP_SIZE}
                            step={1}
                            value={mergeGroupSize}
                            onChange={(value) => setMergeGroupSize(typeof value === 'number' ? value : 1)}
                        />

                        <Box>
                            <Group justify="space-between" mb={4}>
                                <Text size="xs" fw={500}>
                                    Depth
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {depthLabel(depthFraction)} of each region&apos;s max offset
                                </Text>
                            </Group>
                            <Slider
                                size="xs"
                                min={MIN_PANEL_DEPTH_FRACTION}
                                max={FULL_DEPTH_FRACTION}
                                step={DEPTH_FRACTION_STEP}
                                value={depthFraction}
                                label={depthLabel}
                                onChange={setDepthFraction}
                            />
                            <Text size="xs" c="dimmed" mt={4}>
                                {depthFraction >= FULL_DEPTH_FRACTION
                                    ? 'Full depth: the segments tile the region and there is no residue.'
                                    : 'Below full depth the wavefront stops short, and what it never reached is the residue.'}
                            </Text>
                        </Box>

                        <Box>
                            <Text size="xs" fw={500} mb={4}>
                                Residue
                            </Text>
                            <SegmentedControl
                                size="xs"
                                fullWidth
                                data={RESIDUE_OPTIONS}
                                value={residue}
                                onChange={(value) => setResidue(value as ResidueTreatment)}
                            />
                            <Text size="xs" c="dimmed" mt={4}>
                                {residue === 'recurse'
                                    ? 'Each residue ring is subdivided in turn — the droste reading.'
                                    : 'Residue rings are kept whole and undivided — the courtyard reading.'}
                            </Text>
                        </Box>

                        <Switch
                            size="xs"
                            checked={showLeafFills}
                            onChange={(event) => setShowLeafFills(event.currentTarget.checked)}
                            label="Fills"
                            description="Tints each final cell by its level-0 ancestor, and each residue ring by its own colour"
                        />

                        <Stack gap={4}>
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
                                <Group key={level.level} justify="space-between" wrap="nowrap">
                                    <Group gap={6} wrap="nowrap">
                                        <Box
                                            w={12}
                                            h={12}
                                            style={{
                                                background: styleForLevel(level.level).segmentColour,
                                                borderRadius: 2,
                                            }}
                                        />
                                        <Switch
                                            size="xs"
                                            checked={levelVisibility[level.level] ?? true}
                                            onChange={() => toggleLevel(level.level)}
                                            label={`Level ${level.level}`}
                                        />
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {level.segments} seg / {level.nodes} region
                                        {level.nodes === 1 ? '' : 's'}
                                        {level.residueRings > 0 ? ` / ${level.residueRings} residue` : ''}
                                        {level.discardedResidueRings > 0
                                            ? ` (${level.discardedResidueRings} discarded)`
                                            : ''}
                                        {level.failures > 0 ? ` / ${level.failures} failed` : ''}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>

                        <Stack gap={2}>
                            <Text size="xs" c="dimmed">
                                {summary.totalSegments} segment{summary.totalSegments === 1 ? '' : 's'} in total
                                &middot; {summary.leafSegments} leaf cell{summary.leafSegments === 1 ? '' : 's'}
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
                                        : `${summary.totalResidueRings} residue ring`
                                            + `${summary.totalResidueRings === 1 ? '' : 's'}`
                                            + `${summary.totalDiscardedResidueRings > 0
                                                ? `, ${summary.totalDiscardedResidueRings} discarded as degenerate`
                                                : ''}.`}
                                </Text>
                            </Group>
                            <Text size="xs" c={summary.totalFailures > 0 ? 'pink' : 'dimmed'}>
                                {summary.totalFailures === 0
                                    ? 'Every region subdivided.'
                                    : `${summary.totalFailures} region${summary.totalFailures === 1 ? '' : 's'} did not subdivide.`}
                            </Text>
                            {reasons.slice(0, REASONS_SHOWN).map((reason) => (
                                <Text key={reason} size="xs" c="pink" lineClamp={3}>
                                    {reason}
                                </Text>
                            ))}
                            {reasons.length > REASONS_SHOWN && (
                                <Text size="xs" c="pink">
                                    …and {reasons.length - REASONS_SHOWN} more distinct reason
                                    {reasons.length - REASONS_SHOWN === 1 ? '' : 's'}.
                                </Text>
                            )}
                        </Stack>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
