import { useCallback } from 'react';
import { Circle } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import { usePolygonStore, Vertex } from '../stores/usePolygonStore';

const VERTEX_RADIUS = 8;
const EDGE_HIT_DISTANCE = 15;

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
                        radius={(isSelected ? 7 : 4) * invScale}
                        fill={isSelected ? '#ff6b6b' : '#fab005'}
                        stroke={isSelected ? '#fff' : undefined}
                        strokeWidth={isSelected ? 1.5 * invScale : 0}
                        onClick={(e) => {
                            e.cancelBubble = true;
                            onToggleDebugNode(id);
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

export function useSkeletonStageClick(params: {
    vertices: Vertex[];
    invScale: number;
}): (logicalPos: { x: number; y: number }) => void {
    const addVertex = usePolygonStore((s) => s.addVertex);
    const setSelectedVertex = usePolygonStore((s) => s.setSelectedVertex);

    return useCallback(
        (logicalPos: { x: number; y: number }) => {
            const { vertices, invScale } = params;
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
        [params.vertices, params.invScale, addVertex, setSelectedVertex]
    );
}
