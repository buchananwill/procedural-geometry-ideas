"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Text, Arrow } from "react-konva";
import { KonvaEventObject } from "konva/lib/Node";
import { usePolygonStore, Vertex } from "@/stores/usePolygonStore";
import type {PrimaryInteriorEdge, StraightSkeletonGraph} from "@/algorithms/straight-skeleton/types";
import type { Vector2 } from "@/algorithms/straight-skeleton/types";

import type { DebugDisplayOptions, CollisionSweepLine } from "@/app/page";

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

function segmentLength(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  return { x: (ax + bx) / 2, y: (ay + by) / 2 };
}

interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Greedy label de-collision.  For each label (in order), if it overlaps any
 * already-placed label, nudge it downward until it no longer overlaps.
 * Mutates the rects in-place and returns the same array for convenience.
 * charW / lineH are approximate character width and line height in canvas units.
 */
function decollideLabels(rects: LabelRect[], padding: number): LabelRect[] {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    // Check against all previously placed labels, nudge until clear
    let attempts = 0;
    while (attempts < 40) {
      let overlaps = false;
      for (let j = 0; j < i; j++) {
        const o = rects[j];
        if (
          r.x < o.x + o.w + padding &&
          r.x + r.w + padding > o.x &&
          r.y < o.y + o.h + padding &&
          r.y + r.h + padding > o.y
        ) {
          // Nudge below the overlapping label
          r.y = o.y + o.h + padding;
          overlaps = true;
          break; // re-check from the start
        }
      }
      if (!overlaps) break;
      attempts++;
    }
  }
  return rects;
}

interface PolygonCanvasProps {
  skeleton: StraightSkeletonGraph | null;
  primaryEdges?: PrimaryInteriorEdge[];
  primaryEdgeIntersections?: Vector2[];
  stageScale: number;
  stagePosition: { x: number; y: number };
  onScaleChange: (scale: number) => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  debug: DebugDisplayOptions;
  selectedDebugNodes: Set<number>;
  onToggleDebugNode: (nodeId: number) => void;
  collisionSweepLines: CollisionSweepLine[] | null;
  nodeOffsetDistances: Map<number, number> | null;
}

export default function PolygonCanvas({
  skeleton,
  primaryEdges,
  primaryEdgeIntersections,
  stageScale,
  stagePosition,
  onScaleChange,
  onPositionChange,
  debug,
  selectedDebugNodes,
  onToggleDebugNode,
  collisionSweepLines,
  nodeOffsetDistances,
}: PolygonCanvasProps) {
  const vertices = usePolygonStore((s) => s.vertices);
  const moveVertex = usePolygonStore((s) => s.moveVertex);
  const addVertex = usePolygonStore((s) => s.addVertex);
  const selectedVertex = usePolygonStore((s) => s.selectedVertex);
  const setSelectedVertex = usePolygonStore((s) => s.setSelectedVertex);
  const stageRef = useRef<ReturnType<typeof Stage> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan tracking refs
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const invScale = 1 / stageScale;

  const flatPoints = vertices.flatMap((v) => [v.x, v.y]);

  /** Convert screen pointer position to logical canvas coordinates */
  const getLogicalPointerPosition = useCallback(
    (stage: { getPointerPosition: () => { x: number; y: number } | null }): Vertex | null => {
      const pos = stage.getPointerPosition();
      if (!pos) return null;
      return {
        x: (pos.x - stagePosition.x) / stageScale,
        y: (pos.y - stagePosition.y) / stageScale,
      };
    },
    [stageScale, stagePosition]
  );

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

  // Unresolved interior edges (no target set) — shown as fixed-length rays
  const UNRESOLVED_RAY_LENGTH = 100;
  const unresolvedEdges = useMemo(() => {
    if (!skeleton || !debug.showUnresolvedEdges) return [];
    return skeleton.interiorEdges.flatMap(({ id }) => {
      const edge = skeleton.edges[id];
      if (edge.target !== undefined) return [];
      const src = skeleton.nodes[edge.source];
      return [{
        key: `unresolved-${id}`,
        id,
        points: [
          src.position.x, src.position.y,
          src.position.x + edge.basisVector.x * UNRESOLVED_RAY_LENGTH,
          src.position.y + edge.basisVector.y * UNRESOLVED_RAY_LENGTH,
        ],
      }];
    });
  }, [skeleton, debug.showUnresolvedEdges]);

  // Edges connected to selected debug nodes
  const selectedNodeEdges = useMemo(() => {
    if (!skeleton || selectedDebugNodes.size === 0) return [];
    const edges: { key: string; points: number[]; length: number }[] = [];
    const seen = new Set<number>();

    for (const nodeId of selectedDebugNodes) {
      if (nodeId >= skeleton.nodes.length) continue;
      const node = skeleton.nodes[nodeId];
      for (const edgeId of [...node.inEdges, ...node.outEdges]) {
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);
        const edge = skeleton.edges[edgeId];
        if (edge.target === undefined) continue;
        const src = skeleton.nodes[edge.source];
        const tgt = skeleton.nodes[edge.target];
        const len = segmentLength(src.position.x, src.position.y, tgt.position.x, tgt.position.y);
        edges.push({
          key: `sel-${edgeId}`,
          points: [src.position.x, src.position.y, tgt.position.x, tgt.position.y],
          length: len,
        });
      }
    }
    return edges;
  }, [skeleton, selectedDebugNodes]);

  // De-collided positions for sweep labels
  const SWEEP_FONT = 14;      // canvas-unit font size before invScale
  const OFFSET_DIST_FONT = 15;
  const showDetails = debug.showSweepEventDetails;
  const sweepLabelTexts = useMemo(() => {
    if (!collisionSweepLines) return [];
    return collisionSweepLines.map((line) => {
      const base = `${line.offsetDistance.toFixed(1)} e${line.edgeIdA}\u00d7e${line.edgeIdB}`;
      if (!showDetails) return base;
      return `${base} ${line.eventType}\n${line.intersectionType} r1=${line.alongRay1.toFixed(1)} r2=${line.alongRay2.toFixed(1)}`;
    });
  }, [collisionSweepLines, showDetails]);

  const sweepLabelPositions = useMemo(() => {
    if (!collisionSweepLines || collisionSweepLines.length === 0) return [];
    const charW = SWEEP_FONT * invScale * 0.6;
    const lineH = SWEEP_FONT * invScale * 1.3;
    const pad = 2 * invScale;

    const rects: LabelRect[] = collisionSweepLines.map((line, i) => {
      const text = sweepLabelTexts[i] ?? '';
      const lines = text.split('\n');
      const maxLen = Math.max(...lines.map(l => l.length));
      return {
        x: line.targetX + 6 * invScale,
        y: line.targetY - 6 * invScale,
        w: maxLen * charW,
        h: lineH * lines.length,
      };
    });

    decollideLabels(rects, pad);
    return rects;
  }, [collisionSweepLines, sweepLabelTexts, invScale]);

  const handleDragMove = useCallback(
    (index: number, e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      moveVertex(index, node.x(), node.y());
    },
    [moveVertex]
  );

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.target.getClassName() === "Circle") return;

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = getLogicalPointerPosition(stage);
      if (!pos) return;

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

      // Scale the hit distance threshold by inverse scale so it feels consistent
      if (bestDist < EDGE_HIT_DISTANCE * invScale) {
        addVertex(bestIndex, bestPoint);
      } else {
        setSelectedVertex(null);
      }
    },
    [vertices, addVertex, setSelectedVertex, getLogicalPointerPosition, invScale]
  );

  // Zoom centered on pointer
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scaleBy = 1.1;
      const oldScale = stageScale;
      const newScale = e.evt.deltaY < 0
        ? Math.min(oldScale * scaleBy, 10)
        : Math.max(oldScale / scaleBy, 0.1);

      // Zoom centered on pointer
      const mousePointTo = {
        x: (pointer.x - stagePosition.x) / oldScale,
        y: (pointer.y - stagePosition.y) / oldScale,
      };

      onScaleChange(newScale);
      onPositionChange({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [stageScale, stagePosition, onScaleChange, onPositionChange]
  );

  // Pan: middle-click or alt+left-click
  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const isMiddle = e.evt.button === 1;
      const isAltLeft = e.evt.button === 0 && e.evt.altKey;
      if (!isMiddle && !isAltLeft) return;

      e.evt.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.evt.clientX - stagePosition.x, y: e.evt.clientY - stagePosition.y };
    },
    [stagePosition]
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isPanning.current) return;
      onPositionChange({
        x: e.evt.clientX - panStart.current.x,
        y: e.evt.clientY - panStart.current.y,
      });
    },
    [onPositionChange]
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ---------- Debug overlay data ----------

  // Exterior edge labels
  const exteriorEdgeLabels = useMemo(() => {
    if (!debug.showExteriorEdgeLengths && !debug.showEdgeIndices) return [];
    return vertices.map((v, i) => {
      const next = vertices[(i + 1) % vertices.length];
      const mid = midpoint(v.x, v.y, next.x, next.y);
      const len = segmentLength(v.x, v.y, next.x, next.y);
      return { mid, len, index: i };
    });
  }, [vertices, debug.showExteriorEdgeLengths, debug.showEdgeIndices]);

  // Interior edge labels
  const interiorEdgeLabels = useMemo(() => {
    if (!skeleton || (!debug.showInteriorEdgeLengths && !debug.showEdgeIndices)) return [];
    return skeleton.interiorEdges.flatMap(({ id }) => {
      const edge = skeleton.edges[id];
      if (edge.target === undefined) return [];
      const src = skeleton.nodes[edge.source].position;
      const tgt = skeleton.nodes[edge.target].position;
      const mid = midpoint(src.x, src.y, tgt.x, tgt.y);
      const len = segmentLength(src.x, src.y, tgt.x, tgt.y);
      return [{ mid, len, id }];
    });
  }, [skeleton, debug.showInteriorEdgeLengths, debug.showEdgeIndices]);

  // Skeleton nodes for rendering
  const skeletonNodeData = useMemo(() => {
    if (!skeleton || (!debug.showSkeletonNodes && !debug.showNodeIndices && !debug.showOffsetDistances)) return [];
    const data: { id: number; position: Vector2 }[] = [];
    for (let i = skeleton.numExteriorNodes; i < skeleton.nodes.length; i++) {
      data.push({ id: i, position: skeleton.nodes[i].position });
    }
    return data;
  }, [skeleton, debug.showSkeletonNodes, debug.showNodeIndices, debug.showOffsetDistances]);

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
    <Stage
      ref={stageRef as React.RefObject<never>}
      width={size.width}
      height={size.height}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stagePosition.x}
      y={stagePosition.y}
      onClick={handleStageClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ background: "#1a1b1e", borderRadius: 8, cursor: "crosshair" }}
    >
      <Layer>
        {/* Primary interior edges */}
        {primaryEdges?.map((edge) => (
          <Line
            key={`primary-${edge.vertexIndex}`}
            points={[edge.source.x, edge.source.y, edge.target.x, edge.target.y]}
            stroke="#be4bdb"
            strokeWidth={1.5 * invScale}
            dash={[6 * invScale, 4 * invScale]}
            listening={false}
          />
        ))}

        {/* Skeleton interior edges */}
        {skeletonLines.map(({ key, points }) => (
          debug.showEdgeDirections ? (
            <Arrow key={key} points={points} stroke="#fab005" fill="#fab005" strokeWidth={1.5 * invScale} pointerLength={8 * invScale} pointerWidth={6 * invScale} listening={false} />
          ) : (
            <Line key={key} points={points} stroke="#fab005" strokeWidth={1.5 * invScale} listening={false} />
          )
        ))}

        {/* Unresolved interior edges (no target) */}
        {unresolvedEdges.map(({ key, points }) => (
          debug.showEdgeDirections ? (
            <Arrow key={key} points={points} stroke="#ff6b6b" fill="#ff6b6b" strokeWidth={1.5 * invScale} pointerLength={8 * invScale} pointerWidth={6 * invScale} dash={[6 * invScale, 4 * invScale]} listening={false} />
          ) : (
            <Line key={key} points={points} stroke="#ff6b6b" strokeWidth={1.5 * invScale} dash={[6 * invScale, 4 * invScale]} listening={false} />
          )
        ))}

        {/* Selected node edge highlights */}
        {debug.showSelectedNodeEdgeLengths && selectedNodeEdges.map(({ key, points }) => (
          <Line key={key} points={points} stroke="#40c057" strokeWidth={3 * invScale} listening={false} />
        ))}

        {/* Collision sweep lines */}
        {collisionSweepLines?.map((line) => (
          <Line
            key={line.key}
            points={[line.sourceX, line.sourceY, line.targetX, line.targetY]}
            stroke="#22b8cf"
            strokeWidth={1.5 * invScale}
            dash={[4 * invScale, 3 * invScale]}
            listening={false}
          />
        ))}

        {/* Collision sweep target circles */}
        {collisionSweepLines?.map((line) => (
          <Circle
            key={`${line.key}-pt`}
            x={line.targetX}
            y={line.targetY}
            radius={3 * invScale}
            fill="#22b8cf"
            listening={false}
          />
        ))}

        {/* Polygon edges */}
        {debug.showEdgeDirections ? (
          <>
            <Line points={flatPoints} closed stroke="transparent" strokeWidth={0} fill="rgba(76, 110, 245, 0.1)" listening={false} />
            {vertices.map((v, i) => {
              const next = vertices[(i + 1) % vertices.length];
              return (
                <Arrow
                  key={`poly-arrow-${i}`}
                  points={[v.x, v.y, next.x, next.y]}
                  stroke="#4c6ef5"
                  fill="#4c6ef5"
                  strokeWidth={2 * invScale}
                  pointerLength={10 * invScale}
                  pointerWidth={8 * invScale}
                  listening={false}
                />
              );
            })}
          </>
        ) : (
          <Line
            points={flatPoints}
            closed
            stroke="#4c6ef5"
            strokeWidth={2 * invScale}
            fill="rgba(76, 110, 245, 0.1)"
          />
        )}

        {/* --- Debug: Edge length labels --- */}

        {/* Exterior edge lengths */}
        {debug.showExteriorEdgeLengths && exteriorEdgeLabels.map(({ mid, len, index }) => (
          <Text
            key={`ext-len-${index}`}
            x={mid.x}
            y={mid.y}
            offsetX={20 * invScale}
            offsetY={14 * invScale}
            text={len.toFixed(1)}
            fontSize={12 * invScale}
            fill="#4dabf7"
            listening={false}
          />
        ))}

        {/* Interior edge lengths */}
        {debug.showInteriorEdgeLengths && interiorEdgeLabels.map(({ mid, len, id }) => (
          <Text
            key={`int-len-${id}`}
            x={mid.x}
            y={mid.y}
            offsetX={20 * invScale}
            offsetY={0}
            text={len.toFixed(1)}
            fontSize={12 * invScale}
            fill="#ffa94d"
            listening={false}
          />
        ))}

        {/* Selected node edge lengths */}
        {debug.showSelectedNodeEdgeLengths && selectedNodeEdges.map(({ key, points, length }) => {
          const mid = midpoint(points[0], points[1], points[2], points[3]);
          return (
            <Text
              key={`${key}-len`}
              x={mid.x}
              y={mid.y}
              offsetX={20 * invScale}
              offsetY={-14 * invScale}
              text={length.toFixed(1)}
              fontSize={12 * invScale}
              fill="#69db7c"
              listening={false}
            />
          );
        })}

        {/* Collision sweep labels (de-collided) */}
        {collisionSweepLines?.map((line, i) => {
          const pos = sweepLabelPositions[i];
          const text = sweepLabelTexts[i];
          if (!pos || !text) return null;
          return (
            <Text
              key={`${line.key}-lbl`}
              x={pos.x}
              y={pos.y}
              text={text}
              fontSize={SWEEP_FONT * invScale}
              fill="#22b8cf"
              listening={false}
            />
          );
        })}

        {/* --- Debug: Edge indices --- */}
        {debug.showEdgeIndices && exteriorEdgeLabels.map(({ mid, index }) => (
          <Text
            key={`ext-idx-${index}`}
            x={mid.x}
            y={mid.y}
            offsetX={20 * invScale}
            offsetY={-14 * invScale}
            text={`e${index}`}
            fontSize={11 * invScale}
            fill="#4dabf7"
            fontStyle="bold"
            listening={false}
          />
        ))}

        {debug.showEdgeIndices && interiorEdgeLabels.map(({ mid, id }) => (
          <Text
            key={`int-idx-${id}`}
            x={mid.x}
            y={mid.y}
            offsetX={20 * invScale}
            offsetY={14 * invScale}
            text={`e${id}`}
            fontSize={11 * invScale}
            fill="#ffa94d"
            fontStyle="bold"
            listening={false}
          />
        ))}

        {/* --- Debug: Node indices for polygon vertices --- */}
        {debug.showNodeIndices && vertices.map((v, i) => (
          <Text
            key={`vi-${i}`}
            x={v.x}
            y={v.y}
            offsetX={-12 * invScale}
            offsetY={12 * invScale}
            text={`${i}`}
            fontSize={11 * invScale}
            fill="#ffffff"
            fontStyle="bold"
            listening={false}
          />
        ))}

        {/* --- Debug: Skeleton nodes --- */}
        {debug.showSkeletonNodes && skeletonNodeData.map(({ id, position }) => {
          const isSelected = selectedDebugNodes.has(id);
          return (
            <Circle
              key={`sn-${id}`}
              x={position.x}
              y={position.y}
              radius={(isSelected ? 7 : 4) * invScale}
              fill={isSelected ? "#ff6b6b" : "#fab005"}
              stroke={isSelected ? "#fff" : undefined}
              strokeWidth={isSelected ? 1.5 * invScale : 0}
              onClick={(e) => {
                e.cancelBubble = true;
                onToggleDebugNode(id);
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = "pointer";
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = "crosshair";
              }}
            />
          );
        })}

        {/* Skeleton node indices */}
        {debug.showNodeIndices && skeletonNodeData.map(({ id, position }) => (
          <Text
            key={`sni-${id}`}
            x={position.x}
            y={position.y}
            offsetX={-10 * invScale}
            offsetY={10 * invScale}
            text={`${id}`}
            fontSize={11 * invScale}
            fill="#ffa94d"
            fontStyle="bold"
            listening={false}
          />
        ))}

        {/* Offset distance labels */}
        {debug.showOffsetDistances && nodeOffsetDistances && skeletonNodeData.map(({ id, position }) => {
          const offset = nodeOffsetDistances.get(id);
          if (offset === undefined) return null;
          return (
            <Text
              key={`od-${id}`}
              x={position.x}
              y={position.y}
              offsetX={-10 * invScale}
              offsetY={-6 * invScale}
              text={`d=${offset.toFixed(2)}`}
              fontSize={OFFSET_DIST_FONT * invScale}
              fill="#22b8cf"
              listening={false}
            />
          );
        })}

        {/* --- Debug: Primary edge intersection nodes --- */}
        {debug.showPrimaryIntersectionNodes && primaryEdgeIntersections?.map((pt, i) => (
          <Circle
            key={`pei-${i}`}
            x={pt.x}
            y={pt.y}
            radius={4 * invScale}
            fill="#be4bdb"
            listening={false}
          />
        ))}

        {/* Polygon vertices (drawn last so they're on top) */}
        {vertices.map((v, i) => (
          <Circle
            key={i}
            x={v.x}
            y={v.y}
            radius={VERTEX_RADIUS * invScale}
            fill={selectedVertex === i ? "#ff6b6b" : "#4c6ef5"}
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
    </div>
  );
}
