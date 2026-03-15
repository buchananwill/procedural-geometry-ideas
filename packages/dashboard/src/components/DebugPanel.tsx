import { useState } from "react";
import {
    Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse, Switch,
} from "@mantine/core";
import type { StraightSkeletonSolverContext } from "@proc-geo/core";
import type { DebugDisplayOptions, CollisionSweepLine } from "../types";

interface DebugPanelProps {
    debug: DebugDisplayOptions;
    toggleDebug: (key: keyof DebugDisplayOptions) => void;
    showSkeleton: boolean;
    solverContext: StraightSkeletonSolverContext | null;
    collisionSweepLines: CollisionSweepLine[] | null;
    onClearSweep: () => void;
    onSweepPrimaryInit: () => void;
    onSweepPrimaryFull: () => void;
}

export default function DebugPanel({
    debug,
    toggleDebug,
    showSkeleton,
    solverContext,
    collisionSweepLines,
    onClearSweep,
    onSweepPrimaryInit,
    onSweepPrimaryFull,
}: DebugPanelProps) {
    const [debugOpen, setDebugOpen] = useState(false);

    return (
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
                            label="Parent edges"
                            checked={debug.showParentEdges}
                            onChange={() => toggleDebug("showParentEdges")}
                        />

                        <Switch
                            size="xs"
                            label="Sweep event details"
                            checked={debug.showSweepEventDetails}
                            onChange={() => toggleDebug("showSweepEventDetails")}
                        />

                        <Text size="xs" c="dimmed" fw={600} mt={4}>Collision Sweep</Text>
                        <Switch
                            size="xs"
                            label="Collision sweep"
                            checked={debug.showCollisionSweep}
                            onChange={() => toggleDebug("showCollisionSweep")}
                        />
                        <Button
                            size="compact-xs"
                            variant="light"
                            color="cyan"
                            fullWidth
                            disabled={!showSkeleton}
                            onClick={onSweepPrimaryInit}
                        >
                            Sweep Primary (Init)
                        </Button>
                        <Button
                            size="compact-xs"
                            variant="light"
                            color="cyan"
                            fullWidth
                            disabled={!solverContext}
                            onClick={onSweepPrimaryFull}
                        >
                            Sweep Primary (At Termination)
                        </Button>
                        <Button
                            size="compact-xs"
                            variant="light"
                            color="gray"
                            fullWidth
                            disabled={!collisionSweepLines}
                            onClick={onClearSweep}
                        >
                            Clear Sweep
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
