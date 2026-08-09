"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Collapse, Group, Paper, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import {
    CollapseChevron,
    ControlsPanel,
    ParcelControlsPanel,
    ParcelLayerPanel,
    ParcelReportPanel,
    TerrainPanel,
    parcelsToScene,
    useParcelPipeline,
    useParcelStore,
    useParcelTerrain,
    usePolygonStore,
    useTerrainStore,
} from "@proc-geo/dashboard";
import AlgorithmPageLayout from "../AlgorithmPageLayout";

const SceneCanvas = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.SceneCanvas })),
    { ssr: false },
);
const RandomPolygonPanel = dynamic(
    () => import("@proc-geo/dashboard").then((m) => ({ default: m.RandomPolygonPanel })),
    { ssr: false },
);

export default function ParcelsPage() {
    const vertices = usePolygonStore((s) => s.vertices);
    const layers = useParcelStore((s) => s.layers);

    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
    const [instructionsOpen, setInstructionsOpen] = useState(false);

    const result = useParcelPipeline(vertices);
    const colourBySlope = useTerrainStore((s) => s.colourBySlope);
    // The parcels are judged against the terrain the same batch they are drawn from, so the colours
    // and the verdicts can never be one render apart.
    const terrain = useParcelTerrain(result.vertices, result.parcelsByStrip);

    // The skeleton layer draws the arcs the strips were cut from, so it must come from the same
    // solve the strips did — not a second one run for display.
    const scene = parcelsToScene({
        vertices,
        skeleton: result.solve?.graph ?? null,
        offsetRings: result.offsetRings,
        strips: result.strips,
        parcelsByStrip: result.parcelsByStrip,
        layers,
        terrain: terrain.enabled
            ? {
                  slopes: terrain.slopes,
                  field: terrain.field,
                  thresholdDegrees: terrain.slopeThresholdDegrees,
                  maxDisplaySlopeDegrees: terrain.maxDisplaySlopeDegrees,
                  colourBySlope,
              }
            : null,
    });

    function resetView() {
        setStageScale(1);
        setStagePosition({ x: 0, y: 0 });
    }

    const panels = (
        <Stack gap="sm">
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <UnstyledButton w="100%" onClick={() => setInstructionsOpen((o) => !o)}>
                        <Group justify="space-between">
                            <Title order={5}>Instructions</Title>
                            <CollapseChevron opened={instructionsOpen} />
                        </Group>
                    </UnstyledButton>
                    <Collapse in={instructionsOpen}>
                        <Stack gap="xs">
                            <Text size="sm" c="dimmed">
                                The polygon is shared with the Straight Skeleton page — paste one here
                                or there and both see it. Use Edit Polygon to paste, load a fixture, or
                                reset.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Sweep Depth to watch the parcels grow from a perimeter band into a full
                                tiling of the region. Re-roll the seed to redraw the lot boundaries.
                            </Text>
                            <Text size="sm" c="dimmed">
                                The Terrain panel puts the region on real ground. Parcels are coloured
                                by mean slope, and any lot steeper than the threshold is outlined in a
                                white dash — drag the threshold to watch the verdicts move.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Scroll to zoom. Middle-click or Alt+drag to pan.
                            </Text>
                        </Stack>
                    </Collapse>
                </Stack>
            </Paper>

            <ParcelReportPanel result={result} />

            <TerrainPanel terrain={terrain} parcelCount={result.parcels.length} />

            <ParcelControlsPanel
                maxOffset={result.maxOffset}
                depth={result.depth}
                vertexCount={vertices.length}
            />

            <ParcelLayerPanel />

            <ControlsPanel onResetView={resetView} />

            <RandomPolygonPanel />
        </Stack>
    );

    return (
        <AlgorithmPageLayout
            algorithmName="Parcels"
            canvas={
                <SceneCanvas
                    scene={scene}
                    stageScale={stageScale}
                    stagePosition={stagePosition}
                    onScaleChange={setStageScale}
                    onPositionChange={setStagePosition}
                />
            }
            panels={panels}
        />
    );
}
