export type { Vector2 } from './types';

export type {
    GeometryPayload,
    GeometryPayloadBody,
    GeometryPayloadEnvelope,
    GeometryPayloadKind,
    VertexRunBody,
} from './geometry-payload';
export { GEOMETRY_PAYLOAD_FORMAT, GEOMETRY_PAYLOAD_VERSION, makeVertexRun } from './geometry-payload';

export type {
    AssumedField,
    ParseFailureReason,
    ParseGeometryPayloadFailure,
    ParseGeometryPayloadResult,
    ParseGeometryPayloadSuccess,
    PayloadEncoding,
    SerialiseOptions,
} from './geometry-payload-codec';
export {
    LEGACY_BARE_ARRAY_CLOSED,
    LEGACY_BARE_ARRAY_MIN_VERTICES,
    MAX_SERIALISED_LENGTH,
    parseGeometryPayload,
    serialiseGeometryPayload,
} from './geometry-payload-codec';
