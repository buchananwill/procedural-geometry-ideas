"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Collapse, Group, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { subdivideRecursively } from "@proc-geo/core";
import type { RecursiveNode } from "@proc-geo/core";
import { FULL_CORPUS } from "@proc-geo/test-fixtures";
import {
    CollapseChevron,
    EXPLORER_PERCEPTUAL_FLOOR,
    fixtureByName,
    RecursiveControlsPanel,
    RecursivePolygonPanel,
    useRecursiveSubdivisionStore,
} from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const RecursiveSubdivisionCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RecursiveSubdivisionCanvas })),
    { ssr: false },
);

// Client-only for the same reason the canvas is: the inspector draws a Konva stage of its own.
const RegionInspectorPanel = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RegionInspectorPanel })),
    { ssr: false },
);

export default function RecursivePage() {
    const fixtureName = useRecursiveSubdivisionStore((s) => s.fixtureName);
    const customVertices = useRecursiveSubdivisionStore((s) => s.customVertices);
    const levels = useRecursiveSubdivisionStore((s) => s.levels);
    const levelVisibility = useRecursiveSubdivisionStore((s) => s.levelVisibility);

    const [instructionsOpen, setInstructionsOpen] = useState(false);

    // The store's defaults are a real fixture at three levels that do not resemble each other, so the
    // page draws a heterogeneous recursive subdivision on first paint — there is nothing to click
    // before something appears, and what appears shows what a per-level spec is for.
    // The lookup is over the FULL corpus, defect fixtures included: the panel offers them, so a
    // selection that could not be resolved here would silently redraw the first clean fixture.
    // A PASTED OR EDITED POLYGON WINS OVER THE FIXTURE, and goes through this same call: journal
    // decision 97 asks for the page to accept one, and it is only worth accepting if it reaches the
    // driver by the route every fixture takes.
    // THE FLOOR THIS PAGE CAN ACTUALLY SEE, not the library's conservative default (journal
    // decision 106). The chain is: 2 CSS px of separation ÷ SceneCanvas' zoom cap of 100 = 0.02
    // world units, the smallest world separation this canvas can ever resolve; over a reference
    // world extent of 2000 units — larger than any fixture the demo draws — that is 1e-5 of the
    // shape's extent, ten times coarser than SKELETON_NOISE_FLOOR. It matters more here than on the
    // single-solve page: the driver measures the floor once on the ROOT and passes it down, so every
    // sub-region at every level is screened against what THIS canvas can show. Derived and pinned in
    // the dashboard's `perceptual-floor.ts`, which shares the zoom cap with the canvas itself.
    const tree: RecursiveNode = useMemo(() => {
        const vertices = customVertices ?? (fixtureByName(fixtureName) ?? FULL_CORPUS[0]).vertices;
        return subdivideRecursively(vertices, {
            levels,
            perceptualFloor: EXPLORER_PERCEPTUAL_FLOOR,
        });
    }, [customVertices, fixtureName, levels]);

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
                                The polygon is solved and cut into segments — adjacent boundary edges
                                fused in groups — at a fraction of its own maximum offset. What the
                                wavefront never reached is the residue. Each level is its own spec:
                                its own depth, its own merge grouping, and its own answer for each of
                                its two child streams, so a level can send its segments deeper while
                                leaving its courtyard whole, or the other way about.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Add and remove level rows to change the depth of the recursion — the
                                number of rows IS the depth. Every level is drawn at once: the root
                                heaviest and whitest, each level below it thinner and greyer, and a
                                cell that was subdivided drawn fainter than one that is final.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Turn a level off to check the one below it is real. Any region that
                                would not re-solve is filled and labelled in pink rather than left as
                                a gap, and its reason is reported under the controls.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Every region carries a stable id — r0, r0.3, r0.3.1 — shown on any
                                patch that would not solve. The Region Inspector lists them all and
                                draws any one of them alone, fitted, with its vertices numbered and
                                its own standalone solve underneath, so a malformed boundary and a
                                solver failure on a good boundary look different.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Scroll to zoom. Middle-click or Alt+drag to pan. Changing the fixture
                                refits the view.
                            </Text>
                        </Stack>
                    </Collapse>
                </Stack>
            </Paper>

            <RecursivePolygonPanel />
            <RecursiveControlsPanel tree={tree} />
            <RegionInspectorPanel tree={tree} />
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
