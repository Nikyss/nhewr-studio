import { convertIndexedToRgb, decode, encode, hasPngSignature } from "fast-png";
import type { RGBA, Settings } from "./editor-types";

export type Raster = { width: number; height: number; data: Uint8ClampedArray };
const originals = new WeakMap<HTMLCanvasElement, Raster>();

export function checkDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error("A imagem deve ter até 8.192 px por lado e 16 megapixels.");
}

export function readRaster(canvas: HTMLCanvasElement): Raster {
  return originals.get(canvas) ?? { width: canvas.width, height: canvas.height, data: canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data };
}

export function rasterCanvas(raster: Raster) {
  checkDimensions(raster.width, raster.height);
  if (raster.data.length !== raster.width * raster.height * 4) throw new Error("Dados de imagem inválidos.");
  const canvas = document.createElement("canvas");
  canvas.width = raster.width; canvas.height = raster.height;
  canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  // The canvas is a display surface, never the authoritative copy of PNG channels.
  originals.set(canvas, raster);
  return canvas;
}

export function decodePng(bytes: Uint8Array): Raster | null {
  if (!hasPngSignature(bytes)) return null;
  if (bytes.length < 33) throw new Error("PNG incompleto.");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  checkDimensions(header.getUint32(16), header.getUint32(20));
  const png = decode(bytes, { checkCrc: true });
  let source = png.data, channels = png.channels, depth = png.depth;
  if (png.palette) { source = convertIndexedToRgb(png); channels = png.palette[0].length; depth = 8; }
  const data = new Uint8ClampedArray(png.width * png.height * 4);
  const max = 2 ** depth - 1;
  const sample = (n: number, channel: number) => {
    if (depth >= 8) return source[n * channels + channel];
    const rowBytes = Math.ceil(png.width * depth / 8);
    const bit = (n % png.width) * depth;
    return (source[Math.floor(n / png.width) * rowBytes + Math.floor(bit / 8)] >> (8 - depth - bit % 8)) & max;
  };
  for (let n = 0; n < png.width * png.height; n++) {
    const gray = channels <= 2;
    const r = sample(n, 0), g = gray ? r : sample(n, 1), b = gray ? r : sample(n, 2);
    const alpha = channels === 2 || channels === 4 ? sample(n, channels - 1) : max;
    const transparent = !png.palette && png.transparency && r === png.transparency[0] && (gray || (g === png.transparency[1] && b === png.transparency[2]));
    data.set([r / max * 255, g / max * 255, b / max * 255, transparent ? 0 : alpha / max * 255], n * 4);
  }
  return { width: png.width, height: png.height, data };
}

export function pngBlob(raster: Raster) {
  return new Blob([new Uint8Array(encode({ ...raster, depth: 8, channels: 4 }))], { type: "image/png" });
}

export function cropRaster(raster: Raster): Raster {
  const { width, height, data } = raster;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  const w = right - left + 1, h = bottom - top + 1, output = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) output.set(data.subarray(((top + y) * width + left) * 4, ((top + y) * width + left + w) * 4), y * w * 4);
  return { width: w, height: h, data: output };
}

export function transformRaster(raster: Raster, settings: Pick<Settings, "rotation" | "flipX" | "flipY" | "padding">, background: RGBA | null): Raster {
  const { width, height, data } = raster;
  const rotation = ((settings.rotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new Error("Rotação inválida.");
  const padding = Math.max(0, Math.min(512, Math.round(settings.padding)));
  if (!rotation && !settings.flipX && !settings.flipY && !padding && !background) return raster;
  const w = (rotation % 180 ? height : width) + padding * 2, h = (rotation % 180 ? width : height) + padding * 2;
  checkDimensions(w, h);
  const output = new Uint8ClampedArray(w * h * 4);
  if (background) for (let i = 0; i < output.length; i += 4) output.set(background, i);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const fx = settings.flipX ? width - 1 - x : x, fy = settings.flipY ? height - 1 - y : y;
    const dx = rotation === 90 ? height - 1 - fy : rotation === 180 ? width - 1 - fx : rotation === 270 ? fy : fx;
    const dy = rotation === 90 ? fx : rotation === 180 ? height - 1 - fy : rotation === 270 ? width - 1 - fx : fy;
    const i = (y * width + x) * 4, j = ((dy + padding) * w + dx + padding) * 4;
    if (!background) output.set(data.subarray(i, i + 4), j);
    else {
      const a = data[i + 3] / 255, behind = background[3] / 255 * (1 - a), alpha = a + behind;
      for (let c = 0; c < 3; c++) output[j + c] = alpha ? (data[i + c] * a + background[c] * behind) / alpha : 0;
      output[j + 3] = alpha * 255;
    }
  }
  return { width: w, height: h, data: output };
}
