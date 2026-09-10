import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas as nativeCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { defaultSettings, settingsForAsset, type Asset, type PixelSettings } from "../lib/editor-types";
import { processPixels } from "../lib/pixels";
import { decode, encode } from "fast-png";
import { decodePng, pngBlob, rasterCanvas, readRaster, transformRaster } from "../lib/raster";
import { enhanceRaster } from "../lib/quality";

Object.assign(globalThis, { ImageData, document: { createElement: (tag: string) => {
  if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
  const canvas = nativeCanvas(1, 1);
  Object.defineProperty(canvas, Symbol.toStringTag, { value: "HTMLCanvasElement" });
  Object.assign(canvas, { toBlob: async (callback: (value: Blob) => void, type: string, quality: number) => {
    const format = type === "image/jpeg" ? "jpeg" : type === "image/webp" ? "webp" : "png";
    const data = format === "png" ? await canvas.encode("png") : await canvas.encode(format, Math.round(quality * 100)); callback(new Blob([new Uint8Array(data)], { type }));
  } }); return canvas;
} } });

const networkFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  return url.startsWith("file:") ? readFile(fileURLToPath(url)).then(data => new Response(data)) : networkFetch(input, init);
}) as typeof fetch;

const { colorRGBA, colorHex, colorCSS, createCanvas, renderAsset, exportBlob, makeZip, validateSettings, safeName, sampleColor, importAsset } = await import("../lib/image-editor");
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
  const config = { ...options, mode: "none" as const, removeEnabled: true, removeRGBA: [255, 255, 255, 255] as [number, number, number, number], removeTolerance: 0, removeStrength: 100, edgeOnly: true };
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
  assert.throws(() => validateSettings({ ...defaultSettings, removeEnabled: true, removeColor: "#GGGGGG", removeStrength: 50 }));
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

test("PNG import, eyedropper and same-color export keep FCAEE3 at every nonzero alpha", async () => {
  const data = new Uint8ClampedArray(256 * 4);
  for (let a = 0; a <= 255; a++) data.set([252,174,227,a], a * 4);
  const asset = await importAsset(new File([new Uint8Array(encode({ width:256, height:1, channels:4, depth:8, data }))], "exact.png", {type:"image/png"}));
  try {
    assert.deepEqual(readRaster(asset.canvas).data, data);
    for (let a = 1; a <= 255; a++) assert.equal(sampleColor(asset.canvas,a,0), "#fcaee3");
    const result = await renderAsset(asset, {...asset.settings, repairOpacity:false, source:"#fcaee3", target:"#fcaee3", tolerance:0});
    assert.equal(result.changed, 0);
    const png = decode(new Uint8Array(await (await exportBlob(result.canvas,"png",92,"")).arrayBuffer()));
    assert.deepEqual([...png.data], [...data]);
  } finally { URL.revokeObjectURL(asset.url); }
});

test("FF7020 is stored exactly for alpha 1-255 through repeated PNG export and import", async () => {
  const data = new Uint8ClampedArray(256 * 4);
  for (let a = 0; a <= 255; a++) data.set([252,174,227,a], a * 4);
  const canvas = rasterCanvas({width:256,height:1,data});
  const asset = {...fixture(), width:256, height:1, canvas};
  const result = await renderAsset(asset, {...defaultSettings, repairOpacity:false, source:"#FCAEE3",target:"#FF7020",tolerance:0});
  let png = new Uint8Array(await (await exportBlob(result.canvas,"png",92,"")).arrayBuffer());
  for (let round = 0; round < 3; round++) {
    const raster = decodePng(png)!;
    for (let a = 1; a <= 255; a++) assert.deepEqual([...raster.data.subarray(a*4,a*4+4)], [255,112,32,a]);
    assert.equal(raster.data[3],0);
    png = new Uint8Array(await pngBlob(raster).arrayBuffer());
  }
});

test("PNG palette, grayscale and 16-bit channels decode without canvas round trips", () => {
  const indexed = encode({width:2,height:1,depth:8,channels:1,data:new Uint8Array([0,1]),palette:[[252,174,227,63],[255,112,32,255]]});
  assert.deepEqual([...decodePng(indexed)!.data], [252,174,227,63,255,112,32,255]);
  const gray = encode({width:2,height:1,depth:8,channels:2,data:new Uint8Array([70,17,140,255])});
  assert.deepEqual([...decodePng(gray)!.data], [70,70,70,17,140,140,140,255]);
  const high = encode({width:1,height:1,depth:16,channels:4,data:new Uint16Array([65535,112*257,32*257,128*257])});
  assert.deepEqual([...decodePng(high)!.data], [255,112,32,128]);
  assert.equal(decodePng(new Uint8Array([1,2,3])),null);
});

test("residual opacity repair preserves RGB and gives exact visible fills on light and dark backgrounds after PNG export", async () => {
  for (const color of [[255,112,32], [252,174,227], [22,119,170], [0,0,0], [255,255,255]]) {
    const data = new Uint8ClampedArray(256 * 4);
    for (let a = 0; a <= 255; a++) data.set([...color, a], a * 4);
    const original = new Uint8ClampedArray(data);
    const asset = { ...fixture(), width:256, height:1, canvas:rasterCanvas({width:256,height:1,data}) };
    const result = await renderAsset(asset, {...defaultSettings, mode:"none"});
    const blob = await exportBlob(result.canvas,"png",92,"");
    const exported = decodePng(new Uint8Array(await blob.arrayBuffer()))!;
    assert.deepEqual(data, original);
    assert.equal(result.changed, 5);
    for (let a = 0; a <= 255; a++) assert.deepEqual([...exported.data.subarray(a*4,a*4+4)], [...color, a >= 250 ? 255 : a]);
    const pngImage = await loadImage(Buffer.from(await blob.arrayBuffer()));
    for (const bg of ["#272727", "#313131", "#e6e6e6", "#ffffff"]) {
      const surface = nativeCanvas(256,1), context = surface.getContext("2d");
      context.fillStyle = bg; context.fillRect(0,0,256,1);
      context.drawImage(pngImage,0,0);
      for (let a = 250; a <= 255; a++) assert.deepEqual([...context.getImageData(a,0,1,1).data], [...color,255]);
    }
  }
});

test("opacity repair runs before intentional transparency and can be disabled per asset", async () => {
  const data = new Uint8ClampedArray([255,112,32,254,255,112,32,0]);
  const asset = {...fixture(),width:2,height:1,canvas:rasterCanvas({width:2,height:1,data})};
  for (const settings of [
    {...defaultSettings,mode:"none" as const,opacity:50},
    {...defaultSettings,mode:"none" as const,removeEnabled:true,removeColor:"#FF7020",removeStrength:50,edgeOnly:false},
    {...defaultSettings,mode:"none" as const,eraseOperations:[{type:"bucket" as const,point:{x:0,y:0},tolerance:0,strength:50}]},
    {...defaultSettings,source:"#FF7020",target:"argb(128,22,119,170)"},
  ]) {
    const output = readRaster((await renderAsset(asset,settings)).canvas).data;
    assert.equal(output[3],128); assert.equal(output[7],0);
  }
  const unchanged = readRaster((await renderAsset(asset,{...defaultSettings,mode:"none",repairOpacity:false})).canvas);
  assert.deepEqual(unchanged.data,data);
});

test("rotation, mirroring and padding retain exact semitransparent RGB channels", () => {
  const raster = {width:2,height:1,data:new Uint8ClampedArray([255,112,32,5,252,174,227,63])};
  const output = transformRaster(raster,{rotation:90,flipX:true,flipY:false,padding:1},null);
  assert.deepEqual([...output.data.subarray((1*3+1)*4,(1*3+2)*4)], [252,174,227,63]);
  assert.deepEqual([...output.data.subarray((2*3+1)*4,(2*3+2)*4)], [255,112,32,5]);
});

test("resize retains a uniform corporate RGB without making transparent pixels opaque", async () => {
  const data=new Uint8ClampedArray(16*16*4);
  for(let n=0;n<256;n++) data.set([255,112,32,n%16<8?128:0],n*4);
  const canvas=rasterCanvas({width:16,height:16,data});
  const asset={...fixture(),width:16,height:16,canvas};
  const result=await renderAsset(asset,{...defaultSettings,mode:"none",resizeEnabled:true,width:8,height:8});
  const out=readRaster(result.canvas).data;
  for(let n=0;n<64;n++) if(out[n*4+3]) assert.deepEqual([...out.subarray(n*4,n*4+3)],[255,112,32]);
  assert.equal(out[7*4+3],0);
});

test("quality is opt-in and leaves the original raster intact", async () => {
  const input = { width: 2, height: 1, data: new Uint8ClampedArray([255,112,32,63,1,2,3,0]) };
  assert.equal(await enhanceRaster(input, defaultSettings), input);
  const output = await enhanceRaster(input, { ...defaultSettings, qualityEnabled: true, qualityScale: 1, edgeSoftness: 0 });
  assert.deepEqual(output.data, input.data);
});

test("1x, 2x and 4x soften the silhouette without creating new corporate RGB values", async () => {
  const input = { width: 12, height: 12, data: new Uint8ClampedArray(12 * 12 * 4) };
  for (let y = 3; y < 9; y++) for (let x = 3; x <= y; x++) input.data.set([255,112,32,255], (y * 12 + x) * 4);
  const original = new Uint8ClampedArray(input.data);
  for (const qualityScale of [1, 2, 4]) {
    const output = await enhanceRaster(input, { ...defaultSettings, qualityEnabled: true, qualityScale });
    assert.equal(output.width, 12 * qualityScale); assert.equal(output.height, 12 * qualityScale);
    let partial = 0;
    for (let i = 0; i < output.data.length; i += 4) if (output.data[i + 3]) {
      assert.deepEqual([...output.data.subarray(i, i + 3)], [255,112,32]);
      if (output.data[i + 3] < 255) partial++;
    }
    assert.ok(partial > 0); assert.equal(output.data[3], 0);
    const decoded = decodePng(new Uint8Array(await pngBlob(output).arrayBuffer()))!;
    assert.deepEqual(decoded.data, output.data);
  }
  assert.deepEqual(input.data, original);
});

test("all enlargement kernels preserve separate colors without creating mixed RGB", async () => {
  const input = {width: 4, height: 1, data: new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255])};
  const settings = {...defaultSettings, qualityEnabled: true, qualityScale: 4, edgeSoftness: 0};
  for (const qualityMethod of ["triangle","lanczos3","magicKernelSharp2021"] as const) {
    const output = await enhanceRaster(input, {...settings,qualityMethod});
    const colors = new Set<string>();
    for(let i=0;i<output.data.length;i+=4) if (output.data[i+3]) colors.add([...output.data.subarray(i,i+3)].join(","));
    assert.deepEqual(colors,new Set(["255,0,0","0,0,255"]));
  }
});

test("upscale rejects oversized dimensions, invalid factors and cancellation", async () => {
  const input = {width: 4096, height: 4096, data: new Uint8ClampedArray(0)};
  await assert.rejects(enhanceRaster(input, {...defaultSettings, qualityEnabled: true, qualityScale: 4}));
  await assert.rejects(enhanceRaster(input, {...defaultSettings, qualityEnabled: true, qualityScale: 3}));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(enhanceRaster({width:1,height:1,data:new Uint8ClampedArray(4)}, {...defaultSettings,qualityEnabled:true}, controller.signal), {name: "AbortError"});
});

test("feathering removes selected pixels fully and softens neighbouring alpha without changing RGB", () => {
  const input = new Uint8ClampedArray([255,255,255,255,255,112,32,255,255,112,32,255]);
  const result = processPixels(input,3,1,{...options,mode:"none",removeEnabled:true,removeRGBA:[255,255,255,255],removeTolerance:0,removeStrength:100,removeFeather:100});
  assert.equal(result.data[3],0); assert.ok(result.data[7]>0 && result.data[7]<255);
  assert.deepEqual([...result.data.subarray(4,7)],[255,112,32]); assert.equal(result.data[11],255);
  const disabled = processPixels(input,3,1,{...options,mode:"none",removeEnabled:false,removeFeather:100});
  assert.deepEqual(disabled.data,input);
});

test("multiple fixed replacements are applied together and choose the nearest source", () => {
  const data = new Uint8ClampedArray([253,174,228,255,72,8,120,255,252,246,246,255]);
  const result = processPixels(data,3,1,{...options,sourceRGBA:null,targetRGBA:null,replacementRGBA:[
    {sourceRGBA:[253,174,228,255],targetRGBA:[255,0,0,255]},
    {sourceRGBA:[72,8,120,255],targetRGBA:[0,160,255,255]},
  ]});
  assert.deepEqual([...result.data],[255,0,0,255,0,160,255,255,252,246,246,255]);
  assert.equal(result.changed,2);
});

test("tone normalization merges small variations but preserves distant colors", () => {
  const data = new Uint8ClampedArray([100,100,100,255,104,102,103,255,200,20,180,255]);
  const result = processPixels(data,3,1,{...options,mode:"none",targetRGBA:null,sourceRGBA:null,normalizeEnabled:true,normalizeTolerance:3,paletteRGBA:[[100,100,100,255],[200,20,180,255]]});
  assert.deepEqual([...result.data],[100,100,100,255,100,100,100,255,200,20,180,255]);
});

test("background removal progresses from 0 to 50 to 100 percent", () => {
  const input = new Uint8ClampedArray([255,112,32,255]);
  const config = {...options,mode:"none" as const,removeEnabled:true,removeRGBA:[255,112,32,255] as [number,number,number,number],removeTolerance:0};
  assert.equal(processPixels(input,1,1,{...config,removeStrength:0}).data[3],255);
  assert.equal(processPixels(input,1,1,{...config,removeStrength:50}).data[3],128);
  assert.equal(processPixels(input,1,1,{...config,removeStrength:100}).data[3],0);
});

test("multiple fixed color removals retain independent strengths", () => {
  const input = new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255]);
  const result = processPixels(input,3,1,{...options,mode:"none",removeEnabled:true,removeRGBA:null,removalRGBA:[
    {colorRGBA:[255,0,0,255],strength:50,tolerance:0,feather:0,edgeOnly:false},
    {colorRGBA:[0,255,0,255],strength:100,tolerance:0,feather:0,edgeOnly:false},
  ]});
  assert.equal(result.data[3],128);
  assert.equal(result.data[7],0);
  assert.equal(result.data[11],255);
});

test("fixed removals remain valid while the next color slot is empty", () => {
  assert.doesNotThrow(() => validateSettings({
    ...defaultSettings,
    mode: "none",
    removeEnabled: true,
    removals: [{ id: "red", color: "#FF0000", strength: 100, tolerance: 0, feather: 0, edgeOnly: false }],
  }));
});

test("paint bucket removes every matching HEX while preserving other colors", () => {
  const input = new Uint8ClampedArray([255,0,0,255,0,0,255,255,255,0,0,255]);
  const result = processPixels(input,3,1,{...options,mode:"none",removeEnabled:false,eraseOperations:[{type:"bucket",point:{x:.5,y:.5},tolerance:0,strength:100}]});
  assert.equal(result.data[3],0);
  assert.equal(result.data[7],255);
  assert.equal(result.data[11],0);
});

test("eraser stroke changes only pixels covered by its diameter", () => {
  const input = new Uint8ClampedArray(5*5*4);
  for(let n=0;n<25;n++) input.set([120,80,40,255],n*4);
  const result = processPixels(input,5,5,{...options,mode:"none",eraseOperations:[{type:"eraser",points:[{x:2.5,y:2.5}],size:1,strength:100}]});
  assert.equal(result.data[(2*5+2)*4+3],0);
  assert.equal(result.data[3],255);
});

test("lasso removes its closed interior and leaves exterior pixels intact", () => {
  const input = new Uint8ClampedArray(5*5*4);
  for(let n=0;n<25;n++) input.set([40,80,120,255],n*4);
  const points = [{x:1,y:1},{x:4,y:1},{x:4,y:4},{x:1,y:4}];
  const result = processPixels(input,5,5,{...options,mode:"none",eraseOperations:[{type:"lasso",points,strength:100}]});
  assert.equal(result.data[(2*5+2)*4+3],0);
  assert.equal(result.data[3],255);
  assert.equal(result.data[(4*5+4)*4+3],255);
});

test("rendered manual removal changes alpha without altering stored RGB", async () => {
  const asset = fixture();
  const result = await renderAsset(asset, {
    ...asset.settings,
    mode: "none",
    eraseOperations: [{ type: "eraser", points: [{ x: 3.5, y: 3.5 }], size: 2, strength: 100 }],
  });
  assert.deepEqual([...result.canvas.getContext("2d")!.getImageData(3, 3, 1, 1).data], [0, 0, 0, 0]);
  assert.deepEqual([...asset.canvas.getContext("2d")!.getImageData(3, 3, 1, 1).data], [0, 0, 0, 255]);
});

test("quality composes with recolor, resize and independent image settings", async () => {
  const asset = fixture();
  const settings = {...asset.settings,target:"#FF7020",qualityEnabled:true,qualityScale:4,resizeEnabled:true,width:5,height:4};
  const result = await renderAsset(asset,settings);
  assert.equal(result.canvas.width,20); assert.equal(result.canvas.height,16);
  for(let i=0,data=readRaster(result.canvas).data;i<data.length;i+=4) if(data[i+3]) assert.deepEqual([...data.subarray(i,i+3)],[255,112,32]);
  const originalResult = await renderAsset(asset);
  assert.equal(originalResult.canvas.width,10); assert.equal(asset.settings.qualityEnabled,false);
});

test("quality cannot reintroduce residual opacity after any opaque replacement", async () => {
  for (const target of ["#FF0000", "#00FF00", "#0000FF", "#1677AA", "#FF7020"]) {
    const asset = fixture();
    const result = await renderAsset(asset, {...asset.settings,target,qualityEnabled:true,qualityScale:4});
    const data = readRaster(result.canvas).data;
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      assert.ok(data[i+3] < 250 || data[i+3] === 255, `${target}: residual alpha ${data[i+3]}`);
      if (data[i+3] === 255) {
        assert.deepEqual([...data.subarray(i,i+3)],colorRGBA(target)!.slice(0,3));
        opaque++;
      }
    }
    assert.ok(opaque > 0);
  }
});

test("restoring and recoloring the mascot preserves every tested HEX at the reported pixel", async () => {
  const bytes = await readFile(new URL("../public/mascote.png", import.meta.url));
  const asset = await importAsset(new File([bytes],"mascote.png",{type:"image/png"}));
  const x = 331, y = 896, index = (y * asset.width + x) * 4;
  try {
    assert.equal(readRaster(asset.canvas).data[index+3],254);
    const source = sampleColor(asset.canvas,x,y)!;
    for (const target of ["#FF0000","#00FF00","#0000FF","#00FFFF","#7F35C9","#123456","#FFFFFF","#000000"]) {
      asset.settings = {...asset.settings,repairOpacity:false,target:"#FF7020"};
      const reset = settingsForAsset(asset);
      assert.equal(reset.repairOpacity,true);
      const output = await renderAsset(asset,{...reset,source,target,tolerance:10});
      const expected = colorRGBA(target)!;
      assert.deepEqual([...readRaster(output.canvas).data.subarray(index,index+4)],expected);
      const blob = await exportBlob(output.canvas,"png",100,"");
      const decoded = decodePng(new Uint8Array(await blob.arrayBuffer()))!;
      assert.deepEqual([...decoded.data.subarray(index,index+4)],expected);
      const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
      for (const background of ["#272727","#e6e6e6"]) {
        const surface = nativeCanvas(1,1), ctx = surface.getContext("2d");
        ctx.fillStyle = background; ctx.fillRect(0,0,1,1);
        ctx.drawImage(image,x,y,1,1,0,0,1,1);
        assert.deepEqual([...ctx.getImageData(0,0,1,1).data],expected);
      }
    }
    assert.equal(readRaster(asset.canvas).data[index+3],254);
  } finally { URL.revokeObjectURL(asset.url); }
});

test("final opacity repair respects near-opaque intentional alpha edits", async () => {
  const asset = fixture();
  for (const override of [
    {opacity:99},
    {target:"argb(254,255,0,0)"},
    {removeEnabled:true,removeColor:"#000000",removeStrength:1,edgeOnly:false},
    {eraseOperations:[{type:"bucket" as const,point:{x:3,y:3},tolerance:0,strength:1}]},
  ]) {
    const settings = {...asset.settings,...override};
    const result = await renderAsset(asset,settings);
    const alpha = readRaster(result.canvas).data[(3*10+3)*4+3];
    assert.ok(alpha >= 250 && alpha < 255, `Intentional alpha was reset: ${alpha}`);
  }
});

test("all three enlargement modes retain exact replacement RGB through PNG export", async () => {
  for (const qualityMethod of ["triangle","lanczos3","magicKernelSharp2021"] as const)
  for (const target of ["#FF0000","#FF7020","#1677AA"]) for (const qualityScale of [1,2,4]) {
    const asset = fixture();
    const result = await renderAsset(asset,{...asset.settings,target,qualityEnabled:true,qualityScale,qualityMethod});
    const blob = await exportBlob(result.canvas,"png",100,"");
    const decoded = decodePng(new Uint8Array(await blob.arrayBuffer()))!;
    const expected = colorRGBA(target)!.slice(0,3);
    for (let i = 0; i < decoded.data.length; i += 4) if (decoded.data[i+3]) {
      assert.deepEqual([...decoded.data.subarray(i,i+3)],expected, `${qualityMethod} ${target} ${qualityScale}x pixel ${i/4}`);
      assert.ok(decoded.data[i+3] < 250 || decoded.data[i+3] === 255);
    }
    assert.deepEqual(decoded.data,readRaster(result.canvas).data);
    const opaque = decoded.data.findIndex((value,index) => index % 4 === 3 && value === 255);
    assert.ok(opaque >= 0);
    const position = (opaque - 3) / 4;
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    for (const background of ["#272727","#e6e6e6"]) {
      const surface = nativeCanvas(1,1), ctx = surface.getContext("2d");
      ctx.fillStyle = background; ctx.fillRect(0,0,1,1);
      ctx.drawImage(image,position % decoded.width,Math.floor(position / decoded.width),1,1,0,0,1,1);
      assert.deepEqual([...ctx.getImageData(0,0,1,1).data],[...expected,255]);
    }
  }
});

test("the three kernels produce distinct contours while preserving the fill color", async () => {
  const outputs = new Set<string>();
  for (const qualityMethod of ["triangle","lanczos3","magicKernelSharp2021"] as const) {
    const result = await renderAsset(fixture(),{...fixture().settings,qualityEnabled:true,qualityScale:4,qualityMethod});
    outputs.add(Buffer.from(readRaster(result.canvas).data).toString("base64"));
  }
  assert.equal(outputs.size,3);
});
