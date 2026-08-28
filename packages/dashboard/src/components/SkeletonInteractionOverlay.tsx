import { useCallback } from 'react';
import { Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { usePolygonStore, Vertex } from '../stores/usePolygonStore';

const VERTEX_RADIUS = 8;
const EDGE_HIT_DISTANCE = 15;
const SKELETON_NODE_RADIUS = 4;
const SELECTED_NODE_RADIUS = 7;

function distanceToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
): { distance: number; point: Vertex } {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const distX = px - closestX;
    const distY = py - closestY;

    return {
        distance: Math.sqrt(distX * distX + distY * distY),
        point: { x: closestX, y: closestY },
    };
}

/**
 * The nodes drawn on top of each other at `origin`, in ascending id — the origin included.
 *
 * A near-degenerate boundary genuinely resolves to several distinct nodes inside a fraction of a
 * pixel; a rectangle whose walls almost meet at a point puts four there. They are correct geometry
 * rather than a solver defect (`graph-index-invariants.test.ts` in the core package is what asserts
 * the solver merges everything it should), but only the last one drawn can be clicked, so without
 * this the ones underneath are unreachable and the user cannot inspect what the picture is showing.
 *
 * THE RADIUS IS THE DRAWN ONE, so the cluster is exactly the set a click cannot tell apart.
 */
function stackedNodeIds(
    positions: Array<{ id: number; x: number; y: number }>,
    origin: { x: number; y: number },
    radius: number,
): number[] {
    return positions
        .filter(node => Math.hypot(node.x - origin.x, node.y - origin.y) <= radius)
        .map(node => node.id)
        .sort((first, second) => first - second);
}

export interface SkeletonInteractionOverlayProps {
    invScale: number;
    selectedDebugNodes: Set<number>;
    onToggleDebugNode: (nodeId: number) => void;
    skeletonNodePositions: Array<{ id: number; x: number; y: number }>;
    showSkeletonNodes: boolean;
}

export function SkeletonInteractionOverlay({
    invScale,
    selectedDebugNodes,
    onToggleDebugNode,
    skeletonNodePositions,
    showSkeletonNodes,
}: SkeletonInteractionOverlayProps) {
    const vertices = usePolygonStore((s) => s.vertices);
    const selectedVertex = usePolygonStore((s) => s.selectedVertex);
    const moveVertex = usePolygonStore((s) => s.moveVertex);
    const setSelectedVertex = usePolygonStore((s) => s.setSelectedVertex);

    const handleDragMove = useCallback(
        (index: number, e: KonvaEventObject<DragEvent>) => {
            const node = e.target;
            moveVertex(index, node.x(), node.y());
        },
        [moveVertex]
    );

    /**
     * Advance the selection through the nodes stacked where the click landed.
     *
     * The cycle has one more stop than the cluster has nodes: first click takes the lowest id, each
     * further click hands the selection to the next, and the click after the last clears it. A
     * cluster of one is therefore the plain toggle this used to be, unchanged.
     */
    const handleSkeletonNodeClick = useCallback(
        (clicked: { id: number; x: number; y: number }) => {
            const cluster = stackedNodeIds(skeletonNodePositions, clicked, SKELETON_NODE_RADIUS * invScale);
            if (cluster.length <= 1) {
                onToggleDebugNode(clicked.id);
                return;
            }

            const selectedAt = cluster.findIndex(id => selectedDebugNodes.has(id));
            if (selectedAt === -1) {
                onToggleDebugNode(cluster[0]);
                return;
            }

            onToggleDebugNode(cluster[selectedAt]);
            if (selectedAt + 1 < cluster.length) {
                onToggleDebugNode(cluster[selectedAt + 1]);
            }
        },
        [skeletonNodePositions, invScale, selectedDebugNodes, onToggleDebugNode]
    );

    return (
        <>
            {/* Clickable skeleton node circles */}
            {showSkeletonNodes && skeletonNodePositions.map(({ id, x, y }) => {
                const isSelected = selectedDebugNodes.has(id);
                return (
                    <Circle
                        key={`sn-${id}`}
                        x={x}
                        y={y}
                        radius={(isSelected ? SELECTED_NODE_RADIUS : SKELETON_NODE_RADIUS) * invScale}
                        fill={isSelected ? '#ff6b6b' : '#fab005'}
                        stroke={isSelected ? '#fff' : undefined}
                        strokeWidth={isSelected ? 1.5 * invScale : 0}
                        onClick={(e) => {
                            e.cancelBubble = true;
                            handleSkeletonNodeClick({ id, x, y });
                        }}
                        onMouseEnter={(e) => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'pointer';
                        }}
                        onMouseLeave={(e) => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = 'crosshair';
                        }}
                    />
                );
            })}

            {/* Draggable vertex circles */}
            {vertices.map((v, i) => (
                <Circle
                    key={`v-${i}`}
                    x={v.x}
                    y={v.y}
                    radius={VERTEX_RADIUS * invScale}
                    fill={selectedVertex === i ? '#ff6b6b' : '#4c6ef5'}
                    stroke="#fff"
                    strokeWidth={2 * invScale}
                    draggable
                    onDragMove={(e) => handleDragMove(i, e)}
                    onClick={(e) => {
                        e.cancelBubble = true;
                        setSelectedVertex(i);
                    }}
                    onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grab';
                    }}
                    onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'crosshair';
                    }}
                    onDragStart={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grabbing';
                    }}
                    onDragEnd={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grab';
                    }}
                />
            ))}
        </>
    );
}

export function useSkeletonStageClick({ vertices, invScale }: {
    vertices: Vertex[];
    invScale: number;
}): (logicalPos: { x: number; y: number }) => void {
    const addVertex = usePolygonStore((s) => s.addVertex);
    const setSelectedVertex = usePolygonStore((s) => s.setSelectedVertex);

    return useCallback(
        (logicalPos: { x: number; y: number }) => {
            let bestDist = Infinity;
            let bestIndex = -1;
            let bestPoint: Vertex = { x: 0, y: 0 };

            for (let i = 0; i < vertices.length; i++) {
                const a = vertices[i];
                const b = vertices[(i + 1) % vertices.length];
                const result = distanceToSegment(logicalPos.x, logicalPos.y, a.x, a.y, b.x, b.y);
                if (result.distance < bestDist) {
                    bestDist = result.distance;
                    bestIndex = i + 1;
                    bestPoint = result.point;
                }
            }

            if (bestDist < EDGE_HIT_DISTANCE * invScale) {
                addVertex(bestIndex, bestPoint);
            } else {
                setSelectedVertex(null);
            }
        },
        [vertices, invScale, addVertex, setSelectedVertex]
    );
}
