import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface PlaybackStoreState {
    currentFrame: number;
    isPlaying: boolean;
    playDelay: number;
    setCurrentFrame: (n: number) => void;
    setIsPlaying: (v: boolean) => void;
    setPlayDelay: (ms: number) => void;
    resetPlayback: () => void;
    clampToMax: (newMax: number) => void;
}

export const usePlaybackStore = create<PlaybackStoreState>()(
    immer((set) => ({
        currentFrame: 0,
        isPlaying: false,
        playDelay: 500,

        setCurrentFrame: (n) =>
            set((state) => {
                state.currentFrame = n;
            }),

        setIsPlaying: (v) =>
            set((state) => {
                state.isPlaying = v;
            }),

        setPlayDelay: (ms) =>
            set((state) => {
                state.playDelay = ms;
            }),

        resetPlayback: () =>
            set((state) => {
                state.currentFrame = 0;
                state.isPlaying = false;
            }),

        clampToMax: (newMax) =>
            set((state) => {
                if (state.currentFrame > newMax) {
                    state.currentFrame = newMax;
                    state.isPlaying = false;
                }
            }),
    }))
);
