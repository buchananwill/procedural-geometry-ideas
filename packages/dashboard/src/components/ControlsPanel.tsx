import { useState } from "react";
import {
    Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse, Select,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { makeVertexRun, serialiseGeometryPayload } from "@proc-geo/core";
import { usePolygonStore } from "../stores/usePolygonStore";
import CollapseChevron from "./CollapseChevron";
import { interpretGeometryPaste } from "./geometry-clipboard";
import { fixtureByName, holedFixtureByName, SKELETON_FIXTURE_OPTION_GROUPS } from "./fixture-options";
import { HOLED_COPY_DISABLED_TEXT, holedNoticeText } from "./holed-fixture-text";

interface ControlsPanelProps {
    onResetView: () => void;
}

export default function ControlsPanel({ onResetView }: ControlsPanelProps) {
    const vertices = usePolygonStore((s) => s.vertices);
    const vertexCount = vertices.length;
    const resetPolygon = usePolygonStore((s) => s.resetPolygon);
    const selectedVertex = usePolygonStore((s) => s.selectedVertex);
    const removeVertex = usePolygonStore((s) => s.removeVertex);
    const setVertices = usePolygonStore((s) => s.setVertices);
    const loadHoledFixture = usePolygonStore((s) => s.loadHoledFixture);
    const holeCount = usePolygonStore((s) => s.holes.length);
    const holedFixtureName = usePolygonStore((s) => s.holedFixtureName);
    const holed = holeCount > 0;

    const [controlsOpen, setControlsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pasted, setPasted] = useState<"ok" | "fail" | null>(null);

    function copyVerticesToClipboard() {
        // This store holds a closed region, so the payload says so.
        const json = serialiseGeometryPayload(makeVertexRun(vertices, true), { indent: 2 });
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    function pasteVerticesFromClipboard() {
        navigator.clipboard.readText().then((text) => {
            const outcome = interpretGeometryPaste(text);
            if (outcome.ok) {
                setVertices(outcome.vertices);
                setPasted("ok");
                if (outcome.note !== null) {
                    notifications.show({
                        color: "yellow",
                        title: "Pasted with an assumption",
                        message: outcome.note,
                    });
                }
            } else {
                setPasted("fail");
                notifications.show({ color: "red", title: outcome.title, message: outcome.message });
            }
            setTimeout(() => setPasted(null), 1500);
        }).catch((error: unknown) => {
            setPasted("fail");
            notifications.show({
                color: "red",
                title: "Clipboard unavailable",
                message: error instanceof Error ? error.message : "The clipboard could not be read.",
            });
            setTimeout(() => setPasted(null), 1500);
        });
    }

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setControlsOpen(o => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Edit Polygon</Title>
                        <CollapseChevron opened={controlsOpen} />
                    </Group>
                </UnstyledButton>
                {/* Outside the collapse: the holed state changes what every other control here does
                    (decision 6), so it is stated whether the panel is open or not. */}
                {holed && (
                    <Text size="xs" c="yellow">
                        {holedNoticeText(holedFixtureName ?? "", holeCount)}
                    </Text>
                )}
                <Collapse in={controlsOpen}>
                    <Stack gap="xs">
                        <Text size="sm" c="dimmed">
                            Vertices: {vertexCount}
                        </Text>
                        <Button onClick={resetPolygon} variant="light" fullWidth>
                            Reset Polygon
                        </Button>
                        <Button onClick={onResetView} variant="light" color="cyan" fullWidth>
                            Reset View
                        </Button>
                        <Button
                            onClick={copyVerticesToClipboard}
                            variant="light"
                            color="teal"
                            fullWidth
                            disabled={holed}
                        >
                            {copied ? "Copied!" : "Copy Vertices"}
                        </Button>
                        {holed && (
                            <Text size="xs" c="dimmed">
                                {HOLED_COPY_DISABLED_TEXT}
                            </Text>
                        )}
                        <Button
                            onClick={pasteVerticesFromClipboard}
                            variant="light"
                            color="teal"
                            fullWidth
                        >
                            {pasted === "ok" ? "Pasted!" : pasted === "fail" ? "Rejected" : "Paste Vertices"}
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
                            data={SKELETON_FIXTURE_OPTION_GROUPS}
                            value={null}
                            onChange={(name) => {
                                // A holed fixture loads its holes; any other fixture is a single loop (decision 9).
                                const holedFixture = holedFixtureByName(name);
                                if (holedFixture) {
                                    loadHoledFixture(holedFixture);
                                    return;
                                }
                                const poly = fixtureByName(name);
                                if (poly) setVertices(poly.vertices);
                            }}
                            searchable
                            clearable
                        />
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
