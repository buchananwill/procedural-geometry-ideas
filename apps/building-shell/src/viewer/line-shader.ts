// The thick lines (three.js `LineMaterial`), with one patch: a line is pulled toward the camera along its view ray by
// `uBias` (journal decision 98, F1), so an Edge lying in the crease between two faces is not buried in them while a
// face that is really in front still hides it.
//
// The patch is by string replacement on three.js's shader source, which goes silent if an upgrade rewrites the lines it
// matches. So `patchLineShader` throws when the patched source lacks the bias, and `tests/viewer-line-shader.test.ts`
// pins it against the installed three.js (journal decision 104).
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';

const UNIFORM_FROM = 'void main() {';
const UNIFORM_TO = 'uniform float uBias;\nvoid main() {';
const END_FROM = 'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );';
const END_TO = `${END_FROM}\n\t\t\tstart.xyz -= normalize( start.xyz ) * uBias;\n\t\t\tend.xyz -= normalize( end.xyz ) * uBias;`;

/** `source` with the bias applied; throws when the patch did not take. */
export function patchLineShader(source: string): string {
  const patched = source.replace(UNIFORM_FROM, UNIFORM_TO).replace(END_FROM, END_TO);
  if (!patched.includes('uniform float uBias;') || !patched.includes('start.xyz -= normalize( start.xyz ) * uBias;')) {
    throw new Error('patchLineShader: three.js\'s line vertex shader no longer matches the patch; update line-shader.ts');
  }
  return patched;
}

export interface LineMaterialOptions {
  /** Screen-space width in pixels. */
  width: number;
  /** Per-vertex colours when no `colour` is given. */
  colour?: number;
  opacity?: number;
  /** Draw through faces instead of depth-testing against them. */
  alwaysOnTop?: boolean;
}

/** A line material in screen-space width whose `uBias` uniform the caller sets each frame. */
export function makeBiasedLineMaterial(o: LineMaterialOptions): LineMaterial {
  const opacity = o.opacity ?? 1;
  const m = new LineMaterial({
    linewidth: o.width, transparent: opacity < 1, opacity, depthTest: !o.alwaysOnTop,
    ...(o.colour === undefined ? {vertexColors: true} : {color: o.colour}),
  });
  m.uniforms.uBias = {value: 0};
  m.vertexShader = patchLineShader(m.vertexShader);
  return m;
}
