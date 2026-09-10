import { processPixels } from "./pixels";

self.onmessage = (event) => {
  const { id, data, width, height, settings } = event.data;
  try {
    const result = processPixels(data, width, height, settings);
    self.postMessage({ id, ...result }, { transfer: [result.data.buffer, result.mask.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Falha ao processar a imagem." });
  }
};
