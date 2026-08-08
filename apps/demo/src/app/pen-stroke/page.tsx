"use client";

import dynamic from "next/dynamic";
import { Stack } from "@mantine/core";
import { PenStrokeCopyPanel, PenStrokeLerpPanel, PenStrokePipelinePanel } from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const PenStrokeCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.PenStrokeCanvas })),
    { ssr: false },
);

export default function PenStrokePage() {
    return (
        <AlgorithmPageLayout
            algorithmName="Pen Stroke -> Spline"
            canvas={<PenStrokeCanvas />}
            panels={
                <Stack gap="sm">
                    <PenStrokeLerpPanel />
                    <PenStrokeCopyPanel />
                    <PenStrokePipelinePanel />
                </Stack>
            }
        />
    );
}
