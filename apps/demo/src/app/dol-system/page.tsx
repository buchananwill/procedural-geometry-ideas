"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Stack } from "@mantine/core";
import {
    DolConfigPanel,
    DolGenerationPanel,
    useDolSystemStore,
    useDolGeneration,
    turtleToScene,
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
    const config = useDolSystemStore((s) => s.config);

    const configKey = JSON.stringify(config.axiom);

    const scene: ScenePrimitive[] = dolGeneration.currentTurtleOutput
        ? turtleToScene({ turtleOutput: dolGeneration.currentTurtleOutput, colorMode: "generation" })
        : [];

    const controlPanels = (
        <Stack gap="sm">
            <DolConfigPanel key={configKey} />
            <DolGenerationPanel
                generation={dolGeneration}
                onSetMaxGeneration={setGenerationCount}
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
                />
            }
            panels={controlPanels}
        />
    );
}
