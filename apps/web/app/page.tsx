'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCategories, getDiscovery, GRAND_TUNIS } from '../lib/data';
import { BusinessCard, CardSkeleton, Awning, colorFor } from '../components/ui';
import type { Category, Pin } from '../lib/types';

export default function Home() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [q, setQ] = useState('');
  const router = useRouter();

  useEffect(() => {
    void getCategories().then((r) => setCats(r.categories));
    void getDiscovery(GRAND_TUNIS, null).then((r) => setPins(r.pins.slice(0, 6)));
  }, []);

  return (
    <main>
      <section className="wrap section">
        <h1 style={{ maxWidth: '16ch' }}>لا تبحث فقط. <span style={{ color: 'var(--brand)' }}>تجوّل.</span></h1>
        <p className="muted" style={{ marginTop: 'var(--s2)', maxWidth: '46ch' }}>
          MARKYRA خريطة حيّة للأنشطة والخدمات من حولك في تونس الكبرى — تفتحها لترى
          ما لم تكن تعرف أنه موجود.
        </p>

        <form className="field" style={{ marginTop: 'var(--s5)', maxWidth: 520 }}
          onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); }}>
          <span aria-hidden>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن مقهى، مخبزة، صالة رياضة…" aria-label="ابحث عن نشاط" />
          <button className="btn btn-sm" type="submit">ابحث</button>
        </form>

        <div className="row" style={{ marginTop: 'var(--s4)', flexWrap: 'wrap' }}>
          <Link href="/map" className="btn">افتح الخريطة</Link>
          <Link href="/for-business" className="btn btn-ghost">هل تملك نشاطًا؟</Link>
        </div>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <h2 style={{ marginBottom: 'var(--s3)' }}>تصفّح بالفئة</h2>
        <div className="grid-cat">
          {!cats && Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 92 }} aria-hidden />
          ))}
          {cats?.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="tile">
              <Awning color={c.color} size={26} />
              <span className="tile-name">{c.ar}</span>
              <span className="tile-count"><span className="num">{c.count}</span> واجهة</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="row" style={{ marginBottom: 'var(--s3)' }}>
          <h2>حولك الآن</h2>
          <Link href="/map" className="small muted spacer">عرض الكل على الخريطة ›</Link>
        </div>
        <div className="stack">
          {!pins && <CardSkeleton n={4} />}
          {pins?.map((p) => <BusinessCard key={p.id} p={p} />)}
        </div>
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
        <div className="card card-pad-lg">
          <h2>الثقة لا تُشترى</h2>
          <p className="muted small" style={{ marginTop: 'var(--s2)', maxWidth: '58ch' }}>
            يستطيع النشاط شراء <strong>ظهور</strong> على الخريطة، وهو دائمًا موسوم بكلمة
            «مموّل». لا يشتري ترتيبًا في البحث، ولا علامة توثيق، ولا سمعة.
            ولا يتجاوز المحتوى المموَّل واجهة واحدة من كل ست واجهات ظاهرة.
          </p>
          <div className="row" style={{ marginTop: 'var(--s4)', flexWrap: 'wrap', gap: 'var(--s3)' }}>
            <span className="trust-badge" data-state="UNCLAIMED">○ غير مُطالَب به</span>
            <span className="trust-badge" data-state="CLAIMED">● مُطالَب به</span>
            <span className="trust-badge" data-state="VERIFIED">✓ موثّق</span>
            <span className="sponsored-word">مموّل — ظهور مدفوع</span>
          </div>
        </div>
      </section>
      <div style={{ height: 'var(--s8)' }} />
      <span className="sr-only">{colorFor('cafes')}</span>
    </main>
  );
}
