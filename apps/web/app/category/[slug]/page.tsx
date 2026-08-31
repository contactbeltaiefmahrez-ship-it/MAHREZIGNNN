'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getCategories, getDiscovery, GRAND_TUNIS } from '../../../lib/data';
import { BusinessCard, CardSkeleton, EmptyState, Awning } from '../../../components/ui';
import type { Category, Pin } from '../../../lib/types';

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [cat, setCat] = useState<Category | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);

  useEffect(() => {
    void getCategories().then((r) => setCat(r.categories.find((c) => c.slug === slug) ?? null));
    void getDiscovery(GRAND_TUNIS, slug).then((r) => setPins(r.pins));
  }, [slug]);

  return (
    <main className="wrap section">
      <Link href="/" className="small muted">‹ الاكتشاف</Link>
      <div className="row" style={{ marginTop: 'var(--s3)' }}>
        {cat && <Awning color={cat.color} size={32} />}
        <div>
          <h1 style={{ fontSize: 22 }}>{cat?.ar ?? slug}</h1>
          <p className="small muted">
            {pins ? <><span className="num">{pins.length}</span> واجهة في تونس الكبرى</> : '…'}
          </p>
        </div>
        <Link href="/map" className="btn btn-ghost btn-sm spacer">على الخريطة</Link>
      </div>

      <div className="stack" style={{ marginTop: 'var(--s5)', maxWidth: 720 }}>
        {!pins && <CardSkeleton n={5} />}
        {pins?.length === 0 && (
          <EmptyState icon="◌" title="لا أنشطة في هذه الفئة بعد"
            body="نبني التغطية فئةً فئة، والكثافة قبل الاتساع."
            action={<Link href="/map" className="btn btn-sm btn-ghost">تصفّح الخريطة</Link>} />
        )}
        {pins?.map((p) => <BusinessCard key={p.id} p={p} />)}
      </div>
    </main>
  );
}
