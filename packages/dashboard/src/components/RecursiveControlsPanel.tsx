import { useMemo, useState } from 'react';
import {
    Box, Button, Collapse, Divider, Group, Paper, Select, Stack, Switch, Text, Title, UnstyledButton,
} from '@mantine/core';
import {
    flattenRecursiveTree, isLastLevel, MAX_RECURSION_LEVELS, MIN_RECURSION_LEVELS,
} from '@proc-geo/core';
import type { RecursiveNode } from '@proc-geo/core';
import { ALL_TEST_POLYGONS } from '@proc-geo/test-fixtures';
import CollapseChevron from './CollapseChevron';
import RecursiveLevelReadout from './RecursiveLevelReadout';
import RecursiveLevelRow from './RecursiveLevelRow';
import { pluralize, residueTotalLine } from './recursive-readout-text';
import { residueRingStyle } from '../scene/adapters/recursiveSubdivisionToScene';
import {
    summariseRecursiveTree,
    summariseSpines,
    useRecursiveSubdivisionStore,
} from '../stores/useRecursiveSubdivisionStore';

export interface RecursiveControlsPanelProps {
    /** The tree currently drawn, so the counts reported are the counts on the canvas. */
    tree: RecursiveNode;
}

const FIXTURE_OPTIONS = ALL_TEST_POLYGONS.map((polygon) => polygon.name);

/** How many distinct failure reasons to spell out before falling back to a count. */
const REASONS_SHOWN = 3;

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

    const spineStrategies = useRecursiveSubdivisionStore((s) => s.spineStrategies);

    const summary = useMemo(() => summariseRecursiveTree(tree, levels), [tree, levels]);
    // One row per level the composition actually has, so a spine row and a level row are the same
    // level. Memoised because each row re-solves every region at its level to extract a spine.
    const spines = useMemo(
        () => summariseSpines(tree, spineStrategies.slice(0, levels.length)),
        [tree, spineStrategies, levels.length],
    );
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
                                    isLastLevel={isLastLevel(level, levels)}
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
                                    spine={spines[level.level]}
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
                                    {residueTotalLine(summary)}
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
