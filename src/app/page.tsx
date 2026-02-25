"use client";

import {useState, useMemo, useEffect, useCallback} from "react";
import dynamic from "next/dynamic";
import {AppShell, Group, Title, Button, UnstyledButton, Text, Stack, Paper, Switch, Select, Collapse, ScrollArea} from "@mantine/core";
import {usePolygonStore} from "@/stores/usePolygonStore";
import {
    computeStraightSkeleton,
    computePrimaryInteriorEdges,
    computePrimaryEdgeIntersections,
} from "@/algorithms/straight-skeleton/algorithm";
import type {PrimaryInteriorEdge} from "@/algorithms/straight-skeleton/algorithm";
import type {StraightSkeletonGraph} from "@/algorithms/straight-skeleton/types";
import type {Vector2} from "@/algorithms/straight-skeleton/types";
import {computeStraightSkeletonV4} from "@/algorithms/straight-skeleton/algorithm-v4";
import {runAlgorithmV5} from "@/algorithms/straight-skeleton/algorithm-termination-cases";

const PolygonCanvas = dynamic(() => import("@/components/PolygonCanvas"), {
    ssr: false,
});
const RandomPolygonPanel = dynamic(() => import("@/components/RandomPolygonPanel"), {
    ssr: false,
});

export interface DebugDisplayOptions {
    showExteriorEdgeLengths: boolean;
    showInteriorEdgeLengths: boolean;
    showSelectedNodeEdgeLengths: boolean;
    showSkeletonNodes: boolean;
    showPrimaryIntersectionNodes: boolean;
    showNodeIndices: boolean;
    showEdgeIndices: boolean;
}

export default function Home() {
    const vertices = usePolygonStore((s) => s.vertices);
    const vertexCount = vertices.length;
    const resetPolygon = usePolygonStore((s) => s.resetPolygon);
    const selectedVertex = usePolygonStore((s) => s.selectedVertex);
    const removeVertex = usePolygonStore((s) => s.removeVertex);

    const setVertices = usePolygonStore((s) => s.setVertices);

    const [showSkeleton, setShowSkeleton] = useState(false);
    const [algorithmVersion, setAlgorithmVersion] = useState<"v1" | "v5">("v5");
    const [showPrimaryEdges, setShowPrimaryEdges] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pasted, setPasted] = useState<"ok" | "fail" | null>(null);

    // Collapse state for control cards
    const [controlsOpen, setControlsOpen] = useState(false);
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const [algorithmsOpen, setAlgorithmsOpen] = useState(false);
    const [debugOpen, setDebugOpen] = useState(false);

    // Zoom & pan state
    const [stageScale, setStageScale] = useState(1);
    const [stagePosition, setStagePosition] = useState({x: 0, y: 0});

    // Debug toggles
    const [debug, setDebug] = useState<DebugDisplayOptions>({
        showExteriorEdgeLengths: false,
        showInteriorEdgeLengths: false,
        showSelectedNodeEdgeLengths: false,
        showSkeletonNodes: false,
        showPrimaryIntersectionNodes: false,
        showNodeIndices: false,
        showEdgeIndices: false,
    });

    // Node selection
    const [selectedDebugNodes, setSelectedDebugNodes] = useState<Set<number>>(new Set());

    function toggleDebug(key: keyof DebugDisplayOptions) {
        setDebug((prev) => ({...prev, [key]: !prev[key]}));
    }

    const toggleDebugNode = useCallback((nodeId: number) => {
        setSelectedDebugNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    function copyVerticesToClipboard() {
        const json = JSON.stringify(vertices.map(({x, y}) => ({x, y})), null, 2);
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    function pasteVerticesFromClipboard() {
        navigator.clipboard.readText().then((text) => {
            try {
                const parsed = JSON.parse(text);
                if (!Array.isArray(parsed) || parsed.length < 3) throw new Error();
                const verts = parsed.map((v: unknown) => {
                    if (typeof v !== "object" || v === null) throw new Error();
                    const obj = v as Record<string, unknown>;
                    if (typeof obj.x !== "number" || typeof obj.y !== "number") throw new Error();
                    if (!isFinite(obj.x) || !isFinite(obj.y)) throw new Error();
                    return {x: obj.x, y: obj.y};
                });
                setVertices(verts);
                setPasted("ok");
            } catch {
                setPasted("fail");
            }
            setTimeout(() => setPasted(null), 1500);
        }).catch(() => {
            setPasted("fail");
            setTimeout(() => setPasted(null), 1500);
        });
    }

    const skeleton = useMemo<StraightSkeletonGraph | null>(() => {
        if (!showSkeleton) return null;
        try {
            if (algorithmVersion === "v1") {
                return computeStraightSkeleton(vertices);
            }
            return runAlgorithmV5(vertices).graph;
        } catch (e) {
            console.log(e)
            return null;
        }
    }, [showSkeleton, vertices, algorithmVersion]);

    const primaryEdges = useMemo<PrimaryInteriorEdge[]>(() => {
        if (!showPrimaryEdges) return [];
        return computePrimaryInteriorEdges(vertices);
    }, [showPrimaryEdges, vertices]);

    const primaryEdgeIntersections = useMemo<Vector2[]>(() => {
        if (!debug.showPrimaryIntersectionNodes || primaryEdges.length === 0) return [];
        return computePrimaryEdgeIntersections(primaryEdges);
    }, [debug.showPrimaryIntersectionNodes, primaryEdges]);

    // Clear selected debug nodes when skeleton identity changes
    useEffect(() => {
        setSelectedDebugNodes(new Set());
    }, [skeleton]);

    function resetView() {
        setStageScale(1);
        setStagePosition({x: 0, y: 0});
    }

    return (
        <AppShell header={{height: 60}} padding="md">
            <AppShell.Header>
                <Group h="100%" px="md">
                    <Title order={3}>Procedural Geometry</Title>
                </Group>
            </AppShell.Header>

            <AppShell.Main>
                <Group align="stretch" gap="md" wrap="nowrap" style={{height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))"}}>

                    <PolygonCanvas
                        skeleton={skeleton}
                        primaryEdges={primaryEdges}
                        primaryEdgeIntersections={primaryEdgeIntersections}
                        stageScale={stageScale}
                        stagePosition={stagePosition}
                        onScaleChange={setStageScale}
                        onPositionChange={setStagePosition}
                        debug={debug}
                        selectedDebugNodes={selectedDebugNodes}
                        onToggleDebugNode={toggleDebugNode}
                    />

                    <ScrollArea style={{height: "calc(100vh - 60px - 2 * var(--mantine-spacing-md))", width: 240, flexShrink: 0}}>
                    <Stack w={240} gap="sm">
                        <Paper p="md" withBorder>
                            <Stack gap="xs">
                                <UnstyledButton w="100%" onClick={() => setControlsOpen(o => !o)}>
                                    <Group justify="space-between">
                                        <Title order={5}>Controls</Title>
                                        <Text size="xs" c="blue">{controlsOpen ? "\u25B2" : "\u25BC"}</Text>
                                    </Group>
                                </UnstyledButton>
                                <Collapse in={controlsOpen}>
                                    <Stack gap="xs">
                                        <Text size="sm" c="dimmed">
                                            Vertices: {vertexCount}
                                        </Text>
                                        <Button onClick={resetPolygon} variant="light" fullWidth>
                                            Reset Polygon
                                        </Button>
                                        <Button onClick={resetView} variant="light" color="cyan" fullWidth>
                                            Reset View
                                        </Button>
                                        <Button
                                            onClick={copyVerticesToClipboard}
                                            variant="light"
                                            color="teal"
                                            fullWidth
                                        >
                                            {copied ? "Copied!" : "Copy Vertices"}
                                        </Button>
                                        <Button
                                            onClick={pasteVerticesFromClipboard}
                                            variant="light"
                                            color="teal"
                                            fullWidth
                                        >
                                            {pasted === "ok" ? "Pasted!" : pasted === "fail" ? "Invalid Data" : "Paste Vertices"}
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                if (selectedVertex !== null) removeVertex(selectedVertex);
                                            }}
                                            variant="light"
                                            color="red"
                                            fullWidth
                                            disabled={selectedVertex === null || vertexCount <= 3}
                                        >
                                            Delete Selected
                                        </Button>
                                    </Stack>
                                </Collapse>
                            </Stack>
                        </Paper>

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
                                    </Stack>
                                </Collapse>
                            </Stack>
                        </Paper>

                        <Paper p="md" withBorder>
                            <Stack gap="xs">
                                <UnstyledButton w="100%" onClick={() => setAlgorithmsOpen(o => !o)}>
                                    <Group justify="space-between">
                                        <Title order={5}>Algorithms</Title>
                                        <Text size="xs" c="blue">{algorithmsOpen ? "\u25B2" : "\u25BC"}</Text>
                                    </Group>
                                </UnstyledButton>
                                <Collapse in={algorithmsOpen}>
                                    <Stack gap="xs">
                                        <Select
                                            size="xs"
                                            label="Skeleton version"
                                            data={[
                                                {value: "v1", label: "V1 — Heap-based"},
                                                {value: "v5", label: "V5 — Step-based (latest)"},
                                            ]}
                                            value={algorithmVersion}
                                            onChange={(val) => {
                                                if (val === "v1" || val === "v5") setAlgorithmVersion(val);
                                            }}
                                            allowDeselect={false}
                                        />
                                        <Button
                                            color="orange"
                                            variant={showSkeleton ? "filled" : "light"}
                                            fullWidth
                                            onClick={() => setShowSkeleton((s) => !s)}
                                        >
                                            {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
                                        </Button>
                                        <Button
                                            color="grape"
                                            variant={showPrimaryEdges ? "filled" : "light"}
                                            fullWidth
                                            onClick={() => setShowPrimaryEdges((s) => !s)}
                                        >
                                            {showPrimaryEdges ? "Hide" : "Show"} Primary Interior Edges
                                        </Button>
                                    </Stack>
                                </Collapse>
                            </Stack>
                        </Paper>

                        <RandomPolygonPanel/>

                        <Paper p="md" withBorder>
                            <Stack gap="xs">
                                <UnstyledButton w="100%" onClick={() => setDebugOpen(o => !o)}>
                                    <Group justify="space-between">
                                        <Title order={5}>Debug</Title>
                                        <Text size="xs" c="blue">{debugOpen ? "\u25B2" : "\u25BC"}</Text>
                                    </Group>
                                </UnstyledButton>
                                <Collapse in={debugOpen}>
                                    <Stack gap="xs">

                                <Text size="xs" c="dimmed" fw={600}>Edge Lengths</Text>
                                <Switch
                                    size="xs"
                                    label="Exterior edge lengths"
                                    checked={debug.showExteriorEdgeLengths}
                                    onChange={() => toggleDebug("showExteriorEdgeLengths")}
                                />
                                <Switch
                                    size="xs"
                                    label="Interior edge lengths"
                                    checked={debug.showInteriorEdgeLengths}
                                    onChange={() => toggleDebug("showInteriorEdgeLengths")}
                                />
                                <Switch
                                    size="xs"
                                    label="Selected node edges"
                                    checked={debug.showSelectedNodeEdgeLengths}
                                    onChange={() => toggleDebug("showSelectedNodeEdgeLengths")}
                                />

                                <Text size="xs" c="dimmed" fw={600} mt={4}>Nodes</Text>
                                <Switch
                                    size="xs"
                                    label="Skeleton nodes"
                                    checked={debug.showSkeletonNodes}
                                    onChange={() => toggleDebug("showSkeletonNodes")}
                                />
                                <Switch
                                    size="xs"
                                    label="Primary intersections"
                                    checked={debug.showPrimaryIntersectionNodes}
                                    onChange={() => toggleDebug("showPrimaryIntersectionNodes")}
                                />

                                <Text size="xs" c="dimmed" fw={600} mt={4}>Indices</Text>
                                <Switch
                                    size="xs"
                                    label="Node indices"
                                    checked={debug.showNodeIndices}
                                    onChange={() => toggleDebug("showNodeIndices")}
                                />
                                <Switch
                                    size="xs"
                                    label="Edge indices"
                                    checked={debug.showEdgeIndices}
                                    onChange={() => toggleDebug("showEdgeIndices")}
                                />
                                    </Stack>
                                </Collapse>
                            </Stack>
                        </Paper>
                    </Stack>
                    </ScrollArea>
                </Group>
            </AppShell.Main>
        </AppShell>
    );
}
