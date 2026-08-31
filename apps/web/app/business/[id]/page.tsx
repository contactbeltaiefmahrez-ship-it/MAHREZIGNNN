'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getShopfront } from '../../../lib/data';
import { TrustBadge, Awning, EmptyState, colorFor } from '../../../components/ui';
import type { Shopfront } from '../../../lib/types';

export default function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [b, setB] = useState<Shopfront | null | undefined>(undefined);

  useEffect(() => { void getShopfront(id).then((r) => setB(r.data)); }, [id]);

  if (b === undefined) {
    return <main className="wrap section"><div className="skeleton" style={{ height: 180 }} />
      <div className="skeleton" style={{ height: 120, marginTop: 12 }} /></main>;
  }
  if (b === null) {
    return (
      <main className="wrap section">
        <EmptyState icon="◌" title="هذه الصفحة غير متاحة"
          body="قد يكون النشاط غير منشور حاليًا."
          action={<Link href="/map" className="btn btn-sm">العودة إلى الخريطة</Link>} />
      </main>
    );
  }

  const color = b.category?.color ?? colorFor(b.category?.slug ?? '');
  return (
    <main>
      <div className="wrap section" style={{ paddingBottom: 'var(--s4)' }}>
        <Link href="/map" className="small muted">‹ الخريطة</Link>

        <div className="hero" style={{ marginTop: 'var(--s3)', background: `${color}1A` }}>
          <span className="hero-glyph"><Awning color={color} size={84} /></span>
        </div>

        <div className="row" style={{ marginTop: 'var(--s4)', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>{b.name}</h1>
            {b.nameFr && <p className="muted" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{b.nameFr}</p>}
            <p className="small muted" style={{ marginTop: 4 }}>
              {b.category?.ar} · {b.delegationAr ?? b.delegation}
            </p>
          </div>
          <TrustBadge trust={b.trust} />
        </div>

        {/* Market participation is a FACT, not a sponsorship label: nothing on
            this page was purchased — only the placement that led here. */}
        {b.sponsored && (
          <div className="card" style={{ marginTop: 'var(--s4)', borderColor: 'var(--amber-600)' }}>
            <span className="sponsored-word">في سوق هذا الأسبوع</span>
            <p className="small muted" style={{ marginTop: 4 }}>
              اشترى هذا النشاط ظهورًا على الخريطة لمدة أسبوع. هذا لا يؤثر على ترتيبه
              في البحث ولا على حالة الثقة.
            </p>
          </div>
        )}

        {b.claimable && (
          <div className="card" style={{ marginTop: 'var(--s4)' }}>
            <div className="row">
              <div style={{ flex: 1 }}>
                <strong>هل هذا نشاطك؟</strong>
                <p className="small muted">طالِب به مجانًا وصحّح معلوماتك.</p>
              </div>
              <Link href={`/claim/${b.id}`} className="btn btn-sm">طالِب به</Link>
            </div>
          </div>
        )}

        <div className="grid-2" style={{ marginTop: 'var(--s4)' }}>
          <div className="card">
            <h3>المعلومات</h3>
            <dl className="kv" style={{ marginTop: 'var(--s3)' }}>
              <dt>العنوان</dt><dd>{b.address ?? '—'}</dd>
              <dt>ساعات العمل</dt>
              <dd>{b.hours?.note ?? <span className="muted">غير مؤكدة</span>}</dd>
              <dt>الهاتف</dt>
              <dd>{b.phone
                ? <span className="num">{b.phone}</span>
                : <span className="muted">غير متوفر</span>}</dd>
              <dt>الموقع</dt>
              <dd className="num">{b.location.lat.toFixed(4)}, {b.location.lon.toFixed(4)}</dd>
              <dt>دقة الموقع</dt><dd className="small">{b.location.confidence}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>عن النشاط</h3>
            <p className="small" style={{ marginTop: 'var(--s2)' }}>
              {b.description ?? <span className="muted">لم يُضِف صاحب النشاط وصفًا بعد.</span>}
            </p>
            {b.services.length > 0 && (
              <div className="row" style={{ marginTop: 'var(--s3)', flexWrap: 'wrap' }}>
                {b.services.map((s, i) => <span key={i} className="pill">{s.label}</span>)}
              </div>
            )}
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 'var(--s4)' }}>
          معلومة خاطئة؟ <Link href="#" style={{ textDecoration: 'underline' }}>أبلغنا</Link> —
          نراجع البلاغات ونصحّح خلال أيام عمل.
        </p>
      </div>

      <div className="actionbar">
        {b.phone
          ? <a className="btn btn-block" href={`tel:${b.phone}`}>اتصل · <span className="num">{b.phone}</span></a>
          : <button className="btn btn-block" disabled>لا يوجد رقم متاح</button>}
        <a className="btn btn-ghost" target="_blank" rel="noreferrer"
          href={`https://www.openstreetmap.org/?mlat=${b.location.lat}&mlon=${b.location.lon}#map=17/${b.location.lat}/${b.location.lon}`}>
          الاتجاهات
        </a>
      </div>
    </main>
  );
}
