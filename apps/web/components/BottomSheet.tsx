'use client';
import { useRef, type ReactNode } from 'react';

export type Detent = 'lip' | 'half' | 'full';
const H: Record<Detent, string> = { lip: '92px', half: '52dvh', full: 'calc(100dvh - 120px)' };

/** Mobile list sheet, three detents. The bottom edge belongs to the list. */
export function BottomSheet({ detent, onDetent, summary, children }: {
  detent: Detent; onDetent: (d: Detent) => void; summary: ReactNode; children: ReactNode;
}) {
  const start = useRef<number | null>(null);
  const cycle = (dir: 'up' | 'down'): void => {
    const order: Detent[] = ['lip', 'half', 'full'];
    const i = order.indexOf(detent);
    onDetent(order[dir === 'up' ? Math.min(i + 1, 2) : Math.max(i - 1, 0)]!);
  };
  return (
    <section className="sheet" style={{ height: H[detent] }} aria-label="قائمة الأنشطة"
      onTouchStart={(e) => { start.current = e.touches[0]!.clientY; }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        if (s === null) return;
        const dy = e.changedTouches[0]!.clientY - s;
        if (Math.abs(dy) > 24) cycle(dy < 0 ? 'up' : 'down');
      }}>
      <button className="sheet-handle" aria-expanded={detent !== 'lip'}
        aria-label={detent === 'lip' ? 'افتح القائمة' : 'أغلق القائمة'}
        onClick={() => cycle(detent === 'full' ? 'down' : 'up')}>
        <span className="sheet-grip" aria-hidden />
        <span className="small muted">{summary}</span>
      </button>
      <div className="sheet-body">{detent !== 'lip' && children}</div>
    </section>
  );
}
