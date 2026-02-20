"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { AppShell, Group, Title, Button, Text, Stack, Paper } from "@mantine/core";
import { usePolygonStore } from "@/stores/usePolygonStore";
import { computeStraightSkeleton } from "@/algorithms/straight-skeleton/algorithm";
import type { StraightSkeletonGraph } from "@/algorithms/straight-skeleton/types";

const PolygonCanvas = dynamic(() => import("@/components/PolygonCanvas"), {
  ssr: false,
});

export default function Home() {
  const vertices = usePolygonStore((s) => s.vertices);
  const vertexCount = vertices.length;
  const resetPolygon = usePolygonStore((s) => s.resetPolygon);
  const selectedVertex = usePolygonStore((s) => s.selectedVertex);
  const removeVertex = usePolygonStore((s) => s.removeVertex);

  const [showSkeleton, setShowSkeleton] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyVerticesToClipboard() {
    const json = JSON.stringify(vertices.map(({ x, y }) => ({ x, y })), null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const skeleton = useMemo<StraightSkeletonGraph | null>(() => {
    if (!showSkeleton) return null;
    try { return computeStraightSkeleton(vertices); }
    catch { return null; }
  }, [showSkeleton, vertices]);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={3}>Procedural Geometry</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Group align="flex-start" gap="md">
          <PolygonCanvas skeleton={skeleton} />

          <Stack w={240} gap="sm">
            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Title order={5}>Controls</Title>
                <Text size="sm" c="dimmed">
                  Vertices: {vertexCount}
                </Text>
                <Button onClick={resetPolygon} variant="light" fullWidth>
                  Reset Polygon
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
              </Stack>
            </Paper>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Title order={5}>Instructions</Title>
                <Text size="sm" c="dimmed">
                  Drag vertices to reshape the polygon. Click on an edge to add
                  a new vertex. Select a vertex and use Delete to remove it.
                </Text>
              </Stack>
            </Paper>

            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Title order={5}>Algorithms</Title>
                <Button
                  color="orange"
                  variant={showSkeleton ? "filled" : "light"}
                  fullWidth
                  onClick={() => setShowSkeleton((s) => !s)}
                >
                  {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Group>
      </AppShell.Main>
    </AppShell>
  );
}
