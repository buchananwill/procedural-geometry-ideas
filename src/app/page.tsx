"use client";

import dynamic from "next/dynamic";
import { AppShell, Group, Title, Button, Text, Stack, Paper } from "@mantine/core";
import { usePolygonStore } from "@/stores/usePolygonStore";

const PolygonCanvas = dynamic(() => import("@/components/PolygonCanvas"), {
  ssr: false,
});

export default function Home() {
  const vertexCount = usePolygonStore((s) => s.vertices.length);
  const resetPolygon = usePolygonStore((s) => s.resetPolygon);
  const selectedVertex = usePolygonStore((s) => s.selectedVertex);
  const removeVertex = usePolygonStore((s) => s.removeVertex);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={3}>Procedural Geometry</Title>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Group align="flex-start" gap="md">
          <PolygonCanvas />

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
                <Text size="sm" c="dimmed">
                  Subdivision algorithms will be added here.
                </Text>
              </Stack>
            </Paper>
          </Stack>
        </Group>
      </AppShell.Main>
    </AppShell>
  );
}
