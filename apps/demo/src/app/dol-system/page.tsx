"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

function computeFitView(
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
    canvasSize: { width: number; height: number }
): { scale: number; position: { x: number; y: number } } | null {
    if (canvasSize.width === 0 || canvasSize.height === 0) return null;
    const bw = bounds.max.x - bounds.min.x;
    const bh = bounds.max.y - bounds.min.y;
    if (bw === 0 || bh === 0) return null;
    const PADDING = 0.1;
    const scaleX = (canvasSize.width * (1 - 2 * PADDING)) / bw;
    const scaleY = (canvasSize.height * (1 - 2 * PADDING)) / bh;
    const scale = Math.min(scaleX, scaleY, 100);
    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cy = (bounds.min.y + bounds.max.y) / 2;
    return {
        scale,
        position: {
            x: canvasSize.width / 2 - cx * scale,
            y: canvasSize.height / 2 - cy * scale,
        },
    };
}

export default function DolSystemPage() {
    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const canvasSizeRef = useRef(canvasSize);
    const lastFittedOutputRef = useRef<any>(null);

    const dolGeneration = useDolGeneration();

    const handleResize = useCallback((size: { width: number; height: number }) => {
        setCanvasSize(size);
        canvasSizeRef.current = size;
    }, []);

    useEffect(() => {
        const output = dolGeneration.currentTurtleOutput;
        if (!output) return;
        const fit = computeFitView(output.bounds, canvasSizeRef.current);
        if (!fit) return;
        lastFittedOutputRef.current = output;
        setStageScale(fit.scale);
        setStagePosition(fit.position);
    }, [dolGeneration.currentTurtleOutput]);

    const resetView = useCallback(() => {
        const output = lastFittedOutputRef.current;
        if (!output) {
            setStageScale(1);
            setStagePosition({ x: 0, y: 0 });
            return;
        }
        const fit = computeFitView(output.bounds, canvasSizeRef.current);
        if (!fit) return;
        setStageScale(fit.scale);
        setStagePosition(fit.position);
    }, []);

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
                    onResize={handleResize}
                />
            }
            panels={controlPanels}
            playbackController={
                <PlaybackController playback={dolGeneration.playback} color="teal" />
            }
        />
    );
}
