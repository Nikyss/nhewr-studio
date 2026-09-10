import { converter, parse } from "culori";
import pica from "pica";
import { zipSync } from "fflate";
import { defaultSettings, type Asset, type ExportFormat, type RGBA, type Settings } from "./editor-types";
import { processPixels } from "./pixels";

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
}
export function bytes(size: number) { return size < 1024 ? `${size} B` : size < 1_048_576 ? `${(size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : `${(size / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`; }

export function createCanvas(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > MAX_PIXELS) throw new Error("A imagem deve ter até 8.192 px por lado e 16 megapixels.");
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width); canvas.height = Math.round(height);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/png", quality = .92): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível gerar o arquivo.")), type, quality));
}

export function extractColors(canvas: HTMLCanvasElement): string[] {
  const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
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
    const image = new Image(); image.src = url;
    await image.decode();
    const canvas = createCanvas(image.naturalWidth, image.naturalHeight);
    canvas.getContext("2d", { willReadFrequently: true })!.drawImage(image, 0, 0);
    const colors = extractColors(canvas);
    return { id: crypto.randomUUID(), name: file.name, size: file.size, width: canvas.width, height: canvas.height, url, canvas, colors,
      settings: { ...defaultSettings, source: colors[0] ?? "", width: canvas.width, height: canvas.height }, past: [], future: [] };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export function sampleColor(canvas: HTMLCanvasElement, x: number, y: number) {
  const pixel = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(Math.max(0, Math.min(canvas.width - 1, Math.floor(x))), Math.max(0, Math.min(canvas.height - 1, Math.floor(y))), 1, 1).data;
  if (!pixel[3]) return null;
  return "#" + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, "0")).join("");
}

let resizer: ReturnType<typeof pica> | undefined;
export async function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const target = createCanvas(width, height);
  resizer ??= pica({ features: ["js", "wasm"] });
  await resizer.resize(canvas, target, { filter: "mks2013" });
  return target;
}

export async function renderAsset(asset: Asset, settings = asset.settings, signal?: AbortSignal) {
  const { width, height } = asset;
  const original = asset.canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height);
  const pixelSettings = { ...settings, sourceRGBA: colorRGBA(settings.source), targetRGBA: colorRGBA(settings.target), removeRGBA: colorRGBA(settings.removeColor) };
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
  let canvas = createCanvas(width, height);
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(result.data), width, height), 0, 0);
  const mask = createCanvas(width, height);
  mask.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(result.mask), width, height), 0, 0);
  if (settings.trim) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (result.data[(y * width + x) * 4 + 3]) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    const crop = right >= left ? createCanvas(right - left + 1, bottom - top + 1) : createCanvas(1, 1);
    if (right >= left) crop.getContext("2d")!.drawImage(canvas, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    canvas = crop;
  }
  if (settings.resizeEnabled) canvas = await resizeCanvas(canvas, settings.width, settings.height);
  if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
  const quarter = Math.abs(settings.rotation % 180) === 90;
  const rotated = createCanvas(quarter ? canvas.height : canvas.width, quarter ? canvas.width : canvas.height);
  const context = rotated.getContext("2d")!;
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate(settings.rotation * Math.PI / 180);
  context.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  const padding = Math.max(0, Math.min(512, Math.round(settings.padding)));
  const final = createCanvas(rotated.width + padding * 2, rotated.height + padding * 2);
  const ctx = final.getContext("2d")!;
  if (settings.backgroundEnabled && colorRGBA(settings.background)) { ctx.fillStyle = colorCSS(settings.background); ctx.fillRect(0, 0, final.width, final.height); }
  ctx.drawImage(rotated, padding, padding);
  return { canvas: final, mask, changed: result.changed, visible: result.visible };
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
