"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Stack, Paper, Button } from "@mantine/core";
import {
    DolConfigPanel,
    DolGenerationPanel,
    useDolSystemStore,
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
    const setGenerationCount = useDolSystemStore((s) => s.setGenerationCount);
    const generationCount = useDolSystemStore((s) => s.generationCount);
    const config = useDolSystemStore((s) => s.config);

    const configKey = JSON.stringify(config.axiom);

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
                <Button variant="light" color="cyan" onClick={resetView} fullWidth>
                    Reset View
                </Button>
            </Paper>
            <DolConfigPanel key={configKey} />
            <DolGenerationPanel
                maxGeneration={generationCount}
                onSetMaxGeneration={setGenerationCount}
            />
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
