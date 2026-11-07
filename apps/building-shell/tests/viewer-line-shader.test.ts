// The thick-line depth bias is a string patch on three.js's shader source: it must apply to the installed three.js, and
// fail loudly when it does not (journal decision 104).
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {describe, expect, it} from 'vitest';
import {GIZMO_DISTANCE, GIZMO_LABEL_AT, GIZMO_LABEL_SIZE, gizmoWorstExtent} from '../src/viewer/gizmo.ts';
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

  it('would clip a label that sat closer to the camera or further out', () => {
    // The check can fail: the same maths with the labels pushed out reads over 1.
    const tan = Math.tan((30 * Math.PI) / 360);
    const out = (2.2 * Math.sin(Math.PI / 2) + GIZMO_LABEL_SIZE / 2) / (GIZMO_DISTANCE * tan);
    expect(out).toBeGreaterThan(1);
    expect(GIZMO_LABEL_AT).toBeLessThan(2.2);
  });
});
