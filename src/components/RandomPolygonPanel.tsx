"use client";

import { useState } from "react";
import {
  Paper, Stack, Title, Button, Text, Slider, NumberInput,
  Group, Collapse,
} from "@mantine/core";
import { useRandomPolygonStore } from "@/stores/useRandomPolygonStore";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export default function RandomPolygonPanel() {
  const [opened, setOpened] = useState(false);
  const params = useRandomPolygonStore((s) => s.params);
  const generatorState = useRandomPolygonStore((s) => s.generatorState);
  const isStepMode = useRandomPolygonStore((s) => s.isStepMode);
  const setEdgeLengthParam = useRandomPolygonStore((s) => s.setEdgeLengthParam);
  const setAngleDeltaParam = useRandomPolygonStore((s) => s.setAngleDeltaParam);
  const setMaxEdges = useRandomPolygonStore((s) => s.setMaxEdges);
  const generateInstant = useRandomPolygonStore((s) => s.generateInstant);
  const startStepMode = useRandomPolygonStore((s) => s.startStepMode);
  const stepOnce = useRandomPolygonStore((s) => s.stepOnce);
  const finishStepMode = useRandomPolygonStore((s) => s.finishStepMode);
  const resetGenerator = useRandomPolygonStore((s) => s.resetGenerator);

  const isRunning = generatorState?.status === "running";

  return (
    <Paper p="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={5}>Random Polygon</Title>
          <Button
            variant="subtle"
            size="compact-xs"
            onClick={() => setOpened((o) => !o)}
          >
            {opened ? "\u25B2" : "\u25BC"}
          </Button>
        </Group>

        <Collapse in={opened}>
          <Stack gap="xs">
            <Text size="xs" c="dimmed" fw={600}>Edge Length</Text>
            <Text size="xs">Min: {Math.round(params.edgeLength.min)}</Text>
            <Slider min={5} max={200} step={1}
              value={params.edgeLength.min}
              onChange={(v) => setEdgeLengthParam("min", v)}
            />
            <Text size="xs">Max: {Math.round(params.edgeLength.max)}</Text>
            <Slider min={5} max={300} step={1}
              value={params.edgeLength.max}
              onChange={(v) => setEdgeLengthParam("max", v)}
            />
            <Text size="xs">Variance: {params.edgeLength.variance.toFixed(2)}</Text>
            <Slider min={0} max={1} step={0.05}
              value={params.edgeLength.variance}
              onChange={(v) => setEdgeLengthParam("variance", v)}
            />

            <Text size="xs" c="dimmed" fw={600} mt={4}>Angle Delta</Text>
            <Text size="xs">Min: {Math.round(params.angleDelta.min * RAD_TO_DEG)}&deg;</Text>
            <Slider min={-180} max={0} step={1}
              value={Math.round(params.angleDelta.min * RAD_TO_DEG)}
              onChange={(v) => setAngleDeltaParam("min", v * DEG_TO_RAD)}
            />
            <Text size="xs">Max: {Math.round(params.angleDelta.max * RAD_TO_DEG)}&deg;</Text>
            <Slider min={0} max={180} step={1}
              value={Math.round(params.angleDelta.max * RAD_TO_DEG)}
              onChange={(v) => setAngleDeltaParam("max", v * DEG_TO_RAD)}
            />
            <Text size="xs">Variance: {params.angleDelta.variance.toFixed(2)}</Text>
            <Slider min={0} max={1} step={0.05}
              value={params.angleDelta.variance}
              onChange={(v) => setAngleDeltaParam("variance", v)}
            />

            <Text size="xs" c="dimmed" fw={600} mt={4}>Max Edges</Text>
            <NumberInput min={3} max={200} step={1}
              value={params.maxEdges}
              onChange={(v) => setMaxEdges(typeof v === "number" ? v : 20)}
              size="xs"
            />

            <Button color="green" variant="light" fullWidth
              onClick={generateInstant}
              disabled={isStepMode}
            >
              Generate
            </Button>

            <Group grow>
              <Button color="blue" variant="light" size="compact-xs"
                onClick={startStepMode}
                disabled={isStepMode}
              >
                Start
              </Button>
              <Button color="blue" variant="light" size="compact-xs"
                onClick={stepOnce}
                disabled={!isRunning}
              >
                Step
              </Button>
              <Button color="blue" variant="light" size="compact-xs"
                onClick={finishStepMode}
                disabled={!isRunning}
              >
                Finish
              </Button>
            </Group>

            {isStepMode && (
              <Button color="red" variant="light" size="compact-xs" fullWidth
                onClick={resetGenerator}
              >
                Cancel
              </Button>
            )}

            {generatorState && (
              <Text size="xs" c="dimmed">
                Steps: {generatorState.stepCount} | Status: {generatorState.status}
              </Text>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
