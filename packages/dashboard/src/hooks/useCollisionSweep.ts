import { useState, useEffect, useCallback } from "react";
import type {
    StraightSkeletonGraph,
    StraightSkeletonSolverContext,
} from "@proc-geo/core";
import {
    makeStraightSkeletonSolverContext,
    initInteriorEdges,
    generateCollisionSweep,
    computeNodeOffsetDistances,
} from "@proc-geo/core";
import type { CollisionSweepLine, DebugDisplayOptions } from "../types";
import type { Vertex } from "../stores/usePolygonStore";

export interface CollisionSweepState {
    collisionSweepLines: CollisionSweepLine[] | null;
    setCollisionSweepLines: (v: CollisionSweepLine[] | null) => void;
    nodeOffsetDistances: Map<number, number> | null;
    selectedDebugNodes: Set<number>;
    toggleDebugNode: (nodeId: number) => void;
    sweepAllPrimaryInit: () => void;
    sweepAllPrimaryFull: () => void;
}

function sweepLinesToRender(
    edgeIds: number[],
    ctx: StraightSkeletonSolverContext
): CollisionSweepLine[] {
    const sweepEvents = generateCollisionSweep(edgeIds, ctx);
    return sweepEvents.map((se, i) => {
        const sourceNode = ctx.graph.nodes[ctx.graph.edges[se.instigatorEdgeId].source];
        return {
            key: `sweep-${i}`,
            sourceX: sourceNode.position.x,
            sourceY: sourceNode.position.y,
            targetX: se.event.position.x,
            targetY: se.event.position.y,
            offsetDistance: se.event.offsetDistance,
            edgeIdA: se.event.collidingEdges[0],
            edgeIdB: se.event.collidingEdges[1],
            eventType: se.event.eventType,
            intersectionType: se.event.intersectionData[2],
            alongRay1: se.event.intersectionData[0],
            alongRay2: se.event.intersectionData[1],
        };
    });
}

export function useCollisionSweep(
    vertices: Vertex[],
    solverContext: StraightSkeletonSolverContext | null,
    skeleton: StraightSkeletonGraph | null,
    debug: DebugDisplayOptions,
): CollisionSweepState {
    const [collisionSweepLines, setCollisionSweepLines] = useState<CollisionSweepLine[] | null>(null);
    const [selectedDebugNodes, setSelectedDebugNodes] = useState<Set<number>>(new Set());

    const nodeOffsetDistances = (() => {
        if (!solverContext || !debug.showOffsetDistances) return null;
        return computeNodeOffsetDistances(solverContext);
    })();

    const toggleDebugNode = useCallback((nodeId: number) => {
        setSelectedDebugNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    // Clear selected debug nodes and sweep when skeleton identity changes
    useEffect(() => {
        setSelectedDebugNodes(new Set());
        setCollisionSweepLines(null);
    }, [skeleton]);

    function sweepAllPrimaryInit() {
        try {
            const ctx = makeStraightSkeletonSolverContext(vertices);
            initInteriorEdges(ctx);
            const edgeIds = ctx.graph.interiorEdges.map(e => e.id);
            setCollisionSweepLines(sweepLinesToRender(edgeIds, ctx));
        } catch (e) {
            console.log("Sweep init failed:", e);
        }
    }

    function sweepAllPrimaryFull() {
        if (!solverContext) return;
        const n = solverContext.graph.numExteriorNodes;
        const edgeIds: number[] = [];
        for (let i = n; i < 2 * n; i++) {
            if (i < solverContext.graph.edges.length) {
                edgeIds.push(i);
            }
        }
        setCollisionSweepLines(sweepLinesToRender(edgeIds, solverContext));
    }

    return {
        collisionSweepLines,
        setCollisionSweepLines,
        nodeOffsetDistances,
        selectedDebugNodes,
        toggleDebugNode,
        sweepAllPrimaryInit,
        sweepAllPrimaryFull,
    };
}
