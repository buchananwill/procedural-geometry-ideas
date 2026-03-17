"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Stack, Paper, Button, Group } from "@mantine/core";
import {
    DolConfigPanel,
    DolGenerateButton,
    DolGenerationPanel,
    DolInstructionsPanel,
    useDolGeneration,
    turtleToScene,
    PlaybackController,
} from "@proc-geo/dashboard";
import type { ScenePrimitive } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const SceneCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.SceneCanvas })),
    { ssr: false },
);

export default function DolSystemPage() {
    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

    const dolGeneration = useDolGeneration();

    function resetView() {
        setStageScale(1);
        setStagePosition({ x: 0, y: 0 });
    }

    const scene: ScenePrimitive[] = dolGeneration.currentTurtleOutput
        ? turtleToScene({ turtleOutput: dolGeneration.currentTurtleOutput, colorMode: "generation" })
        : [];

    const controlPanels = (
        <Stack gap="sm">
            <Paper withBorder p="sm">
                <Group gap="xs">
                    <Button variant="light" color="cyan" onClick={resetView}>
                        Reset View
                    </Button>
                    <DolGenerateButton />
                </Group>
            </Paper>
            <DolInstructionsPanel />
            <DolConfigPanel />
            <DolGenerationPanel />
        </Stack>
    );

    return (
        <AlgorithmPageLayout
            algorithmName="L-System (D0L)"
            canvas={
                <SceneCanvas
                    scene={scene}
                    stageScale={stageScale}
                    stagePosition={stagePosition}
                    onScaleChange={setStageScale}
                    onPositionChange={setStagePosition}
                />
            }
            panels={controlPanels}
            playbackController={
                <PlaybackController playback={dolGeneration.playback} color="teal" />
            }
        />
    );
}
