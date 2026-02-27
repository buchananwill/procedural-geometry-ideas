"use client";

import {useState, useMemo, useEffect, useCallback} from "react";
import dynamic from "next/dynamic";
import {AppShell, Group, Title, Button, UnstyledButton, Text, Stack, Paper, Switch, Select, Collapse, ScrollArea, Modal, Slider, ActionIcon} from "@mantine/core";
import {usePolygonStore} from "@/stores/usePolygonStore";
import {
    computeStraightSkeleton,
    computePrimaryInteriorEdges,
    computePrimaryEdgeIntersections,
} from "@/algorithms/straight-skeleton/algorithm";
import type {PrimaryInteriorEdge} from "@/algorithms/straight-skeleton/algorithm";
import type {StraightSkeletonGraph, StraightSkeletonSolverContext, CollisionType, IntersectionType} from "@/algorithms/straight-skeleton/types";
import type {Vector2} from "@/algorithms/straight-skeleton/types";
import {runAlgorithmV5, runAlgorithmV5Stepped} from "@/algorithms/straight-skeleton/algorithm-termination-cases";
import type {SteppedAlgorithmResult} from "@/algorithms/straight-skeleton/algorithm-termination-cases";
import {makeStraightSkeletonSolverContext} from "@/algorithms/straight-skeleton/solver-context";
import {initInteriorEdges} from "@/algorithms/straight-skeleton/algorithm-helpers";
import {ALL_TEST_POLYGONS} from "@/algorithms/straight-skeleton/test-cases";
import {generateCollisionSweep, computeNodeOffsetDistances} from "@/algorithms/straight-skeleton/debug-helpers";

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
    showOffsetDistances: boolean;
    showSweepEventDetails: boolean;
    showUnresolvedEdges: boolean;
    showEdgeDirections: boolean;
}

export interface CollisionSweepLine {
    key: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    offsetDistance: number;
    edgeIdA: number;
    edgeIdB: number;
    eventType: CollisionType;
    intersectionType: IntersectionType;
    alongRay1: number;
    alongRay2: number;
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

    // Animation step-through state (V5 only)
    const [animationMode, setAnimationMode] = useState(false);
    const [steppedResult, setSteppedResult] = useState<SteppedAlgorithmResult | null>(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [stepDelay, setStepDelay] = useState(500);
    const [errorModalOpen, setErrorModalOpen] = useState(false);

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
        showOffsetDistances: false,
        showSweepEventDetails: false,
        showUnresolvedEdges: false,
        showEdgeDirections: false,
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

    // Collision sweep state
    const [collisionSweepLines, setCollisionSweepLines] = useState<CollisionSweepLine[] | null>(null);

    const solverContext = useMemo<StraightSkeletonSolverContext | null>(() => {
        if (!showSkeleton || algorithmVersion !== "v5") return null;
        try {
            return runAlgorithmV5(vertices);
        } catch (e) {
            console.log(e);
            return null;
        }
    }, [showSkeleton, vertices, algorithmVersion]);

    const skeleton = useMemo<StraightSkeletonGraph | null>(() => {
        if (animationMode && algorithmVersion === "v5" && steppedResult && steppedResult.snapshots.length > 0) {
            return steppedResult.snapshots[Math.min(currentStep, steppedResult.snapshots.length - 1)];
        }
        if (!showSkeleton) return null;
        if (algorithmVersion === "v5") {
            return solverContext?.graph ?? null;
        }
        try {
            return computeStraightSkeleton(vertices);
        } catch (e) {
            console.log(e);
            return null;
        }
    }, [showSkeleton, vertices, algorithmVersion, animationMode, steppedResult, currentStep, solverContext]);

    const primaryEdges = useMemo<PrimaryInteriorEdge[]>(() => {
        if (!showPrimaryEdges) return [];
        return computePrimaryInteriorEdges(vertices);
    }, [showPrimaryEdges, vertices]);

    const primaryEdgeIntersections = useMemo<Vector2[]>(() => {
        if (!debug.showPrimaryIntersectionNodes || primaryEdges.length === 0) return [];
        return computePrimaryEdgeIntersections(primaryEdges);
    }, [debug.showPrimaryIntersectionNodes, primaryEdges]);

    const nodeOffsetDistances = useMemo<Map<number, number> | null>(() => {
        if (!solverContext || !debug.showOffsetDistances) return null;
        return computeNodeOffsetDistances(solverContext);
    }, [solverContext, debug.showOffsetDistances]);

    function sweepLinesToRender(
        edgeIds: number[],
        ctx: StraightSkeletonSolverContext
    ): CollisionSweepLine[] {
        const sweepEvents = generateCollisionSweep(edgeIds, ctx);
        return sweepEvents.map((se, i) => {
            const sourceNode = ctx.graph.nodes[ctx.graph.edges[se.instigatorEdgeId].source];
            return {
                key: `sweep-${i}`,
                sourceX: sourceNode.position.x,
                sourceY: sourceNode.position.y,
                targetX: se.event.position.x,
                targetY: se.event.position.y,
                offsetDistance: se.event.offsetDistance,
                edgeIdA: se.event.collidingEdges[0],
                edgeIdB: se.event.collidingEdges[1],
                eventType: se.event.eventType,
                intersectionType: se.event.intersectionData[2],
                alongRay1: se.event.intersectionData[0],
                alongRay2: se.event.intersectionData[1],
            };
        });
    }

    function sweepAllPrimaryInit() {
        try {
            const ctx = makeStraightSkeletonSolverContext(vertices);
            initInteriorEdges(ctx);
            const edgeIds = ctx.graph.interiorEdges.map(e => e.id);
            setCollisionSweepLines(sweepLinesToRender(edgeIds, ctx));
        } catch (e) {
            console.log("Sweep init failed:", e);
        }
    }

    function sweepAllPrimaryFull() {
        if (!solverContext) return;
        const n = solverContext.graph.numExteriorNodes;
        const edgeIds: number[] = [];
        for (let i = n; i < 2 * n; i++) {
            if (i < solverContext.graph.edges.length) {
                edgeIds.push(i);
            }
        }
        setCollisionSweepLines(sweepLinesToRender(edgeIds, solverContext));
    }

    // Clear selected debug nodes and sweep when skeleton identity changes
    useEffect(() => {
        setSelectedDebugNodes(new Set());
        setCollisionSweepLines(null);
    }, [skeleton]);

    function resetView() {
        setStageScale(1);
        setStagePosition({x: 0, y: 0});
    }

    // Clear animation state when vertices or algorithm version change
    useEffect(() => {
        setAnimationMode(false);
        setSteppedResult(null);
        setIsPlaying(false);
        setCurrentStep(0);
    }, [vertices, algorithmVersion]);

    // Auto-advance playback timer
    useEffect(() => {
        if (!isPlaying || !steppedResult) return;
        const maxStep = steppedResult.snapshots.length - 1;
        if (currentStep >= maxStep) {
            setIsPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            setCurrentStep(prev => Math.min(prev + 1, maxStep));
        }, stepDelay);
        return () => clearTimeout(timer);
    }, [isPlaying, currentStep, stepDelay, steppedResult]);

    function startAnimation() {
        const result = runAlgorithmV5Stepped(vertices);
        setSteppedResult(result);
        setCurrentStep(0);
        setAnimationMode(true);
        setShowSkeleton(true);
        setIsPlaying(false);
        if (result.error) {
            setErrorModalOpen(true);
        }
    }

    function togglePlayPause() {
        if (!steppedResult) return;
        if (currentStep >= steppedResult.snapshots.length - 1) {
            setCurrentStep(0);
            setIsPlaying(true);
        } else {
            setIsPlaying(prev => !prev);
        }
    }

    function stepForward() {
        if (!steppedResult) return;
        setIsPlaying(false);
        setCurrentStep(prev => Math.min(prev + 1, steppedResult.snapshots.length - 1));
    }

    function stepBackward() {
        setIsPlaying(false);
        setCurrentStep(prev => Math.max(prev - 1, 0));
    }

    function exitAnimation() {
        setAnimationMode(false);
        setSteppedResult(null);
        setIsPlaying(false);
        setCurrentStep(0);
    }

    const maxStep = steppedResult ? steppedResult.snapshots.length - 1 : 0;

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
                        collisionSweepLines={collisionSweepLines}
                        nodeOffsetDistances={nodeOffsetDistances}
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
                                        <Select
                                            size="xs"
                                            label="Load test polygon"
                                            placeholder="Select..."
                                            data={ALL_TEST_POLYGONS.map((p) => p.name)}
                                            value={null}
                                            onChange={(name) => {
                                                const poly = ALL_TEST_POLYGONS.find((p) => p.name === name);
                                                if (poly) setVertices(poly.vertices);
                                            }}
                                            searchable
                                            clearable
                                        />
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
                                        {algorithmVersion === "v5" && (
                                            <Stack gap="xs" mt="xs">
                                                {!animationMode ? (
                                                    <Button
                                                        color="yellow"
                                                        variant="light"
                                                        fullWidth
                                                        onClick={startAnimation}
                                                    >
                                                        Step Through
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Text size="xs" c="dimmed" fw={600}>
                                                            Step {currentStep} / {maxStep}
                                                            {steppedResult?.error && " (error)"}
                                                        </Text>
                                                        <Slider
                                                            min={0}
                                                            max={Math.max(maxStep, 0)}
                                                            step={1}
                                                            value={currentStep}
                                                            onChange={(val) => {
                                                                setIsPlaying(false);
                                                                setCurrentStep(val);
                                                            }}
                                                            size="sm"
                                                            label={(val) => `Step ${val}`}
                                                        />
                                                        <Group grow gap="xs">
                                                            <ActionIcon
                                                                variant="light"
                                                                color="yellow"
                                                                onClick={() => { setIsPlaying(false); setCurrentStep(0); }}
                                                                disabled={currentStep === 0}
                                                                title="Jump to start"
                                                            >
                                                                <Text size="xs">|&lt;</Text>
                                                            </ActionIcon>
                                                            <ActionIcon
                                                                variant="light"
                                                                color="yellow"
                                                                onClick={stepBackward}
                                                                disabled={currentStep === 0}
                                                                title="Step backward"
                                                            >
                                                                <Text size="xs">&lt;</Text>
                                                            </ActionIcon>
                                                            <ActionIcon
                                                                variant={isPlaying ? "filled" : "light"}
                                                                color="yellow"
                                                                onClick={togglePlayPause}
                                                                title={isPlaying ? "Pause" : "Play"}
                                                            >
                                                                <Text size="xs">{isPlaying ? "||" : ">"}</Text>
                                                            </ActionIcon>
                                                            <ActionIcon
                                                                variant="light"
                                                                color="yellow"
                                                                onClick={stepForward}
                                                                disabled={currentStep >= maxStep}
                                                                title="Step forward"
                                                            >
                                                                <Text size="xs">&gt;</Text>
                                                            </ActionIcon>
                                                            <ActionIcon
                                                                variant="light"
                                                                color="yellow"
                                                                onClick={() => { setIsPlaying(false); setCurrentStep(maxStep); }}
                                                                disabled={currentStep >= maxStep}
                                                                title="Jump to end"
                                                            >
                                                                <Text size="xs">&gt;|</Text>
                                                            </ActionIcon>
                                                        </Group>
                                                        <Text size="xs" c="dimmed">Delay: {stepDelay}ms</Text>
                                                        <Slider
                                                            min={50}
                                                            max={2000}
                                                            step={50}
                                                            value={stepDelay}
                                                            onChange={setStepDelay}
                                                            size="sm"
                                                            label={(val) => `${val}ms`}
                                                        />
                                                        {steppedResult?.error && (
                                                            <Button
                                                                color="red"
                                                                variant="light"
                                                                size="compact-xs"
                                                                fullWidth
                                                                onClick={() => setErrorModalOpen(true)}
                                                            >
                                                                Show Error
                                                            </Button>
                                                        )}
                                                        <Button
                                                            color="red"
                                                            variant="light"
                                                            size="compact-xs"
                                                            fullWidth
                                                            onClick={exitAnimation}
                                                        >
                                                            Exit Step-Through
                                                        </Button>
                                                    </>
                                                )}
                                            </Stack>
                                        )}
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
                                <Switch
                                    size="xs"
                                    label="Offset distances"
                                    checked={debug.showOffsetDistances}
                                    onChange={() => toggleDebug("showOffsetDistances")}
                                />
                                <Switch
                                    size="xs"
                                    label="Unresolved edges"
                                    checked={debug.showUnresolvedEdges}
                                    onChange={() => toggleDebug("showUnresolvedEdges")}
                                />
                                <Switch
                                    size="xs"
                                    label="Edge directions"
                                    checked={debug.showEdgeDirections}
                                    onChange={() => toggleDebug("showEdgeDirections")}
                                />

                                <Switch
                                    size="xs"
                                    label="Sweep event details"
                                    checked={debug.showSweepEventDetails}
                                    onChange={() => toggleDebug("showSweepEventDetails")}
                                />

                                <Text size="xs" c="dimmed" fw={600} mt={4}>Collision Sweep</Text>
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="cyan"
                                    fullWidth
                                    disabled={!showSkeleton}
                                    onClick={sweepAllPrimaryInit}
                                >
                                    Sweep Primary (Init)
                                </Button>
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="cyan"
                                    fullWidth
                                    disabled={!solverContext}
                                    onClick={sweepAllPrimaryFull}
                                >
                                    Sweep Primary (At Termination)
                                </Button>
                                <Button
                                    size="compact-xs"
                                    variant="light"
                                    color="gray"
                                    fullWidth
                                    disabled={!collisionSweepLines}
                                    onClick={() => setCollisionSweepLines(null)}
                                >
                                    Clear Sweep
                                </Button>
                                    </Stack>
                                </Collapse>
                            </Stack>
                        </Paper>
                    </Stack>
                    </ScrollArea>
                </Group>
            </AppShell.Main>

            <Modal
                opened={errorModalOpen}
                onClose={() => setErrorModalOpen(false)}
                title="Skeleton Computation Error"
                centered
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm">
                        The straight skeleton algorithm encountered an error and could not
                        complete. The partial result up to the point of failure is shown
                        on the canvas.
                    </Text>
                    <Paper p="sm" withBorder style={{fontFamily: "monospace"}}>
                        <Text size="xs" c="red" style={{whiteSpace: "pre-wrap", wordBreak: "break-word"}}>
                            {steppedResult?.error}
                        </Text>
                    </Paper>
                    <Text size="xs" c="dimmed">
                        Steps completed: {maxStep} (including partial state at failure)
                    </Text>
                    <Button onClick={() => setErrorModalOpen(false)} fullWidth>
                        Dismiss
                    </Button>
                </Stack>
            </Modal>
        </AppShell>
    );
}
