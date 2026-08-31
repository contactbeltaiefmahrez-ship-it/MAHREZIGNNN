'use client';
import Link from 'next/link';
import { DEMO_MARKET } from '../../lib/data';

const TIER_AR: Record<string, string> = {
  FEATURED: 'Featured', PREMIUM: 'Premium', STANDARD: 'Standard',
  CURATED: 'مقعد لا يُباع', VACANT: 'شاغر',
};

/**
 * The owner-facing surface. Deliberately NOT a SaaS dashboard: it explains what
 * a business gets, what claiming and verification mean, and how the weekly
 * market works. The market grid is an ILLUSTRATIVE LAYOUT — no business has
 * bought anything, and the page says so rather than showing an invented count.
 */
export default function ForBusiness() {
  const counts = DEMO_MARKET.layout.reduce<Record<string, number>>((a, t) => {
    a[t] = (a[t] ?? 0) + 1; return a;
  }, {});
  return (
    <main className="wrap section" style={{ maxWidth: 820 }}>
      <h1>لأصحاب الأنشطة</h1>
      <p className="muted" style={{ marginTop: 'var(--s2)', maxWidth: '52ch' }}>
        واجهتك على MARKYRA مجانية. يمكنك المطالبة بها، تصحيح معلوماتها، ثم — إن أردت —
        شراء أسبوع من الظهور في السوق الأسبوعي.
      </p>

      <section className="grid-2" style={{ marginTop: 'var(--s6)' }}>
        <div className="card">
          <h3>١ · طالِب بواجهتك</h3>
          <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
            نرسل رمزًا إلى الرقم المدرَج في الواجهة. تُدخله، فتصبح تحت إدارتك.
            ثلاثة حقول فقط: الفئة، الساعات، صورة.
          </p>
          <span className="trust-badge" data-state="CLAIMED" style={{ marginTop: 'var(--s3)' }}>● مُطالَب به</span>
        </div>
        <div className="card">
          <h3>٢ · وثّق نشاطك</h3>
          <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
            مستند أو زيارة ميدانية، تُراجَع يدويًا خلال يومَي عمل. التوثيق
            <strong> لا يُشترى</strong>، ويفتح مقاعد Premium وFeatured.
          </p>
          <span className="trust-badge" data-state="VERIFIED" style={{ marginTop: 'var(--s3)' }}>✓ موثّق</span>
        </div>
      </section>

      <section className="card card-pad-lg" style={{ marginTop: 'var(--s6)' }}>
        <div className="row">
          <div>
            <h2>السوق الأسبوعي</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              مساحة واحدة خارج الخريطة. <span className="num">100</span> مقعد فقط،
              تُعاد تشكيلها كل جمعة.
            </p>
          </div>
          <span className="pill spacer" style={{ background: 'var(--amber-050)', color: 'var(--amber-700)' }}>
            عرض توضيحي
          </span>
        </div>

        <div className="seatgrid" style={{ marginTop: 'var(--s5)' }}>
          {DEMO_MARKET.layout.map((t, i) => (
            <span key={i} className="seat" data-t={t} title={TIER_AR[t]} />
          ))}
        </div>

        <div className="legend">
          <span><i style={{ background: 'var(--violet-600)' }} />Featured</span>
          <span><i style={{ background: 'var(--violet-500)' }} />Premium</span>
          <span><i style={{ background: 'var(--violet-300)' }} />Standard</span>
          <span><i style={{ background: '#16A57A' }} />مقاعد لا تُباع (<span className="num">{counts.CURATED ?? 0}</span>)</span>
          <span><i style={{ border: '1px dashed var(--ink-200)' }} />شاغر</span>
        </div>

        <p className="small" style={{ marginTop: 'var(--s5)', color: 'var(--amber-700)' }}>
          <strong>هذا تخطيط توضيحي.</strong> لم يشترِ أي نشاط مقعدًا بعد — لا توجد
          مبيعات ولا أنشطة حقيقية في النظام. تظهر الأرقام الحقيقية عندما تبدأ التجربة.
        </p>

        <div className="grid-2" style={{ marginTop: 'var(--s5)' }}>
          <div>
            <h3>ماذا يشتري المقعد</h3>
            <ul className="small muted" style={{ paddingInlineStart: '1.2em', lineHeight: 2 }}>
              <li>ظهور على الخريطة لمدة أسبوع، موسوم دائمًا بكلمة «مموّل».</li>
              <li>مقعد في السوق الأسبوعي.</li>
              <li>تقرير أسبوعي بما حصلت عليه فعلًا.</li>
            </ul>
          </div>
          <div>
            <h3>ماذا لا يشتريه</h3>
            <ul className="small muted" style={{ paddingInlineStart: '1.2em', lineHeight: 2 }}>
              <li>ترتيبًا في نتائج البحث — بأي مبلغ.</li>
              <li>علامة التوثيق أو أي سمعة.</li>
              <li>أكثر من واجهة من كل ست واجهات ظاهرة.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--s5)' }}>
        <h3>خلال التجربة</h3>
        <p className="small muted" style={{ marginTop: 'var(--s2)' }}>
          كل شيء مجاني. لا نضمن زبائن ولا زيارات ولا ترتيبًا. نحن نختبر ما إذا كان
          هذا مفيدًا — وسنقول لك ما حصلت عليه بالضبط، حتى في الأسابيع الضعيفة.
        </p>
        <Link href="/map" className="btn btn-sm btn-ghost" style={{ marginTop: 'var(--s4)' }}>
          ابحث عن نشاطك على الخريطة
        </Link>
      </section>
      <div style={{ height: 'var(--s8)' }} />
    </main>
  );
}
