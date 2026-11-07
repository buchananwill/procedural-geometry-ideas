// The thick-line depth bias is a string patch on three.js's shader source: it must apply to the installed three.js, and
// fail loudly when it does not (journal decision 104).
import {readFileSync} from 'node:fs';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {describe, expect, it} from 'vitest';
import {GIZMO_AXIS_LENGTH, GIZMO_DISTANCE, GIZMO_FOV, GIZMO_LABEL_AT, GIZMO_LABEL_SIZE, GIZMO_SHAPE, gizmoWorstExtent} from '../src/viewer/gizmo.ts';
import {makeBiasedLineMaterial, patchLineShader} from '../src/viewer/line-shader.ts';

describe('line shader patch', () => {
  it('applies to the installed three.js: the uniform is declared and both endpoints are pulled toward the camera', () => {
    const patched = patchLineShader(new LineMaterial().vertexShader);
    expect(patched).toContain('uniform float uBias;');
    expect(patched).toContain('start.xyz -= normalize( start.xyz ) * uBias;');
    expect(patched).toContain('end.xyz -= normalize( end.xyz ) * uBias;');
  });

  it('makeBiasedLineMaterial returns a material with a uBias uniform and the patched shader', () => {
    const m = makeBiasedLineMaterial({width: 3});
    expect(m.uniforms.uBias.value).toBe(0);
    expect(m.vertexShader).toContain('uniform float uBias;');
  });

  it('throws when the shader source is not the one the patch expects', () => {
    expect(() => patchLineShader('void mainImage() {}')).toThrow(/no longer matches/);
    expect(() => patchLineShader('')).toThrow(/no longer matches/);
  });

  it('a depth-tested line is the default, and alwaysOnTop turns the test off', () => {
    expect(makeBiasedLineMaterial({width: 1}).depthTest).toBe(true);
    expect(makeBiasedLineMaterial({width: 1, alwaysOnTop: true}).depthTest).toBe(false);
  });
});

describe('orientation gizmo', () => {
  it('keeps every label inside its square in every view direction', () => {
    expect(gizmoWorstExtent()).toBeLessThan(1);
  });

  it('would clip a label that sat further out or a camera that stood closer: the same function reads over 1', () => {
    expect(gizmoWorstExtent({labelAt: 2.2})).toBeGreaterThan(1);
    expect(gizmoWorstExtent({distance: 3})).toBeGreaterThan(1);
    expect(gizmoWorstExtent({labelSize: 1.5})).toBeGreaterThan(1);
    expect(gizmoWorstExtent({fov: 15})).toBeGreaterThan(1);
  });

  it('with no overrides it reads the numbers the scene is built from, which the gizmo camera takes (GIZMO_FOV)', () => {
    expect(gizmoWorstExtent({})).toBe(gizmoWorstExtent(GIZMO_SHAPE));
    expect(GIZMO_SHAPE).toEqual({fov: GIZMO_FOV, distance: GIZMO_DISTANCE, axisLength: GIZMO_AXIS_LENGTH, labelAt: GIZMO_LABEL_AT, labelSize: GIZMO_LABEL_SIZE});
    expect(gizmoWorstExtent({labelAt: GIZMO_LABEL_AT})).toBe(gizmoWorstExtent());
  });

  it('the scene builds its gizmo camera with GIZMO_FOV, so the clip test and the screen share the number', () => {
    const source = readFileSync(new URL('../src/viewer/scene.ts', import.meta.url), 'utf8');
    expect(source).toContain('gizmoCamera = new PerspectiveCamera(GIZMO_FOV,');
  });

  it('a label further out always reaches further', () => {
    expect(gizmoWorstExtent({labelAt: GIZMO_LABEL_AT + 0.5})).toBeGreaterThan(gizmoWorstExtent());
  });
});
