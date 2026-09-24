import { useState } from "react";
import {
    Alert, Button, Collapse, Group, NumberInput, Paper, Stack, Text, Title, UnstyledButton,
} from "@mantine/core";
import { usePolygonStore } from "../stores/usePolygonStore";
import CollapseChevron from "./CollapseChevron";

/**
 * The smallest weight the editor will accept. A weight is a strictly positive speed (W-spec W2). The
 * solver's ratio bound is `maxWeightRatio(δ)` (about 1e8 at the library floor, C8 spec T22), far
 * beyond anything this floor and a typed weight reach, so the door refuses only pathological input.
 */
export const MIN_EDGE_WEIGHT = 0.01;

export interface EdgeWeightsPanelProps {
    /**
     * The solver's refusal message, shown verbatim above the editor (arc decision 130). It names the
     * offending edge or vertex, which is the index the user has to come back here and change, so it
     * belongs beside the inputs rather than in a modal they have to dismiss to act on it.
     */
    solveError?: string | null;
}

/**
 * Per-edge wavefront speeds, one numeric input per edge `i → i + 1` (arc decision 130).
 *
 * ALL ONES IS THE UNWEIGHTED SKELETON. The reset button puts the polygon back there in one click,
 * and loading a fixture or generating a random polygon does the same on its own, because a weight
 * that outlived the ring it was set on would be a speed change the user never asked for.
 */
export default function EdgeWeightsPanel({ solveError = null }: EdgeWeightsPanelProps) {
    const vertices = usePolygonStore((s) => s.vertices);
    const weights = usePolygonStore((s) => s.weights);
    const setEdgeWeight = usePolygonStore((s) => s.setEdgeWeight);
    const resetWeights = usePolygonStore((s) => s.resetWeights);

    const [opened, setOpened] = useState(false);

    const vertexCount = vertices.length;
    const allOnes = weights.every((weight) => weight === 1);

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened(o => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Edge Weights</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>

                {/* Outside the collapse: a refusal has to be visible whether the editor is open or
                    not, because while it stands the canvas is showing the LAST solution, not this
                    one. */}
                {solveError !== null && (
                    <Alert color="red" title="Solver refused the input">
                        <Text size="xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {solveError}
                        </Text>
                        <Text size="xs" c="dimmed" mt="xs">
                            The canvas is showing the last solution that solved.
                        </Text>
                    </Alert>
                )}

                <Collapse in={opened}>
                    <Stack gap="xs">
                        <Text size="sm" c="dimmed">
                            Wavefront speed of each edge. {allOnes
                                ? "All ones — the unweighted skeleton."
                                : "The ridge shifts towards the slower edges."}
                        </Text>
                        {weights.map((weight, index) => (
                            <NumberInput
                                key={index}
                                size="xs"
                                label={`Edge ${index} → ${(index + 1) % vertexCount}`}
                                min={MIN_EDGE_WEIGHT}
                                step={0.1}
                                decimalScale={4}
                                value={weight}
                                onChange={(v) => {
                                    if (typeof v === "number") setEdgeWeight(index, v);
                                }}
                            />
                        ))}
                        <Button
                            onClick={resetWeights}
                            variant="light"
                            fullWidth
                            disabled={allOnes}
                        >
                            Reset Weights to 1
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
