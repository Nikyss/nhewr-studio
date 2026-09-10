import { z } from "zod";
import { colorRGBA } from "./image-editor";

const color = z.string().refine(value => !!colorRGBA(value), "Cor inválida.");
const configuration = z.object({ source: color.optional(), target: color, tolerance: z.number().min(0).max(100).optional(), mode: z.enum(["replace", "solid"]).optional() }).strict();
export type ColorConfiguration = z.infer<typeof configuration>;
type Actions = { read: () => unknown; configure: (value: ColorConfiguration) => unknown };
type Context = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (value: unknown) => unknown }, options: { signal: AbortSignal }) => void | Promise<void> };

export function registerEditorTools(getActions: () => Actions) {
  const context = (document as Document & { modelContext?: Context }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools = [{
    name: "read_icon_editor", title: "Ler estado do editor", description: "Retorna os arquivos abertos e ajustes do ícone atual. Não lê pixels nem envia arquivos.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input: unknown) => { z.object({}).strict().parse(input); return getActions().read(); },
  }, {
    name: "configure_icon_colors", title: "Configurar cores do ícone", description: "Configura a troca de cores no ícone aberto e inicia a atualização da prévia. Não baixa arquivos.",
    inputSchema: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, tolerance: { type: "number", minimum: 0, maximum: 100 }, mode: { type: "string", enum: ["replace", "solid"] } }, required: ["target"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input: unknown) => getActions().configure(configuration.parse(input)),
  }];
  for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => lifecycle.abort()); } catch { lifecycle.abort(); } }
  return () => lifecycle.abort();
}
