import type {PrimaryInteriorEdge, StraightSkeletonGraph, Vector2} from "@proc-geo/core";
import type {Vertex} from "../../stores/usePolygonStore";
import type {DebugDisplayOptions, CollisionSweepLine} from "../../types";
import type {ScenePrimitive, SceneGroup} from "../types";

// TODO 14/3/26: There are several obviously generic functions here that should be consolidated into package-wide
//  helpers, if those don't already exist.

interface LabelRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function segmentLength(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    return {x: (ax + bx) / 2, y: (ay + by) / 2};
}

function decollideLabels(rects: LabelRect[], padding: number): LabelRect[] {
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
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
                    r.y = o.y + o.h + padding;
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps) break;
            attempts++;
        }
    }
    return rects;
}

const UNRESOLVED_RAY_LENGTH = 100;
const SWEEP_FONT = 14;
const OFFSET_DIST_FONT = 15;

// TODO 14/3/26: This long function should be split into it's already labelled constituent parts,
//  for readability at least.
export function skeletonToScene(params: {
    vertices: Vertex[];
    skeleton: StraightSkeletonGraph | null;
    primaryEdges?: PrimaryInteriorEdge[];
    primaryEdgeIntersections?: Vector2[];
    debug: DebugDisplayOptions;
    collisionSweepLines: CollisionSweepLine[] | null;
    nodeOffsetDistances: Map<number, number> | null;
    selectedDebugNodes: Set<number>;
    invScale: number;
}): ScenePrimitive[] {
    const {
        vertices,
        skeleton,
        primaryEdges,
        primaryEdgeIntersections,
        debug,
        collisionSweepLines,
        nodeOffsetDistances,
        selectedDebugNodes,
        invScale,
    } = params;

    const groups: SceneGroup[] = [];

    // 1. group:primary-edges
    {
        const children: ScenePrimitive[] = [];
        if (primaryEdges) {
            for (const edge of primaryEdges) {
                children.push({
                    type: 'line',
                    points: [edge.source.x, edge.source.y, edge.target.x, edge.target.y],
                    stroke: {color: '#be4bdb', width: 1.5, dash: [6, 4]},
                });
            }
        }
        groups.push({type: 'group', id: 'group:primary-edges', children});
    }

    // 2. group:skeleton-edges
    {
        const children: ScenePrimitive[] = [];
        if (skeleton) {
            for (const {id} of skeleton.interiorEdges) {
                const edge = skeleton.edges[id];
                if (edge.target === undefined) continue;
                const src = skeleton.nodes[edge.source];
                const tgt = skeleton.nodes[edge.target];
                const pts = [src.position.x, src.position.y, tgt.position.x, tgt.position.y];
                if (debug.showEdgeDirections) {
                    children.push({
                        type: 'line',
                        points: pts,
                        stroke: {color: '#fab005', width: 1.5},
                        arrow: {pointerLength: 8, pointerWidth: 6},
                    });
                } else {
                    children.push({
                        type: 'line',
                        points: pts,
                        stroke: {color: '#fab005', width: 1.5},
                    });
                }
            }
        }
        groups.push({type: 'group', id: 'group:skeleton-edges', children});
    }

    // 3. group:unresolved-edges
    {
        const children: ScenePrimitive[] = [];
        if (skeleton) {
            for (const {id} of skeleton.interiorEdges) {
                const edge = skeleton.edges[id];
                if (edge.target !== undefined) continue;
                const src = skeleton.nodes[edge.source];
                const pts = [
                    src.position.x, src.position.y,
                    src.position.x + edge.basisVector.x * UNRESOLVED_RAY_LENGTH,
                    src.position.y + edge.basisVector.y * UNRESOLVED_RAY_LENGTH,
                ];
                if (debug.showEdgeDirections) {
                    children.push({
                        type: 'line',
                        points: pts,
                        stroke: {color: '#ff6b6b', width: 1.5, dash: [6, 4]},
                        arrow: {pointerLength: 8, pointerWidth: 6},
                    });
                } else {
                    children.push({
                        type: 'line',
                        points: pts,
                        stroke: {color: '#ff6b6b', width: 1.5, dash: [6, 4]},
                    });
                }
            }
        }
        groups.push({
            type: 'group',
            id: 'group:unresolved-edges',
            children,
            visible: debug.showUnresolvedEdges,
        });
    }

    // 4. group:selected-node-edges
    {
        const children: ScenePrimitive[] = [];
        if (skeleton && selectedDebugNodes.size > 0) {
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
                    children.push({
                        type: 'line',
                        points: [src.position.x, src.position.y, tgt.position.x, tgt.position.y],
                        stroke: {color: '#40c057', width: 3},
                    });
                }
            }
        }
        groups.push({
            type: 'group',
            id: 'group:selected-node-edges',
            children,
            visible: debug.showSelectedNodeEdgeLengths,
        });
    }

    // 5. group:collision-sweep
    {
        const children: ScenePrimitive[] = [];
        if (collisionSweepLines) {
            const showDetails = debug.showSweepEventDetails;

            // Sweep lines
            for (const line of collisionSweepLines) {
                children.push({
                    type: 'line',
                    points: [line.sourceX, line.sourceY, line.targetX, line.targetY],
                    stroke: {color: '#22b8cf', width: 1.5, dash: [4, 3]},
                });
            }

            // Target circles
            for (const line of collisionSweepLines) {
                children.push({
                    type: 'point',
                    x: line.targetX,
                    y: line.targetY,
                    radius: 3,
                    fill: {color: '#22b8cf'},
                });
            }

            // De-collided labels (uses invScale for geometry computation)
            const sweepLabelTexts = collisionSweepLines.map((line) => {
                const base = `${line.offsetDistance.toFixed(1)} e${line.edgeIdA}\u00d7e${line.edgeIdB}`;
                if (!showDetails) return base;
                return `${base} ${line.eventType}\n${line.intersectionType} r1=${line.alongRay1.toFixed(1)} r2=${line.alongRay2.toFixed(1)}`;
            });

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

            for (let i = 0; i < collisionSweepLines.length; i++) {
                const pos = rects[i];
                const text = sweepLabelTexts[i];
                if (!pos || !text) continue;
                children.push({
                    type: 'label',
                    x: pos.x,
                    y: pos.y,
                    text,
                    style: {fontSize: SWEEP_FONT, color: '#22b8cf'},
                });
            }
        }
        groups.push({type: 'group', id: 'group:collision-sweep', children});
    }

    // 6. group:polygon
    {
        const children: ScenePrimitive[] = [];
        const flatPoints = vertices.flatMap((v) => [v.x, v.y]);

        if (debug.showEdgeDirections) {
            // Fill polygon with transparent stroke
            children.push({
                type: 'line',
                points: flatPoints,
                closed: true,
                stroke: {color: 'transparent', width: 0},
                fill: {color: '#4c6ef5', opacity: 0.1},
            });
            // Arrow for each edge
            for (let i = 0; i < vertices.length; i++) {
                const v = vertices[i];
                const next = vertices[(i + 1) % vertices.length];
                children.push({
                    type: 'line',
                    points: [v.x, v.y, next.x, next.y],
                    stroke: {color: '#4c6ef5', width: 2},
                    arrow: {pointerLength: 10, pointerWidth: 8},
                });
            }
        } else {
            children.push({
                type: 'line',
                points: flatPoints,
                closed: true,
                stroke: {color: '#4c6ef5', width: 2},
                fill: {color: '#4c6ef5', opacity: 0.1},
            });
        }
        groups.push({type: 'group', id: 'group:polygon', children});
    }

    // 7. group:debug-labels
    {
        const children: ScenePrimitive[] = [];
        const showAnyLabel = debug.showExteriorEdgeLengths || debug.showEdgeIndices ||
            debug.showInteriorEdgeLengths || debug.showParentEdges || debug.showSelectedNodeEdgeLengths;

        if (showAnyLabel) {
            // Exterior edge data
            const exteriorEdgeData = vertices.map((v, i) => {
                const next = vertices[(i + 1) % vertices.length];
                const mid_ = midpoint(v.x, v.y, next.x, next.y);
                const len = segmentLength(v.x, v.y, next.x, next.y);
                return {mid: mid_, len, index: i};
            });

            // Exterior edge lengths
            if (debug.showExteriorEdgeLengths) {
                for (const {mid: m, len, index} of exteriorEdgeData) {
                    children.push({
                        type: 'label',
                        x: m.x,
                        y: m.y,
                        offsetX: 20,
                        offsetY: 14,
                        text: len.toFixed(1),
                        style: {fontSize: 12, color: '#4dabf7'},
                    });
                }
            }

            // Exterior edge indices
            if (debug.showEdgeIndices) {
                for (const {mid: m, index} of exteriorEdgeData) {
                    children.push({
                        type: 'label',
                        x: m.x,
                        y: m.y,
                        offsetX: 20,
                        offsetY: -14,
                        text: `e${index}`,
                        style: {fontSize: 11, color: '#4dabf7', bold: true},
                    });
                }
            }

            // Interior edge data
            if (skeleton && (debug.showInteriorEdgeLengths || debug.showEdgeIndices)) {
                const interiorEdgeData = skeleton.interiorEdges.flatMap(({id}) => {
                    const edge = skeleton.edges[id];
                    if (edge.target === undefined) return [];
                    const src = skeleton.nodes[edge.source].position;
                    const tgt = skeleton.nodes[edge.target].position;
                    const mid_ = midpoint(src.x, src.y, tgt.x, tgt.y);
                    const len = segmentLength(src.x, src.y, tgt.x, tgt.y);
                    return [{mid: mid_, len, id}];
                });

                // Interior edge lengths
                if (debug.showInteriorEdgeLengths) {
                    for (const {mid: m, len, id} of interiorEdgeData) {
                        children.push({
                            type: 'label',
                            x: m.x,
                            y: m.y,
                            offsetX: 20,
                            offsetY: 0,
                            text: len.toFixed(1),
                            style: {fontSize: 12, color: '#ffa94d'},
                        });
                    }
                }

                // Interior edge indices
                if (debug.showEdgeIndices) {
                    for (const {mid: m, id} of interiorEdgeData) {
                        children.push({
                            type: 'label',
                            x: m.x,
                            y: m.y,
                            offsetX: 20,
                            offsetY: 14,
                            text: `e${id}`,
                            style: {fontSize: 11, color: '#ffa94d', bold: true},
                        });
                    }
                }
            }

            // Parent edge labels
            if (skeleton && debug.showParentEdges) {
                for (const {id, clockwiseExteriorEdgeIndex, widdershinsExteriorEdgeIndex} of skeleton.interiorEdges) {
                    const edge = skeleton.edges[id];
                    const src = skeleton.nodes[edge.source].position;
                    let mid_: { x: number; y: number };
                    if (edge.target !== undefined) {
                        const tgt = skeleton.nodes[edge.target].position;
                        mid_ = midpoint(src.x, src.y, tgt.x, tgt.y);
                    } else {
                        mid_ = {
                            x: src.x + edge.basisVector.x * UNRESOLVED_RAY_LENGTH * 0.5,
                            y: src.y + edge.basisVector.y * UNRESOLVED_RAY_LENGTH * 0.5,
                        };
                    }
                    children.push({
                        type: 'label',
                        x: mid_.x,
                        y: mid_.y,
                        offsetX: -4,
                        offsetY: -14,
                        text: `[${clockwiseExteriorEdgeIndex},${widdershinsExteriorEdgeIndex}]`,
                        style: {fontSize: 11, color: '#e599f7'},
                    });
                }
            }

            // Selected node edge lengths
            if (debug.showSelectedNodeEdgeLengths && skeleton && selectedDebugNodes.size > 0) {
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
                        const mid_ = midpoint(src.position.x, src.position.y, tgt.position.x, tgt.position.y);
                        children.push({
                            type: 'label',
                            x: mid_.x,
                            y: mid_.y,
                            offsetX: 20,
                            offsetY: -14,
                            text: len.toFixed(1),
                            style: {fontSize: 12, color: '#69db7c'},
                        });
                    }
                }
            }
        }

        // Node index labels for polygon vertices
        if (debug.showNodeIndices) {
            for (let i = 0; i < vertices.length; i++) {
                const v = vertices[i];
                children.push({
                    type: 'label',
                    x: v.x,
                    y: v.y,
                    offsetX: -12,
                    offsetY: 12,
                    text: `${i}`,
                    style: {fontSize: 11, color: '#ffffff', bold: true},
                });
            }
        }

        groups.push({type: 'group', id: 'group:debug-labels', children});
    }

    // 8. group:debug-nodes — skeleton node index labels and offset distance labels
    {
        const children: ScenePrimitive[] = [];
        if (skeleton && (debug.showSkeletonNodes || debug.showNodeIndices || debug.showOffsetDistances)) {
            const nodeData: { id: number; position: Vector2 }[] = [];
            for (let i = skeleton.numExteriorNodes; i < skeleton.nodes.length; i++) {
                nodeData.push({id: i, position: skeleton.nodes[i].position});
            }

            // Skeleton node indices
            if (debug.showNodeIndices) {
                for (const {id, position} of nodeData) {
                    children.push({
                        type: 'label',
                        x: position.x,
                        y: position.y,
                        offsetX: -10,
                        offsetY: 10,
                        text: `${id}`,
                        style: {fontSize: 11, color: '#ffa94d', bold: true},
                    });
                }
            }

            // Offset distance labels
            if (debug.showOffsetDistances && nodeOffsetDistances) {
                for (const {id, position} of nodeData) {
                    const offset = nodeOffsetDistances.get(id);
                    if (offset === undefined) continue;
                    children.push({
                        type: 'label',
                        x: position.x,
                        y: position.y,
                        offsetX: -10,
                        offsetY: -6,
                        text: `d=${offset.toFixed(2)}`,
                        style: {fontSize: OFFSET_DIST_FONT, color: '#22b8cf'},
                    });
                }
            }
        }
        groups.push({type: 'group', id: 'group:debug-nodes', children});
    }

    // 9. group:intersection-nodes
    {
        const children: ScenePrimitive[] = [];
        if (primaryEdgeIntersections) {
            for (const pt of primaryEdgeIntersections) {
                children.push({
                    type: 'point',
                    x: pt.x,
                    y: pt.y,
                    radius: 4,
                    fill: {color: '#be4bdb'},
                });
            }
        }
        groups.push({
            type: 'group',
            id: 'group:intersection-nodes',
            children,
            visible: debug.showPrimaryIntersectionNodes,
        });
    }

    // 10. group:vertices — placeholder, interactive vertices handled by overlay
    {
        groups.push({
            type: 'group',
            id: 'group:vertices',
            children: [],
            visible: false,
        });
    }

    return groups;
}
