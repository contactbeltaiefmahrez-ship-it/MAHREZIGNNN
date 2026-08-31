'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapCanvas } from '../../components/MapCanvas';
import { BottomSheet, type Detent } from '../../components/BottomSheet';
import { BusinessCard, CardSkeleton, EmptyState } from '../../components/ui';
import { getCategories, getDiscovery, GRAND_TUNIS } from '../../lib/data';
import type { Category, Pin } from '../../lib/types';

export default function MapPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [sponsored, setSponsored] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detent, setDetent] = useState<Detent>('half');
  const router = useRouter();

  useEffect(() => { void getCategories().then((r) => setCats(r.categories)); }, []);
  useEffect(() => {
    setPins(null);
    void getDiscovery(GRAND_TUNIS, cat).then((r) => { setPins(r.pins); setSponsored(r.sponsoredCount); });
  }, [cat]);

  const list = useMemo(() => pins ?? [], [pins]);

  // Fit the viewport to the data with padding, rather than always drawing the
  // full Grand Tunis box — otherwise a filtered set leaves most of the map empty.
  const view = useMemo(() => {
    if (list.length === 0) return GRAND_TUNIS;
    const lons = list.map((p) => p.lon), lats = list.map((p) => p.lat);
    const w = Math.min(...lons), e = Math.max(...lons);
    const s2 = Math.min(...lats), n = Math.max(...lats);
    const padX = Math.max((e - w) * 0.12, 0.004);
    const padY = Math.max((n - s2) * 0.12, 0.003);
    return { west: w - padX, south: s2 - padY, east: e + padX, north: n + padY };
  }, [list]);
  const summary = pins === null ? 'جارٍ التحميل…'
    : `${list.length} واجهة ظاهرة${sponsored ? ` · ${sponsored} مموّل` : ''}`;

  const open = (id: string): void => router.push(`/business/${id}`);

  return (
    <main className="shell" style={{ height: 'calc(100dvh - var(--header-h))' }}>
      <div className="wrap" style={{ paddingBlock: 'var(--s3)' }}>
        <div className="chiprow" role="tablist" aria-label="الفئات">
          <button className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>الكل</button>
          {cats.map((c) => (
            <button key={c.slug} className="chip" aria-pressed={cat === c.slug}
              onClick={() => setCat(c.slug)}>
              <span className="chip-dot" style={{ background: c.color }} />{c.ar}
            </button>
          ))}
        </div>
      </div>

      <div className="split">
        <aside className="split-list" aria-label="نتائج">
          <div className="small muted" style={{ padding: '0 4px 4px' }}>{summary}</div>
          {pins === null && <CardSkeleton n={5} />}
          {pins?.length === 0 && (
            <EmptyState icon="◌" title="لا توجد أنشطة هنا بعد"
              body="تغطيتنا حاليًا في تونس الكبرى، ٨ فئات."
              action={<button className="btn btn-sm btn-ghost" onClick={() => setCat(null)}>إزالة الفلتر</button>} />
          )}
          {list.map((p) => (
            <BusinessCard key={p.id} p={p} selected={selected === p.id} onHover={setSelected} />
          ))}
        </aside>

        <section className="split-map">
          <MapCanvas pins={list} bbox={view} selected={selected} onSelect={open} />
        </section>
      </div>

      <BottomSheet detent={detent} onDetent={setDetent} summary={summary}>
        {pins === null && <CardSkeleton n={4} />}
        {pins?.length === 0 && (
          <EmptyState icon="◌" title="لا توجد أنشطة هنا بعد" body="جرّب فئة أخرى." />
        )}
        {list.map((p) => (
          <BusinessCard key={p.id} p={p} selected={selected === p.id} onHover={setSelected} />
        ))}
      </BottomSheet>
    </main>
  );
}
