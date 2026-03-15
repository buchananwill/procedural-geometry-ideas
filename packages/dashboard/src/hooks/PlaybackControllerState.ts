export interface PlaybackControllerState {
    currentFrame: number;
    maxFrame: number;
    isPlaying: boolean;
    playDelay: number;
    setCurrentFrame: (n: number) => void;
    setPlayDelay: (ms: number) => void;
    play: () => void;
    pause: () => void;
    togglePlayPause: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    frameLabel: string;
}
