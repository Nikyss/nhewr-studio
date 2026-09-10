import type { PixelSettings, RGBA } from "./editor-types";

function closeTo(data: Uint8ClampedArray, i: number, color: RGBA, tolerance: number) {
  return (data[i] - color[0]) ** 2 + (data[i + 1] - color[1]) ** 2 +
    (data[i + 2] - color[2]) ** 2 <= (tolerance / 100) ** 2 * 3 * 255 ** 2 + 0.01;
}

function distanceSq(data: Uint8ClampedArray, i: number, color: RGBA) {
  return (data[i] - color[0]) ** 2 + (data[i + 1] - color[1]) ** 2 + (data[i + 2] - color[2]) ** 2;
}

function boxBlur(input: Float32Array, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < Math.min(width, radius + 1); x++) sum += input[y * width + x];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / (Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1);
      if (x - radius >= 0) sum -= input[y * width + x - radius];
      if (x + radius + 1 < width) sum += input[y * width + x + radius + 1];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < Math.min(height, radius + 1); y++) sum += horizontal[y * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / (Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1);
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x];
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x];
    }
  }
  return output;
}

function borderConnected(mask: Float32Array, width: number, height: number, data: Uint8ClampedArray) {
  const visited = new Uint8Array(mask.length);
  const queue = new Uint32Array(mask.length);
  let tail = 0;
  const add = (n: number) => {
    if (!visited[n] && (mask[n] || data[n * 4 + 3] === 0)) { visited[n] = 1; queue[tail++] = n; }
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  for (let head = 0; head < tail; head++) {
    const n = queue[head];
    if (n % width > 0) add(n - 1);
    if (n % width < width - 1) add(n + 1);
    if (n >= width) add(n - width);
    if (n + width < mask.length) add(n + width);
  }
  for (let n = 0; n < mask.length; n++) if (!visited[n]) mask[n] = 0;
}

export function processPixels(input: Uint8ClampedArray, width: number, height: number, s: PixelSettings) {
  const output = new Uint8ClampedArray(input);
  const count = width * height;
  const selected = new Float32Array(count);
  const selectedRule = new Int16Array(count); selectedRule.fill(-1);
  const removed = new Float32Array(count);
  const rules = s.mode === "replace" ? (s.replacementRGBA?.length ? s.replacementRGBA : s.sourceRGBA && s.targetRGBA ? [{ sourceRGBA: s.sourceRGBA, targetRGBA: s.targetRGBA }] : []) : [];
  const canColor = s.mode === "solid" ? !!s.targetRGBA : rules.length > 0;
  const colorLimit = (s.tolerance / 100) ** 2 * 3 * 255 ** 2 + .01;
  for (let n = 0; n < count; n++) {
    const i = n * 4;
    if (!input[i + 3]) continue;
    if (canColor && s.mode === "solid") selected[n] = 1;
    else if (canColor) {
      let best = colorLimit, rule = -1;
      for (let r = 0; r < rules.length; r++) {
        const distance = distanceSq(input, i, rules[r].sourceRGBA);
        if (distance <= best) { best = distance; rule = r; }
      }
      if (rule >= 0) { selected[n] = 1; selectedRule[n] = rule; }
    }
    if (s.removeEnabled && s.removeRGBA && closeTo(input, i, s.removeRGBA, s.removeTolerance)) removed[n] = 1;
  }
  if (s.removeEnabled && s.edgeOnly) borderConnected(removed, width, height, input);
  const feather = s.removeEnabled && s.removeFeather > 0 ? boxBlur(removed, width, height, 1) : null;
  let weights = selected;
  if (s.smooth && rules.length) {
    // Normalize by visible coverage so transparent edges do not acquire dark fringes.
    const coverage = new Float32Array(count);
    const weighted = new Float32Array(count);
    for (let n = 0; n < count; n++) { coverage[n] = input[n * 4 + 3] / 255; weighted[n] = selected[n] * coverage[n]; }
    const r = Math.max(1, Math.min(20, Math.round(s.radius)));
    const soft = boxBlur(weighted, width, height, r);
    const total = boxBlur(coverage, width, height, r);
    weights = soft;
    for (let n = 0; n < count; n++) weights[n] = total[n] > 0 ? Math.max(0, Math.min(1, soft[n] / total[n])) : 0;
  }
  const mask = new Uint8ClampedArray(input.length);
  let changed = 0;
  let visible = 0;
  for (let n = 0; n < count; n++) {
    const i = n * 4;
    if (input[i + 3]) {
      visible++;
      if (s.normalizeEnabled && s.paletteRGBA?.length) {
        const limit = (s.normalizeTolerance / 100) ** 2 * 3 * 255 ** 2 + .01;
        let best = limit, match: RGBA | null = null;
        for (const color of s.paletteRGBA) {
          const distance = distanceSq(input, i, color);
          if (distance <= best) { best = distance; match = color; }
        }
        if (match) for (let c = 0; c < 3; c++) output[i + c] = match[c];
      }
      const amount = weights[n];
      if (canColor && amount > 0) {
        let target = s.targetRGBA;
        if (s.mode === "replace") {
          let rule = selectedRule[n];
          if (rule < 0) {
            let best = Infinity;
            for (let r = 0; r < rules.length; r++) { const distance = distanceSq(input, i, rules[r].sourceRGBA); if (distance < best) { best = distance; rule = r; } }
          }
          target = rule >= 0 ? rules[rule].targetRGBA : null;
        }
        if (target) {
          for (let c = 0; c < 3; c++) output[i + c] = output[i + c] * (1 - amount) + target[c] * amount;
          output[i + 3] *= 1 - amount + amount * target[3] / 255;
        }
      }
      const removeAmount = Math.max(0, Math.min(100, s.removeStrength)) / 100;
      if (removed[n]) output[i + 3] *= 1 - removeAmount;
      else if (feather) output[i + 3] *= 1 - feather[n] * s.removeFeather / 100 * removeAmount;
      if (s.filter === "grayscale") {
        const gray = output[i] * .2126 + output[i + 1] * .7152 + output[i + 2] * .0722;
        output[i] = output[i + 1] = output[i + 2] = gray;
      } else if (s.filter === "invert") for (let c = 0; c < 3; c++) output[i + c] = 255 - output[i + c];
      output[i + 3] *= s.opacity / 100;
    }
    const edited = output[i] !== input[i] || output[i + 1] !== input[i + 1] || output[i + 2] !== input[i + 2] || output[i + 3] !== input[i + 3];
    if (edited) changed++;
    mask[i] = mask[i + 1] = mask[i + 2] = edited ? 0 : 255;
    mask[i + 3] = 255;
  }
  return { data: output, mask, changed, visible };
}
