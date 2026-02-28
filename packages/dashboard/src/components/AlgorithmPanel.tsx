import { useState } from "react";
import {
    Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse,
    Slider, ActionIcon, Modal,
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
        steppedResult,
        currentStep, setCurrentStep,
        isPlaying, setIsPlaying,
        stepDelay, setStepDelay,
        errorModalOpen, setErrorModalOpen,
        maxStep,
        startAnimation,
        togglePlayPause,
        stepForward,
        stepBackward,
        exitAnimation,
    } = animation;

    return (
        <>
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
        </>
    );
}
