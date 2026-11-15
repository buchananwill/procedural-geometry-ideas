import {REMOVED_VERTEX_INDEX} from "@proc-geo/core";
import type {PrimaryInteriorEdge, SkeletonLoopMap, StraightSkeletonGraph, Vector2} from "@proc-geo/core";
import type {Vertex} from "../../stores/usePolygonStore";
import type {DebugDisplayOptions, CollisionSweepLine} from "../../types";
import type {ScenePrimitive, SceneGroup, StrokeStyle} from "../types";
import {HOLED_REFUSED_CANVAS_TEXT, HOLED_REFUSED_STALE_CANVAS_TEXT} from "../../components/holed-fixture-text";

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

/** The current holed loops while core refuses them (BSA.D323): the red of the removed mark and the unresolved ray. */
const REFUSED_COLOUR = '#ff6b6b';
/** The last good solve, kept on screen while a refusal stands: a dashed grey ghost (BSA.D323). */
const STALE_STROKE: StrokeStyle = {color: '#868e96', width: 1.5, dash: [6, 4]};

/** A graph's own exterior loops, by its loop table; `[]` on a merged graph, whose table is empty. */
function graphLoops(graph: StraightSkeletonGraph): Vector2[][] {
    return graph.loops.map(({start, count}) =>
        graph.nodes.slice(start, start + count).map(node => node.position));
}

/** One labelled position on the boundary the debug overlay is numbering, and the end of the edge leaving it. */
interface LabelledBoundaryVertex {
    position: Vector2;
    index: number;
    next: Vector2;
}

/** One hole of a holed polygon, in the caller's order (dashboard holed-fixtures spec, decision 1). */
export interface SceneHole {
    vertices: Vertex[];
}

/** The caller's loops: the outline, then each hole. */
function callerLoops(vertices: Vertex[], holes: readonly SceneHole[]): Vertex[][] {
    return [vertices, ...holes.map(hole => hole.vertices)];
}

/**
 * The node after exterior node `index` along its own edge. THE LOOP TABLE'S READING (dashboard holed-fixtures spec,
 * decision 27): the edge's own target, which `initBoundingPolygon` sets inside the edge's loop, so a hole's last edge
 * ends at the hole's first node and never at the next loop's. `(index + 1) % n` only on a merged graph, whose
 * `loops` is `[]` and whose exterior ids are not one ring. On a single loop the two are the same node.
 */
function nextExteriorPosition(skeleton: StraightSkeletonGraph, index: number): Vector2 {
    const target = skeleton.edges[index]?.target;
    if (skeleton.loops.length > 0 && target !== undefined) {
        return skeleton.nodes[target].position;
    }
    return skeleton.nodes[(index + 1) % skeleton.numExteriorNodes].position;
}

/**
 * Whether `maps` can describe `loops` at all: one map per loop, each with one entry per caller vertex. A refusal is
 * passed explicitly (`refused`); this is the adapter's own guard against maps of another outline, which is what the
 * last good solve's maps are once the outline gains or loses a vertex (BSA.D323).
 */
function loopMapsFit(maps: readonly SkeletonLoopMap[] | null | undefined, loops: readonly Vertex[][]): boolean {
    return maps !== null && maps !== undefined && maps.length === loops.length
        && maps.every((map, k) => map.vertexToNode.length === loops[k].length);
}

/**
 * A HOLED POLYGON'S LABELLED BOUNDARY, ONE NUMBERING WHETHER THE SKELETON IS SHOWN OR HIDDEN (BSA.D323). The holed solve
 * runs either way (decision 13), so its maps are always at hand when it solved, and the labels are the solver's global
 * ids (decision 28) read off them: loop `k`'s surviving caller vertex `i` is node `vertexToNode[i]`, and since a loop's
 * nodes are one run of ids in solved order (the loop table), exterior edge `n` runs from node `n` to the loop's next
 * id, wrapping in the loop. A vertex its map removed is marked, per loop (decision 29).
 *
 * Without maps there is no solve of these loops to number by (a refusal, or no holed solve): with a live graph its own
 * numbering stands, nothing marked; with none, the caller's loops in caller order, each edge wrapping in its loop.
 */
function labelledHoledBoundary(
    loops: Vertex[][],
    skeleton: StraightSkeletonGraph | null,
    loopMaps: readonly SkeletonLoopMap[] | null,
): { ring: LabelledBoundaryVertex[]; removed: Vertex[] } {
    if (loopMaps !== null) {
        const ring: LabelledBoundaryVertex[] = [];
        const removed: Vertex[] = [];
        loops.forEach((loop, k) => {
            const survivors: { position: Vertex; index: number }[] = [];
            loop.forEach((vertex, i) => {
                const node = loopMaps[k].vertexToNode[i];
                if (node === REMOVED_VERTEX_INDEX) removed.push(vertex);
                else survivors.push({position: vertex, index: node});
            });
            survivors.sort((a, b) => a.index - b.index);
            survivors.forEach((survivor, j) => ring.push({
                position: survivor.position, index: survivor.index,
                next: survivors[(j + 1) % survivors.length].position}));
        });
        ring.sort((a, b) => a.index - b.index);
        return {ring, removed};
    }
    if (skeleton) {
        const ring = skeleton.nodes
            .slice(0, skeleton.numExteriorNodes)
            .map((node, index) => ({position: node.position, index, next: nextExteriorPosition(skeleton, index)}));
        return {ring, removed: []};
    }
    let offset = 0;
    const ring = loops.flatMap(loop => {
        const start = offset;
        offset += loop.length;
        return loop.map((vertex, local) => ({
            position: vertex, index: start + local, next: loop[(local + 1) % loop.length]}));
    });
    return {ring, removed: []};
}

/**
 * The boundary the debug labels are numbered against, and the input vertices missing from it.
 *
 * ONE INDEX SPACE PER PICTURE (journal decision 75, 2026-08-28). Every skeleton label on this
 * canvas — interior edge ids, parent pairs, skeleton node ids — is written in the SOLVER'S indices,
 * and the solver's boundary is not always the caller's: the boundary stage removes vertices that sit
 * on their own edge, which is exactly what this canvas's click-to-insert produces, and every
 * exterior node and edge after the removal is then numbered one lower. Drawing input indices beside
 * solver indices made a correct solve read as a corrupted one — a run of bisectors each apparently
 * carrying the parents of the vertex before it — and cost a dashboard inspection and a day's
 * investigation before the graph was found to be right throughout.
 *
 * So the exterior labels come off the SOLVED GRAPH whenever there is one. A vertex the solve does
 * not contain gets no number, because it has none; it is marked instead, so that a vertex which
 * vanished from the algorithm cannot look like one the algorithm ignored.
 *
 * THE REMAP IS TRUSTED ONLY WHERE IT DESCRIBES THIS GRAPH. It comes from `canonicaliseForSolve`,
 * which is the boundary stage alone; the self-intersecting path decomposes and re-merges and
 * renumbers again, so a survivor count that disagrees with `numExteriorNodes` means the mapping is
 * about a different graph and nothing is marked.
 */
function labelledBoundary(
    vertices: Vertex[],
    skeleton: StraightSkeletonGraph | null,
    solverVertexRemap: number[] | null | undefined,
    holes: readonly SceneHole[],
    solverLoopMaps: readonly SkeletonLoopMap[] | null,
): { ring: LabelledBoundaryVertex[]; removed: Vertex[] } {
    if (holes.length > 0) {
        return labelledHoledBoundary(callerLoops(vertices, holes), skeleton, solverLoopMaps);
    }
    if (!skeleton) {
        return {
            ring: vertices.map((vertex, index) => ({position: vertex, index, next: vertices[(index + 1) % vertices.length]})),
            removed: [],
        };
    }

    const ring = skeleton.nodes
        .slice(0, skeleton.numExteriorNodes)
        .map((node, index) => ({position: node.position, index, next: nextExteriorPosition(skeleton, index)}));

    const survivors = solverVertexRemap?.filter(index => index !== REMOVED_VERTEX_INDEX).length;
    const removed = solverVertexRemap !== null && solverVertexRemap !== undefined
        && survivors === skeleton.numExteriorNodes
        ? vertices.filter((_vertex, index) => solverVertexRemap[index] === REMOVED_VERTEX_INDEX)
        : [];

    return {ring, removed};
}

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
    /**
     * `canonicaliseForSolve(vertices).indexRemap` for the polygon being solved, where the caller has
     * it: input vertex index to solver exterior node, `REMOVED_VERTEX_INDEX` where the boundary
     * stage dropped it. Omitting it costs only the marking of dropped vertices — see
     * {@link labelledBoundary} for why the numbering itself never depends on it.
     */
    solverVertexRemap?: number[] | null;
    /**
     * The holes of a holed fixture, drawn read-only (dashboard holed-fixtures spec, decisions 24 to 29). Omitted or
     * `[]`, the scene is exactly the single-loop one.
     */
    holes?: readonly SceneHole[];
    /** The holed solve's `loopMaps`, one per caller loop: arrows follow `reversed`, removed marks `vertexToNode`. */
    solverLoopMaps?: readonly SkeletonLoopMap[] | null;
    /**
     * True when the holed solve came back `complete: false` (decision 30): the unresolved edges are then drawn
     * whatever their toggle, so the part the solver did not finish reads as missing.
     */
    incomplete?: boolean;
    /**
     * True on a step-through frame that is not the last (BSA.D323). Its targetless bisectors are PENDING, so
     * `incomplete` does not force them on screen there; the toggle alone decides, as on a single loop.
     */
    pendingFrame?: boolean;
    /**
     * True while core REFUSES the current holed loops (BSA.D323). `skeleton`, if given, is then the last good solve, of
     * another outline: it is drawn as a dashed grey ghost with its own outline, the current loops are stroked red and
     * NOT FILLED, and nothing indexed by the caller's vertices (maps, labels by solver id, sweeps, previews) is taken
     * from that solve. Ignored without holes, so the single-loop scene is untouched.
     */
    refused?: boolean;
}): ScenePrimitive[] {
    const {
        vertices,
        debug,
        selectedDebugNodes,
        invScale,
        solverVertexRemap,
    } = params;
    const holes = params.holes ?? [];
    const refused = holes.length > 0 && (params.refused ?? false);
    // WHILE A REFUSAL STANDS, NOTHING OF THE LAST GOOD SOLVE IS DRAWN AS IF IT WERE THIS OUTLINE'S (BSA.D323): the
    // skeleton is held back for the ghost, and every overlay derived from that solve is dropped.
    const skeleton = refused ? null : params.skeleton;
    const staleSkeleton = refused ? params.skeleton : null;
    const primaryEdges = refused ? undefined : params.primaryEdges;
    const primaryEdgeIntersections = refused ? undefined : params.primaryEdgeIntersections;
    const collisionSweepLines = refused ? null : params.collisionSweepLines;
    const nodeOffsetDistances = refused ? null : params.nodeOffsetDistances;
    const incomplete = (params.incomplete ?? false) && !(params.pendingFrame ?? false);
    const loops = holes.length > 0 ? callerLoops(vertices, holes) : [];
    const solverLoopMaps = !refused && loopMapsFit(params.solverLoopMaps, loops) ? params.solverLoopMaps! : null;

    const boundary = labelledBoundary(vertices, skeleton, solverVertexRemap, holes, solverLoopMaps);

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
        } else if (staleSkeleton) {
            // THE LAST GOOD SKELETON, AS A GHOST (BSA.D323): dashed grey, never the skeleton's yellow, so it cannot be
            // read as this outline's.
            for (const {id} of staleSkeleton.interiorEdges) {
                const edge = staleSkeleton.edges[id];
                if (edge.target === undefined) continue;
                const src = staleSkeleton.nodes[edge.source].position;
                const tgt = staleSkeleton.nodes[edge.target].position;
                children.push({type: 'line', points: [src.x, src.y, tgt.x, tgt.y], stroke: STALE_STROKE});
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
            // An incomplete holed result shows what the solver did not finish, toggle or not (decision 30).
            visible: debug.showUnresolvedEdges || incomplete,
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
        groups.push({type: 'group', id: 'group:collision-sweep', children, visible: debug.showCollisionSweep});
    }

    // 6. group:polygon
    if (holes.length > 0) {
        // A HOLED POLYGON (decisions 24 to 26): one region, filled by the even-odd rule so every hole reads as empty,
        // and each loop stroked as a closed line of its own, a hole wall like the outline's because the solver treats
        // it as a wall like any other. With edge directions, each loop gets one arrow per edge, wrapping inside its
        // own loop, the way the solver walks it: reversed where winding normalisation reversed that loop.
        //
        // WHILE CORE REFUSES THESE LOOPS (BSA.D323) NOTHING IS FILLED. The solver has said they bound no region it
        // accepts: an even-odd fill over an outline dragged across its hole shades the part of the hole outside it as
        // building, and filling the outline alone shades the whole hole. An unfilled red stroke claims nothing. The last
        // good solve's own outline is drawn as a dashed grey ghost beside its ghost skeleton, and the canvas says so.
        const children: ScenePrimitive[] = [];
        if (!refused) {
            children.push({
                type: 'region',
                rings: loops.map(loop => loop.flatMap(v => [v.x, v.y])),
                fill: {color: '#4c6ef5', opacity: 0.1},
            });
        }
        const ghostLoops = staleSkeleton ? graphLoops(staleSkeleton) : [];
        for (const ghost of ghostLoops) {
            children.push({type: 'line', points: ghost.flatMap(v => [v.x, v.y]), closed: true, stroke: STALE_STROKE});
        }
        const loopColour = refused ? REFUSED_COLOUR : '#4c6ef5';
        loops.forEach((loop, k) => {
            if (debug.showEdgeDirections) {
                const reversed = solverLoopMaps?.[k]?.reversed ?? false;
                for (let i = 0; i < loop.length; i++) {
                    const a = loop[i];
                    const b = loop[(i + 1) % loop.length];
                    const [from, to] = reversed ? [b, a] : [a, b];
                    children.push({
                        type: 'line',
                        points: [from.x, from.y, to.x, to.y],
                        stroke: {color: loopColour, width: 2},
                        arrow: {pointerLength: 10, pointerWidth: 8},
                    });
                }
            } else {
                children.push({
                    type: 'line',
                    points: loop.flatMap(v => [v.x, v.y]),
                    closed: true,
                    stroke: {color: loopColour, width: 2},
                });
            }
        });
        if (refused) {
            const all = [...loops, ...ghostLoops].flat();
            children.push({
                type: 'label',
                x: Math.min(...all.map(v => v.x)),
                y: Math.min(...all.map(v => v.y)),
                offsetY: 30,
                text: staleSkeleton ? HOLED_REFUSED_STALE_CANVAS_TEXT : HOLED_REFUSED_CANVAS_TEXT,
                style: {fontSize: 12, color: REFUSED_COLOUR, bold: true},
            });
        }
        groups.push({type: 'group', id: 'group:polygon', children});
    } else {
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
            // Exterior edge data, numbered as the SOLVER numbers it — see `labelledBoundary` — each edge ending at
            // its own target node (decision 27).
            const exteriorEdgeData = boundary.ring.map(({position, index, next}) => {
                const mid_ = midpoint(position.x, position.y, next.x, next.y);
                const len = segmentLength(position.x, position.y, next.x, next.y);
                return {mid: mid_, len, index};
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
            for (const {position, index} of boundary.ring) {
                children.push({
                    type: 'label',
                    x: position.x,
                    y: position.y,
                    offsetX: -12,
                    offsetY: 12,
                    text: `${index}`,
                    style: {fontSize: 11, color: '#ffffff', bold: true},
                });
            }
            // A vertex the solve does not contain. It has no index to show, and showing the next
            // one's would be the very confusion this numbering exists to end.
            for (const vertex of boundary.removed) {
                children.push({
                    type: 'label',
                    x: vertex.x,
                    y: vertex.y,
                    offsetX: -12,
                    offsetY: 12,
                    text: 'x',
                    style: {fontSize: 11, color: '#ff6b6b', bold: true},
                });
            }
        }

        groups.push({type: 'group', id: 'group:debug-labels', children});
    }

    // 8. group:debug-node-labels — skeleton node index labels and offset distance labels
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
        groups.push({type: 'group', id: 'group:debug-node-labels', children});
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
