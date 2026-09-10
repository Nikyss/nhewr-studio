import { enhanceRaster } from "./quality";
import type { Settings } from "./editor-types";
import type { Raster } from "./raster";

self.onmessage = async ({ data }: MessageEvent<{ input: Raster; settings: Settings }>) => {
  try {
    const raster = await enhanceRaster(data.input, data.settings);
    self.postMessage({ raster }, { transfer: [raster.data.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Falha ao melhorar a imagem." });
  }
};
