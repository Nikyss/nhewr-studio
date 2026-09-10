export type RGBA = [number, number, number, number];

export interface Settings {
  mode: "replace" | "solid" | "none";
  source: string;
  target: string;
  tolerance: number;
  smooth: boolean;
  radius: number;
  removeEnabled: boolean;
  removeColor: string;
  removeTolerance: number;
  edgeOnly: boolean;
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
}

export const defaultSettings: Settings = {
  mode: "replace", source: "", target: "", tolerance: 10,
  smooth: false, radius: 1, removeEnabled: false, removeColor: "",
  removeTolerance: 10, edgeOnly: true, opacity: 100,
  backgroundEnabled: false, background: "", resizeEnabled: false,
  width: 512, height: 512, lockRatio: true, rotation: 0, flipX: false,
  flipY: false, trim: false, padding: 0, filter: "none",
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

export type PixelSettings = Settings & { sourceRGBA: RGBA | null; targetRGBA: RGBA | null; removeRGBA: RGBA | null };
export type ToolId = "colors" | "alpha" | "size" | "transform" | "palette";
export type ExportFormat = "png" | "webp" | "jpeg" | "ico";
