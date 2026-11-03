'use client';
// Recuadro para dibujar la firma con el dedo, el mouse o un lápiz.
// Entrega un PNG recortado a lo dibujado (fondo transparente, tinta negra), o null si está vacío.
import { useEffect, useRef, useState } from 'react';

export default function SignaturePad({ onChange, hint = 'Firma aquí con el dedo o el mouse', clearLabel = 'Borrar', label = 'Dibuja tu firma' }: { onChange: (png: string | null) => void; hint?: string; clearLabel?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // tamaño real del lienzo según la pantalla (nítido en celulares)
  useEffect(() => {
    const c = ref.current!;
    const fit = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111114'; g.lineWidth = 2.4;
      box.current = null; setEmpty(true); onChange(null);
    };
    fit();
    const ro = new ResizeObserver(() => { if (box.current === null) fit(); });
    ro.observe(c);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const grow = (p: { x: number; y: number }) => {
    const b = box.current;
    box.current = b ? { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true; last.current = pos(e); grow(last.current);
    const g = ref.current!.getContext('2d')!;
    g.beginPath(); g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); g.fillStyle = '#111114'; g.fill();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e), g = ref.current!.getContext('2d')!;
    // un poco más gruesa con presión de lápiz
    g.lineWidth = e.pointerType === 'pen' && e.pressure ? 1.4 + e.pressure * 2.4 : 2.4;
    g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke();
    last.current = p; grow(p);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    const b = box.current;
    // trazos demasiado chicos no cuentan como firma
    if (!b || (b.x1 - b.x0 < 24 && b.y1 - b.y0 < 12)) return;
    setEmpty(false);
    onChange(exportPng());
  };

  // recorta a lo dibujado y lo baja a máx. 600×200 para que pese poco
  const exportPng = () => {
    const c = ref.current!, b = box.current!, dpr = window.devicePixelRatio || 1, pad = 8;
    const sx = Math.max(0, (b.x0 - pad) * dpr), sy = Math.max(0, (b.y0 - pad) * dpr);
    const sw = Math.min(c.width - sx, (b.x1 - b.x0 + 2 * pad) * dpr), sh = Math.min(c.height - sy, (b.y1 - b.y0 + 2 * pad) * dpr);
    const k = Math.min(1, 600 / sw, 200 / sh);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
    out.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };

  const clear = () => {
    const c = ref.current!, g = c.getContext('2d')!;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore();
    box.current = null; setEmpty(true); onChange(null);
  };

  return (
    <div className="sigpad">
      <canvas ref={ref} aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <span className="sigpad-line" aria-hidden="true" />
      {empty && <span className="sigpad-hint" aria-hidden="true">{hint}</span>}
      {!empty && <button type="button" className="btn small sigpad-clear" onClick={clear}>{clearLabel}</button>}
    </div>
  );
}
