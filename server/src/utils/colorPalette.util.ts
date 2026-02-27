/**
 * HSL-based color palette generation for charts.
 * Inspired by: https://stackoverflow.com/a/19389478 (CC BY-SA 3.0)
 */

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Convert RGB (0-255) to HSL. */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const dRed = r / 255;
  const dGrn = g / 255;
  const dBlu = b / 255;
  const dMax = Math.max(dRed, dGrn, dBlu);
  const dMin = Math.min(dRed, dGrn, dBlu);

  let h = 0;
  if (dMax !== dMin) {
    if (dMax === dRed && dGrn >= dBlu) {
      h = (60 * (dGrn - dBlu)) / (dMax - dMin);
    } else if (dMax === dRed && dGrn < dBlu) {
      h = (60 * (dGrn - dBlu)) / (dMax - dMin) + 360;
    } else if (dMax === dGrn) {
      h = (60 * (dBlu - dRed)) / (dMax - dMin) + 120;
    } else {
      h = (60 * (dRed - dGrn)) / (dMax - dMin) + 240;
    }
  }

  const l = (dMax + dMin) / 2;
  let s = 0;
  if (l > 0 && dMax !== dMin) {
    s = l <= 0.5
      ? (dMax - dMin) / (dMax + dMin)
      : (dMax - dMin) / (2 - (dMax + dMin));
  }

  return { h, s, l };
}

/** Convert HSL to RGB (0-255). */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const dQ = l < 0.5
    ? l * (1 + s)
    : l + s - l * s;
  const dP = 2 * l - dQ;
  const dHueAng = h / 360;

  const hueToChannel = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x * 6 < 1) return dP + (dQ - dP) * 6 * x;
    if (x * 2 < 1) return dQ;
    if (x * 3 < 2) return dP + (dQ - dP) * (2 / 3 - x) * 6;
    return dP;
  };

  const r = Math.round(hueToChannel(dHueAng + 1 / 3) * 255);
  const g = Math.round(hueToChannel(dHueAng) * 255);
  const b = Math.round(hueToChannel(dHueAng - 1 / 3) * 255);

  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

export interface GenerateDistinctColorsOptions {
  baseHex?: number;
  nonAdjacent?: boolean;
}

/**
 * Generate an array of distinct colors for chart series.
 * Colors are evenly spaced in hue from a base color; optional reorder so adjacent indices are less similar.
 */
export function generateDistinctColors(
  count: number,
  options: GenerateDistinctColorsOptions = {},
): string[] {
  const { baseHex = 0x8a56e2, nonAdjacent = true } = options;

  if (count <= 0) return [];

  const r = (baseHex >> 16) & 0xff;
  const g = (baseHex >> 8) & 0xff;
  const b = baseHex & 0xff;
  const base = rgbToHsl(r, g, b);

  if (count === 1) {
    return [rgbToHex(r, g, b)];
  }

  const step = 360 / count;
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    let hue = (base.h + i * step) % 360;
    if (hue < 0) hue += 360;
    const rgb = hslToRgb(hue, base.s, base.l);
    colors.push(rgbToHex(rgb.r, rgb.g, rgb.b));
  }

  if (nonAdjacent && count > 2) {
    const half = Math.floor(count / 2);
    for (let i = 0, j = half; i < half; i += 2, j += 2) {
      if (j < count) {
        const a = colors[i];
        const b = colors[j];
        if (a !== undefined && b !== undefined) {
          colors[i] = b;
          colors[j] = a;
        }
      }
    }
  }

  return colors;
}
