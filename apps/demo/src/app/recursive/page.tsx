"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Collapse, Group, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { subdivideRecursively } from "@proc-geo/core";
import type { RecursiveNode } from "@proc-geo/core";
import { ALL_TEST_POLYGONS } from "@proc-geo/test-fixtures";
import {
    CollapseChevron,
    RecursiveControlsPanel,
    useRecursiveSubdivisionStore,
} from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const RecursiveSubdivisionCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RecursiveSubdivisionCanvas })),
    { ssr: false },
);

export default function RecursivePage() {
    const fixtureName = useRecursiveSubdivisionStore((s) => s.fixtureName);
    const levels = useRecursiveSubdivisionStore((s) => s.levels);
    const mergeGroupSize = useRecursiveSubdivisionStore((s) => s.mergeGroupSize);
    const depthFraction = useRecursiveSubdivisionStore((s) => s.depthFraction);
    const residue = useRecursiveSubdivisionStore((s) => s.residue);
    const levelVisibility = useRecursiveSubdivisionStore((s) => s.levelVisibility);

    const [instructionsOpen, setInstructionsOpen] = useState(false);

    // The store's defaults are a real fixture at two levels, so the page draws a recursive
    // subdivision on first paint — there is nothing to click before something appears.
    const tree: RecursiveNode = useMemo(() => {
        const fixture = ALL_TEST_POLYGONS.find((polygon) => polygon.name === fixtureName)
            ?? ALL_TEST_POLYGONS[0];
        return subdivideRecursively(fixture.vertices, { levels, mergeGroupSize, depthFraction, residue });
    }, [fixtureName, levels, mergeGroupSize, depthFraction, residue]);

    const panels = (
        <Stack gap="sm">
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <UnstyledButton w="100%" onClick={() => setInstructionsOpen((o) => !o)}>
                        <Group justify="space-between">
                            <Title order={5}>Instructions</Title>
                            <CollapseChevron opened={instructionsOpen} />
                        </Group>
                    </UnstyledButton>
                    <Collapse in={instructionsOpen}>
                        <Stack gap="xs">
                            <Text size="sm" c="dimmed">
                                The polygon is solved, cut at full depth into segments — adjacent
                                boundary edges fused in groups — and then each of those segments is
                                solved again as a polygon in its own right. Every level is drawn at
                                once: the root heaviest and whitest, each level below it thinner and
                                greyer.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Turn a level off to check the one below it is real. Any region that
                                would not re-solve is filled and labelled in pink rather than left as
                                a gap, and its reason is reported under the controls.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Scroll to zoom. Middle-click or Alt+drag to pan. Changing the fixture
                                refits the view.
                            </Text>
                        </Stack>
                    </Collapse>
                </Stack>
            </Paper>

            <RecursiveControlsPanel tree={tree} />
        </Stack>
    );

    return (
        <AlgorithmPageLayout
            algorithmName="Recursive Subdivision"
            canvas={<RecursiveSubdivisionCanvas tree={tree} levelVisibility={levelVisibility} />}
            panels={panels}
        />
    );
}
