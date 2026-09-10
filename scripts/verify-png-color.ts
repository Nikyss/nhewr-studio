import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import { importAsset, renderAsset, exportBlob } from "../lib/image-editor";
import { decodePng, readRaster } from "../lib/raster";

// Exercise the production import/render/export pipeline without a browser or screen picker.
Object.assign(globalThis, { ImageData, document: { createElement: (tag: string) => {
  assert.equal(tag, "canvas");
  return createCanvas(1, 1);
} } });

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Uso: npx tsx scripts/verify-png-color.ts entrada.png saida.png");
if (resolve(inputPath) === resolve(outputPath)) throw new Error("A saida precisa ser diferente do original.");
const bytes = await readFile(inputPath);
const asset = await importAsset(new File([bytes], "prova.png", { type: "image/png" }));
try {
  const original = readRaster(asset.canvas);
  const result = await renderAsset(asset, { ...asset.settings, mode: "none", repairOpacity: true });
  const exported = new Uint8Array(await (await exportBlob(result.canvas, "png", 100, "")).arrayBuffer());
  const decoded = decodePng(exported)!;
  let repaired = 0, transparent = 0;
  const alphaHistogram: Record<number, number> = {};
  for (let i = 0; i < original.data.length; i += 4) {
    const alpha = original.data[i + 3];
    alphaHistogram[alpha] = (alphaHistogram[alpha] ?? 0) + 1;
    assert.deepEqual(decoded.data.subarray(i, i + 3), original.data.subarray(i, i + 3));
    assert.equal(decoded.data[i + 3], alpha >= 250 ? 255 : alpha);
    if (alpha >= 250 && alpha < 255) repaired++;
    if (!alpha) transparent++;
  }
  const image = await loadImage(Buffer.from(exported));
  const backgrounds = ["#272727", "#313131", "#e6e6e6", "#ffffff"];
  for (const background of backgrounds) {
    const surface = createCanvas(image.width, image.height), context = surface.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (original.data[i + 3] >= 250) {
      for (let c = 0; c < 3; c++) assert.equal(pixels[i + c], original.data[i + c], `Canal ${c}, pixel ${i / 4}, fundo ${background}`);
    }
  }
  await writeFile(outputPath, exported, { flag: "wx" });
  console.log(JSON.stringify({ width:asset.width, height:asset.height, repaired, transparent, alphaHistogram, backgrounds, output:resolve(outputPath) }, null, 2));
} finally { URL.revokeObjectURL(asset.url); }
