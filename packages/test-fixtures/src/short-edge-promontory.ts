import {Vector2} from '@proc-geo/core';

/**
 * Reproducing input for the short-edge parcel defect (parcel-quality brief, 2026-08-09).
 *
 * The eastern promontory carries a run of short exterior edges — notably the ~8.6-unit edge from
 * (986.8, 317.9) to (992.7, 311.6) — each of which, under the one-strip-per-edge default, is
 * guaranteed a fronting parcel and therefore spawns a degenerate-tending triangular lot. It is the
 * repro case for `StripOptions.minEdgeLength`: with that bound active the short edges merge into
 * their straightest neighbouring run instead of standing as strips of their own.
 *
 * NOT in `ALL_TEST_POLYGONS`, recorded 2026-08-09: enrolment requires every sweeping suite to
 * pass, and this polygon fails exactly one of them — `large-coordinate-failures.test.ts`,
 * "every fixture survives translation to 1000000000 at its native span". It passes the same
 * sweep at 1e5/1e6/1e7, the 50×-scale envelope at every distance up to 1e8, and the 1e4 scale-up,
 * and every strip/slicing sweep at its native placement. The 1e9 failure is the known
 * large-coordinate envelope limitation (see the near-regular-polygons exclusion note in
 * `index.ts`), not a property of this shape's short edges. Promote once that envelope is fixed.
 */
export const SHORT_EDGE_PROMONTORY: Vector2[] = [
    {x: 755.7095794766699, y: 86.07079347753358},
    {x: 289.1438878983182, y: 132.98919477987982},
    {x: 255.1539350857047, y: 384.0154841600986},
    {x: 257.06831608404616, y: 442.50040482032244},
    {x: 361.1581017796838, y: 405.996833106862},
    {x: 634.3943018555723, y: 349.59755784784267},
    {x: 741.0289360381832, y: 473.6045930561204},
    {x: 759.51904665229, y: 437.7364643159455},
    {x: 788.2362486924904, y: 412.62829528803013},
    {x: 986.8179497273193, y: 317.8599048905803},
    {x: 992.6863691337453, y: 311.6008921755559},
    {x: 978.4250246813748, y: 302.5560034277609},
    {x: 895.3963646027089, y: 275.8419174170277},
    {x: 710.5896793315917, y: 256.39113601050616},
    {x: 748.5358573869659, y: 124.77812439558917},
    {x: 785.2349529111951, y: 64.0097246849636},
];
