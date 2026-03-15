"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
    Group, Title, Text, Stack, Paper, UnstyledButton, Collapse,
} from "@mantine/core";
import {
    usePolygonStore,
    useSkeletonAnimation,
    useCollisionSweep,
    skeletonToScene,
    SkeletonInteractionOverlay,
    useSkeletonStageClick,
    ControlsPanel,
    AlgorithmPanel,
    DebugPanel,
} from "@proc-geo/dashboard";
import type { DebugDisplayOptions } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const SceneCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.SceneCanvas })),
    { ssr: false },
);
const RandomPolygonPanel = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RandomPolygonPanel })),
    { ssr: false },
);

export default function StraightSkeletonPage() {
    const vertices = usePolygonStore((s) => s.vertices);

    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

    const [instructionsOpen, setInstructionsOpen] = useState(false);

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

    const invScale = 1 / stageScale;

    const skeletonNodePositions = useMemo(() => {
        if (!animation.skeleton) return [];
        return animation.skeleton.nodes.map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
        }));
    }, [animation.skeleton]);

    const scene = skeletonToScene({
        vertices,
        skeleton: animation.skeleton,
        primaryEdges: animation.primaryEdges,
        primaryEdgeIntersections: animation.primaryEdgeIntersections,
        debug,
        collisionSweepLines: sweep.collisionSweepLines,
        nodeOffsetDistances: sweep.nodeOffsetDistances,
        selectedDebugNodes: sweep.selectedDebugNodes,
        invScale,
    });

    const onStageClick = useSkeletonStageClick({ vertices, invScale });

    const interactionOverlay = (overlayInvScale: number) => (
        <SkeletonInteractionOverlay
            invScale={overlayInvScale}
            selectedDebugNodes={sweep.selectedDebugNodes}
            onToggleDebugNode={sweep.toggleDebugNode}
            skeletonNodePositions={skeletonNodePositions}
            showSkeletonNodes={debug.showSkeletonNodes}
        />
    );

    const controlPanels = (
        <Stack gap="sm">
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
                            <Text size="sm" c="dimmed">
                                On touch devices: pinch to zoom, drag with one finger to pan.
                            </Text>
                        </Stack>
                    </Collapse>
                </Stack>
            </Paper>

            <ControlsPanel onResetView={resetView} />

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
    );

    return (
        <AlgorithmPageLayout
            canvas={
                <SceneCanvas
                    scene={scene}
                    stageScale={stageScale}
                    stagePosition={stagePosition}
                    onScaleChange={setStageScale}
                    onPositionChange={setStagePosition}
                    interactionOverlay={interactionOverlay}
                    onStageClick={onStageClick}
                />
            }
            panels={controlPanels}
        />
    );
}
