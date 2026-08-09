"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Stack } from "@mantine/core";
import { ArticulationControlsPanel, ArticulationConstraintPanel } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const ArticulationCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.ArticulationCanvas })),
    { ssr: false },
);

export default function ArticulationPage() {
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

    function resetView() {
        setStagePosition({ x: 0, y: 0 });
    }

    return (
        <AlgorithmPageLayout
            algorithmName="Articulation Constraints"
            canvas={<ArticulationCanvas stagePosition={stagePosition} onPositionChange={setStagePosition} />}
            panels={
                <Stack gap="sm">
                    <ArticulationControlsPanel onResetView={resetView} />
                    <ArticulationConstraintPanel />
                </Stack>
            }
        />
    );
}
