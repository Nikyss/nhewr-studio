"use client";

import { Eraser, LassoSelect, PaintBucket, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Asset, Settings } from "@/lib/editor-types";
import { colorCSS, colorRGBA } from "@/lib/image-editor";
import { Choice, ColorField, IconButton, RangeField, Toggle } from "./editor-controls";

type Props = {
  asset?: Asset;
  settings: Settings;
  patch: (value: Partial<Settings>) => void;
  picking: string | null;
  pick: (field: "removeColor") => void;
};

const tools = [
  { id: "color", label: "Por cor", icon: Palette },
  { id: "eraser", label: "Borracha", icon: Eraser },
  { id: "bucket", label: "Balde", icon: PaintBucket },
  { id: "lasso", label: "Laço", icon: LassoSelect },
] as const;

function rgbKey(value: string) {
  return colorRGBA(value)?.slice(0, 3).join(",") ?? "";
}

export default function TransparencyAdjustments({ asset, settings: s, patch, picking, pick }: Props) {
  const currentValid = !!colorRGBA(s.removeColor) && s.removeStrength > 0;
  const upsertCurrent = (removeColor = "") => {
    if (!currentValid) { patch({ removeColor, removeStrength: 0 }); return; }
    const key = rgbKey(s.removeColor);
    const existing = s.removals.find(rule => rgbKey(rule.color) === key);
    const rule = {
      id: existing?.id ?? crypto.randomUUID(), color: s.removeColor.trim(), strength: s.removeStrength,
      tolerance: s.removeTolerance, feather: s.removeFeather, edgeOnly: s.edgeOnly,
    };
    patch({ removals: [...s.removals.filter(item => item.id !== rule.id && rgbKey(item.color) !== key), rule], removeColor, removeStrength: 0 });
    toast.success("Faixa anterior fixada. Escolha a próxima cor.");
  };
  const selectColor = (removeColor: string) => {
    const same = rgbKey(removeColor) && rgbKey(removeColor) === rgbKey(s.removeColor);
    if (currentValid && !same) upsertCurrent(removeColor);
    else patch({ removeColor, ...(same ? {} : { removeStrength: 0 }) });
  };

  return <fieldset className="controls-body" disabled={!asset}>
    <section className="control-section erase-section">
      <h3>Ferramenta de remoção</h3>
      <div className="erase-tool-grid" role="group" aria-label="Ferramenta de remoção">
        {tools.map(item => <button key={item.id} type="button" className="erase-tool" aria-label={item.label} aria-pressed={s.eraseTool === item.id} onClick={() => patch({ eraseTool: item.id })}><item.icon size={17} /><span>{item.label}</span></button>)}
      </div>

      {s.eraseTool === "color" && <div className="erase-tool-controls">
        <Toggle label="Ativar remoção por cor" checked={s.removeEnabled} onChange={removeEnabled => patch({ removeEnabled })} />
        {s.removeEnabled && <>
          <ColorField label="Cor a apagar" value={s.removeColor} onChange={selectColor} onPick={() => { if (currentValid) upsertCurrent(); pick("removeColor"); }} active={picking === "removeColor"} />
          <RangeField label="Intensidade da remoção" value={s.removeStrength} onChange={removeStrength => patch({ removeStrength })} />
          <div className="range-endpoints"><span>0% · manter</span><span>100% · apagar</span></div>
          <Choice label="Área afetada" hideLabel value={s.edgeOnly ? "edge" : "all"} onChange={value => patch({ edgeOnly: value === "edge" })} options={[{ value: "edge", label: "Fundo conectado às bordas" }, { value: "all", label: "Toda a imagem" }]} />
          <RangeField label="Incluir tons parecidos" value={s.removeTolerance} onChange={removeTolerance => patch({ removeTolerance })} />
          <RangeField label="Suavização do recorte" value={s.removeFeather} onChange={removeFeather => patch({ removeFeather })} />
          <button className="button secondary wide add-replacement" disabled={!currentValid || s.removals.length >= 16} onClick={() => upsertCurrent()}><Plus size={16} />Fixar e adicionar outra</button>
          {s.removals.length > 0 && <div className="replacement-list removal-list"><div className="replacement-heading"><span>Remoções fixadas</span><span className="count">{s.removals.length}</span></div>{s.removals.map(rule => <div className="replacement-row" key={rule.id}><button type="button" className="removal-edit" aria-label={`Editar remoção ${rule.color}`} onClick={() => patch({ removals: s.removals.filter(item => item.id !== rule.id), removeColor: rule.color, removeStrength: rule.strength, removeTolerance: rule.tolerance, removeFeather: rule.feather, edgeOnly: rule.edgeOnly })}><span className="swatch" style={{ background: colorCSS(rule.color) }} /><span><code>{rule.color}</code><small>{rule.strength}% · tons {rule.tolerance}% · {rule.edgeOnly ? "bordas" : "imagem"}</small></span><Pencil size={14} /></button><IconButton label={`Remover faixa ${rule.color}`} onClick={() => patch({ removals: s.removals.filter(item => item.id !== rule.id) })}><Trash2 size={15} /></IconButton></div>)}</div>}
        </>}
      </div>}

      {s.eraseTool === "eraser" && <div className="erase-tool-controls"><RangeField label="Tamanho da borracha" value={s.eraseSize} min={1} max={256} unit="px" onChange={eraseSize => patch({ eraseSize })} /><RangeField label="Intensidade da borracha" value={s.eraseStrength} onChange={eraseStrength => patch({ eraseStrength })} /></div>}
      {s.eraseTool === "bucket" && <div className="erase-tool-controls"><RangeField label="Intensidade do balde" value={s.eraseStrength} onChange={eraseStrength => patch({ eraseStrength })} /><RangeField label="Incluir tons parecidos" value={s.eraseTolerance} onChange={eraseTolerance => patch({ eraseTolerance })} /></div>}
      {s.eraseTool === "lasso" && <div className="erase-tool-controls"><RangeField label="Intensidade da seleção" value={s.eraseStrength} onChange={eraseStrength => patch({ eraseStrength })} /></div>}

      {s.eraseOperations.length > 0 && <div className="manual-removal-summary"><span>{s.eraseOperations.length} {s.eraseOperations.length === 1 ? "remoção manual" : "remoções manuais"}</span><button type="button" className="text-action" onClick={() => patch({ eraseOperations: [] })}><Trash2 size={14} />Limpar</button></div>}
    </section>
    <section className="control-section"><h3>Visibilidade do ícone</h3><Toggle label="Corrigir opacidade residual" description="Torna alfa 250–254 totalmente opaco no resultado e no PNG. Desative para manter a semitransparência original." checked={s.repairOpacity} onChange={repairOpacity => patch({ repairOpacity })} /><RangeField label="Opacidade" value={s.opacity} onChange={opacity => patch({ opacity })} /><div className="range-endpoints"><span>0% · invisível</span><span>100% · sem redução</span></div></section>
    <section className="control-section"><h3>Fundo do arquivo</h3><Choice label="Fundo de saída" value={s.backgroundEnabled ? "color" : "transparent"} onChange={value => patch({ backgroundEnabled: value === "color" })} options={[{ value: "transparent", label: "Preservar transparência" }, { value: "color", label: "Preencher com uma cor" }]} />{s.backgroundEnabled && <ColorField label="Cor do fundo" value={s.background} onChange={background => patch({ background })} />}</section>
  </fieldset>;
}
