"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ArrowDownToLine, ArrowLeftRight, BookmarkPlus, Check, CheckCheck, ChevronRight, Copy, Crop, Download, FileArchive, FileImage, FlipHorizontal2, FolderOpen, ImagePlus, Layers3, LoaderCircle, Moon, Sun, Palette, Pipette, Plus, Redo2, RotateCw, ScanLine, ScanEye, ShieldCheck, Sparkles, Undo2, Upload, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { defaultSettings, settingsForAsset, type Asset, type ExportFormat, type ManualEraseOperation, type Settings, type ToolId } from "@/lib/editor-types";
import { bytes, canvasBlob, colorHex, colorRGBA, download, exportBlob, importAsset, makeZip, MAX_SESSION_PIXELS, renderAsset, safeName, validateSettings } from "@/lib/image-editor";
import { Choice, ColorField, IconButton, RangeField, Toggle } from "./editor-controls";
import Adjustments from "./adjustments";
import Preview, { type PixelReading } from "./canvas-preview";
import { version } from "../package.json";
import { registerEditorTools, type ColorConfiguration } from "@/lib/webmcp";

type Rendered = Awaited<ReturnType<typeof renderAsset>>;
const navigation: { id: ToolId; title: string; icon: typeof Palette }[] = [
  { id: "colors", title: "Alterar cores", icon: Palette },
  { id: "alpha", title: "Transparência", icon: ScanLine },
  { id: "size", title: "Redimensionar", icon: Crop },
  { id: "quality", title: "Melhorar qualidade", icon: Sparkles },
  { id: "transform", title: "Transformar", icon: FlipHorizontal2 },
  { id: "palette", title: "Cores salvas", icon: BookmarkPlus },
];

export default function Studio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeId, setActiveId] = useState("");
  const [tool, setTool] = useState<ToolId>("colors");
  const [view, setView] = useState("split");
  const [background, setBackground] = useState("checker");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("nhewr-theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
  });
  const [livePixel, setLivePixel] = useState<PixelReading | null>(null);
  const [inspectRgb, setInspectRgb] = useState(false);
  const [mask, setMask] = useState(false);
  const [picking, setPicking] = useState<"source" | "target" | "removeColor" | null>(null);
  const [rendered, setRendered] = useState<{ key: string; result: Rendered } | null>(null);
  const [renderError, setRenderError] = useState("");
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(92);
  const [jpegBackground, setJpegBackground] = useState("");
  const [filename, setFilename] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [batch, setBatch] = useState(false);
  const [sameSettings, setSameSettings] = useState(false);
  const [exportIds, setExportIds] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const assetRef = useRef(assets); assetRef.current = assets;
  const importLock = useRef(false);
  const lastEdit = useRef({ time: 0, key: "" });
  const active = assets.find(a => a.id === activeId);
  const s = active?.settings ?? defaultSettings;
  const renderKey = active ? `${active.id}:${JSON.stringify(s)}` : "";
  const ready = rendered?.key === renderKey;
  const output = active && rendered?.key.startsWith(`${active.id}:`) ? rendered.result : null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#191919" : "#ffffff");
    try { localStorage.setItem("nhewr-theme", theme); } catch { /* Theme remains usable for this session. */ }
  }, [theme]);

  useEffect(() => {
    try { const colors: unknown = JSON.parse(localStorage.getItem("icone-studio-colors-v2") || "[]"); if (Array.isArray(colors)) setSaved(colors.filter((c): c is string => typeof c === "string" && !!colorRGBA(c)).slice(0, 40)); } catch { /* Device preferences may be unavailable. */ }
    return () => assetRef.current.forEach(a => URL.revokeObjectURL(a.url));
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setRenderError("");
    const timer = setTimeout(() => { renderAsset(active, active.settings, controller.signal).then(result => {
      if (!controller.signal.aborted) setRendered({ key: renderKey, result });
    }).catch(error => { if (error.name !== "AbortError" && !controller.signal.aborted) setRenderError(error.message); }); }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active?.id, s, renderKey]);

  const patch = useCallback((change: Partial<Settings>) => {
    const key = activeId + Object.keys(change).sort().join(","); const now = Date.now();
    const group = key === lastEdit.current.key && now - lastEdit.current.time < 500;
    lastEdit.current = { key, time: now };
    setAssets(current => current.map(a => a.id === activeId ? { ...a, settings: { ...a.settings, ...change }, past: group ? a.past : [...a.past, a.settings].slice(-40), future: [] } : a));
  }, [activeId]);

  const agentActions = useRef({
    read: () => ({ files: assets.map(a => ({ id: a.id, name: a.name, width: a.width, height: a.height })), selectedId: activeId, settings: active?.settings ?? null }),
    configure: (value: ColorConfiguration) => { if (!active) throw new Error("Importe um ícone antes de configurar as cores."); validateSettings({ ...s, ...value }); flushSync(() => patch(value)); return { status: "configured", selectedId: activeId, preview: "processing" }; },
  });
  agentActions.current = {
    read: () => ({ files: assets.map(a => ({ id: a.id, name: a.name, width: a.width, height: a.height })), selectedId: activeId, settings: active?.settings ?? null }),
    configure: (value: ColorConfiguration) => { if (!active) throw new Error("Importe um ícone antes de configurar as cores."); validateSettings({ ...s, ...value }); flushSync(() => patch(value)); return { status: "configured", selectedId: activeId, preview: "processing" }; },
  };
  useEffect(() => registerEditorTools(() => agentActions.current), []);

  useEffect(() => {
    if (tool === "alpha" && s.eraseTool !== "color") { setView("split"); setPicking(null); }
  }, [tool, s.eraseTool]);

  const history = useCallback((redo = false) => {
    lastEdit.current = { key: "", time: 0 };
    setAssets(current => current.map(a => {
      if (a.id !== activeId || !(redo ? a.future : a.past).length) return a;
      return redo ? { ...a, settings: a.future[0], past: [...a.past, a.settings], future: a.future.slice(1) } : { ...a, settings: a.past[a.past.length - 1], past: a.past.slice(0, -1), future: [a.settings, ...a.future] };
    }));
  }, [activeId]);

  const importFiles = useCallback(async (files: File[]) => {
    if (importLock.current || !files.length) return;
    importLock.current = true; setLoading(true);
    const imported: Asset[] = [];
    let total = assetRef.current.reduce((n, a) => n + a.width * a.height, 0);
    try {
      for (const file of files) {
        if (assetRef.current.length + imported.length >= 50) { toast.error("O limite é 50 arquivos por sessão."); break; }
        try {
          const asset = await importAsset(file);
          if (total + asset.width * asset.height > MAX_SESSION_PIXELS) { URL.revokeObjectURL(asset.url); throw new Error("O limite da sessão é 32 megapixels. Remova alguns arquivos antes de importar mais."); }
          total += asset.width * asset.height; imported.push(asset);
        } catch (error) { toast.error(error instanceof Error ? error.message : `Não foi possível abrir ${file.name}.`); }
      }
      if (imported.length) {
        setAssets(previous => [...previous, ...imported]); setActiveId(imported[0].id); setMask(false); setPicking(null);
        toast.success(`${imported.length} ${imported.length === 1 ? "ícone importado" : "ícones importados"}.`);
      }
    } finally { setLoading(false); importLock.current = false; }
  }, []);

  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); void importFiles(files); }
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(null);
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); history(e.shiftKey); }
    };
    document.addEventListener("paste", paste); document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("paste", paste); document.removeEventListener("keydown", keys); };
  }, [history, importFiles]);

  async function example() {
    try {
      const response = await fetch("/mascote.png");
      if (!response.ok) throw new Error();
      await importFiles([new File([await response.blob()], "mascote-nhewr.png", { type: "image/png" })]);
    } catch { toast.error("Não foi possível abrir o exemplo."); }
  }

  function saveColor(value: string) {
    if (!colorRGBA(value)) { toast.error("Selecione uma cor válida."); return; }
    const color = colorRGBA(value)![3] === 255 ? colorHex(value) : value.trim();
    const colors = [...new Set([...saved, color])].slice(-40); setSaved(colors);
    try { localStorage.setItem("icone-studio-colors-v2", JSON.stringify(colors)); toast.success("Cor salva neste navegador."); } catch { toast.info("Cor disponível nesta sessão. O navegador bloqueou o armazenamento."); }
  }

  function setSavedColors(colors: string[]) {
    setSaved(colors);
    try { localStorage.setItem("icone-studio-colors-v2", JSON.stringify(colors)); } catch { /* Keep session state usable. */ }
  }

  function removeColor(color: string) { setSavedColors(saved.filter(c => c !== color)); }

  function removeAsset(id: string) {
    const item = assets.find(a => a.id === id); if (item) URL.revokeObjectURL(item.url);
    const remaining = assets.filter(a => a.id !== id); setAssets(remaining);
    if (activeId === id) { setActiveId(remaining[0]?.id ?? ""); setPicking(null); }
  }

  function openExport(all = false) {
    if (!active) return;
    setBatch(all); setFormat("png"); setSameSettings(false); setExportIds(all ? assets.map(a => a.id) : [active.id]); setFilename(`${safeName(active.name)}-editado`); setExportOpen(true);
  }

  async function runExport() {
    if (!active || exporting) return;
    setExporting(true);
    const selected = batch ? assets.filter(a => exportIds.includes(a.id)) : [active];
    if (!selected.length) { setExporting(false); return; }
    const archive: Record<string, Uint8Array> = {};
    try {
      for (let i = 0; i < selected.length; i++) {
        const a = selected[i]; setExportProgress(`${i + 1} de ${selected.length}`);
        const config = batch && sameSettings ? { ...s, ...(!s.resizeEnabled ? { width: a.width, height: a.height } : {}) } : a.settings;
        if (batch && sameSettings && config.resizeEnabled && config.lockRatio) config.height = Math.max(1, Math.round(config.width * a.height / a.width));
        validateSettings(config);
        const result = await renderAsset(a, config);
        const blob = await exportBlob(result.canvas, format, quality, jpegBackground);
        const extension = format === "jpeg" ? "jpg" : format;
        const name = batch ? `${String(i + 1).padStart(2, "0")}-${safeName(a.name)}-editado.${extension}` : `${safeName(filename)}.${extension}`;
        if (batch) archive[name] = new Uint8Array(await blob.arrayBuffer()); else download(blob, name);
      }
      if (batch) download(makeZip(archive), "icones-editados.zip");
      toast.success(batch ? `${selected.length} ícones exportados.` : "Ícone exportado."); setExportOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao exportar os ícones."); }
    finally { setExporting(false); setExportProgress(""); }
  }

  async function copyResult(original = false) {
    if (!active) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") { toast.info("A cópia de imagem não está disponível neste navegador. Use Exportar."); return; }
    try {
      if (!original) validateSettings(active.settings);
      const promise = original ? canvasBlob(active.canvas) : renderAsset(active).then(result => canvasBlob(result.canvas));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": promise })]); toast.success("Imagem copiada.");
    } catch { toast.error("O navegador não autorizou a cópia. Use Exportar."); }
  }

  const sample = (color: string) => { if (picking) { patch(picking === "removeColor" ? { removeColor: color, removeStrength: 0 } : { [picking]: color }); setPicking(null); toast.success(`Cor capturada: ${color.toUpperCase()}`); } };
  const reset = () => active && patch(settingsForAsset(active));
  const eraseControl = active && tool === "alpha" && s.eraseTool !== "color" && !picking ? {
    tool: s.eraseTool, size: s.eraseSize, strength: s.eraseStrength, tolerance: s.eraseTolerance,
    onCommit: (operation: ManualEraseOperation) => patch({ eraseOperations: [...s.eraseOperations, operation].slice(-80) }),
  } : undefined;

  return <TooltipProvider delayDuration={250}><div className="studio" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); void importFiles([...e.dataTransfer.files]); }}>
    <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,.ico" multiple hidden onChange={e => { void importFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    <header className="topbar"><a className="brand" href="/" aria-label="Nhewr Studios"><img className="brand-mascot" src="/mascote.png" alt="" /><span>Nhewr<span className="brand-light">Studios</span></span><span className="version">V{version}</span></a><div className="topbar-divider" /><span className="workspace-label">Área de trabalho</span><div className="topbar-actions"><IconButton label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"} onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</IconButton><span className="local-status"><ShieldCheck size={15} />Arquivos locais</span><button className="button secondary" aria-label="Importar ícones" disabled={loading} onClick={() => fileInput.current?.click()}>{loading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}<span>Importar ícones</span></button><button className="button primary" aria-label="Exportar" disabled={!active} onClick={() => openExport()}><Download size={16} /><span>Exportar</span></button></div></header>
    <SidebarProvider className="editor-layout" style={{ "--sidebar-width": "204px" } as CSSProperties}>
      <Sidebar collapsible="none" className="tool-sidebar"><div className="side-section"><span className="eyebrow">FERRAMENTAS</span><nav aria-label="Ferramentas de imagem">{navigation.map(item => <button key={item.id} className={`nav-item ${tool === item.id ? "active" : ""}`} title={item.title} aria-label={item.title} aria-current={tool === item.id ? "page" : undefined} onClick={() => setTool(item.id)}><item.icon size={18} /><span>{item.title}</span>{tool === item.id && <ChevronRight size={14} />}</button>)}</nav></div>
        <div className="file-section"><div className="section-heading"><span className="eyebrow">ARQUIVOS</span><span className="count">{assets.length}</span><IconButton label="Adicionar arquivos" onClick={() => fileInput.current?.click()}><Plus size={16} /></IconButton></div><div className="file-list">{assets.length ? assets.map(a => <div className={`file-row ${a.id === activeId ? "selected" : ""}`} key={a.id}><button className="file-select" aria-pressed={a.id === activeId} title={a.name} onClick={() => { setActiveId(a.id); setPicking(null); }}><span className="file-thumb checker"><img src={a.url} alt="" /></span><span className="file-name"><strong>{a.name}</strong><small>{a.width} × {a.height}{a.past.length > 0 ? " · Editado" : ""}</small></span></button><IconButton label={`Remover ${a.name}`} onClick={() => removeAsset(a.id)}><X size={13} /></IconButton></div>) : <div className="files-empty"><FolderOpen size={24} strokeWidth={1.4} /><span>Nenhum arquivo</span></div>}</div>{assets.length > 1 && <button className="button batch-button" onClick={() => openExport(true)}><FileArchive size={16} />Exportar lote<span>{assets.length}</span></button>}</div>
        <div className="sidebar-footer"><ShieldCheck size={17} /><span>Processamento local<small>Imagens ficam no navegador</small></span></div>
      </Sidebar>
      <main className="editor-main"><div className="workspace-heading"><div><div className="breadcrumb">Editor de ícones <ChevronRight size={12} /> {navigation.find(n => n.id === tool)?.title}</div><h1>{navigation.find(n => n.id === tool)?.title}</h1></div><div className="history-controls"><IconButton label="Desfazer" onClick={() => history()} disabled={!active?.past.length}><Undo2 size={18} /></IconButton><IconButton label="Refazer" onClick={() => history(true)} disabled={!active?.future.length}><Redo2 size={18} /></IconButton><span className="toolbar-separator" /><IconButton label="Restaurar original" onClick={reset} disabled={!active}><RotateCw size={17} /></IconButton></div></div>
        {assets.length > 0 && <div className="mobile-files"><Choice label="Arquivo atual" value={activeId} onChange={id => { setActiveId(id); setPicking(null); }} options={assets.map(a => ({ value: a.id, label: a.name }))} /><IconButton label="Remover arquivo atual" onClick={() => removeAsset(activeId)}><X size={16} /></IconButton>{assets.length > 1 && <button className="button secondary" onClick={() => openExport(true)}><FileArchive size={16} />Lote ({assets.length})</button>}</div>}
        <div className="workspace-toolbar"><Tabs value={view} onValueChange={setView}><TabsList className="view-tabs"><TabsTrigger value="split"><ArrowLeftRight size={14} />Comparar</TabsTrigger><TabsTrigger value="result"><FileImage size={14} />Resultado</TabsTrigger></TabsList></Tabs><div className="display-options"><IconButton label="Inspecionar RGB sem transparência" aria-pressed={inspectRgb} onClick={() => setInspectRgb(v => !v)}><ScanEye size={17} /></IconButton><div className="background-controls" aria-label="Fundo da prévia">{[{ id: "checker", label: "Fundo transparente" }, { id: "white", label: "Fundo branco" }, { id: "dark", label: "Fundo escuro" }].map(b => <button key={b.id} className={`background-swatch ${b.id} ${background === b.id ? "chosen" : ""}`} onClick={() => setBackground(b.id)} aria-label={b.label} title={b.label} aria-pressed={background === b.id} />)}</div></div></div>
        {inspectRgb && <div className="inspection-status"><ScanEye size={14} />Inspeção RGB · alfa oculto somente na prévia</div>}
        <div className={`previews ${view === "result" ? "result-only" : ""}`}>
          {view === "split" && <section className="preview-panel"><header><span><span className="preview-dot" />Original</span><div>{active && <small>{active.width} × {active.height} px</small>}<IconButton label="Copiar original" disabled={!active} onClick={() => copyResult(true)}><Copy size={15} /></IconButton><IconButton label="Baixar original" disabled={!active} onClick={() => active && canvasBlob(active.canvas).then(blob => download(blob, `${safeName(active.name)}-original.png`)).catch(() => toast.error("Falha ao baixar original."))}><ArrowDownToLine size={15} /></IconButton></div></header>
            {active ? <Preview key={`${active.id}-original`} canvas={active.canvas} label="Imagem original" background={background} inspectRgb={inspectRgb} onHover={setLivePixel} onSample={picking ? sample : undefined} erase={eraseControl} /> : <div className="import-area checker"><div className="import-symbol"><ImagePlus size={32} strokeWidth={1.25} /></div><h2>Seu próximo ícone começa aqui</h2><button className="button primary" onClick={() => fileInput.current?.click()}><Plus size={16} />Abrir arquivos</button><span className="file-formats">PNG, JPG, WebP, SVG e ICO</span><button className="text-action example-action" onClick={example}>Abrir ícone de exemplo <ChevronRight size={14} /></button></div>}
            <footer><span>{active ? active.name : "Nenhum ícone aberto"}</span>{active && <small>{bytes(active.size)}</small>}</footer></section>}
          <section className="preview-panel output-panel"><header><span><span className="preview-dot result-dot" />{mask ? "Máscara" : "Resultado"}</span><div>{active && <small>{!ready && !renderError ? <LoaderCircle size={14} className="spin" /> : output ? `${mask ? active.width : output.canvas.width} × ${mask ? active.height : output.canvas.height} px` : ""}</small>}{mask && <IconButton label="Baixar máscara de alterações" disabled={!output} onClick={() => output && canvasBlob(output.mask).then(blob => download(blob, "mascara-de-alteracoes.png")).catch(() => toast.error("Falha ao baixar máscara."))}><Download size={15} /></IconButton>}<IconButton label="Copiar resultado" onClick={() => copyResult()} disabled={!active}><Copy size={15} /></IconButton></div></header>
            {renderError ? <div className="render-error"><ScanLine size={28} /><p>{renderError}</p></div> : <Preview key={`${active?.id ?? "empty"}-result`} canvas={output ? mask ? output.mask : output.canvas : undefined} label={mask ? "Máscara: preto indica pixels alterados; branco, pixels preservados" : "Imagem resultante"} background={background} inspectRgb={inspectRgb} onHover={setLivePixel} onSample={picking && output && !mask ? sample : undefined} />}
            <footer><span>{!active ? "Aguardando imagem" : !ready ? "Atualizando prévia…" : output?.changed ? <><Check size={13} />{output.changed.toLocaleString("pt-BR")} pixels alterados</> : "Sem alterações de cor"}</span>{active && <small>Prévia</small>}</footer></section>
        </div>
        <div className="workspace-bottom"><span>{picking ? <><Pipette size={15} />Conta-gotas ativo · {picking === "source" ? "cor original" : picking === "target" ? "nova cor" : "cor a remover"}<button className="text-action" onClick={() => setPicking(null)}>Cancelar</button></> : <><Layers3 size={15} />{active ? active.name : "Nenhum ícone selecionado"}</>}</span><span>{active ? `${assets.length} ${assets.length === 1 ? "arquivo" : "arquivos"}` : "PNG com transparência"}</span></div>
      </main>
      <aside className="inspector"><div className="live-pixel-panel"><div className="live-pixel-heading"><Pipette size={15} /><span>RGB do pixel no arquivo</span></div><div className="live-pixel-value"><span className="pixel-swatch checker"><span style={{ background: livePixel?.hex ?? "transparent" }} /></span><div><strong>{livePixel ? livePixel.alpha ? livePixel.hex : "Transparente" : "—"}</strong><small>{livePixel ? livePixel.rgba : "Nenhum pixel selecionado"}</small></div></div>{livePixel && <div className="pixel-position">{livePixel.label} · X {livePixel.x} · Y {livePixel.y} · Alfa {livePixel.alpha}/255</div>}</div><Adjustments asset={active} settings={s} tool={tool} patch={patch} picking={picking} pick={field => { setPicking(picking === field ? null : field); setView("split"); }} mask={mask} setMask={setMask} reset={reset} saved={saved} saveColor={saveColor} removeColor={removeColor} setSavedColors={setSavedColors} /><div className="inspector-footer"><CheckCheck size={16} /><span>Original preservado</span></div></aside>
    </SidebarProvider>
    {drag && <div className="drop-overlay"><Upload size={44} /><strong>Importar ícones</strong><span>{assets.length} arquivos na sessão</span></div>}
    <Dialog open={exportOpen} onOpenChange={open => { if (!exporting) setExportOpen(open); }}><DialogContent className="export-dialog" showCloseButton={false}><DialogClose asChild><button className="dialog-close icon-button" aria-label="Fechar" disabled={exporting}><X size={18} /></button></DialogClose><DialogTitle>{batch ? "Exportar lote" : "Exportar ícone"}</DialogTitle><DialogDescription>{batch ? `${exportIds.length} de ${assets.length} arquivos selecionados` : active?.name}</DialogDescription><div className="export-settings"><Choice label="Formato" value={format} onChange={f => setFormat(f as ExportFormat)} options={[{ value: "png", label: "PNG · transparência" }, { value: "webp", label: "WebP · arquivo compacto" }, { value: "jpeg", label: "JPG · fundo opaco" }, { value: "ico", label: "ICO · ícone de até 256 px" }]} />{!batch && <div className="field"><label htmlFor="export-name">Nome do arquivo</label><div className="filename-input"><input id="export-name" value={filename} onChange={e => setFilename(e.target.value)} /><span>.{format === "jpeg" ? "jpg" : format}</span></div></div>}{(format === "webp" || format === "jpeg") && <RangeField label="Qualidade" min={1} max={100} value={quality} onChange={setQuality} />}{format === "jpeg" && <ColorField label="Cor de fundo do JPG" value={jpegBackground} onChange={setJpegBackground} />}{batch && <fieldset className="export-files" disabled={exporting}><legend>Arquivos do lote</legend><label className="export-file"><input type="checkbox" aria-label="Selecionar todos os arquivos" checked={exportIds.length === assets.length} onChange={e => setExportIds(e.target.checked ? assets.map(a => a.id) : [])} /><strong>Selecionar todos</strong></label><div className="export-file-list">{assets.map(a => <label className="export-file" key={a.id}><input type="checkbox" aria-label={`Exportar ${a.name}`} checked={exportIds.includes(a.id)} onChange={e => setExportIds(ids => e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id))} /><span className="file-thumb checker"><img src={a.url} alt="" /></span><span>{a.name}</span></label>)}</div><Toggle label="Repetir ajustes da imagem atual" checked={sameSettings} onChange={setSameSettings} /></fieldset>}<div className="export-meta"><ShieldCheck size={15} /><span>Exportação neste dispositivo</span></div></div><button className="button primary export-submit" onClick={runExport} disabled={exporting || (batch && !exportIds.length) || (format === "jpeg" && !colorRGBA(jpegBackground)) || (!batch && !filename.trim())}>{exporting ? <LoaderCircle size={17} className="spin" /> : batch ? <FileArchive size={17} /> : <Download size={17} />}{exporting ? `Exportando ${exportProgress}` : batch ? "Baixar ZIP" : `Baixar ${format === "jpeg" ? "JPG" : format.toUpperCase()}`}</button></DialogContent></Dialog>
    <Toaster theme={theme} position="bottom-right" richColors closeButton customAriaLabel="Notificações" toastOptions={{ className: "studio-toast", closeButtonAriaLabel: "Fechar aviso" }} />
  </div></TooltipProvider>;
}
