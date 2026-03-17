import { useCallback, useRef } from 'react';
import {
    Stack, Text, Group, Pill, Box, Tooltip,
} from '@mantine/core';
import type { DolSymbol } from '@proc-geo/core';
import {
    DragDropProvider, DragOverlay, useDraggable, useDroppable, useDragOperation,
} from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { useSortable, isSortable } from '@dnd-kit/react/sortable';
import { useDolSystemStore } from '../../stores/useDolSystemStore';

const PALETTE_ORDER = ['F', 'f', '+', '-', '[', ']'] as const;

const KEYWORD_TOOLTIPS: Record<string, string> = {
    F: 'Draw forward',
    f: 'Move without drawing',
    '+': 'Turn left',
    '-': 'Turn right',
    '[': 'Push position',
    ']': 'Pop position',
};

function PalettePill({ symbol, hasTooltip }: { symbol: string; hasTooltip: boolean }) {
    const { ref, isDragSource } = useDraggable({
        id: `palette-${symbol}`,
        data: { symbol, source: 'palette' as const },
    });

    const pill = (
        <span ref={ref} style={{ display: 'inline-flex' }}>
            <Pill style={{ cursor: 'grab', opacity: isDragSource ? 0.4 : 1 }}>
                {symbol}
            </Pill>
        </span>
    );

    if (hasTooltip) {
        return <Tooltip label={KEYWORD_TOOLTIPS[symbol] || symbol}>{pill}</Tooltip>;
    }
    return pill;
}

function SortablePill({ id, symbol, index, group, onRemove }: {
    id: string;
    symbol: string;
    index: number;
    group: string;
    onRemove: () => void;
}) {
    const { ref, isDragSource } = useSortable({
        id,
        index,
        group,
        data: { symbol, source: 'row' as const },
    });

    return (
        <span ref={ref} style={{ display: 'inline-flex' }}>
            <Pill
                withRemoveButton
                onRemove={onRemove}
                style={{ cursor: 'grab', opacity: isDragSource ? 0.4 : 1 }}
            >
                {symbol}
            </Pill>
        </span>
    );
}

function DroppableRow({ rowId, children }: { rowId: string; children: React.ReactNode }) {
    const { ref, isDropTarget } = useDroppable({
        id: `row-${rowId}`,
        data: { rowId },
    });

    return (
        <Box
            ref={ref}
            style={{
                flex: 1,
                minHeight: 32,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 4,
                padding: 4,
                borderRadius: 4,
                border: isDropTarget
                    ? '1px dashed var(--mantine-color-blue-5)'
                    : '1px dashed var(--mantine-color-gray-4)',
            }}
        >
            {children}
        </Box>
    );
}

function VisualProductionRow({ label, rowId, rhs, onChange }: {
    label: string;
    rowId: string;
    rhs: DolSymbol[];
    onChange: (newRhs: DolSymbol[]) => void;
}) {
    const counterRef = useRef(0);
    const idsRef = useRef<string[]>([]);
    const prevRhsRef = useRef<DolSymbol[]>();

    // Regenerate IDs whenever the array reference changes (after reorder, insert, delete).
    // IDs stay stable during a drag (same render cycle, same refs) but change after
    // a drag completes (new rhs array reference), forcing dnd-kit to create fresh
    // sortable instances and avoiding the OptimisticSortingPlugin DOM desync.
    if (prevRhsRef.current !== rhs) {
        prevRhsRef.current = rhs;
        idsRef.current = rhs.map(() => `${rowId}-pill-${counterRef.current++}`);
    }

    const handleRemove = useCallback((index: number) => {
        onChange(rhs.filter((_, j) => j !== index));
    }, [rhs, onChange]);

    return (
        <Group gap="xs" align="center" wrap="nowrap">
            <Text size="xs" fw={600} style={{ width: 50, flexShrink: 0 }}>{label} &rarr;</Text>
            <DroppableRow rowId={rowId}>
                {rhs.length === 0 && (
                    <Text size="xs" c="dimmed" style={{ userSelect: 'none' }}>Drop symbols here</Text>
                )}
                {rhs.map((sym, i) => (
                    <SortablePill
                        key={idsRef.current[i]}
                        id={idsRef.current[i]}
                        symbol={sym}
                        index={i}
                        group={rowId}
                        onRemove={() => handleRemove(i)}
                    />
                ))}
            </DroppableRow>
        </Group>
    );
}

function OverlayContent() {
    const { source } = useDragOperation();
    if (!source) return null;
    const symbol = source.data?.symbol as string | undefined;
    if (!symbol) return null;
    return <Pill>{symbol}</Pill>;
}

export default function DolProductionComposer() {
    const config = useDolSystemStore((s) => s.config);
    const setProduction = useDolSystemStore((s) => s.setProduction);
    const setAxiom = useDolSystemStore((s) => s.setAxiom);

    const letters = Object.keys(config.alphabet);

    const getRowData = useCallback((rowId: string): { rhs: DolSymbol[]; setter: (newRhs: DolSymbol[]) => void } | null => {
        if (rowId === '__axiom__') {
            return { rhs: [...config.axiom], setter: setAxiom };
        }
        if (rowId in config.productions) {
            return { rhs: [...config.productions[rowId]], setter: (newRhs) => setProduction(rowId, newRhs) };
        }
        return null;
    }, [config.axiom, config.productions, setAxiom, setProduction]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        if (event.canceled) return;
        const { source, target } = event.operation;
        if (!source || !target) return;

        const sourceData = source.data as Record<string, unknown>;

        if (!isSortable(source)) {
            // Palette drag -> insert into a row
            const symbol = sourceData.symbol as string;
            if (!symbol) return;

            let targetGroup: string | undefined;
            let insertIndex: number;

            if (isSortable(target)) {
                targetGroup = target.sortable.group as string | undefined;
                insertIndex = target.sortable.index + 1;
            } else {
                // Dropped on the droppable row container
                const targetData = target.data as Record<string, unknown>;
                targetGroup = targetData.rowId as string | undefined;
                insertIndex = 0;
            }

            if (!targetGroup) return;
            const rowData = getRowData(targetGroup);
            if (!rowData) return;

            const newRhs = [...rowData.rhs];
            newRhs.splice(insertIndex, 0, symbol);
            rowData.setter(newRhs);
        } else {
            // Sortable reorder — use the underlying Sortable instance
            // which always has initialIndex, index, initialGroup, group.
            const sortable = source.sortable;
            const fromIndex = sortable.initialIndex;
            const toIndex = sortable.index;
            const fromGroup = sortable.initialGroup as string | undefined;
            const toGroup = sortable.group as string | undefined;

            // Only handle reorder within the same group
            if (!fromGroup || fromGroup !== toGroup) return;
            if (fromIndex === toIndex) return;

            const rowData = getRowData(fromGroup);
            if (!rowData) return;

            const newRhs = [...rowData.rhs];
            newRhs.splice(toIndex, 0, newRhs.splice(fromIndex, 1)[0]);
            rowData.setter(newRhs);
        }
    }, [getRowData]);

    return (
        <DragDropProvider onDragEnd={handleDragEnd}>
            <Stack gap="xs">
                <Text size="xs" c="dimmed">Drag symbols into rules below</Text>
                <Group gap={4} wrap="wrap">
                    {PALETTE_ORDER.map((kw) => (
                        <PalettePill key={kw} symbol={kw} hasTooltip={true} />
                    ))}
                    {letters.map((letter) => (
                        <PalettePill key={letter} symbol={letter} hasTooltip={false} />
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
            <DragOverlay dropAnimation={null}>
                <OverlayContent />
            </DragOverlay>
        </DragDropProvider>
    );
}
