import { useMemo, useState } from 'react';
import {
    Badge, Box, Code, Collapse, Group, Paper, ScrollArea, Stack, Switch, Text, Title, UnstyledButton,
} from '@mantine/core';
import { findRegionById, signedArea } from '@proc-geo/core';
import type { RecursiveNode } from '@proc-geo/core';
import CollapseChevron from './CollapseChevron';
import RegionFocusCanvas from './RegionFocusCanvas';
import { FAILURE_COLOUR } from '../scene/adapters/recursiveTerritoryTint';
import { describeProvenance, regionListRows, standaloneSolve } from '../scene/adapters/regionInspector';
import { useRecursiveSubdivisionStore } from '../stores/useRecursiveSubdivisionStore';

/**
 * Pick one region of the subdivision tree and look at it ALONE — journal decision 97, the user's own
 * design.
 *
 * The panel answers one question the whole-tree canvas cannot: is a region that would not solve a bad
 * polygon, or a good polygon the solver failed on? It puts three things in one frame — the boundary
 * the driver captured, the driver's verdict on it, and a fresh standalone solve of the same boundary
 * — so the two readings separate by eye instead of by argument.
 *
 * BY ID THROUGHOUT. The list, the canvas label on the whole-tree picture, the census rows in the core
 * suite and this panel all name a region the same way, which is the only reason a defect can be
 * carried from one to another.
 */

/** Height of the focused canvas. Tall enough to read a boundary, short enough to sit in a panel. */
const FOCUS_CANVAS_HEIGHT = 260;

/** Height of the region list before it scrolls. A full tree runs to hundreds of rows. */
const LIST_HEIGHT = 220;

export interface RegionInspectorPanelProps {
    /** The tree currently drawn, so the region inspected is a region on the canvas. */
    tree: RecursiveNode;
}

/** The colour a region's outcome badge carries: the page's failure pink, or a neutral. */
function outcomeBadge(node: RecursiveNode): { colour: string; label: string } {
    switch (node.outcome.kind) {
        case 'solved':
            return { colour: 'teal', label: 'solved' };
        case 'declined-degenerate':
            return { colour: 'yellow', label: 'declined' };
        case 'failed':
            return { colour: 'pink', label: 'failed' };
    }
}

/** What the standalone solve's verdict is called, and whether it reads as good news. */
function solveBadge(status: string): { colour: string; label: string } {
    if (status === 'solved') return { colour: 'teal', label: 'standalone solve: complete' };
    if (status === 'degenerate') return { colour: 'yellow', label: 'standalone solve: no polygon' };
    return { colour: 'pink', label: `standalone solve: ${status}` };
}

export default function RegionInspectorPanel({ tree }: RegionInspectorPanelProps) {
    const [opened, setOpened] = useState(true);
    const [failuresOnly, setFailuresOnly] = useState(false);

    const selectedRegionId = useRecursiveSubdivisionStore((s) => s.selectedRegionId);
    const setSelectedRegionId = useRecursiveSubdivisionStore((s) => s.setSelectedRegionId);

    const rows = useMemo(() => regionListRows(tree), [tree]);
    const shown = useMemo(
        () => (failuresOnly ? rows.filter((row) => row.node.failure !== undefined) : rows),
        [rows, failuresOnly],
    );

    // Resolved from the tree on every render rather than held as a node: the tree is rebuilt whenever
    // a level setting moves, and a stored node would be a region of a tree that no longer exists.
    const selected = useMemo(
        () => (selectedRegionId === null ? undefined : findRegionById(tree, selectedRegionId)),
        [tree, selectedRegionId],
    );

    // The one piece of real work this panel does. Kept to the SELECTED region — solving every region
    // in the list to fill in a badge would re-solve the whole tree on every render.
    const solve = useMemo(
        () => (selected === undefined ? undefined : standaloneSolve(selected.boundary)),
        [selected],
    );

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Region Inspector</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="sm">
                        <Text size="xs" c="dimmed">
                            Every region of the tree, in the order its ids number them. Pick one to see
                            its boundary alone, fitted, with its vertices numbered — and its own
                            standalone solve under it.
                        </Text>

                        <Switch
                            size="xs"
                            checked={failuresOnly}
                            onChange={(event) => setFailuresOnly(event.currentTarget.checked)}
                            label="Only regions that did not subdivide"
                        />

                        <ScrollArea h={LIST_HEIGHT} type="auto">
                            <Stack gap={2}>
                                {shown.length === 0 && (
                                    <Text size="xs" c="dimmed">
                                        No region matches.
                                    </Text>
                                )}
                                {shown.map((row) => (
                                    <UnstyledButton
                                        key={row.node.id}
                                        onClick={() => setSelectedRegionId(row.node.id)}
                                        pl={8 + row.indent * 12}
                                        py={2}
                                        style={{
                                            borderRadius: 4,
                                            background: row.node.id === selectedRegionId
                                                ? 'rgba(255,255,255,0.12)'
                                                : undefined,
                                        }}
                                    >
                                        <Group gap={6} wrap="nowrap">
                                            <Text
                                                size="xs"
                                                ff="monospace"
                                                c={row.node.failure === undefined ? undefined : FAILURE_COLOUR}
                                            >
                                                {row.node.id}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {row.origin} · {row.node.boundary.length} vertices
                                            </Text>
                                        </Group>
                                    </UnstyledButton>
                                ))}
                            </Stack>
                        </ScrollArea>

                        {selected === undefined || solve === undefined ? (
                            <Text size="xs" c="dimmed">
                                {selectedRegionId === null
                                    ? 'No region selected.'
                                    : `Region ${selectedRegionId} is not in the current tree — the settings changed under it.`}
                            </Text>
                        ) : (
                            <Stack gap="xs">
                                <Group gap={6} wrap="wrap">
                                    <Text size="sm" ff="monospace" fw={600}>
                                        {selected.id}
                                    </Text>
                                    <Badge size="xs" color={outcomeBadge(selected).colour}>
                                        {outcomeBadge(selected).label}
                                    </Badge>
                                    <Badge size="xs" color={solveBadge(solve.status).colour} variant="light">
                                        {solveBadge(solve.status).label}
                                    </Badge>
                                </Group>

                                <Text size="xs" c="dimmed">
                                    level {selected.level} · {describeProvenance(selected)}
                                    {selected.parentId === undefined ? '' : ` of ${selected.parentId}`} ·{' '}
                                    {selected.boundary.length} vertices · area{' '}
                                    {Math.abs(signedArea(selected.boundary)).toPrecision(6)}
                                </Text>

                                {/* Drawn for a region that solved as well as one that did not: the
                                    picture is how a reader checks a boundary they have no complaint
                                    about, which is what makes the complaint about another one mean
                                    something. */}
                                <Box h={FOCUS_CANVAS_HEIGHT} style={{ display: 'flex' }}>
                                    <RegionFocusCanvas boundary={selected.boundary} solve={solve} />
                                </Box>

                                {selected.failure !== undefined && (
                                    <Stack gap={2}>
                                        <Text size="xs" fw={500} c="pink">
                                            What the driver reported
                                        </Text>
                                        {/* VERBATIM. A diagnostic paraphrased in a panel is a
                                            diagnostic that cannot be grepped for in the suite. */}
                                        <Code block fz={10}>
                                            {selected.failure}
                                        </Code>
                                    </Stack>
                                )}

                                {solve.detail !== '' && (
                                    <Stack gap={2}>
                                        <Text size="xs" fw={500} c="pink">
                                            What a standalone solve of this boundary reports
                                        </Text>
                                        <Code block fz={10}>
                                            {solve.detail}
                                        </Code>
                                    </Stack>
                                )}

                                {selected.canonicalAreaDrift > 0 && (
                                    <Text size="xs" c="yellow">
                                        Canonicalisation removed {selected.boundary.length
                                            - selected.canonicalBoundary.length} vertex(es) before the
                                        solve — area drift {selected.canonicalAreaDrift.toExponential(3)}.
                                    </Text>
                                )}
                            </Stack>
                        )}
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
