import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "./editor-controls";
import { readRaster } from "@/lib/raster";

export type PixelReading = { hex: string; rgba: string; alpha: number; x: number; y: number; label: string };
type Props = { canvas?: HTMLCanvasElement; label: string; background: string; inspectRgb?: boolean; onSample?: (color: string) => void; onHover: (color: PixelReading | null) => void };
type Camera = { x: number; y: number; scale: number };
export default function CanvasPreview({ canvas, label, background, inspectRgb = false, onSample, onHover }: Props) {
  const raster = useMemo(() => canvas ? readRaster(canvas) : null, [canvas]);
  const [zoom, onZoom] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [hover, setHover] = useState<{ pixel: PixelReading; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: Camera; moved: boolean; pan: boolean } | null>(null);
  const state = useRef({ camera, canvas, onZoom, size, zoom });
  state.current = { camera, canvas, onZoom, size, zoom };
  const pendingZoom = useRef<number | null>(null);
  const previousSize = useRef(size);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const fit = () => canvas ? Math.max(.01, Math.min(16, (size.width - 36) / canvas.width, (size.height - 36) / canvas.height)) : 1;
  const resetCamera = () => {
    onZoom(0);
    setCamera({ scale: fit(), x: (size.width - (canvas?.width ?? 0) * fit()) / 2, y: (size.height - (canvas?.height ?? 0) * fit()) / 2 });
  };

  useLayoutEffect(() => {
    const element = stage.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!display.current || !canvas) return;
    display.current.width = canvas.width; display.current.height = canvas.height;
    const pixels = new Uint8ClampedArray(raster!.data);
    if (inspectRgb) for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) pixels[i] = 255;
    display.current.getContext("2d", { colorSpace: "srgb" })!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  }, [canvas, raster, inspectRgb]);
  useLayoutEffect(() => {
    if (!canvas) return;
    const previous = previousSize.current;
    previousSize.current = size;
    const scale = Math.max(.01, zoom ? zoom / 100 : fit());
    if (pendingZoom.current === zoom) { pendingZoom.current = null; return; }
    setCamera(old => {
      if (!zoom) return { scale, x: (size.width - canvas.width * scale) / 2, y: (size.height - canvas.height * scale) / 2 };
      const ratio = scale / old.scale;
      return { scale, x: size.width / 2 - (previous.width / 2 - old.x) * ratio, y: size.height / 2 - (previous.height / 2 - old.y) * ratio };
    });
    setHover(null);
  }, [zoom, size.width, size.height, canvas?.width, canvas?.height]);

  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => {
      if (!state.current.canvas) return;
      event.preventDefault(); event.stopPropagation();
      const { camera: old, onZoom: report } = state.current;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.current.size.height : 1);
      const scale = Math.max(.01, Math.min(16, old.scale * Math.exp(-delta * .0015)));
      const next = { scale, x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale };
      state.current.camera = next; setCamera(next); setHover(null); onHover(null);
      pendingZoom.current = scale * 100; report(scale * 100);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [onHover]);

  function read(clientX: number, clientY: number) {
    if (!canvas || !stage.current) return null;
    const rect = stage.current.getBoundingClientRect();
    const imageRect = display.current!.getBoundingClientRect();
    const x = Math.floor((clientX - imageRect.left) * canvas.width / imageRect.width);
    const y = Math.floor((clientY - imageRect.top) * canvas.height / imageRect.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) { setHover(null); onHover(null); return null; }
    const index = (y * canvas.width + x) * 4;
    const [r, g, b, a] = raster!.data.subarray(index, index + 4);
    const hex = "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    const pixel = { hex, rgba: `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`, alpha: a, x, y, label };
    setHover({ pixel, left: Math.min(Math.max(6, clientX - rect.left + 16), Math.max(6, rect.width - 177)), top: Math.max(6, clientY - rect.top - 75) });
    onHover(pixel); return pixel;
  }
  useEffect(() => {
    if (pointer.current && !drag.current) read(pointer.current.x, pointer.current.y);
  }, [camera, canvas]);
  return <><div className="preview-navigation" role="group" aria-label={`Zoom: ${label}`}><IconButton label={`Diminuir zoom: ${label}`} disabled={!canvas} onClick={() => onZoom(Math.max(1, camera.scale * 80))}><Minus size={14} /></IconButton><output className="zoom-label">{canvas ? `${Math.round(camera.scale * 100)}%` : "—"}</output><IconButton label={`Aumentar zoom: ${label}`} disabled={!canvas} onClick={() => onZoom(Math.min(1600, camera.scale * 125))}><Plus size={14} /></IconButton><IconButton label={`Zoom 100%: ${label}`} disabled={!canvas} onClick={() => onZoom(100)}>100%</IconButton><IconButton label={`Ajustar à área: ${label}`} disabled={!canvas} onClick={resetCamera}><Maximize size={14} /></IconButton></div><div ref={stage} className={`canvas-stage interactive-stage ${background} ${onSample ? "sampling" : ""} ${dragging ? "panning" : ""}`} tabIndex={canvas ? 0 : -1} aria-label={`Área de trabalho: ${label}`} onContextMenu={e => e.preventDefault()} onDoubleClick={resetCamera}
    onKeyDown={e => {
      if (!canvas) return;
      if (e.key === "0") resetCamera();
      else if (e.key === "+" || e.key === "=") onZoom(Math.min(1600, camera.scale * 125));
      else if (e.key === "-") onZoom(Math.max(1, camera.scale * 80));
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); setCamera(c => ({ ...c, x: c.x + (e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0), y: c.y + (e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0) })); }
    }} onPointerDown={e => {
      if (!canvas || (e.button !== 0 && e.button !== 1)) return;
      if (e.pointerType === "touch" && !onSample) return;
      e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, start: camera, moved: false, pan: !onSample || e.button === 1 || e.altKey };
    }} onPointerMove={e => {
      pointer.current = { x: e.clientX, y: e.clientY };
      const d = drag.current;
      if (d && (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3 || d.moved)) {
        d.moved = true;
        if (d.pan) { setDragging(true); setCamera({ ...d.start, x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }); setHover(null); onHover(null); return; }
      }
      if (!read(e.clientX, e.clientY)) { setHover(null); onHover(null); }
    }} onPointerUp={e => {
      const d = drag.current; drag.current = null; setDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (d && !d.moved && onSample && !d.pan) { const pixel = read(e.clientX, e.clientY); if (pixel?.alpha) onSample(pixel.hex); else if (pixel) toast.info("Pixel transparente: nenhuma cor foi capturada."); }
    }} onPointerCancel={() => { pointer.current = null; drag.current = null; setDragging(false); setHover(null); onHover(null); }} onPointerLeave={() => { pointer.current = null; if (!drag.current) { setHover(null); onHover(null); } }}>
    {canvas ? <canvas ref={display} aria-label={label} role="img" style={{ position: "absolute", left: camera.x, top: camera.y, width: canvas.width * camera.scale, height: canvas.height * camera.scale, maxWidth: "none", imageRendering: inspectRgb || camera.scale >= 4 ? "pixelated" : "auto" }} /> : <div className="preview-placeholder"><ScanLine size={34} strokeWidth={1} /><span>Prévia do resultado</span></div>}
    {hover && !dragging && <div className="pixel-tooltip" style={{ left: hover.left, top: hover.top }}><span className="pixel-swatch checker"><span style={{ background: hover.pixel.alpha ? hover.pixel.hex : "transparent" }} /></span><div><strong>{hover.pixel.alpha ? hover.pixel.hex : "Transparente"}</strong><small>{hover.pixel.x}, {hover.pixel.y} · α {Math.round(hover.pixel.alpha / 255 * 100)}%</small></div></div>}
  </div></>;
}
