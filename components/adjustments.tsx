"use client";

import { useRef, useState } from "react";
import { ArrowDown, BookmarkPlus, Copy, Download, FlipHorizontal2, FlipVertical2, Link2, Palette, Pencil, Plus, RotateCcw, RotateCw, Trash2, Unlink2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ColorField, Choice, IconButton, RangeField, Toggle } from "./editor-controls";
import TransparencyAdjustments from "./transparency-adjustments";
import type { Asset, Settings, ToolId } from "@/lib/editor-types";
import { colorCSS, colorRGBA, download } from "@/lib/image-editor";

export type AdjustmentProps = {
  asset?: Asset; settings: Settings; tool: ToolId; patch: (value: Partial<Settings>) => void;
  picking: string | null; pick: (field: "source" | "target" | "removeColor") => void;
  mask: boolean; setMask: (v: boolean) => void; reset: () => void;
  saved: string[]; saveColor: (value: string) => void; removeColor: (value: string) => void;
  setSavedColors: (colors: string[]) => void;
};

export default function Adjustments({ asset, settings: s, tool, patch, picking, pick, mask, setMask, reset, saved, saveColor, removeColor, setSavedColors }: AdjustmentProps) {
  const [newColor, setNewColor] = useState("");
  const paletteInput = useRef<HTMLInputElement>(null);
  const heading = { colors: "Ajustes de cor", alpha: "Fundo e transparência", size: "Tamanho e margens", quality: "Qualidade da imagem", transform: "Transformar imagem", palette: "Cores salvas" };
  const resetPanel = () => tool === "alpha" ? patch({ repairOpacity: true, removeEnabled: false, removeColor: "", removeStrength: 0, removeTolerance: 10, removeFeather: 0, edgeOnly: true, removals: [], eraseTool: "color", eraseSize: 32, eraseStrength: 100, eraseTolerance: 0, eraseOperations: [], opacity: 100, backgroundEnabled: false, background: "" }) : tool === "quality" ? patch({ qualityEnabled: false, qualityScale: 2, edgeSoftness: 35, qualityMethod: "lanczos3" }) : reset();
  const panelHeading = <div className="panel-heading"><h2>{heading[tool]}</h2><IconButton label={tool === "alpha" || tool === "quality" ? "Restaurar esta ferramenta" : "Restaurar ajustes"} onClick={resetPanel} disabled={!asset}><RotateCcw size={16} /></IconButton></div>;
  if (tool === "palette") return <>{panelHeading}<div className="control-section"><ColorField label="Nova cor da paleta" value={newColor} onChange={setNewColor} /><button className="button secondary wide" onClick={() => { saveColor(newColor); if (colorRGBA(newColor)) setNewColor(""); }} disabled={!colorRGBA(newColor)}><BookmarkPlus size={16} />Salvar cor</button></div><div className="control-section"><div className="section-heading palette-heading"><h3>Minha paleta <span className="count">{saved.length}</span></h3><IconButton label="Importar paleta JSON" onClick={() => paletteInput.current?.click()}><Upload size={16} /></IconButton><IconButton label="Exportar paleta JSON" disabled={!saved.length} onClick={() => download(new Blob([JSON.stringify({ version: 1, colors: saved }, null, 2)], { type: "application/json" }), "minha-paleta.json")}><Download size={16} /></IconButton></div><input ref={paletteInput} type="file" accept=".json,application/json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      try { if (file.size > 100_000) throw new Error(); const parsed: unknown = JSON.parse(await file.text());
        const list = parsed && typeof parsed === "object" && "colors" in parsed ? (parsed as { colors: unknown }).colors : parsed;
        if (!Array.isArray(list) || list.length > 40 || !list.every(c => typeof c === "string" && colorRGBA(c))) throw new Error();
        setSavedColors([...new Set([...saved, ...list])].slice(-40)); toast.success("Paleta importada.");
      } catch { toast.error("Paleta inválida. Use um JSON com até 40 cores válidas."); }
    }} />{saved.length ? <div className="saved-colors">{saved.map(c => <div className="saved-color-row" key={c}><button className="saved-color-use" disabled={!asset} onClick={() => { patch({ target: c, mode: s.mode === "none" ? "replace" : s.mode }); toast.success("Cor aplicada ao ícone atual."); }} aria-label={`Aplicar ${c}`}><span className="swatch" style={{ background: colorCSS(c) }} /><code>{c}</code></button><IconButton label={`Excluir cor ${c}`} onClick={() => removeColor(c)}><Trash2 size={15} /></IconButton></div>)}</div> : <div className="palette-empty"><Palette size={30} strokeWidth={1.2} /><span>Nenhuma cor salva</span></div>}</div></>;
  if (tool === "alpha") return <>{panelHeading}<TransparencyAdjustments asset={asset} settings={s} patch={patch} picking={picking} pick={pick} /></>;
  if (tool === "quality") {
    const width = (s.resizeEnabled ? s.width : asset?.width ?? 0) * s.qualityScale;
    const height = (s.resizeEnabled ? s.height : asset?.height ?? 0) * s.qualityScale;
    const tooLarge = width > 8192 || height > 8192 || width * height > 16_777_216;
    return <>{panelHeading}<fieldset className="controls-body" disabled={!asset}>
      <section className="control-section"><Toggle label="Ativar melhoria" checked={s.qualityEnabled} onChange={qualityEnabled => patch({ qualityEnabled })} />
        {s.qualityEnabled && <><Choice label="Ampliação" value={String(s.qualityScale)} onChange={v => patch({ qualityScale: Number(v) })} options={[{ value: "1", label: "1× · tamanho atual" }, { value: "2", label: "2× · dobro do tamanho" }, { value: "4", label: "4× · quatro vezes maior" }]} />
          <output className="quality-dimensions">{s.trim ? "Até " : ""}{width} × {height} px · antes das margens</output>{tooLarge && <small className="field-error">Acima de 16 MP ou 8.192 px por lado. Reduza a ampliação ou o tamanho.</small>}</>}
      </section>{s.qualityEnabled && <section className="control-section"><h3>Acabamento</h3>
        <Choice label="Método de ampliação" value={s.qualityMethod} onChange={v => patch({ qualityMethod: v as Settings["qualityMethod"] })} options={[{ value: "triangle", label: "Contorno leve · Bilinear" }, { value: "lanczos3", label: "Contorno suave · Lanczos 3" }, { value: "magicKernelSharp2021", label: "Contorno nítido · Magic Kernel" }]} />
        <RangeField label="Suavização extra do contorno" value={s.edgeSoftness} onChange={edgeSoftness => patch({ edgeSoftness })} />
      </section>}
    </fieldset></>;
  }
  if (tool === "size") return <>{panelHeading}<fieldset className="controls-body" disabled={!asset}><section className="control-section"><h3>Dimensões da imagem</h3><Toggle label="Redimensionar" checked={s.resizeEnabled} onChange={resizeEnabled => patch({ resizeEnabled })} /><div className="dimensions"><div className="field"><label htmlFor="image-width">Largura</label><div className="dimension-input"><input id="image-width" type="number" min={1} max={8192} value={s.width} disabled={!s.resizeEnabled} onChange={e => { const width = Math.max(1, Math.min(8192, Number(e.target.value))); patch({ width, ...(s.lockRatio && asset ? { height: Math.max(1, Math.round(width * asset.height / asset.width)) } : {}) }); }} /><span>px</span></div></div><IconButton label={s.lockRatio ? "Desvincular proporções" : "Manter proporções"} aria-pressed={s.lockRatio} onClick={() => patch({ lockRatio: !s.lockRatio })}>{s.lockRatio ? <Link2 size={17} /> : <Unlink2 size={17} />}</IconButton><div className="field"><label htmlFor="image-height">Altura</label><div className="dimension-input"><input id="image-height" type="number" min={1} max={8192} value={s.height} disabled={!s.resizeEnabled} onChange={e => { const height = Math.max(1, Math.min(8192, Number(e.target.value))); patch({ height, ...(s.lockRatio && asset ? { width: Math.max(1, Math.round(height * asset.width / asset.height)) } : {}) }); }} /><span>px</span></div></div></div><Choice label="Dimensão rápida" value="custom" onChange={n => { const width = Number(n); patch({ resizeEnabled: true, width, height: s.lockRatio && asset ? Math.max(1, Math.round(width * asset.height / asset.width)) : width }); }} options={[{ value: "custom", label: "Personalizada" }, ...[16, 24, 32, 48, 64, 128, 256, 512, 1024].map(n => ({ value: String(n), label: `Largura de ${n} px` }))]} /></section><section className="control-section"><h3>Área ao redor do ícone</h3><Toggle label="Recortar margens transparentes" checked={s.trim} onChange={trim => patch({ trim })} /><RangeField label="Margem externa" value={s.padding} min={0} max={512} unit="px" onChange={padding => patch({ padding })} /></section></fieldset></>;
  if (tool === "transform") return <>{panelHeading}<fieldset className="controls-body" disabled={!asset}><section className="control-section"><h3>Orientação</h3><div className="transform-actions"><IconButton label="Girar 90 graus para a esquerda" onClick={() => patch({ rotation: (s.rotation + 270) % 360 })}><RotateCcw size={21} /></IconButton><output>{s.rotation}°</output><IconButton label="Girar 90 graus para a direita" onClick={() => patch({ rotation: (s.rotation + 90) % 360 })}><RotateCw size={21} /></IconButton></div><div className="transform-actions mirror-actions"><IconButton label="Espelhar horizontalmente" aria-pressed={s.flipX} onClick={() => patch({ flipX: !s.flipX })}><FlipHorizontal2 size={22} /></IconButton><IconButton label="Espelhar verticalmente" aria-pressed={s.flipY} onClick={() => patch({ flipY: !s.flipY })}><FlipVertical2 size={22} /></IconButton></div></section><section className="control-section"><Choice label="Ajuste de cores" value={s.filter} onChange={filter => patch({ filter: filter as Settings["filter"] })} options={[{ value: "none", label: "Sem filtro" }, { value: "grayscale", label: "Escala de cinza" }, { value: "invert", label: "Inverter cores" }]} /></section></fieldset></>;
  const currentValid = !!colorRGBA(s.source) && !!colorRGBA(s.target);
  const upsertCurrent = (source = "") => {
    if (!currentValid) { patch({ source }); return; }
    const key = colorRGBA(s.source)!.join(",");
    const existing = s.replacements.find(rule => colorRGBA(rule.source)?.join(",") === key);
    const rule = { id: existing?.id ?? crypto.randomUUID(), source: s.source.trim(), target: s.target.trim() };
    patch({ replacements: [...s.replacements.filter(item => item.id !== rule.id && colorRGBA(item.source)?.join(",") !== key), rule], source, target: "" });
    toast.success("Troca anterior fixada. Escolha a próxima cor.");
  };
  const selectSource = (source: string) => currentValid && source !== s.source ? upsertCurrent(source) : patch({ source });
  return <><div className="panel-heading"><h2>Ajustes de cor</h2><IconButton label="Restaurar ajustes" onClick={reset} disabled={!asset}><RotateCcw size={16} /></IconButton></div>
    <fieldset disabled={!asset} className="controls-body"><section className="control-section">
      <Choice label="Aplicação" value={s.mode} onChange={mode => patch({ mode: mode as Settings["mode"] })} options={[{ value: "replace", label: "Trocar cores selecionadas" }, { value: "solid", label: "Uma única cor no ícone" }, { value: "none", label: "Sem troca de cor" }]} />
      {s.mode === "replace" && <ColorField label="Cor original" value={s.source} onChange={selectSource} onPick={() => { if (currentValid) upsertCurrent(); pick("source"); }} active={picking === "source"} />}
      {s.mode !== "none" && <><div className="color-direction"><ArrowDown size={15} />{s.mode === "replace" && <IconButton label="Usar cor original como nova cor" disabled={!colorRGBA(s.source)} onClick={() => patch({ target: s.source })}><Copy size={15} /></IconButton>}</div><ColorField label="Nova cor" value={s.target} onChange={target => patch({ target })} onPick={() => pick("target")} active={picking === "target"} />
        <button className="text-action" onClick={() => saveColor(s.target)} disabled={!s.target}><BookmarkPlus size={15} /> Salvar esta cor</button></>}
      {saved.length > 0 && <div className="swatch-list">{saved.map(c => <button key={c} title={c} aria-label={`Usar ${c}`} className="swatch" style={{ background: colorCSS(c) }} onClick={() => patch({ target: c })} />)}</div>}
      {s.mode === "replace" && <button className="button secondary wide add-replacement" disabled={!currentValid || s.replacements.length >= 16} onClick={() => upsertCurrent()}><Plus size={16} />Fixar e adicionar outra</button>}
      {s.mode === "replace" && s.replacements.length > 0 && <div className="replacement-list"><div className="replacement-heading"><span>Trocas fixadas</span><span className="count">{s.replacements.length}</span></div>{s.replacements.map(rule => <div className="replacement-row" key={rule.id}><button type="button" className="replacement-edit" onClick={() => patch({ replacements: s.replacements.filter(item => item.id !== rule.id), source: rule.source, target: rule.target })} aria-label={`Editar troca ${rule.source} para ${rule.target}`}><span className="replacement-colors"><span className="swatch" style={{ background: colorCSS(rule.source) }} /><ArrowDown size={13} /><span className="swatch" style={{ background: colorCSS(rule.target) }} /></span><span><code>{rule.source}</code><code>{rule.target}</code></span><Pencil size={14} /></button><IconButton label={`Remover troca ${rule.source} para ${rule.target}`} onClick={() => patch({ replacements: s.replacements.filter(item => item.id !== rule.id) })}><Trash2 size={15} /></IconButton></div>)}</div>}
    </section>
    {s.mode === "replace" && <section className="control-section"><h3>Precisão da seleção</h3><RangeField label="Similaridade" value={s.tolerance} onChange={tolerance => patch({ tolerance })} /><Toggle label="Mesclar cores nas bordas" checked={s.smooth} onChange={smooth => patch({ smooth })} />{s.smooth && <RangeField label="Raio de suavização" value={s.radius} min={1} max={20} unit="px" onChange={radius => patch({ radius })} />}</section>}
    {s.mode !== "solid" && <section className="control-section"><h3>Padronização</h3><Toggle label="Unificar tons quase iguais" checked={s.normalizeEnabled} onChange={normalizeEnabled => patch({ normalizeEnabled })} />{s.normalizeEnabled && <RangeField label="Variação agrupada" value={s.normalizeTolerance} onChange={normalizeTolerance => patch({ normalizeTolerance })} />}</section>}
    <section className="control-section"><h3>Revisão</h3><Toggle label="Corrigir opacidade residual" description="Torna alfa 250–254 totalmente opaco no resultado e no PNG. Desative para manter a semitransparência original." checked={s.repairOpacity} onChange={repairOpacity => patch({ repairOpacity })} /><Toggle label="Mostrar máscara de alterações" checked={mask} onChange={setMask} />
      {asset && asset.colors.length > 0 && <><span className="section-label">Cores no original</span><div className="swatch-list">{asset.colors.map(c => <button key={c} className="swatch" style={{ background: colorCSS(c) }} title={c} aria-label={`Selecionar cor original ${c}`} onClick={() => selectSource(c)} />)}</div></>}
    </section></fieldset>
  </>;
}
