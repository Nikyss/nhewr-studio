import { converter, parse } from "culori";
import pica from "pica";
import { zipSync } from "fflate";
import { defaultSettings, type Asset, type ExportFormat, type RGBA, type Settings } from "./editor-types";
import { processPixels } from "./pixels";
import { enhanceInWorker } from "./quality";
import { checkDimensions, cropRaster, decodePng, pngBlob, rasterCanvas, readRaster, transformRaster, type Raster } from "./raster";

const rgb = converter("rgb");
export const MAX_PIXELS = 16_777_216;
export const MAX_SESSION_PIXELS = 33_554_432;

export function colorRGBA(value: string): RGBA | null {
  try {
    const input = value.trim();
    // ARGB uses byte alpha first; CSS eight-digit HEX keeps alpha last.
    const argbHex = input.match(/^(?:0x([\da-f]{8})|argb\(\s*#?([\da-f]{8})\s*\))$/i);
    if (argbHex) {
      const hex = argbHex[1] || argbHex[2];
      return [2, 4, 6, 0].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGBA;
    }
    const argb = input.match(/^argb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (argb) {
      const [a, r, g, b] = argb.slice(1).map(Number);
      return [a, r, g, b].every(n => n >= 0 && n <= 255) ? [r, g, b, a] : null;
    }
    const c = rgb(parse(input));
    if (!c || ![c.r, c.g, c.b, c.alpha ?? 1].every(Number.isFinite)) return null;
    return [c.r, c.g, c.b, c.alpha ?? 1].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)) as RGBA;
  } catch { return null; }
}

export function colorHex(value: string) {
  const color = colorRGBA(value);
  return color ? "#" + color.slice(0, 3).map(n => n.toString(16).padStart(2, "0")).join("") : "";
}
export function colorCSS(value: string) {
  const c = colorRGBA(value);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] / 255})` : "transparent";
}
export function validateSettings(s: Settings) {
  if (s.mode === "replace" && s.target && !colorRGBA(s.source)) throw new Error("Selecione uma cor original válida.");
  if (s.mode !== "none" && s.target && !colorRGBA(s.target)) throw new Error("A nova cor é inválida.");
  if (s.removeEnabled && !colorRGBA(s.removeColor)) throw new Error("Escolha a cor que será removida.");
  if (s.backgroundEnabled && !colorRGBA(s.background)) throw new Error("Escolha a cor de fundo.");
  if (s.replacements.length > 16) throw new Error("Use no máximo 16 trocas de cor por imagem.");
  if (s.replacements.some(rule => !colorRGBA(rule.source) || !colorRGBA(rule.target))) throw new Error("Há uma troca de cor inválida.");
}
export function bytes(size: number) { return size < 1024 ? `${size} B` : size < 1_048_576 ? `${(size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : `${(size / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`; }

export function createCanvas(width: number, height: number) {
  checkDimensions(Math.round(width), Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width); canvas.height = Math.round(height);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/png", quality = .92): Promise<Blob> {
  if (type === "image/png") return Promise.resolve(pngBlob(readRaster(canvas)));
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível gerar o arquivo.")), type, quality));
}

export function extractColors(canvas: HTMLCanvasElement): string[] {
  const { data } = readRaster(canvas);
  const colors = new Map<string, number>();
  const stride = Math.max(1, Math.floor(data.length / 4 / 100_000));
  for (let i = 0; i < data.length; i += 4 * stride) {
    if (!data[i + 3]) continue;
    const key = "#" + [data[i], data[i + 1], data[i + 2]].map(c => c.toString(16).padStart(2, "0")).join("");
    colors.set(key, (colors.get(key) ?? 0) + data[i + 3] / 255);
  }
  const distinct: string[] = [];
  for (const [color] of [...colors].sort((a, b) => b[1] - a[1])) {
    const candidate = colorRGBA(color)!;
    if (distinct.every(existing => {
      const other = colorRGBA(existing)!;
      return Math.hypot(candidate[0] - other[0], candidate[1] - other[1], candidate[2] - other[2]) >= 18;
    })) distinct.push(color);
    if (distinct.length === 12) break;
  }
  return distinct;
}

export async function importAsset(file: File): Promise<Asset> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: o limite por arquivo é 20 MB.`);
  if (!/\.(png|jpe?g|webp|svg|ico)$/i.test(file.name) && !/^image\/(png|jpeg|webp|svg\+xml|x-icon|vnd.microsoft.icon)$/.test(file.type)) throw new Error(`${file.name}: formato não aceito.`);
  if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") {
    const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
    if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error(`${file.name}: SVG inválido.`);
    // Images are decoded in an isolated image context; reject external resource dependencies.
    if (doc.querySelector("script, foreignObject") || [...doc.querySelectorAll("*")].some(el => [...el.attributes].some(a => /^on/i.test(a.name) || ((a.localName === "href" || a.name === "src") && !a.value.startsWith("#") && !a.value.startsWith("data:image/"))))) throw new Error(`${file.name}: o SVG precisa ser independente, sem scripts ou referências externas.`);
  }
  const url = URL.createObjectURL(file);
  try {
    let raster = decodePng(new Uint8Array(await file.arrayBuffer()));
    if (!raster) {
      const image = new Image(); image.src = url; await image.decode();
      const decoded = createCanvas(image.naturalWidth, image.naturalHeight);
      decoded.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!.drawImage(image, 0, 0);
      raster = readRaster(decoded);
    }
    const canvas = rasterCanvas(raster);
    const colors = extractColors(canvas);
    return { id: crypto.randomUUID(), name: file.name, size: file.size, width: canvas.width, height: canvas.height, url, canvas, colors,
      settings: { ...defaultSettings, source: colors[0] ?? "", width: canvas.width, height: canvas.height }, past: [], future: [] };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export function sampleColor(canvas: HTMLCanvasElement, x: number, y: number) {
  const index = (Math.max(0, Math.min(canvas.height - 1, Math.floor(y))) * canvas.width + Math.max(0, Math.min(canvas.width - 1, Math.floor(x)))) * 4;
  const pixel = readRaster(canvas).data.subarray(index, index + 4);
  if (!pixel[3]) return null;
  return "#" + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, "0")).join("");
}

let resizer: ReturnType<typeof pica> | undefined;
export async function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  checkDimensions(width, height);
  const raster = readRaster(canvas);
  if (width === raster.width && height === raster.height) return rasterCanvas(raster);
  resizer ??= pica({ features: ["js", "wasm"] });
  const data = await resizer.resizeBuffer({ src: new Uint8Array(raster.data), width: raster.width, height: raster.height, toWidth: width, toHeight: height, filter: "mks2013" });
  return rasterCanvas({ width, height, data: new Uint8ClampedArray(data) });
}

export async function renderAsset(asset: Asset, settings = asset.settings, signal?: AbortSignal) {
  const { width, height } = asset;
  const original = readRaster(asset.canvas);
  const replacementRGBA = settings.replacements.flatMap(rule => {
    const sourceRGBA = colorRGBA(rule.source), targetRGBA = colorRGBA(rule.target);
    return sourceRGBA && targetRGBA ? [{ sourceRGBA, targetRGBA }] : [];
  });
  if (settings.mode === "replace") {
    const sourceRGBA = colorRGBA(settings.source), targetRGBA = colorRGBA(settings.target);
    if (sourceRGBA && targetRGBA) replacementRGBA.push({ sourceRGBA, targetRGBA });
  }
  const pixelSettings = {
    ...settings,
    sourceRGBA: colorRGBA(settings.source),
    targetRGBA: colorRGBA(settings.target),
    removeRGBA: colorRGBA(settings.removeColor),
    replacementRGBA,
    paletteRGBA: asset.colors.flatMap(color => { const value = colorRGBA(color); return value ? [value] : []; }),
  };
  type Result = ReturnType<typeof processPixels>;
  const result = await new Promise<Result>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Cancelado", "AbortError")); return; }
    if (typeof Worker === "undefined") { resolve(processPixels(original.data, width, height, pixelSettings)); return; }
    let worker: Worker;
    let settled = false;
    const cleanup = () => { worker?.terminate(); signal?.removeEventListener("abort", abort); };
    const finish = (value: Result) => { if (!settled) { settled = true; cleanup(); resolve(value); } };
    const abort = () => { if (!settled) { settled = true; cleanup(); reject(new DOMException("Cancelado", "AbortError")); } };
    try {
      worker = new Worker(new URL("./pixel-worker.ts", import.meta.url), { type: "module" });
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) => { if (data.error) { settled = true; cleanup(); reject(new Error(data.error)); } else finish(data); };
      worker.onerror = () => { if (!settled) finish(processPixels(original.data, width, height, pixelSettings)); };
      worker.postMessage({ id: 1, data: original.data, width, height, settings: pixelSettings });
    } catch { finish(processPixels(original.data, width, height, pixelSettings)); }
  });
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
  let raster: Raster = { width, height, data: result.data };
  const mask = rasterCanvas({ width, height, data: result.mask });
  if (settings.trim) raster = cropRaster(raster);
  if (settings.resizeEnabled && !settings.qualityEnabled) raster = readRaster(await resizeCanvas(rasterCanvas(raster), settings.width, settings.height));
  raster = await enhanceInWorker(raster, settings, signal);
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
  raster = transformRaster(raster, settings, settings.backgroundEnabled ? colorRGBA(settings.background) : null);
  return { canvas: rasterCanvas(raster), mask, changed: result.changed, visible: result.visible };
}

export function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0, 100) || "icone";
}

export async function exportBlob(canvas: HTMLCanvasElement, format: ExportFormat, quality: number, jpegBackground: string) {
  if (format === "ico") {
    const size = Math.min(256, Math.max(canvas.width, canvas.height));
    const square = createCanvas(size, size);
    const ratio = size / Math.max(canvas.width, canvas.height);
    const scaled = await resizeCanvas(canvas, Math.max(1, Math.round(canvas.width * ratio)), Math.max(1, Math.round(canvas.height * ratio)));
    square.getContext("2d")!.drawImage(scaled, Math.floor((size - scaled.width) / 2), Math.floor((size - scaled.height) / 2));
    const png = await canvasBlob(square);
    const header = new ArrayBuffer(22); const view = new DataView(header);
    view.setUint16(2, 1, true); view.setUint16(4, 1, true);
    view.setUint8(6, size === 256 ? 0 : size); view.setUint8(7, size === 256 ? 0 : size);
    view.setUint16(10, 1, true); view.setUint16(12, 32, true);
    view.setUint32(14, png.size, true); view.setUint32(18, 22, true);
    return new Blob([header, png], { type: "image/x-icon" });
  }
  if (format === "jpeg") {
    if (!colorRGBA(jpegBackground)) throw new Error("Escolha a cor de fundo do JPG.");
    const flat = createCanvas(canvas.width, canvas.height); const ctx = flat.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.fillStyle = colorCSS(jpegBackground); ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(canvas, 0, 0);
    canvas = flat;
  }
  const blob = await canvasBlob(canvas, `image/${format}`, quality / 100);
  if (blob.type !== `image/${format}`) throw new Error("Este navegador não exporta nesse formato. Selecione PNG.");
  return blob;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function makeZip(files: Record<string, Uint8Array>) { return new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" }); }
