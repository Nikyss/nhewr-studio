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

const percent = (value: number) => Math.max(0, Math.min(100, value)) / 100;
function mergeRemoval(mask: Float32Array, index: number, amount: number) {
  if (amount > mask[index]) mask[index] = amount;
}

function colorRemovalMask(input: Uint8ClampedArray, width: number, height: number, s: PixelSettings) {
  const output = new Float32Array(width * height);
  if (!s.removeEnabled) return output;
  const rules = s.removalRGBA?.length ? s.removalRGBA : s.removeRGBA ? [{ colorRGBA: s.removeRGBA, strength: s.removeStrength, tolerance: s.removeTolerance, feather: s.removeFeather, edgeOnly: s.edgeOnly }] : [];
  for (const rule of rules) {
    const strength = percent(rule.strength);
    if (!strength) continue;
    const selected = new Float32Array(width * height);
    for (let n = 0; n < selected.length; n++) {
      const i = n * 4;
      if (input[i + 3] && closeTo(input, i, rule.colorRGBA, rule.tolerance)) selected[n] = 1;
    }
    if (rule.edgeOnly) borderConnected(selected, width, height, input);
    const feather = rule.feather > 0 ? boxBlur(selected, width, height, 1) : null;
    for (let n = 0; n < selected.length; n++) {
      const amount = selected[n] ? strength : feather ? feather[n] * percent(rule.feather) * strength : 0;
      mergeRemoval(output, n, amount);
    }
  }
  return output;
}

function stampCircle(mask: Float32Array, width: number, height: number, cx: number, cy: number, radius: number, amount: number) {
  const left = Math.max(0, Math.floor(cx - radius));
  const right = Math.min(width - 1, Math.ceil(cx + radius));
  const top = Math.max(0, Math.floor(cy - radius));
  const bottom = Math.min(height - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= radiusSq) mergeRemoval(mask, y * width + x, amount);
  }
}

function rasterizeEraser(mask: Float32Array, width: number, height: number, points: { x: number; y: number }[], size: number, strength: number) {
  if (!points.length) return;
  const radius = Math.max(.5, Math.min(512, size) / 2);
  const amount = percent(strength);
  if (!amount) return;
  if (points.length === 1) { stampCircle(mask, width, height, points[0].x, points[0].y, radius, amount); return; }
  for (let n = 1; n < points.length; n++) {
    const from = points[n - 1], to = points[n];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(.75, radius * .45)));
    for (let step = 0; step <= steps; step++) {
      const progress = step / steps;
      stampCircle(mask, width, height, from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress, radius, amount);
    }
  }
}

function rasterizeBucket(mask: Float32Array, input: Uint8ClampedArray, width: number, height: number, point: { x: number; y: number }, tolerance: number, strength: number) {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const seedIndex = (y * width + x) * 4;
  if (!input[seedIndex + 3]) return;
  const color: RGBA = [input[seedIndex], input[seedIndex + 1], input[seedIndex + 2], input[seedIndex + 3]];
  const amount = percent(strength);
  for (let n = 0; n < width * height; n++) {
    const i = n * 4;
    if (input[i + 3] && closeTo(input, i, color, tolerance)) mergeRemoval(mask, n, amount);
  }
}

function rasterizeLasso(mask: Float32Array, width: number, height: number, points: { x: number; y: number }[], strength: number) {
  if (points.length < 3) return;
  const amount = percent(strength);
  if (!amount) return;
  const top = Math.max(0, Math.floor(Math.min(...points.map(point => point.y))));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...points.map(point => point.y))));
  for (let y = top; y <= bottom; y++) {
    const scanY = y + .5;
    const intersections: number[] = [];
    for (let n = 0; n < points.length; n++) {
      const from = points[n], to = points[(n + 1) % points.length];
      if ((from.y <= scanY && to.y > scanY) || (to.y <= scanY && from.y > scanY)) intersections.push(from.x + (scanY - from.y) * (to.x - from.x) / (to.y - from.y));
    }
    intersections.sort((a, b) => a - b);
    for (let n = 0; n + 1 < intersections.length; n += 2) {
      const left = Math.max(0, Math.ceil(intersections[n] - .5));
      const right = Math.min(width - 1, Math.floor(intersections[n + 1] - .5));
      for (let x = left; x <= right; x++) mergeRemoval(mask, y * width + x, amount);
    }
  }
}

function manualRemovalMask(input: Uint8ClampedArray, width: number, height: number, s: PixelSettings) {
  const output = new Float32Array(width * height);
  for (const operation of s.eraseOperations.slice(-80)) {
    if (operation.type === "eraser") rasterizeEraser(output, width, height, operation.points, operation.size, operation.strength);
    else if (operation.type === "bucket") rasterizeBucket(output, input, width, height, operation.point, operation.tolerance, operation.strength);
    else rasterizeLasso(output, width, height, operation.points, operation.strength);
  }
  return output;
}

export function processPixels(input: Uint8ClampedArray, width: number, height: number, s: PixelSettings) {
  const output = new Uint8ClampedArray(input);
  const count = width * height;
  const selected = new Float32Array(count);
  const selectedRule = new Int16Array(count); selectedRule.fill(-1);
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
  }
  const removed = colorRemovalMask(input, width, height, s);
  const manuallyRemoved = manualRemovalMask(input, width, height, s);
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
      // Repair near-opaque source fills before intentional alpha edits, never after them.
      if (s.repairOpacity && output[i + 3] >= 250) output[i + 3] = 255;
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
      const removeAmount = Math.max(removed[n], manuallyRemoved[n]);
      if (removeAmount) output[i + 3] *= 1 - removeAmount;
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
