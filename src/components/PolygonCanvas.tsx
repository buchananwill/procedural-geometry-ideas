"use client";

import { useCallback, useMemo, useRef } from "react";
import { Stage, Layer, Line, Circle } from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import { usePolygonStore, Vertex } from "@/stores/usePolygonStore";
import type { StraightSkeletonGraph } from "@/algorithms/straight-skeleton/types";
import type { PrimaryInteriorEdge } from "@/algorithms/straight-skeleton/algorithm";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
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

interface PolygonCanvasProps {
  skeleton: StraightSkeletonGraph | null;
  primaryEdges?: PrimaryInteriorEdge[];
}

export default function PolygonCanvas({ skeleton, primaryEdges }: PolygonCanvasProps) {
  const vertices = usePolygonStore((s) => s.vertices);
  const moveVertex = usePolygonStore((s) => s.moveVertex);
  const addVertex = usePolygonStore((s) => s.addVertex);
  const selectedVertex = usePolygonStore((s) => s.selectedVertex);
  const setSelectedVertex = usePolygonStore((s) => s.setSelectedVertex);
  const stageRef = useRef<ReturnType<typeof Stage> | null>(null);

  const flatPoints = vertices.flatMap((v) => [v.x, v.y]);

  const skeletonLines = useMemo(() => {
    if (!skeleton) return [];
    return skeleton.interiorEdges.flatMap(({ id }) => {
      const edge = skeleton.edges[id];
      if (edge.target === undefined) return [];
      const src = skeleton.nodes[edge.source];
      const tgt = skeleton.nodes[edge.target];
      return [{ key: id, points: [src.position.x, src.position.y, tgt.position.x, tgt.position.y] }];
    });
  }, [skeleton]);

  const handleDragMove = useCallback(
    (index: number, e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      moveVertex(index, node.x(), node.y());
    },
    [moveVertex]
  );

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // Only handle clicks on the stage/line, not on vertices
      if (e.target.getClassName() === "Circle") return;

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Find closest edge
      let bestDist = Infinity;
      let bestIndex = -1;
      let bestPoint: Vertex = { x: 0, y: 0 };

      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const result = distanceToSegment(pos.x, pos.y, a.x, a.y, b.x, b.y);
        if (result.distance < bestDist) {
          bestDist = result.distance;
          bestIndex = i + 1;
          bestPoint = result.point;
        }
      }

      if (bestDist < EDGE_HIT_DISTANCE) {
        addVertex(bestIndex, bestPoint);
      } else {
        setSelectedVertex(null);
      }
    },
    [vertices, addVertex, setSelectedVertex]
  );

  return (
    <Stage
      ref={stageRef as React.RefObject<never>}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={handleStageClick}
      style={{ background: "#1a1b1e", borderRadius: 8, cursor: "crosshair" }}
    >
      <Layer>
        {primaryEdges?.map((edge) => (
          <Line
            key={`primary-${edge.vertexIndex}`}
            points={[edge.source.x, edge.source.y, edge.target.x, edge.target.y]}
            stroke="#be4bdb"
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
          />
        ))}
        {skeletonLines.map(({ key, points }) => (
          <Line key={key} points={points} stroke="#fab005" strokeWidth={1.5} listening={false} />
        ))}
        <Line
          points={flatPoints}
          closed
          stroke="#4c6ef5"
          strokeWidth={2}
          fill="rgba(76, 110, 245, 0.1)"
        />
        {vertices.map((v, i) => (
          <Circle
            key={i}
            x={v.x}
            y={v.y}
            radius={VERTEX_RADIUS}
            fill={selectedVertex === i ? "#ff6b6b" : "#4c6ef5"}
            stroke="#fff"
            strokeWidth={2}
            draggable
            onDragMove={(e) => handleDragMove(i, e)}
            onClick={(e) => {
              e.cancelBubble = true;
              setSelectedVertex(i);
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "grab";
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "crosshair";
            }}
            onDragStart={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "grabbing";
            }}
            onDragEnd={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "grab";
            }}
          />
        ))}
      </Layer>
    </Stage>
  );
}
