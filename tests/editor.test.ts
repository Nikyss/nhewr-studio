import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas as nativeCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { defaultSettings, type Asset, type PixelSettings } from "../lib/editor-types";
import { processPixels } from "../lib/pixels";

Object.assign(globalThis, { ImageData, document: { createElement: (tag: string) => {
  if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
  const canvas = nativeCanvas(1, 1);
  Object.defineProperty(canvas, Symbol.toStringTag, { value: "HTMLCanvasElement" });
  Object.assign(canvas, { toBlob: async (callback: (value: Blob) => void, type: string, quality: number) => {
    const format = type === "image/jpeg" ? "jpeg" : type === "image/webp" ? "webp" : "png";
    const data = format === "png" ? await canvas.encode("png") : await canvas.encode(format, Math.round(quality * 100)); callback(new Blob([new Uint8Array(data)], { type }));
  } }); return canvas;
} } });

const { colorRGBA, colorHex, colorCSS, createCanvas, renderAsset, exportBlob, makeZip, validateSettings, safeName } = await import("../lib/image-editor");
const source = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128, 255, 255, 255, 255, 25, 26, 27, 0]);
const options: PixelSettings = { ...defaultSettings, source: "#000", target: "#1677aa", tolerance: 0, sourceRGBA: [0, 0, 0, 255], targetRGBA: [22, 119, 170, 255], removeRGBA: null };

test("exact color replacement preserves alpha, unrelated colors and the source buffer", () => {
  const original = [...source]; const result = processPixels(source, 4, 1, options);
  assert.deepEqual([...result.data], [22, 119, 170, 255, 22, 119, 170, 128, 255, 255, 255, 255, 25, 26, 27, 0]);
  assert.deepEqual([...source], original); assert.equal(result.changed, 2);
  assert.deepEqual([...result.mask], [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
});
test("100% similarity includes every visible color", () => {
  const result = processPixels(source, 4, 1, { ...options, tolerance: 100 });
  assert.equal(result.changed, 3); assert.equal(result.data[12], 25); assert.equal(result.data[15], 0);
});
test("similarity threshold excludes a distant shade and includes nearby gray", () => {
  const data = new Uint8ClampedArray([20, 20, 20, 255, 100, 100, 100, 255]);
  const result = processPixels(data, 2, 1, { ...options, tolerance: 10 });
  assert.equal(result.changed, 1); assert.deepEqual([...result.data.slice(4)], [100, 100, 100, 255]);
});
test("edge smoothing keeps exact output color on a glyph surrounded by transparency", () => {
  const data = new Uint8ClampedArray(5 * 5 * 4); const i = (2 * 5 + 2) * 4; data[i + 3] = 128;
  const result = processPixels(data, 5, 5, { ...options, smooth: true, radius: 2 });
  assert.deepEqual([...result.data.slice(i, i + 4)], [22, 119, 170, 128]);
  assert.equal(result.changed, 1);
});
test("smoothing blends a selection boundary while preserving opacity", () => {
  const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const result = processPixels(data, 3, 1, { ...options, smooth: true, radius: 1 });
  assert.ok(result.data[0] > 0 && result.data[0] < 22); assert.equal(result.data[3], 255);
  assert.deepEqual([...result.data.slice(8)], [255, 255, 255, 255]);
});
test("edge-only background removal preserves enclosed regions of the same color", () => {
  const data = new Uint8ClampedArray(5 * 5 * 4);
  for (let n = 0; n < 25; n++) { data[n * 4 + 3] = 255; const x = n % 5, y = Math.floor(n / 5); if (x === 0 || y === 0 || x === 4 || y === 4 || (x === 2 && y === 2)) data.fill(255, n * 4, n * 4 + 3); }
  const config = { ...options, mode: "none" as const, removeEnabled: true, removeRGBA: [255, 255, 255, 255] as [number, number, number, number], removeTolerance: 0, edgeOnly: true };
  const result = processPixels(data, 5, 5, config);
  assert.equal(result.data[3], 0); assert.equal(result.data[(2 * 5 + 2) * 4 + 3], 255);
  const all = processPixels(data, 5, 5, { ...config, edgeOnly: false }); assert.equal(all.data[(2 * 5 + 2) * 4 + 3], 0);
});
test("solid recolor, RGBA and opacity compose without making transparent pixels opaque", () => {
  const result = processPixels(source, 4, 1, { ...options, mode: "solid", targetRGBA: [220, 30, 70, 128], opacity: 50 });
  assert.deepEqual([...result.data.slice(0, 4)], [220, 30, 70, 64]); assert.equal(result.data[7], 32); assert.equal(result.data[15], 0);
});
test("no selected target means no implicit or predefined recolor", () => {
  assert.equal(defaultSettings.target, ""); assert.equal(defaultSettings.removeColor, ""); assert.equal(defaultSettings.background, "");
  assert.deepEqual([...processPixels(source, 4, 1, { ...options, targetRGBA: null }).data], [...source]);
});
test("color formats are parsed consistently; invalid input is rejected", () => {
  assert.deepEqual(colorRGBA("#1677aa"), [22, 119, 170, 255]);
  assert.deepEqual(colorRGBA("rgb(22, 119, 170)"), [22, 119, 170, 255]);
  assert.deepEqual(colorRGBA("rgba(22,119,170,0.5)"), [22, 119, 170, 128]);
  assert.deepEqual(colorRGBA("hsl(0, 100%, 50%)"), [255, 0, 0, 255]);
  assert.equal(colorRGBA("#GGGGGG"), null);
  assert.throws(() => validateSettings({ ...defaultSettings, target: "#GGGGGG" }));
  assert.throws(() => validateSettings({ ...defaultSettings, removeEnabled: true }));
});
test("dimension limits prevent oversized output canvases", () => {
  assert.throws(() => createCanvas(0, 20)); assert.throws(() => createCanvas(8193, 1)); assert.throws(() => createCanvas(5000, 5000));
  assert.equal(createCanvas(16, 32).width, 16);
});

test("ARGB byte notation and CSS HEX alpha remain unambiguous", () => {
  for (const input of ["argb(128,22,119,170)", "ARGB(128, 22, 119, 170)", "0x801677AA", "argb(#801677AA)", "#1677aa80"]) {
    assert.deepEqual(colorRGBA(input), [22, 119, 170, 128]);
    assert.equal(colorHex(input), "#1677aa");
    assert.equal(colorCSS(input), "rgba(22, 119, 170, 0.5019607843137255)");
  }
  assert.deepEqual(colorRGBA("argb(0,22,119,170)"), [22, 119, 170, 0]);
  assert.deepEqual(colorRGBA("argb(1,22,119,170)"), [22, 119, 170, 1]);
  for (const invalid of ["argb(256,0,0,0)", "argb(-1,0,0,0)", "argb(0.5,0,0,0)", "argb(255,0,0)", "0xXX1677AA"]) assert.equal(colorRGBA(invalid), null);
});

function fixture(): Asset {
  const canvas = createCanvas(10, 8); const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000"; ctx.fillRect(2, 2, 6, 4);
  return { id: "fixture", name: "icone.png", size: 100, width: 10, height: 8, url: "", canvas, colors: ["#000000"], settings: { ...defaultSettings, source: "#000000", target: "#1677aa", width: 10, height: 8 }, past: [], future: [] };
}
test("full render composes crop, resize, rotation, padding and background", async () => {
  const asset = fixture();
  const result = await renderAsset(asset, { ...asset.settings, trim: true, resizeEnabled: true, width: 12, height: 8, rotation: 90, padding: 2, backgroundEnabled: true, background: "#ffffff" });
  assert.equal(result.canvas.width, 12); assert.equal(result.canvas.height, 16);
  assert.deepEqual([...result.canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data], [255, 255, 255, 255]);
  assert.deepEqual([...result.canvas.getContext("2d")!.getImageData(5, 5, 1, 1).data], [22, 119, 170, 255]);
  assert.deepEqual([...asset.canvas.getContext("2d")!.getImageData(3, 3, 1, 1).data], [0, 0, 0, 255]);
});
test("PNG export decodes to the expected dimensions, color and alpha", async () => {
  const result = await renderAsset(fixture()); const blob = await exportBlob(result.canvas, "png", 92, "");
  const decoded = await loadImage(Buffer.from(await blob.arrayBuffer())); const canvas = nativeCanvas(decoded.width, decoded.height);
  canvas.getContext("2d").drawImage(decoded, 0, 0);
  assert.equal(decoded.width, 10); assert.equal(decoded.height, 8);
  assert.deepEqual([...canvas.getContext("2d").getImageData(3, 3, 1, 1).data], [22, 119, 170, 255]);
  assert.equal(canvas.getContext("2d").getImageData(0, 0, 1, 1).data[3], 0);
});
test("JPG flattens transparency to the explicitly selected background", async () => {
  const result = await renderAsset(fixture()); await assert.rejects(exportBlob(result.canvas, "jpeg", 100, ""));
  const blob = await exportBlob(result.canvas, "jpeg", 100, "#ffffff");
  assert.equal(blob.type, "image/jpeg"); const decoded = await loadImage(Buffer.from(await blob.arrayBuffer()));
  assert.equal(decoded.width, 10); assert.equal(decoded.height, 8);
});

test("independent assets export different colors with alpha zero outside the glyph", async () => {
  const first = fixture(), second = fixture();
  second.settings.target = "argb(255,40,160,80)";
  const archive: Record<string, Uint8Array> = {};
  for (const [name, asset] of [["first.png", first], ["second.png", second]] as const) {
    const result = await renderAsset(asset);
    archive[name] = new Uint8Array(await (await exportBlob(result.canvas, "png", 92, "")).arrayBuffer());
  }
  const files = unzipSync(new Uint8Array(await makeZip(archive).arrayBuffer()));
  for (const [name, expected] of [["first.png", [22,119,170,255]], ["second.png", [40,160,80,255]]] as const) {
    assert.deepEqual([...files[name].slice(0, 8)], [137,80,78,71,13,10,26,10]);
    const image = await loadImage(Buffer.from(files[name]));
    const decoded = nativeCanvas(image.width, image.height); decoded.getContext("2d").drawImage(image, 0, 0);
    assert.deepEqual([...decoded.getContext("2d").getImageData(3,3,1,1).data], [...expected]);
    assert.equal(decoded.getContext("2d").getImageData(0,0,1,1).data[3], 0);
  }
  assert.equal(first.settings.target, "#1677aa");
});

test("ARGB transparent target and explicit ARGB background render correctly", async () => {
  const asset = fixture();
  const transparent = await renderAsset(asset, { ...asset.settings, target: "argb(0,22,119,170)" });
  assert.equal(transparent.canvas.getContext("2d")!.getImageData(3,3,1,1).data[3], 0);
  const background = await renderAsset(asset, { ...asset.settings, backgroundEnabled: true, background: "argb(255,40,160,80)" });
  assert.deepEqual([...background.canvas.getContext("2d")!.getImageData(0,0,1,1).data], [40,160,80,255]);
});
test("WebP output uses its correct container signature", async () => {
  const result = await renderAsset(fixture()); const blob = await exportBlob(result.canvas, "webp", 92, "");
  const data = Buffer.from(await blob.arrayBuffer()); assert.equal(data.toString("ascii", 0, 4), "RIFF"); assert.equal(data.toString("ascii", 8, 12), "WEBP");
});
test("ICO header points to a square, aspect-preserving embedded PNG", async () => {
  const result = await renderAsset(fixture()); const blob = await exportBlob(result.canvas, "ico", 92, "");
  const buffer = await blob.arrayBuffer(); const header = new DataView(buffer);
  assert.equal(header.getUint16(2, true), 1); assert.equal(header.getUint16(4, true), 1);
  assert.equal(header.getUint32(18, true), 22); assert.equal(header.getUint32(14, true), blob.size - 22);
  const decoded = await loadImage(Buffer.from(buffer.slice(22))); assert.equal(decoded.width, 10); assert.equal(decoded.height, 10);
});
test("batch ZIP retains both independently named files byte for byte", async () => {
  const result = await renderAsset(fixture()); const data = new Uint8Array(await (await exportBlob(result.canvas, "png", 92, "")).arrayBuffer());
  const zip = makeZip({ "01-icone.png": data, "02-icone.png": data });
  const extracted = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(extracted), ["01-icone.png", "02-icone.png"]); assert.deepEqual(extracted["02-icone.png"], data);
  assert.equal(safeName("../icone.png"), "..-icone");
});
