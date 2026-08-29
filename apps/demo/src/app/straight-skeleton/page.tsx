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
    PlaybackController,
    CollapseChevron,
    EXPLORER_PERCEPTUAL_FLOOR,
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
        showCollisionSweep: true,
    });

    function toggleDebug(key: keyof DebugDisplayOptions) {
        setDebug((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    // THE FLOOR THIS PAGE CAN ACTUALLY SEE, not the library's conservative default (journal
    // decision 106). The chain is: 2 CSS px of separation ÷ SceneCanvas' zoom cap of 100 = 0.02
    // world units, the smallest world separation this canvas can ever resolve; over a reference
    // world extent of 2000 units — larger than any fixture the demo draws — that is 1e-5 of the
    // shape's extent, ten times coarser than SKELETON_NOISE_FLOOR. Below it the solver would be
    // computing structure this page throws away in the renderer. Derived and pinned in the
    // dashboard's `perceptual-floor.ts`, which shares the zoom cap with the canvas itself.
    const animation = useSkeletonAnimation(vertices, EXPLORER_PERCEPTUAL_FLOOR);
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
        solverVertexRemap: animation.solverVertexRemap,
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
                            <CollapseChevron opened={instructionsOpen} />
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
                solverVertexRemap={animation.solverVertexRemap}
                collisionSweepLines={sweep.collisionSweepLines}
                onClearSweep={() => sweep.setCollisionSweepLines(null)}
                onSweepPrimaryInit={sweep.sweepAllPrimaryInit}
                onSweepPrimaryFull={sweep.sweepAllPrimaryFull}
            />
        </Stack>
    );

    return (
        <AlgorithmPageLayout
            algorithmName="Straight Skeleton"
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
            playbackController={
                animation.animationMode
                    ? <PlaybackController playback={animation.playback} color="yellow" />
                    : undefined
            }
        />
    );
}
