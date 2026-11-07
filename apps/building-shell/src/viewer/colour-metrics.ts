// Colour arithmetic for the palette's floors (journal decision 98, F4): sRGB to CIELAB and the ΔE76 distance, plus the
// sRGB/linear conversion the draw buffers use. Pure functions on 0xRRGGBB integers.

export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** One sRGB channel in 0..255 to linear light in 0..1 (the IEC 61966-2-1 curve). */
export function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** One linear-light channel in 0..1 (clamped) to an sRGB channel in 0..255. */
export function linearToSrgb(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}

export const hexToRgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export const rgbToHex = ([r, g, b]: RGB): number => (r << 16) | (g << 8) | b;

export function hexToLab(hex: number): Lab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  // D65 white.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. 2.3 is a just-noticeable difference; 30 is plainly a different colour. */
export function deltaE76(a: number, b: number): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** `fg` laid over `bg` at `alpha`, per sRGB channel (the way the browser composites a translucent fill). */
export function over(fg: number, bg: number, alpha: number): number {
  const f = hexToRgb(fg), g = hexToRgb(bg);
  const mix = (i: number): number => Math.round(g[i] + (f[i] - g[i]) * alpha);
  return (mix(0) << 16) | (mix(1) << 8) | mix(2);
}
