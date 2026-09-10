import resize from "@jsquash/resize";
import type { Settings } from "./editor-types";
import { checkDimensions, type Raster } from "./raster";

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
}

export function enhanceInWorker(input: Raster, s: Settings, signal?: AbortSignal): Promise<Raster> {
  if (!s.qualityEnabled || typeof Worker === "undefined") return enhanceRaster(input, s, signal);
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    const worker = new Worker(new URL("./quality-worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Cancelado", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error) reject(new Error(data.error)); else resolve(data.raster);
    };
    worker.onerror = () => { cleanup(); reject(new Error("Falha ao melhorar a imagem. Reduza a ampliação e tente novamente.")); };
    worker.postMessage({ input, settings: s });
  });
}

export async function enhanceRaster(input: Raster, s: Settings, signal?: AbortSignal): Promise<Raster> {
  if (!s.qualityEnabled) return input;
  if (![1, 2, 4].includes(s.qualityScale)) throw new Error("Selecione uma ampliação de 1×, 2× ou 4×.");
  const width = (s.resizeEnabled ? s.width : input.width) * s.qualityScale;
  const height = (s.resizeEnabled ? s.height : input.height) * s.qualityScale;
  checkDimensions(width, height);
  checkAbort(signal);
  let source = input.data;
  const amount = Math.max(0, Math.min(100, s.edgeSoftness)) / 100;
  if (amount > 0) {
    source = new Uint8ClampedArray(input.data);
    // Only alpha is blurred. Newly covered pixels inherit a visible neighbour's RGB.
    for (let y = 0; y < input.height; y++) {
      for (let x = 0; x < input.width; x++) {
        const i = (y * input.width + x) * 4;
        let alpha = 0, best = i, bestAlpha = input.data[i + 3];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.max(0, Math.min(input.width - 1, x + dx));
          const sy = Math.max(0, Math.min(input.height - 1, y + dy));
          const j = (sy * input.width + sx) * 4, a = input.data[j + 3];
          alpha += a * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
          if (a > bestAlpha) { best = j; bestAlpha = a; }
        }
        source[i + 3] = input.data[i + 3] * (1 - amount) + alpha / 16 * amount;
        if (!input.data[i + 3] && source[i + 3]) source.set(input.data.subarray(best, best + 3), i);
      }
      if (y % 64 === 0) { await pause(); checkAbort(signal); }
    }
  }
  if (width === input.width && height === input.height) return { ...input, data: source };
  const resized = await resize(new ImageData(new Uint8ClampedArray(source), input.width, input.height), {
    width, height, method: s.preserveColors ? "lanczos3" : s.qualityMethod,
    fitMethod: "stretch", premultiply: true, linearRGB: true,
  });
  checkAbort(signal);
  const data = new Uint8ClampedArray(resized.data);
  if (s.preserveColors) {
    const searchRadius = Math.ceil(Math.max(3, input.width / width * 3, input.height / height * 3));
    // jSquash filters alpha; RGB is copied from the closest covered source pixel, never averaged.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (!data[i + 3]) continue;
        const fx = (x + .5) * input.width / width - .5, fy = (y + .5) * input.height / height - .5;
        const sx = Math.max(0, Math.min(input.width - 1, Math.round(fx)));
        const sy = Math.max(0, Math.min(input.height - 1, Math.round(fy)));
        let best = (sy * input.width + sx) * 4;
        if (!source[best + 3]) {
          let distance = Infinity;
          for (let dy = -searchRadius; dy <= searchRadius; dy++) for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || ny < 0 || nx >= input.width || ny >= input.height) continue;
            const j = (ny * input.width + nx) * 4, d = (nx - fx) ** 2 + (ny - fy) ** 2;
            if (source[j + 3] && d < distance) { best = j; distance = d; }
          }
          if (distance === Infinity) { data[i + 3] = 0; continue; }
        }
        data.set(source.subarray(best, best + 3), i);
      }
      if (y % 64 === 0) { await pause(); checkAbort(signal); }
    }
  }
  return { width, height, data };
}
