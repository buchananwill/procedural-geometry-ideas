import type { Vector2 } from '@proc-geo/core';

/**
 * Undo the stage's pan offset so pointer input reaches the store in world
 * coordinates. Konva reports pointer positions relative to the stage container,
 * which never moves; panning shifts the stage's own transform, so the world
 * point under the cursor is the container-relative position less that offset.
 * The store and the solver only ever see world coordinates, so every pointer
 * sample crosses this function first.
 */
export function screenToWorld(screenPosition: Vector2, stagePosition: Vector2): Vector2 {
    return {
        x: screenPosition.x - stagePosition.x,
        y: screenPosition.y - stagePosition.y,
    };
}
