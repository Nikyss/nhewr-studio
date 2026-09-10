export type RGBA = [number, number, number, number];

export interface ColorReplacement {
  id: string;
  source: string;
  target: string;
}

export interface ColorRemoval {
  id: string;
  color: string;
  strength: number;
  tolerance: number;
  feather: number;
  edgeOnly: boolean;
}

export type ErasePoint = { x: number; y: number };
export type ManualEraseOperation =
  | { type: "eraser"; points: ErasePoint[]; size: number; strength: number }
  | { type: "bucket"; point: ErasePoint; tolerance: number; strength: number }
  | { type: "lasso"; points: ErasePoint[]; strength: number };

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
  removals: ColorRemoval[];
  eraseTool: "color" | "eraser" | "bucket" | "lasso";
  eraseSize: number;
  eraseStrength: number;
  eraseTolerance: number;
  eraseOperations: ManualEraseOperation[];
  opacity: number;
  repairOpacity: boolean;
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
  qualityMethod: "triangle" | "lanczos3" | "magicKernelSharp2021";
}

export const defaultSettings: Settings = {
  mode: "replace", source: "", target: "", tolerance: 10,
  smooth: false, radius: 1, replacements: [], normalizeEnabled: false, normalizeTolerance: 8,
  removeEnabled: false, removeColor: "", removeStrength: 0,
  removeTolerance: 10, edgeOnly: true, removeFeather: 0, removals: [],
  eraseTool: "color", eraseSize: 32, eraseStrength: 100, eraseTolerance: 0, eraseOperations: [], opacity: 100,
  repairOpacity: true, backgroundEnabled: false, background: "", resizeEnabled: false,
  width: 512, height: 512, lockRatio: true, rotation: 0, flipX: false,
  flipY: false, trim: false, padding: 0, filter: "none",
  qualityEnabled: false, qualityScale: 2, edgeSoftness: 35, qualityMethod: "lanczos3",
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

export function settingsForAsset(asset: Pick<Asset, "width" | "height" | "colors">): Settings {
  return { ...defaultSettings, width: asset.width, height: asset.height, source: asset.colors[0] ?? "",
    replacements: [], removals: [], eraseOperations: [] };
}

export type ResolvedReplacement = { sourceRGBA: RGBA; targetRGBA: RGBA };
export type ResolvedRemoval = Omit<ColorRemoval, "id" | "color"> & { colorRGBA: RGBA };
export type PixelSettings = Settings & {
  sourceRGBA: RGBA | null;
  targetRGBA: RGBA | null;
  removeRGBA: RGBA | null;
  replacementRGBA?: ResolvedReplacement[];
  removalRGBA?: ResolvedRemoval[];
  paletteRGBA?: RGBA[];
};
export type ToolId = "colors" | "alpha" | "size" | "quality" | "transform" | "palette";
export type ExportFormat = "png" | "webp" | "jpeg" | "ico";
