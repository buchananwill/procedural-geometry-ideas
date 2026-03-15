import {
    Paper, Group, ActionIcon, Slider, Text, Collapse, Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { PlaybackControllerState } from "../hooks/PlaybackControllerState";

interface PlaybackControllerProps {
    playback: PlaybackControllerState;
    color?: string;
}

export default function PlaybackController({
    playback,
    color = "teal",
}: PlaybackControllerProps) {
    const [opened, { toggle }] = useDisclosure(true);

    return (
        <div style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
        }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <Tooltip label={opened ? "Hide playback" : "Show playback"} position="left">
                    <ActionIcon
                        variant="filled"
                        color={color}
                        size="lg"
                        onClick={toggle}
                    >
                        <Text size="xs">{opened ? "\u25BC" : "\u25B2"}</Text>
                    </ActionIcon>
                </Tooltip>
            </div>

            <Collapse in={opened}>
                <Paper
                    withBorder
                    p="sm"
                    style={{ minWidth: 360, maxWidth: 500 }}
                >
                    <Text size="xs" c="dimmed" fw={600} mb={4}>
                        {playback.frameLabel}
                    </Text>
                    <Slider
                        min={0}
                        max={Math.max(playback.maxFrame, 0)}
                        step={1}
                        value={playback.currentFrame}
                        onChange={(val) => {
                            playback.pause();
                            playback.setCurrentFrame(val);
                        }}
                        size="sm"
                        color={color}
                        label={(val) => `${val}`}
                        mb="xs"
                    />
                    <Group grow gap="xs" mb="xs">
                        <ActionIcon
                            variant="light"
                            color={color}
                            onClick={() => { playback.pause(); playback.setCurrentFrame(0); }}
                            disabled={playback.currentFrame === 0}
                            title="Jump to start"
                        >
                            <Text size="xs">|&lt;</Text>
                        </ActionIcon>
                        <ActionIcon
                            variant="light"
                            color={color}
                            onClick={playback.stepBackward}
                            disabled={playback.currentFrame === 0}
                            title="Step backward"
                        >
                            <Text size="xs">&lt;</Text>
                        </ActionIcon>
                        <ActionIcon
                            variant={playback.isPlaying ? "filled" : "light"}
                            color={color}
                            onClick={playback.togglePlayPause}
                            title={playback.isPlaying ? "Pause" : "Play"}
                        >
                            <Text size="xs">{playback.isPlaying ? "||" : ">"}</Text>
                        </ActionIcon>
                        <ActionIcon
                            variant="light"
                            color={color}
                            onClick={playback.stepForward}
                            disabled={playback.currentFrame >= playback.maxFrame}
                            title="Step forward"
                        >
                            <Text size="xs">&gt;</Text>
                        </ActionIcon>
                        <ActionIcon
                            variant="light"
                            color={color}
                            onClick={() => { playback.pause(); playback.setCurrentFrame(playback.maxFrame); }}
                            disabled={playback.currentFrame >= playback.maxFrame}
                            title="Jump to end"
                        >
                            <Text size="xs">&gt;|</Text>
                        </ActionIcon>
                    </Group>
                    <Text size="xs" c="dimmed">Delay: {playback.playDelay}ms</Text>
                    <Slider
                        min={50}
                        max={2000}
                        step={50}
                        value={playback.playDelay}
                        onChange={playback.setPlayDelay}
                        size="sm"
                        color={color}
                        label={(val) => `${val}ms`}
                    />
                </Paper>
            </Collapse>
        </div>
    );
}
