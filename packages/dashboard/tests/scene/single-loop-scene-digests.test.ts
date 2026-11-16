import { writeFileSync } from 'node:fs';
import { FULL_CORPUS } from '@proc-geo/test-fixtures';
import { singleLoopSceneDigest } from './single-loop-scene-digest';
import { SINGLE_LOOP_SCENE_DIGESTS } from './single-loop-scene-digests';

/*
 * ============================================================================
 *  EVERY SINGLE-LOOP PICTURE IS UNCHANGED (dashboard holed-fixtures spec, decisions 41 and 42; BSA.D317).
 * ============================================================================
 *
 * The holed fixtures came into the skeleton page through the scene adapter, the solve boundary, the primary preview
 * and the sweep. A single-loop fixture must draw exactly what it drew before: this pins a SHA-256 of
 * `skeletonToScene`'s output for every `FULL_CORPUS` fixture, every debug flag off and every flag on, measured on the
 * tree before the first edit to the dashboard. A digest that moves is a single-loop picture that changed.
 *
 * `SCENE_DIGEST_OUT=<file>` writes the measured table to that file instead of comparing, for a deliberate re-pin.
 */

const OUT = process.env.SCENE_DIGEST_OUT;

describe('the single-loop scene digests', () => {
    it('covers every FULL_CORPUS fixture, and nothing else', () => {
        expect(Object.keys(SINGLE_LOOP_SCENE_DIGESTS).sort()).toEqual(FULL_CORPUS.map(fixture => fixture.name).sort());
    });

    it('is deterministic', () => {
        const [first] = FULL_CORPUS;
        expect(singleLoopSceneDigest(first.vertices, true)).toBe(singleLoopSceneDigest(first.vertices, true));
    });

    if (OUT) {
        it('writes the measured table', () => {
            const table = Object.fromEntries(FULL_CORPUS.map(fixture => [fixture.name, {
                off: singleLoopSceneDigest(fixture.vertices, false),
                on: singleLoopSceneDigest(fixture.vertices, true),
            }]));
            writeFileSync(OUT, JSON.stringify(table, null, 4));
        });
        return;
    }

    it.each(FULL_CORPUS.map(fixture => [fixture.name, fixture.vertices] as const))('%s', (name, vertices) => {
        expect({
            off: singleLoopSceneDigest(vertices, false),
            on: singleLoopSceneDigest(vertices, true),
        }).toEqual(SINGLE_LOOP_SCENE_DIGESTS[name]);
    });
});
