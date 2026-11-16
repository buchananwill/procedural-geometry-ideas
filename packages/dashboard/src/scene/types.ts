export interface StrokeStyle {
    color: string;
    width: number;
    dash?: number[];
    opacity?: number;
}

export interface FillStyle {
    color: string;
    opacity?: number;
}

export interface TextStyle {
    fontSize: number;
    color: string;
    bold?: boolean;
}

export interface SceneLine {
    type: 'line';
    points: number[];
    closed?: boolean;
    stroke: StrokeStyle;
    fill?: FillStyle;
    arrow?: { pointerLength: number; pointerWidth: number };
}

export interface ScenePoint {
    type: 'point';
    x: number;
    y: number;
    radius: number;
    fill: FillStyle;
    stroke?: StrokeStyle;
}

export interface SceneLabel {
    type: 'label';
    x: number;
    y: number;
    offsetX?: number;
    offsetY?: number;
    text: string;
    style: TextStyle;
}

/**
 * A filled region of several closed rings, ring 0 the outline (dashboard holed-fixtures spec, decision 24). Filled by
 * the EVEN-ODD rule, so a hole inside the outline is empty however its ring is wound. `rings` are flat `[x, y, …]`
 * point lists, as `SceneLine.points` is. It has no stroke: each ring is stroked by a line of its own.
 */
export interface SceneRegion {
    type: 'region';
    rings: number[][];
    fill: FillStyle;
}

export interface SceneGroup {
    type: 'group';
    id: string;
    children: ScenePrimitive[];
    visible?: boolean;
}

export type ScenePrimitive = SceneLine | ScenePoint | SceneLabel | SceneRegion | SceneGroup;
