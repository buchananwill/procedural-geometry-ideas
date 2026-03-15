import { usePlaybackStore } from '../../src/stores/usePlaybackStore';

// Helper: reset the store to its initial state before each test.
// Zustand stores are singletons, so we must manually reset between tests.
const resetStore = () => {
    usePlaybackStore.setState({
        currentFrame: 0,
        isPlaying: false,
        playDelay: 500,
    });
};

beforeEach(() => {
    resetStore();
});

// -- Initial state -----------------------------------------------------------

describe('initial state', () => {
    it('starts with currentFrame = 0', () => {
        expect(usePlaybackStore.getState().currentFrame).toBe(0);
    });

    it('starts with isPlaying = false', () => {
        expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });

    it('starts with playDelay = 500', () => {
        expect(usePlaybackStore.getState().playDelay).toBe(500);
    });
});

// -- setCurrentFrame ---------------------------------------------------------

describe('setCurrentFrame', () => {
    it('sets the current frame to the given value', () => {
        usePlaybackStore.getState().setCurrentFrame(7);
        expect(usePlaybackStore.getState().currentFrame).toBe(7);
    });

    it('can set the frame to 0', () => {
        usePlaybackStore.getState().setCurrentFrame(5);
        usePlaybackStore.getState().setCurrentFrame(0);
        expect(usePlaybackStore.getState().currentFrame).toBe(0);
    });
});

// -- setIsPlaying ------------------------------------------------------------

describe('setIsPlaying', () => {
    it('sets isPlaying to true', () => {
        usePlaybackStore.getState().setIsPlaying(true);
        expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });

    it('sets isPlaying to false', () => {
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().setIsPlaying(false);
        expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });
});

// -- setPlayDelay ------------------------------------------------------------

describe('setPlayDelay', () => {
    it('sets the play delay to the given value', () => {
        usePlaybackStore.getState().setPlayDelay(200);
        expect(usePlaybackStore.getState().playDelay).toBe(200);
    });
});

// -- resetPlayback -----------------------------------------------------------

describe('resetPlayback', () => {
    it('resets currentFrame to 0', () => {
        usePlaybackStore.getState().setCurrentFrame(10);
        usePlaybackStore.getState().resetPlayback();
        expect(usePlaybackStore.getState().currentFrame).toBe(0);
    });

    it('resets isPlaying to false', () => {
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().resetPlayback();
        expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });

    it('preserves playDelay', () => {
        usePlaybackStore.getState().setPlayDelay(100);
        usePlaybackStore.getState().setCurrentFrame(10);
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().resetPlayback();
        expect(usePlaybackStore.getState().playDelay).toBe(100);
    });
});

// -- clampToMax --------------------------------------------------------------

describe('clampToMax', () => {
    it('clamps currentFrame when it exceeds newMax', () => {
        usePlaybackStore.getState().setCurrentFrame(10);
        usePlaybackStore.getState().clampToMax(5);
        expect(usePlaybackStore.getState().currentFrame).toBe(5);
    });

    it('stops playing when currentFrame exceeds newMax', () => {
        usePlaybackStore.getState().setCurrentFrame(10);
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().clampToMax(5);
        expect(usePlaybackStore.getState().isPlaying).toBe(false);
    });

    it('does not change currentFrame when it equals newMax', () => {
        usePlaybackStore.getState().setCurrentFrame(5);
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().clampToMax(5);
        expect(usePlaybackStore.getState().currentFrame).toBe(5);
    });

    it('does not stop playing when currentFrame equals newMax', () => {
        usePlaybackStore.getState().setCurrentFrame(5);
        usePlaybackStore.getState().setIsPlaying(true);
        usePlaybackStore.getState().clampToMax(5);
        expect(usePlaybackStore.getState().isPlaying).toBe(true);
    });

    it('does not change currentFrame when it is below newMax', () => {
        usePlaybackStore.getState().setCurrentFrame(3);
        usePlaybackStore.getState().clampToMax(5);
        expect(usePlaybackStore.getState().currentFrame).toBe(3);
    });

    it('clamps to 0 when newMax is 0 and currentFrame > 0', () => {
        usePlaybackStore.getState().setCurrentFrame(3);
        usePlaybackStore.getState().clampToMax(0);
        expect(usePlaybackStore.getState().currentFrame).toBe(0);
    });
});
