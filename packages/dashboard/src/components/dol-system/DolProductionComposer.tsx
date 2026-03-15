import { useState, useRef, useCallback } from 'react';
import {
    Stack, Text, Group, Pill, Box, Tooltip,
} from '@mantine/core';
import type { DolSymbol } from '@proc-geo/core';
import { useDolSystemStore } from '../../stores/useDolSystemStore';

const KEYWORD_NAMES: readonly string[] = ['F', '+', '-', '[', ']', 'f'];

const KEYWORD_TOOLTIPS: Record<string, string> = {
    F: 'Draw forward',
    f: 'Move without drawing',
    '+': 'Turn left',
    '-': 'Turn right',
    '[': 'Push position',
    ']': 'Pop position',
};

interface DragPayload {
    source: 'palette' | 'row';
    symbol?: string;
    letter?: string;
    index?: number;
}

function makePaletteDragStart(symbol: string) {
    return (e: React.DragEvent) => {
        const payload: DragPayload = { source: 'palette', symbol };
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'copy';
    };
}

function computeInsertIndex(container: HTMLElement, clientX: number): number {
    const children = Array.from(container.querySelectorAll('[data-pill-index]'));
    for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        if (clientX < midpoint) return i;
    }
    return children.length;
}

function VisualProductionRow({ label, rowId, rhs, onChange }: {
    label: string;
    rowId: string;
    rhs: DolSymbol[];
    onChange: (newRhs: DolSymbol[]) => void;
}) {
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (containerRef.current) {
            setDragOverIndex(computeInsertIndex(containerRef.current, e.clientX));
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOverIndex(null);
        let payload: DragPayload;
        try {
            payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }

        // Fallback — containerRef is always populated during drag events
        const insertAt = containerRef.current
            ? computeInsertIndex(containerRef.current, e.clientX)
            : rhs.length;

        if (payload.source === 'palette' && payload.symbol) {
            const newRhs = [...rhs];
            newRhs.splice(insertAt, 0, payload.symbol);
            onChange(newRhs);
        // Cross-row pill moves are not supported — pills can only be reordered within their own row
        } else if (payload.source === 'row' && payload.letter === rowId && payload.index != null) {
            const oldIndex = payload.index;
            const newRhs = [...rhs];
            const [removed] = newRhs.splice(oldIndex, 1);
            const adjustedInsert = insertAt > oldIndex ? insertAt - 1 : insertAt;
            newRhs.splice(adjustedInsert, 0, removed);
            onChange(newRhs);
        }
    }, [rowId, rhs, onChange]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
            setDragOverIndex(null);
        }
    }, []);

    const handleRemove = useCallback((index: number) => {
        onChange(rhs.filter((_, j) => j !== index));
    }, [rhs, onChange]);

    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <Text size="xs" fw={600} style={{ width: 50, flexShrink: 0 }}>{label} &rarr;</Text>
            <Box
                ref={containerRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragLeave={handleDragLeave}
                style={{
                    flex: 1,
                    minHeight: 32,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 4,
                    padding: 4,
                    borderRadius: 4,
                    border: dragOverIndex != null
                        ? '1px dashed var(--mantine-color-blue-5)'
                        : '1px dashed var(--mantine-color-gray-4)',
                    position: 'relative',
                }}
            >
                {rhs.length === 0 && dragOverIndex == null && (
                    <Text size="xs" c="dimmed" style={{ userSelect: 'none' }}>Drop symbols here</Text>
                )}
                {rhs.map((sym, i) => (
                    <span key={`${i}-${sym}`} style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                        {dragOverIndex === i && (
                            <span style={{
                                width: 2,
                                height: 20,
                                backgroundColor: 'var(--mantine-color-blue-5)',
                                marginRight: 2,
                                borderRadius: 1,
                                flexShrink: 0,
                            }} />
                        )}
                        <Pill
                            data-pill-index={i}
                            withRemoveButton
                            onRemove={() => handleRemove(i)}
                            draggable
                            onDragStart={(e: React.DragEvent) => {
                                const payload: DragPayload = { source: 'row', letter: rowId, index: i };
                                e.dataTransfer.setData('text/plain', JSON.stringify(payload));
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            style={{ cursor: 'grab' }}
                        >
                            {sym}
                        </Pill>
                    </span>
                ))}
                {dragOverIndex != null && dragOverIndex >= rhs.length && (
                    <span style={{
                        width: 2,
                        height: 20,
                        backgroundColor: 'var(--mantine-color-blue-5)',
                        marginLeft: 2,
                        borderRadius: 1,
                        flexShrink: 0,
                    }} />
                )}
            </Box>
        </Group>
    );
}

export default function DolProductionComposer() {
    const config = useDolSystemStore((s) => s.config);
    const setProduction = useDolSystemStore((s) => s.setProduction);
    const setAxiom = useDolSystemStore((s) => s.setAxiom);

    const letters = Object.keys(config.alphabet);

    return (
        <Stack gap="xs">
            <Text size="xs" c="dimmed">Drag symbols into rules below</Text>
            <Group gap={4} wrap="wrap">
                {KEYWORD_NAMES.map((kw) => (
                    <Tooltip key={kw} label={KEYWORD_TOOLTIPS[kw] || kw}>
                        <Pill
                            draggable
                            onDragStart={makePaletteDragStart(kw)}
                            style={{ cursor: 'grab' }}
                        >
                            {kw}
                        </Pill>
                    </Tooltip>
                ))}
                {letters.map((letter) => (
                    <Pill
                        key={letter}
                        draggable
                        onDragStart={makePaletteDragStart(letter)}
                        style={{ cursor: 'grab' }}
                    >
                        {letter}
                    </Pill>
                ))}
            </Group>
            {Object.keys(config.productions).map((letter) => (
                <VisualProductionRow
                    key={letter}
                    label={letter}
                    rowId={letter}
                    rhs={config.productions[letter]}
                    onChange={(newRhs) => setProduction(letter, newRhs)}
                />
            ))}
            <Text size="xs" c="dimmed" fw={600} mt={4}>Axiom</Text>
            <VisualProductionRow
                label="Axiom"
                rowId="__axiom__"
                rhs={config.axiom}
                onChange={setAxiom}
            />
        </Stack>
    );
}
