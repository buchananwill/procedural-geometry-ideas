import { useState } from 'react';
import { Button, Collapse, Group, Paper, Select, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { makeVertexRun, serialiseGeometryPayload } from '@proc-geo/core';
import type { Vector2 } from '@proc-geo/core';
import CollapseChevron from './CollapseChevron';
import { FIXTURE_OPTION_GROUPS } from './fixture-options';
import { interpretGeometryPaste } from './geometry-clipboard';
import { usePolygonStore } from '../stores/usePolygonStore';
import { useRecursiveSubdivisionStore } from '../stores/useRecursiveSubdivisionStore';

/**
 * Where the polygon this page subdivides comes from — a fixture, the clipboard, or the skeleton
 * page's own editor.
 *
 * THE PAGE WAS FIXTURES-ONLY, and journal decision 97 names that the omission being corrected: a
 * recursion that can only be run on the corpus cannot be pointed at the shape a reader is actually
 * asking about. The affordances here are the SKELETON PAGE'S, reached the same way — the identical
 * `interpretGeometryPaste` and the identical `serialiseGeometryPayload`, so a polygon copied from one
 * page pastes into the other with no format to reconcile.
 *
 * FULL VERTEX EDITING IS BORROWED, NOT REBUILT. Dragging a vertex needs an interaction overlay over
 * the canvas, and the recursive canvas deliberately has none — it draws a tree, not an editable ring.
 * Rather than grow a second editor here, this panel takes the polygon the straight-skeleton page's
 * editor is holding, which is the one place in the app where a vertex can be dragged, inserted and
 * deleted. Edit there, bring it here, subdivide it.
 *
 * Whatever the source, the polygon goes through EXACTLY the pipeline a fixture goes through: the page
 * calls `subdivideRecursively` on it and on nothing else. An editing affordance that took its own
 * route through the driver would show a picture the corpus never produces.
 */

export default function RecursivePolygonPanel() {
    const [opened, setOpened] = useState(true);
    const [pasted, setPasted] = useState<'ok' | 'fail' | null>(null);
    const [copied, setCopied] = useState(false);

    const fixtureName = useRecursiveSubdivisionStore((s) => s.fixtureName);
    const setFixtureName = useRecursiveSubdivisionStore((s) => s.setFixtureName);
    const customVertices = useRecursiveSubdivisionStore((s) => s.customVertices);
    const setCustomVertices = useRecursiveSubdivisionStore((s) => s.setCustomVertices);
    const clearCustomVertices = useRecursiveSubdivisionStore((s) => s.clearCustomVertices);

    const editorVertices = usePolygonStore((s) => s.vertices);

    function flash(outcome: 'ok' | 'fail') {
        setPasted(outcome);
        setTimeout(() => setPasted(null), 1500);
    }

    function pasteVerticesFromClipboard() {
        navigator.clipboard.readText().then((text) => {
            const outcome = interpretGeometryPaste(text);
            if (!outcome.ok) {
                flash('fail');
                notifications.show({ color: 'red', title: outcome.title, message: outcome.message });
                return;
            }
            setCustomVertices(outcome.vertices);
            flash('ok');
            if (outcome.note !== null) {
                notifications.show({
                    color: 'yellow',
                    title: 'Pasted with an assumption',
                    message: outcome.note,
                });
            }
        }).catch((error: unknown) => {
            flash('fail');
            notifications.show({
                color: 'red',
                title: 'Clipboard unavailable',
                message: error instanceof Error ? error.message : 'The clipboard could not be read.',
            });
        });
    }

    function copyVerticesToClipboard(vertices: Vector2[]) {
        const json = serialiseGeometryPayload(makeVertexRun(vertices, true), { indent: 2 });
        navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }).catch(() => {
            notifications.show({
                color: 'red',
                title: 'Clipboard unavailable',
                message: 'The clipboard could not be written to.',
            });
        });
    }

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={() => setOpened((o) => !o)}>
                    <Group justify="space-between">
                        <Title order={5}>Polygon</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="xs">
                        <Select
                            size="xs"
                            label="Fixture"
                            data={FIXTURE_OPTION_GROUPS}
                            value={customVertices === null ? fixtureName : null}
                            placeholder="A pasted polygon is in front of the fixtures"
                            searchable
                            allowDeselect={false}
                            onChange={(value) => setFixtureName(value ?? fixtureName)}
                        />

                        <Text size="xs" c={customVertices === null ? 'dimmed' : 'yellow'}>
                            {customVertices === null
                                ? `Subdividing the fixture “${fixtureName}”.`
                                : `Subdividing a pasted polygon of ${customVertices.length} vertices.`}
                        </Text>

                        <Button size="xs" variant="light" color="teal" fullWidth onClick={pasteVerticesFromClipboard}>
                            {pasted === 'ok' ? 'Pasted!' : pasted === 'fail' ? 'Rejected' : 'Paste Vertices'}
                        </Button>

                        <Button
                            size="xs"
                            variant="light"
                            color="teal"
                            fullWidth
                            onClick={() => copyVerticesToClipboard(customVertices ?? [])}
                            disabled={customVertices === null}
                        >
                            {copied ? 'Copied!' : 'Copy Pasted Vertices'}
                        </Button>

                        {/* The bridge to the one editor in the app that can drag a vertex. */}
                        <Button
                            size="xs"
                            variant="light"
                            fullWidth
                            onClick={() => setCustomVertices(editorVertices)}
                            disabled={editorVertices.length < 3}
                        >
                            Take polygon from the Straight Skeleton editor ({editorVertices.length})
                        </Button>

                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            fullWidth
                            onClick={clearCustomVertices}
                            disabled={customVertices === null}
                        >
                            Back to the fixture
                        </Button>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
