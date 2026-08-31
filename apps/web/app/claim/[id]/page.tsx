'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getShopfront, API, currentMode } from '../../../lib/data';
import { TrustBadge, ErrorState } from '../../../components/ui';
import type { Shopfront } from '../../../lib/types';

type Step = 'intro' | 'otp' | 'done';

/**
 * Claim flow. In API mode this calls the REAL endpoints — the code is sent to
 * the number ALREADY on the listing, never one the claimant supplies.
 * In demo mode the UX is shown and the step is labelled, but no claim is
 * created: a fabricated successful claim would be a fake business relationship.
 */
export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [b, setB] = useState<Shopfront | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('intro');
  const [masked, setMasked] = useState('');
  const [claimId, setClaimId] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    void getShopfront(id).then((r) => setB(r.data));
    void currentMode().then((m) => setDemo(m === 'demo'));
  }, [id]);

  async function start(): Promise<void> {
    setErr(''); setBusy(true);
    if (demo) {
      setMasked('+216 ••• •••'); setStep('otp'); setBusy(false); return;
    }
    try {
      const r = await fetch(`${API}/v1/claim`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ business_id: id }),
      });
      const j = await r.json() as { claim_id?: string; destination_masked?: string; error?: { message: string } };
      if (!r.ok) { setErr(j.error?.message ?? 'تعذّر بدء المطالبة'); setBusy(false); return; }
      setClaimId(j.claim_id ?? ''); setMasked(j.destination_masked ?? ''); setStep('otp');
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    setBusy(false);
  }

  async function verify(): Promise<void> {
    setErr(''); setBusy(true);
    if (demo) {
      setErr('الوضع التجريبي: لا تُنشأ مطالبات حقيقية. هذه الشاشة تعرض التجربة فقط.');
      setBusy(false); return;
    }
    try {
      const r = await fetch(`${API}/v1/claim/${claimId}/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ code }),
      });
      const j = await r.json() as { error?: { message: string } };
      if (!r.ok) { setErr(j.error?.message ?? 'الرمز غير صحيح'); setBusy(false); return; }
      setStep('done');
    } catch { setErr('تعذّر الاتصال بالخادم.'); }
    setBusy(false);
  }

  if (b === undefined) return <main className="wrap section"><div className="skeleton" style={{ height: 200 }} /></main>;
  if (b === null) return <main className="wrap section"><ErrorState message="لم نجد هذا النشاط." /></main>;

  return (
    <main className="wrap section" style={{ maxWidth: 560 }}>
      <Link href={`/business/${id}`} className="small muted">‹ عودة إلى الواجهة</Link>
      <h1 style={{ marginTop: 'var(--s3)', fontSize: 22 }}>المطالبة بـ{b.name}</h1>
      <div style={{ marginTop: 'var(--s2)' }}><TrustBadge trust={b.trust} /></div>

      {step === 'intro' && (
        <div className="card" style={{ marginTop: 'var(--s5)' }}>
          <h3>كيف تعمل المطالبة</h3>
          <ol className="small" style={{ paddingInlineStart: '1.2em', marginTop: 'var(--s3)', lineHeight: 2 }}>
            <li>نرسل رمزًا إلى <strong>الرقم المدرَج في الواجهة</strong> — لا إلى رقم تكتبه أنت.</li>
            <li>تُدخل الرمز، فتصبح الواجهة تحت إدارتك.</li>
            <li>تُكمل ثلاثة حقول: الفئة، ساعات العمل، صورة واحدة.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 'var(--s3)' }}>
            <strong>المطالبة ليست توثيقًا.</strong> التوثيق يتطلب مستندًا أو زيارة ميدانية،
            ويُراجَع يدويًا. ولا يمكن شراء أيٍّ منهما.
          </p>
          <button className="btn btn-block" style={{ marginTop: 'var(--s4)' }}
            onClick={() => void start()} disabled={busy}>
            {busy ? '…' : 'أرسل الرمز'}
          </button>
          {err && <p role="alert" className="small" style={{ color: 'var(--red-700)', marginTop: 'var(--s3)' }}>{err}</p>}
        </div>
      )}

      {step === 'otp' && (
        <div className="card" style={{ marginTop: 'var(--s5)' }}>
          <h3>أدخل الرمز</h3>
          <p className="small muted" style={{ marginTop: 4 }}>
            أرسلنا رمزًا إلى <span className="num">{masked}</span>
          </p>
          <input className="input" style={{ marginTop: 'var(--s4)', fontFamily: 'var(--mono)',
            letterSpacing: '.4em', textAlign: 'center', direction: 'ltr' }}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            aria-label="رمز التحقق" placeholder="000000" />
          <button className="btn btn-block" style={{ marginTop: 'var(--s3)' }}
            onClick={() => void verify()} disabled={busy || code.length !== 6}>
            {busy ? '…' : 'تحقّق'}
          </button>
          {err && <p role="alert" className="small" style={{ color: 'var(--red-700)', marginTop: 'var(--s3)' }}>{err}</p>}
          {demo && (
            <p className="small" style={{ marginTop: 'var(--s3)', color: 'var(--amber-700)' }}>
              وضع تجريبي — لا تُرسَل رسائل ولا تُنشأ مطالبات.
            </p>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ marginTop: 'var(--s5)' }}>
          <h3>الواجهة الآن تحت إدارتك</h3>
          <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
            حالتك الآن <strong>مُطالَب به</strong>. للحصول على <strong>موثّق</strong>،
            أرسل مستندًا أو اطلب زيارة ميدانية — تُراجَع خلال يومَي عمل.
          </p>
          <Link href={`/business/${id}`} className="btn btn-block" style={{ marginTop: 'var(--s4)' }}>
            عرض واجهتي
          </Link>
        </div>
      )}
    </main>
  );
}
