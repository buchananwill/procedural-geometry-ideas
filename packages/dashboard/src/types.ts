import type { CollisionType, IntersectionType } from "@proc-geo/core";

export interface DebugDisplayOptions {
    showExteriorEdgeLengths: boolean;
    showInteriorEdgeLengths: boolean;
    showSelectedNodeEdgeLengths: boolean;
    showSkeletonNodes: boolean;
    showPrimaryIntersectionNodes: boolean;
    showNodeIndices: boolean;
    showEdgeIndices: boolean;
    showOffsetDistances: boolean;
    showSweepEventDetails: boolean;
    showUnresolvedEdges: boolean;
    showEdgeDirections: boolean;
    showParentEdges: boolean;
}

export interface CollisionSweepLine {
    key: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    offsetDistance: number;
    edgeIdA: number;
    edgeIdB: number;
    eventType: CollisionType;
    intersectionType: IntersectionType;
    alongRay1: number;
    alongRay2: number;
}
