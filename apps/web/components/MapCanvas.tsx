'use client';
import { useEffect, useRef, useState } from 'react';
import { Awning, colorFor } from './ui';
import type { Bbox, Pin } from '../lib/types';

/**
 * Progressive map (UX/UI System §06.1).
 *
 * Pins render immediately using the same Web Mercator projection MapLibre will
 * use, so they do not move when the engine takes over — the highest-risk detail
 * in the product.
 *
 * BLOCKED: no PMTiles basemap archive exists (external acquisition unavailable,
 * see docs/legal). Until one does, this renders the DESIGNED degraded state:
 * neutral surface + real pins + an honest banner. Setting NEXT_PUBLIC_PMTILES_URL
 * activates the real basemap with no code change.
 */
const merc = (lon: number, lat: number): { x: number; y: number } => {
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
};

export function MapCanvas({ pins, bbox, selected, onSelect }: {
  pins: Pin[]; bbox: Bbox; selected: string | null; onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const hasBasemap = Boolean(process.env.NEXT_PUBLIC_PMTILES_URL);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const project = (lon: number, lat: number): { left: number; top: number } => {
    const a = merc(bbox.west, bbox.north), b = merc(bbox.east, bbox.south), p = merc(lon, lat);
    const cx = size.w / 2, cy = size.h / 2;
    const x = ((p.x - a.x) / (b.x - a.x)) * size.w;
    const y = ((p.y - a.y) / (b.y - a.y)) * size.h;
    return { left: cx + (x - cx) * zoom, top: cy + (y - cy) * zoom };
  };

  return (
    <div ref={ref} className="mapstage" role="application" aria-label="خريطة الأنشطة">
      <div className="mapgrid" aria-hidden />
      {!hasBasemap && (
        <div className="mapnotice" role="status">
          خلفية الخريطة غير مفعّلة بعد — الأنشطة معروضة بمواقعها الحقيقية.
        </div>
      )}
      <div className="mapctl" style={{ top: 'var(--s3)' }}>
        <button aria-label="تكبير" onClick={() => setZoom((z) => Math.min(3, z * 1.35))}>+</button>
        <button aria-label="تصغير" onClick={() => setZoom((z) => Math.max(0.6, z / 1.35))}>−</button>
        <button aria-label="إعادة الضبط" onClick={() => setZoom(1)}>◎</button>
      </div>

      {size.w > 0 && pins.map((p) => {
        const { left, top } = project(p.lon, p.lat);
        if (left < -40 || top < -40 || left > size.w + 40 || top > size.h + 40) return null;
        const isSel = selected === p.id;
        return (
          <button key={p.id} className="mappin" style={{ left, top, zIndex: isSel ? 12 : 10 }}
            onClick={() => onSelect(p.id)}
            aria-label={`${p.name}${p.trust === 'VERIFIED' ? '، موثّق' : ''}${p.sponsored ? '، مموّل' : ''}`}>
            <span style={{
              display: 'block', filter: isSel ? 'drop-shadow(0 3px 8px rgba(20,18,58,.35))' : 'none',
              transform: isSel ? 'scale(1.3)' : 'none', opacity: 0.55 + p.weight * 0.09,
            }}>
              <Awning color={colorFor(p.categorySlug)} size={20 + p.weight * 4} />
            </span>
            {p.sponsored && (
              <span style={{ display: 'block', fontSize: 9, fontWeight: 600,
                color: 'var(--attention)', textAlign: 'center', marginTop: -2 }}>مموّل</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
