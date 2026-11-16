import { useState } from "react";
import {
    Alert, Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse,
    Modal,
} from "@mantine/core";
import type { SkeletonDiagnostic } from "@proc-geo/core";
import type { SkeletonAnimationState } from "../hooks/useSkeletonAnimation";
import { describeBlockingDiagnostics } from "../hooks/skeleton-solve-boundary";
import CollapseChevron from "./CollapseChevron";
import { isBlockingDiagnosticKind, SKELETON_INCOMPLETE_TITLE } from "./holed-fixture-text";

/**
 * One informational diagnostic of a holed solve, inside the collapse (dashboard holed-fixtures spec, decision 38): a
 * causality violation in yellow as `{oracle} at {elementId}: {detail}`, every other kind dimmed and verbatim.
 */
function InformationalDiagnostic({ diagnostic }: { diagnostic: SkeletonDiagnostic }) {
    if (diagnostic.kind === "causality-violation") {
        return (
            <Text size="xs" c="yellow" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {`${diagnostic.oracle} at ${diagnostic.elementId}: ${diagnostic.detail}`}
            </Text>
        );
    }
    return (
        <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {diagnostic.detail}
        </Text>
    );
}

interface AlgorithmPanelProps {
    animation: SkeletonAnimationState;
}

export default function AlgorithmPanel({ animation }: AlgorithmPanelProps) {
    const [algorithmsOpen, setAlgorithmsOpen] = useState(false);

    const {
        showSkeleton, setShowSkeleton,
        showPrimaryEdges, setShowPrimaryEdges,
        animationMode,
        hasError,
        errorMessage,
        errorModalOpen, setErrorModalOpen,
        playback,
        startAnimation,
        exitAnimation,
        holedSolve,
    } = animation;

    // A HOLED RESULT THE SOLVER DID NOT FINISH, OR DISTRUSTS (decisions 37, 39 and 52): stated outside the collapse,
    // over every frame of a step-through, so no picture of it reads as a finished skeleton.
    const incompleteText = holedSolve !== null && !holedSolve.complete
        ? describeBlockingDiagnostics(holedSolve.diagnostics) ?? "The holed solve reports complete: false."
        : null;
    const informational = holedSolve?.diagnostics.filter((d) => !isBlockingDiagnosticKind(d.kind)) ?? [];

    return (
        <>
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <UnstyledButton w="100%" onClick={() => setAlgorithmsOpen(o => !o)}>
                        <Group justify="space-between">
                            <Title order={5}>Algorithm</Title>
                            <CollapseChevron opened={algorithmsOpen} />
                        </Group>
                    </UnstyledButton>
                    {incompleteText !== null && (
                        <Alert color="orange" title={SKELETON_INCOMPLETE_TITLE}>
                            <Text size="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {incompleteText}
                            </Text>
                        </Alert>
                    )}
                    <Collapse in={algorithmsOpen}>
                        <Stack gap="xs">
                            {informational.length > 0 && (
                                <Stack gap={2}>
                                    <Text size="xs" c="dimmed" fw={600}>Holed solve reports</Text>
                                    {informational.map((diagnostic, index) => (
                                        <InformationalDiagnostic key={index} diagnostic={diagnostic} />
                                    ))}
                                </Stack>
                            )}
                            <Button
                                color="orange"
                                variant={showSkeleton ? "filled" : "light"}
                                fullWidth
                                onClick={() => setShowSkeleton((s: boolean) => !s)}
                            >
                                {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
                            </Button>
                            <Button
                                color="grape"
                                variant={showPrimaryEdges ? "filled" : "light"}
                                fullWidth
                                onClick={() => setShowPrimaryEdges((s: boolean) => !s)}
                            >
                                {showPrimaryEdges ? "Hide" : "Show"} Primary Interior Edges
                            </Button>
                            {(
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
                                            {hasError && (
                                                <Text size="xs" c="red" fw={600}>
                                                    {playback.frameLabel} (error)
                                                </Text>
                                            )}
                                            {hasError && (
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

            <Modal
                opened={errorModalOpen}
                onClose={() => setErrorModalOpen(false)}
                title={holedSolve !== null ? SKELETON_INCOMPLETE_TITLE : "Skeleton Computation Error"}
                centered
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm">
                        {holedSolve !== null
                            ? "The holed solve came back incomplete. Every frame of this step-through is of an "
                                + "unfinished or distrusted skeleton; the reasons are below."
                            : "The straight skeleton algorithm encountered an error and could not complete. The "
                                + "partial result up to the point of failure is shown on the canvas."}
                    </Text>
                    <Paper p="sm" withBorder style={{ fontFamily: "monospace" }}>
                        <Text size="xs" c="red" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {errorMessage}
                        </Text>
                    </Paper>
                    <Text size="xs" c="dimmed">
                        Steps completed: {playback.maxFrame} (including partial state at failure)
                    </Text>
                    <Button onClick={() => setErrorModalOpen(false)} fullWidth>
                        Dismiss
                    </Button>
                </Stack>
            </Modal>
        </>
    );
}
