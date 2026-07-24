import { useState } from "react";
import {
    Paper, Stack, Title, Button, UnstyledButton, Text, Group, Collapse, Select,
} from "@mantine/core";
import { usePolygonStore } from "../stores/usePolygonStore";
import CollapseChevron from "./CollapseChevron";
import { ALL_TEST_POLYGONS } from "@proc-geo/test-fixtures";

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

    const [controlsOpen, setControlsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pasted, setPasted] = useState<"ok" | "fail" | null>(null);

    function copyVerticesToClipboard() {
        const json = JSON.stringify(vertices.map(({ x, y }) => ({ x, y })), null, 2);
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
                    return { x: obj.x, y: obj.y };
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

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setControlsOpen(o => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Edit Polygon</Title>
                        <CollapseChevron opened={controlsOpen} />
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
                        <Button onClick={onResetView} variant="light" color="cyan" fullWidth>
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
    );
}
