"use client";

import dynamic from "next/dynamic";
import { Stack } from "@mantine/core";
import { ArticulationControlsPanel, ArticulationConstraintPanel } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const ArticulationCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.ArticulationCanvas })),
    { ssr: false },
);

export default function ArticulationPage() {
    return (
        <AlgorithmPageLayout
            algorithmName="Articulation Constraints"
            canvas={<ArticulationCanvas />}
            panels={
                <Stack gap="sm">
                    <ArticulationControlsPanel />
                    <ArticulationConstraintPanel />
                </Stack>
            }
        />
    );
}
