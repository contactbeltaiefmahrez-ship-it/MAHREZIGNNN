'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { search } from '../../lib/data';
import { BusinessCard, CardSkeleton, EmptyState, ErrorState } from '../../components/ui';
import type { Pin } from '../../lib/types';

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<Pin[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (initial.trim().length < 2) { setState('idle'); setResults(null); return; }
    setState('loading');
    search(initial).then((r) => { setResults(r.results); setState('ready'); })
      .catch(() => setState('error'));
  }, [initial]);

  return (
    <main className="wrap section">
      <h1>البحث</h1>
      <form className="field" style={{ marginTop: 'var(--s4)', maxWidth: 560 }}
        onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); }}>
        <span aria-hidden>🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="اسم نشاط، أو فئة" aria-label="ابحث" />
        <button className="btn btn-sm" type="submit">ابحث</button>
      </form>

      <div className="stack" style={{ marginTop: 'var(--s5)', maxWidth: 640 }}>
        {state === 'idle' && (
          <EmptyState icon="🔍" title="ابحث عن نشاط"
            body="اكتب حرفين على الأقل. البحث يعمل بالعربية والفرنسية، ويتحمّل الأخطاء الإملائية." />
        )}
        {state === 'loading' && <CardSkeleton n={4} />}
        {state === 'error' && <ErrorState message="تعذّر تنفيذ البحث." onRetry={() => router.refresh()} />}
        {state === 'ready' && results?.length === 0 && (
          <EmptyState icon="◌" title={`لم نجد "${initial}"`}
            body="قد لا يكون النشاط مُسجّلًا بعد. البحث لا يتأثر بالمحتوى المموَّل إطلاقًا." />
        )}
        {state === 'ready' && results?.map((p) => <BusinessCard key={p.id} p={p} />)}
        {state === 'ready' && (results?.length ?? 0) > 0 && (
          <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
            الترتيب حسب مطابقة الاسم ثم الثقة. الظهور المدفوع لا يؤثر على نتائج البحث.
          </p>
        )}
      </div>
    </main>
  );
}
export default function SearchPage() {
  return <Suspense fallback={<main className="wrap section"><CardSkeleton n={3} /></main>}><SearchInner /></Suspense>;
}
