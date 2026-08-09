import { screenToWorld } from '../../src/components/articulation/screen-to-world';

describe('screenToWorld', () => {
    it('is the identity when the stage has not been panned', () => {
        expect(screenToWorld({ x: 120, y: 80 }, { x: 0, y: 0 })).toEqual({ x: 120, y: 80 });
    });

    it('subtracts the stage offset so the world point under the cursor is recovered', () => {
        expect(screenToWorld({ x: 120, y: 80 }, { x: 50, y: -30 })).toEqual({ x: 70, y: 110 });
    });

    it('inverts the stage transform: a world point drawn at the stage offset reads back unchanged', () => {
        const stagePosition = { x: -215.5, y: 42.25 };
        const worldPoint = { x: 400, y: 300 };
        const screenPosition = { x: worldPoint.x + stagePosition.x, y: worldPoint.y + stagePosition.y };
        expect(screenToWorld(screenPosition, stagePosition)).toEqual(worldPoint);
    });
});
