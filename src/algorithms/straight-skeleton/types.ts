export interface Vector2 {
    x: number;
    y: number;
}

export interface PolygonNode {
    id: number;
    position: Vector2;
    inEdges: number[];
    outEdges: number[];
}

export interface PolygonEdge {
    id: number;
    source: number;
    target?: number;
    basisVector: Vector2;
}

export interface InteriorEdge {
    clockwiseExteriorEdge: number;
    widdershinsExteriorEdge: number;
}

export interface StraightSkeletonGraph {
    nodes: PolygonNode[];
    edges: PolygonEdge[];
    numExteriorNodes: number;
    interiorEdges: InteriorEdge[];
}

export interface RayProjection {
    basisVector: Vector2;
    sourceVector: Vector2;
}

export interface HeapInteriorEdge {
    sourceNode: number
    basisVector: Vector2;
    length: number;
}