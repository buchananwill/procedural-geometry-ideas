import log from 'loglevel';

export const solverLog    = log.getLogger('skeleton:solver');
export const collisionLog = log.getLogger('skeleton:collision');
export const splitLog     = log.getLogger('skeleton:split');
export const complexLog   = log.getLogger('skeleton:complex');
export const stepLog      = log.getLogger('skeleton:step');

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export function setSkeletonLogLevel(level: LogLevel): void {
    solverLog.setLevel(level);
    collisionLog.setLevel(level);
    splitLog.setLevel(level);
    complexLog.setLevel(level);
    stepLog.setLevel(level);
}

// Default: warn — production shows only warnings and errors
setSkeletonLogLevel('warn');
