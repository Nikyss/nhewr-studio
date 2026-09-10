export type RGBA = [number, number, number, number];

export interface ColorReplacement {
  id: string;
  source: string;
  target: string;
}

export interface Settings {
  mode: "replace" | "solid" | "none";
  source: string;
  target: string;
  tolerance: number;
  smooth: boolean;
  radius: number;
  replacements: ColorReplacement[];
  normalizeEnabled: boolean;
  normalizeTolerance: number;
  removeEnabled: boolean;
  removeColor: string;
  removeStrength: number;
  removeTolerance: number;
  edgeOnly: boolean;
  removeFeather: number;
  opacity: number;
  backgroundEnabled: boolean;
  background: string;
  resizeEnabled: boolean;
  width: number;
  height: number;
  lockRatio: boolean;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  trim: boolean;
  padding: number;
  filter: "none" | "grayscale" | "invert";
  qualityEnabled: boolean;
  qualityScale: number;
  edgeSoftness: number;
  preserveColors: boolean;
  qualityMethod: "lanczos3" | "magicKernelSharp2021";
}

export const defaultSettings: Settings = {
  mode: "replace", source: "", target: "", tolerance: 10,
  smooth: false, radius: 1, replacements: [], normalizeEnabled: false, normalizeTolerance: 8,
  removeEnabled: false, removeColor: "", removeStrength: 0,
  removeTolerance: 10, edgeOnly: true, removeFeather: 0, opacity: 100,
  backgroundEnabled: false, background: "", resizeEnabled: false,
  width: 512, height: 512, lockRatio: true, rotation: 0, flipX: false,
  flipY: false, trim: false, padding: 0, filter: "none",
  qualityEnabled: false, qualityScale: 2, edgeSoftness: 35, preserveColors: true, qualityMethod: "lanczos3",
};

export interface Asset {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  url: string;
  canvas: HTMLCanvasElement;
  colors: string[];
  settings: Settings;
  past: Settings[];
  future: Settings[];
  example?: boolean;
}

export type ResolvedReplacement = { sourceRGBA: RGBA; targetRGBA: RGBA };
export type PixelSettings = Settings & {
  sourceRGBA: RGBA | null;
  targetRGBA: RGBA | null;
  removeRGBA: RGBA | null;
  replacementRGBA?: ResolvedReplacement[];
  paletteRGBA?: RGBA[];
};
export type ToolId = "colors" | "alpha" | "size" | "quality" | "transform" | "palette";
export type ExportFormat = "png" | "webp" | "jpeg" | "ico";
