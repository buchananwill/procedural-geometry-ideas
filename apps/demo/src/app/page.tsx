"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
    AppShell, Group, Title, Text, Stack, Paper, UnstyledButton, Collapse, ScrollArea,
} from "@mantine/core";
import {
    usePolygonStore,
    useSkeletonAnimation,
    useCollisionSweep,
    ControlsPanel,
    AlgorithmPanel,
    DebugPanel,
} from "@proc-geo/dashboard";
import type { DebugDisplayOptions } from "@proc-geo/dashboard";

const PolygonCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.PolygonCanvas })),
    { ssr: false },
);
const RandomPolygonPanel = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RandomPolygonPanel })),
    { ssr: false },
);

export default function Home() {
    const vertices = usePolygonStore((s) => s.vertices);

    // Zoom & pan state
    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

    // Instructions collapse
    const [instructionsOpen, setInstructionsOpen] = useState(false);

    // Debug toggles
    const [debug, setDebug] = useState<DebugDisplayOptions>({
        showExteriorEdgeLengths: false,
        showInteriorEdgeLengths: false,
        showSelectedNodeEdgeLengths: false,
        showSkeletonNodes: false,
        showPrimaryIntersectionNodes: false,
        showNodeIndices: false,
        showEdgeIndices: false,
        showOffsetDistances: false,
        showSweepEventDetails: false,
        showUnresolvedEdges: false,
        showEdgeDirections: false,
        showParentEdges: false,
    });

    function toggleDebug(key: keyof DebugDisplayOptions) {
        setDebug((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    const animation = useSkeletonAnimation(vertices);
    const sweep = useCollisionSweep(vertices, animation.solverContext, animation.skeleton, debug);

    function resetView() {
        setStageScale(1);
        setStagePosition({ x: 0, y: 0 });
    }

    return (
        <AppShell header={{ height: 60 }} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Title order={3}>Procedural Geometry</Title>
                </Group>
            </AppShell.Header>

            <AppShell.Main>
                <Group align="stretch" gap="md" wrap="nowrap" style={{ height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))" }}>

                    <PolygonCanvas
                        skeleton={animation.skeleton}
                        primaryEdges={animation.primaryEdges}
                        primaryEdgeIntersections={animation.primaryEdgeIntersections}
                        stageScale={stageScale}
                        stagePosition={stagePosition}
                        onScaleChange={setStageScale}
                        onPositionChange={setStagePosition}
                        debug={debug}
                        selectedDebugNodes={sweep.selectedDebugNodes}
                        onToggleDebugNode={sweep.toggleDebugNode}
                        collisionSweepLines={sweep.collisionSweepLines}
                        nodeOffsetDistances={sweep.nodeOffsetDistances}
                    />

                    <ScrollArea style={{ height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))", width: 240, flexShrink: 0 }}>
                        <Stack w={240} gap="sm">
                            <ControlsPanel onResetView={resetView} />

                            <Paper p="md" withBorder>
                                <Stack gap="xs">
                                    <UnstyledButton w="100%" onClick={() => setInstructionsOpen(o => !o)}>
                                        <Group justify="space-between">
                                            <Title order={5}>Instructions</Title>
                                            <Text size="xs" c="blue">{instructionsOpen ? "\u25B2" : "\u25BC"}</Text>
                                        </Group>
                                    </UnstyledButton>
                                    <Collapse in={instructionsOpen}>
                                        <Stack gap="xs">
                                            <Text size="sm" c="dimmed">
                                                Drag vertices to reshape the polygon. Click on an edge to add
                                                a new vertex. Select a vertex and use Delete to remove it.
                                            </Text>
                                            <Text size="sm" c="dimmed">
                                                Scroll to zoom. Middle-click or Alt+drag to pan.
                                            </Text>
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            </Paper>

                            <AlgorithmPanel animation={animation} />

                            <RandomPolygonPanel />

                            <DebugPanel
                                debug={debug}
                                toggleDebug={toggleDebug}
                                showSkeleton={animation.showSkeleton}
                                solverContext={animation.solverContext}
                                collisionSweepLines={sweep.collisionSweepLines}
                                onClearSweep={() => sweep.setCollisionSweepLines(null)}
                                onSweepPrimaryInit={sweep.sweepAllPrimaryInit}
                                onSweepPrimaryFull={sweep.sweepAllPrimaryFull}
                            />
                        </Stack>
                    </ScrollArea>
                </Group>
            </AppShell.Main>
        </AppShell>
    );
}
