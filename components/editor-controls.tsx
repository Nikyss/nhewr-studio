"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Pipette } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { colorCSS, colorHex, colorRGBA } from "@/lib/image-editor";

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" aria-label={label} {...props} className={`icon-button ${props.className ?? ""}`}>{children}</button></TooltipTrigger><TooltipContent sideOffset={6}>{label}</TooltipContent></Tooltip>;
}

export function ColorField({ label, value, onChange, onPick, active }: { label: string; value: string; onChange: (value: string) => void; onPick?: () => void; active?: boolean }) {
  const id = useId(); const valid = !value || colorRGBA(value);
  return <div className="field color-field"><label htmlFor={id}>{label}</label><div className={`color-input ${!valid ? "invalid" : ""}`}>
    <span className="color-well checker"><span className="color-well-fill" style={{ background: colorCSS(value) }} /><input type="color" aria-label={`Seletor: ${label}`} value={colorHex(value) || "#000000"} onChange={e => onChange(e.target.value)} /></span>
    <input id={id} value={value} spellCheck={false} aria-invalid={!valid} placeholder="HEX, RGB ou ARGB" onChange={e => onChange(e.target.value)} />
    {onPick && <IconButton label={`Capturar ${label.toLowerCase()}`} aria-pressed={active} onClick={onPick}><Pipette size={17} /></IconButton>}
  </div>{!valid && <small className="field-error">Cor inválida. Ex.: #1677AA, rgb(22,119,170), argb(128,22,119,170).</small>}</div>;
}

export function Toggle({ label, checked, onChange, disabled, description }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; description?: string }) {
  const id = useId(); return <div className="toggle-row"><label htmlFor={id} title={description}>{label}</label><Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} /></div>;
}

export function RangeField({ label, value, onChange, min = 0, max = 100, unit = "%", disabled }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; unit?: string; disabled?: boolean }) {
  const id = useId(); return <div className="field range-field"><div className="field-heading"><label htmlFor={id}>{label}</label><div className="number-unit"><input id={id} type="number" min={min} max={max} value={value} disabled={disabled} onChange={e => { if (e.target.value !== "") onChange(Math.max(min, Math.min(max, Number(e.target.value)))); }} /><span>{unit}</span></div></div><Slider aria-label={label} value={[value]} min={min} max={max} step={1} disabled={disabled} onValueChange={([n]) => onChange(n)} /></div>;
}

export function Choice({ label, value, onChange, options, hideLabel = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; hideLabel?: boolean }) {
  const id = useId(); return <div className="field"><label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} aria-label={label} className="choice-select"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}
