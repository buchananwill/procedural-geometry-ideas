import { useState } from "react";
import {
    Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse,
    Modal,
} from "@mantine/core";
import type { SkeletonAnimationState } from "../hooks/useSkeletonAnimation";

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
    } = animation;

    return (
        <>
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <UnstyledButton w="100%" onClick={() => setAlgorithmsOpen(o => !o)}>
                        <Group justify="space-between">
                            <Title order={5}>Algorithm</Title>
                            <Text size="xs" c="blue">{algorithmsOpen ? "\u25B2" : "\u25BC"}</Text>
                        </Group>
                    </UnstyledButton>
                    <Collapse in={algorithmsOpen}>
                        <Stack gap="xs">
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
