import { useState, useRef, useEffect } from 'react';
import {
    Paper, Stack, UnstyledButton, Text, Group, Collapse, List, Title,
} from '@mantine/core';
import CollapseChevron from '../CollapseChevron';

export default function DolInstructionsPanel() {
    const [opened, setOpened] = useState(() => {
        try {
            return localStorage.getItem('dol-instructions-seen') === null;
        } catch {
            return true;
        }
    });
    const wasOpen = useRef(opened);

    useEffect(() => {
        if (opened) {
            try {
                localStorage.setItem('dol-instructions-seen', '1');
            } catch { /* ignore */ }
        }
    }, []);

    function handleToggle() {
        setOpened(o => {
            const next = !o;
            if (wasOpen.current && !next) {
                try {
                    localStorage.setItem('dol-instructions-seen', '1');
                } catch { /* ignore */ }
            }
            wasOpen.current = next;
            return next;
        });
    }

    return (
        <Paper p="md" withBorder>
            <Stack gap="xs">
                <UnstyledButton w="100%" onClick={handleToggle}>
                    <Group justify="space-between">
                        <Title order={5}>How D0L Systems Work</Title>
                        <CollapseChevron opened={opened} />
                    </Group>
                </UnstyledButton>
                <Collapse in={opened}>
                    <Stack gap="xs">
                        <Text size="sm">
                            A D0L (deterministic, context-free Lindenmayer) system generates geometry by
                            rewriting a short starting word (the axiom) generation by generation using
                            production rules. Each letter in the word is replaced simultaneously by its
                            rule's expansion.
                        </Text>
                        <Text size="xs" fw={600} mt="xs">
                            A D0L configuration has three parts:
                        </Text>
                        <List size="sm" spacing="xs">
                            <List.Item>
                                <Text size="sm" component="span"><Text component="span" size="sm" fw={700}>Alphabet</Text>: each
                                letter has a drawing meaning: a sequence of turtle keywords (F, +, -, [, ], f).
                                Letters without keywords are purely structural.</Text>
                            </List.Item>
                            <List.Item>
                                <Text size="sm" component="span"><Text component="span" size="sm" fw={700}>Production Rules</Text>: each
                                letter has one rule describing what replaces it next generation. A letter with
                                no rule rewrites to itself.</Text>
                            </List.Item>
                            <List.Item>
                                <Text size="sm" component="span"><Text component="span" size="sm" fw={700}>Turtle Parameters</Text>: Step
                                Length, Angle Delta, and Generation Scaling control how keywords become line
                                segments on the canvas.</Text>
                            </List.Item>
                        </List>
                        <Text size="xs" c="dimmed" mt="xs">
                            Tip: Edit the alphabet and productions, then press Generate to recompute. Load
                            a preset to start from a known working example.
                        </Text>
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}
