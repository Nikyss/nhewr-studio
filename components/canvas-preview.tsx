import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "./editor-controls";
import { readRaster } from "@/lib/raster";
import type { ErasePoint, ManualEraseOperation } from "@/lib/editor-types";

export type PixelReading = { hex: string; rgba: string; alpha: number; x: number; y: number; label: string };
type Camera = { x: number; y: number; scale: number };
type Gesture = { type: "eraser" | "lasso"; points: ErasePoint[] };
type EraseControl = {
  tool: "eraser" | "bucket" | "lasso";
  size: number;
  strength: number;
  tolerance: number;
  onCommit: (operation: ManualEraseOperation) => void;
};
type Props = {
  canvas?: HTMLCanvasElement;
  label: string;
  background: string;
  inspectRgb?: boolean;
  onSample?: (color: string) => void;
  onHover: (color: PixelReading | null) => void;
  erase?: EraseControl;
};

export default function CanvasPreview({ canvas, label, background, inspectRgb = false, onSample, onHover, erase }: Props) {
  const raster = useMemo(() => canvas ? readRaster(canvas) : null, [canvas]);
  const [zoom, onZoom] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [hover, setHover] = useState<{ pixel: PixelReading; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [eraseCursor, setEraseCursor] = useState<{ left: number; top: number; size: number } | null>(null);
  const drag = useRef<{ x: number; y: number; start: Camera; moved: boolean; pan: boolean; point: ErasePoint | null } | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const state = useRef({ camera, canvas, onZoom, size, zoom });
  state.current = { camera, canvas, onZoom, size, zoom };
  const pendingZoom = useRef<number | null>(null);
  const previousSize = useRef(size);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const fit = () => canvas ? Math.max(.01, Math.min(16, (size.width - 36) / canvas.width, (size.height - 36) / canvas.height)) : 1;
  const setActiveGesture = (value: Gesture | null) => { gestureRef.current = value; setGesture(value); };
  const resetCamera = () => {
    onZoom(0);
    setCamera({ scale: fit(), x: (size.width - (canvas?.width ?? 0) * fit()) / 2, y: (size.height - (canvas?.height ?? 0) * fit()) / 2 });
  };

  useLayoutEffect(() => {
    const element = stage.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!display.current || !canvas) return;
    const pixels = new Uint8ClampedArray(raster!.data);
    if (inspectRgb) for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) pixels[i] = 255;
    const source = document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    const sourceContext = source.getContext("2d", { colorSpace: "srgb" })!;
    sourceContext.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    const bitmapWidth = camera.scale < 1 ? Math.max(1, Math.round(canvas.width * camera.scale)) : canvas.width;
    const bitmapHeight = camera.scale < 1 ? Math.max(1, Math.round(canvas.height * camera.scale)) : canvas.height;
    display.current.width = bitmapWidth;
    display.current.height = bitmapHeight;
    const context = display.current.getContext("2d", { colorSpace: "srgb" })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, bitmapWidth, bitmapHeight);
  }, [canvas, raster, inspectRgb, camera.scale]);

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
    setEraseCursor(null);
  }, [zoom, size.width, size.height, canvas?.width, canvas?.height]);

  useEffect(() => {
    const element = stage.current!;
    const wheel = (event: WheelEvent) => {
      if (!state.current.canvas) return;
      event.preventDefault();
      event.stopPropagation();
      const { camera: old, onZoom: report } = state.current;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.current.size.height : 1);
      const scale = Math.max(.01, Math.min(16, old.scale * Math.exp(-delta * .0015)));
      const next = { scale, x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale };
      state.current.camera = next;
      setCamera(next);
      setHover(null);
      setEraseCursor(null);
      onHover(null);
      pendingZoom.current = scale * 100;
      report(scale * 100);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [onHover]);

  function pointAt(clientX: number, clientY: number, clamp = false): ErasePoint | null {
    if (!canvas || !display.current) return null;
    const rect = display.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    let x = (clientX - rect.left) * canvas.width / rect.width;
    let y = (clientY - rect.top) * canvas.height / rect.height;
    if (clamp) {
      x = Math.max(0, Math.min(canvas.width - .001, x));
      y = Math.max(0, Math.min(canvas.height - .001, y));
    } else if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  }

  function read(clientX: number, clientY: number) {
    if (!canvas || !stage.current) return null;
    const point = pointAt(clientX, clientY);
    if (!point) { setHover(null); onHover(null); return null; }
    const rect = stage.current.getBoundingClientRect();
    const x = Math.floor(point.x), y = Math.floor(point.y);
    const index = (y * canvas.width + x) * 4;
    const [r, g, b, a] = raster!.data.subarray(index, index + 4);
    const hex = "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    const pixel = { hex, rgba: `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`, alpha: a, x, y, label };
    setHover({ pixel, left: Math.min(Math.max(6, clientX - rect.left + 16), Math.max(6, rect.width - 177)), top: Math.max(6, clientY - rect.top - 75) });
    onHover(pixel);
    return pixel;
  }

  function appendPoint(point: ErasePoint) {
    const current = gestureRef.current;
    if (!current || current.points.length >= 2048) return;
    const last = current.points[current.points.length - 1];
    const minimum = current.type === "eraser" ? Math.max(.75, (erase?.size ?? 1) * .08) : .75;
    if (Math.hypot(point.x - last.x, point.y - last.y) < minimum) return;
    setActiveGesture({ ...current, points: [...current.points, point] });
  }

  function updateEraseCursor(clientX: number, clientY: number) {
    if (erase?.tool !== "eraser" || !stage.current || !pointAt(clientX, clientY)) { setEraseCursor(null); return; }
    const rect = stage.current.getBoundingClientRect();
    const imageRect = display.current?.getBoundingClientRect();
    const displayScale = imageRect && canvas ? imageRect.width / canvas.width : camera.scale;
    setEraseCursor({ left: clientX - rect.left, top: clientY - rect.top, size: Math.max(4, Math.min(1200, erase.size * displayScale)) });
  }

  useEffect(() => {
    if (pointer.current && !drag.current) read(pointer.current.x, pointer.current.y);
  }, [camera, canvas]);

  useEffect(() => {
    setActiveGesture(null);
    setEraseCursor(null);
  }, [erase?.tool]);

  const displayWidth = canvas ? Math.max(1, Math.round(canvas.width * camera.scale)) : 0;
  const displayHeight = canvas ? Math.max(1, Math.round(canvas.height * camera.scale)) : 0;
  const imageStyle = canvas ? { position: "absolute" as const, left: Math.round(camera.x), top: Math.round(camera.y), width: displayWidth, height: displayHeight, maxWidth: "none" } : undefined;
  // The external color picker reads the composited screen pixel. CSS interpolation
  // must never invent a nearby channel value between source pixels.
  const imageRendering = "pixelated";

  return <>
    <div className="preview-navigation" role="group" aria-label={`Zoom: ${label}`}>
      <IconButton label={`Diminuir zoom: ${label}`} disabled={!canvas} onClick={() => onZoom(Math.max(1, camera.scale * 80))}><Minus size={14} /></IconButton>
      <output className="zoom-label">{canvas ? `${Math.round(camera.scale * 100)}%` : "—"}</output>
      <IconButton label={`Aumentar zoom: ${label}`} disabled={!canvas} onClick={() => onZoom(Math.min(1600, camera.scale * 125))}><Plus size={14} /></IconButton>
      <IconButton label={`Zoom 100%: ${label}`} disabled={!canvas} onClick={() => onZoom(100)}>100%</IconButton>
      <IconButton label={`Ajustar à área: ${label}`} disabled={!canvas} onClick={resetCamera}><Maximize size={14} /></IconButton>
    </div>
    <div ref={stage} className={`canvas-stage interactive-stage ${background} ${onSample ? "sampling" : ""} ${erase ? `manual-edit ${erase.tool}` : ""} ${dragging ? "panning" : ""}`} tabIndex={canvas ? 0 : -1} aria-label={`Área de trabalho: ${label}`} data-erase-tool={erase?.tool} onContextMenu={event => event.preventDefault()} onDoubleClick={() => { if (!erase && !onSample) resetCamera(); }}
      onKeyDown={event => {
        if (!canvas) return;
        if (event.key === "Escape" && gestureRef.current) { setActiveGesture(null); return; }
        if (event.key === "0") resetCamera();
        else if (event.key === "+" || event.key === "=") onZoom(Math.min(1600, camera.scale * 125));
        else if (event.key === "-") onZoom(Math.max(1, camera.scale * 80));
        else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          setCamera(current => ({ ...current, x: current.x + (event.key === "ArrowLeft" ? 30 : event.key === "ArrowRight" ? -30 : 0), y: current.y + (event.key === "ArrowUp" ? 30 : event.key === "ArrowDown" ? -30 : 0) }));
        }
      }}
      onPointerDown={event => {
        if (!canvas || (event.button !== 0 && event.button !== 1)) return;
        if (event.pointerType === "touch" && !onSample && !erase) return;
        const point = pointAt(event.clientX, event.clientY);
        const pan = event.button === 1 || event.altKey || (!onSample && !erase);
        if (!pan && erase && !point) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, start: camera, moved: false, pan, point };
        if (!pan && erase && point && erase.tool !== "bucket") setActiveGesture({ type: erase.tool, points: [point] });
      }}
      onPointerMove={event => {
        pointer.current = { x: event.clientX, y: event.clientY };
        updateEraseCursor(event.clientX, event.clientY);
        const currentDrag = drag.current;
        if (currentDrag && (Math.abs(event.clientX - currentDrag.x) + Math.abs(event.clientY - currentDrag.y) > 3 || currentDrag.moved)) {
          currentDrag.moved = true;
          if (currentDrag.pan) {
            setDragging(true);
            setCamera({ ...currentDrag.start, x: currentDrag.start.x + event.clientX - currentDrag.x, y: currentDrag.start.y + event.clientY - currentDrag.y });
            setHover(null);
            onHover(null);
            return;
          }
          if (erase?.tool !== "bucket") appendPoint(pointAt(event.clientX, event.clientY, true)!);
        }
        if (!read(event.clientX, event.clientY)) { setHover(null); onHover(null); }
      }}
      onPointerUp={event => {
        const currentDrag = drag.current;
        const currentGesture = gestureRef.current;
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (currentDrag && !currentDrag.pan && erase) {
          if (erase.tool === "bucket" && currentDrag.point) erase.onCommit({ type: "bucket", point: currentDrag.point, tolerance: erase.tolerance, strength: erase.strength });
          else if (currentGesture?.type === "eraser" && currentGesture.points.length) erase.onCommit({ type: "eraser", points: currentGesture.points, size: erase.size, strength: erase.strength });
          else if (currentGesture?.type === "lasso" && currentGesture.points.length >= 3) erase.onCommit({ type: "lasso", points: currentGesture.points, strength: erase.strength });
          setActiveGesture(null);
          return;
        }
        if (currentDrag && !currentDrag.moved && onSample && !currentDrag.pan) {
          const pixel = read(event.clientX, event.clientY);
          if (pixel?.alpha) onSample(pixel.hex);
          else if (pixel) toast.info("Pixel transparente: nenhuma cor foi capturada.");
        }
      }}
      onPointerCancel={() => { pointer.current = null; drag.current = null; setDragging(false); setActiveGesture(null); setEraseCursor(null); setHover(null); onHover(null); }}
      onPointerLeave={() => { pointer.current = null; if (!drag.current) { setHover(null); setEraseCursor(null); onHover(null); } }}>
      {canvas ? <canvas ref={display} aria-label={label} role="img" style={{ ...imageStyle, imageRendering }} /> : <div className="preview-placeholder"><ScanLine size={34} strokeWidth={1} /><span>Prévia do resultado</span></div>}
      {canvas && gesture && <svg className="erase-overlay" aria-hidden="true" viewBox={`0 0 ${canvas.width} ${canvas.height}`} style={imageStyle}>
        {gesture.type === "eraser" ? <polyline points={gesture.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={erase?.size ?? 1} strokeLinecap="round" strokeLinejoin="round" /> : gesture.points.length >= 3 ? <polygon points={gesture.points.map(point => `${point.x},${point.y}`).join(" ")} /> : <polyline points={gesture.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" />}
      </svg>}
      {eraseCursor && <span className="erase-cursor" aria-hidden="true" style={{ left: eraseCursor.left, top: eraseCursor.top, width: eraseCursor.size, height: eraseCursor.size }} />}
      {hover && !dragging && <div className="pixel-tooltip" style={{ left: hover.left, top: hover.top }}><span className="pixel-swatch checker"><span style={{ background: hover.pixel.alpha ? hover.pixel.hex : "transparent" }} /></span><div><strong>{hover.pixel.alpha ? hover.pixel.hex : "Transparente"}</strong><small>{hover.pixel.x}, {hover.pixel.y} · α {Math.round(hover.pixel.alpha / 255 * 100)}%</small></div></div>}
    </div>
  </>;
}
