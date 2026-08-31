'use client';
import { useEffect, useState, useCallback } from 'react';
import { ops } from '../lib/api';

type Queue = { queue: string; n: number };
type Biz = {
  id: string; name_ar: string; name_fr: string | null; trust: string; state: string;
  delegation_code: string; coord: string; quality_score: number;
  source_code: string | null; lon: number; lat: number;
};
type AuditRow = {
  id: string; actor_type: string; actor_id: string | null; action: string;
  target_table: string; target_id: string; reason: string | null; created_at: string;
};

const QUEUE_AR: Record<string, string> = {
  claims: 'مطالبات', verifications: 'توثيقات', duplicates: 'تكرارات',
  reports: 'بلاغات', offers: 'عروض',
};

export default function OpsConsole() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>('');
  const [tab, setTab] = useState<'queues' | 'businesses' | 'audit'>('queues');

  const check = useCallback(async () => {
    const r = await ops<{ role: string }>('/ops/me');
    setAuthed(r.ok); if (r.ok && r.data) setRole(r.data.role);
  }, []);
  useEffect(() => { void check(); }, [check]);

  if (authed === null) return <Shell><p style={{ padding: 24 }}>جارٍ التحقق…</p></Shell>;
  if (!authed) return <Login onDone={check} />;

  return (
    <Shell role={role} tab={tab} onTab={setTab} onLogout={async () => {
      await ops('/ops/logout', { method: 'POST' }); setAuthed(false);
    }}>
      {tab === 'queues' && <Queues />}
      {tab === 'businesses' && <Businesses />}
      {tab === 'audit' && <Audit role={role} />}
    </Shell>
  );
}

function Shell({ children, role, tab, onTab, onLogout }: {
  children: React.ReactNode; role?: string;
  tab?: string; onTab?: (t: 'queues'|'businesses'|'audit') => void; onLogout?: () => void;
}) {
  return (
    <main style={{ minHeight: '100dvh', fontSize: 13 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px',
        background: 'var(--ink-900)', color: '#fff' }}>
        <strong style={{ letterSpacing: '.08em' }}>MARKYRA</strong>
        <span style={{ opacity: .7 }}>Ops</span>
        {role && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-full)',
          background: 'rgba(255,255,255,.14)' }}>{role}</span>}
        {onTab && (
          <nav style={{ display: 'flex', gap: 4, marginInlineStart: 16 }}>
            {(['queues','businesses','audit'] as const).map((t) => (
              <button key={t} onClick={() => onTab(t)} aria-current={tab === t}
                style={{ padding: '6px 12px', minHeight: 32, border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--r-sm)', fontSize: 13,
                  background: tab === t ? 'rgba(255,255,255,.18)' : 'transparent', color: '#fff' }}>
                {t === 'queues' ? 'الطوابير' : t === 'businesses' ? 'الأنشطة' : 'سجل التدقيق'}
              </button>
            ))}
          </nav>
        )}
        {onLogout && <button onClick={onLogout}
          style={{ marginInlineStart: 'auto', background: 'transparent', color: '#fff',
            border: '1px solid rgba(255,255,255,.3)', borderRadius: 'var(--r-sm)',
            padding: '6px 12px', minHeight: 32, cursor: 'pointer' }}>خروج</button>}
      </header>
      <div style={{ padding: 20 }}>{children}</div>
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        const r = await ops<{ role: string }>('/ops/login',
          { method: 'POST', body: JSON.stringify({ email, password: pw }) });
        setBusy(false);
        // The API returns the same failure for an unknown user and a wrong
        // password; the UI must not distinguish them either.
        if (!r.ok) { setErr(r.status === 429 ? 'محاولات كثيرة. انتظر قليلًا.' : 'بيانات الدخول غير صحيحة'); return; }
        onDone();
      }} style={{ maxWidth: 340, margin: '48px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>دخول المشغّلين</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
          placeholder="البريد" aria-label="البريد" required style={inputStyle} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password"
          placeholder="كلمة المرور" aria-label="كلمة المرور" required style={inputStyle} />
        {err && <p role="alert" style={{ color: 'var(--red-700)', margin: 0 }}>{err}</p>}
        <button disabled={busy} type="submit" style={btnStyle}>{busy ? '…' : 'دخول'}</button>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
          الحسابات بالدعوة فقط. لا يوجد تسجيل ذاتي.
        </p>
      </form>
    </Shell>
  );
}

function Queues() {
  const [q, setQ] = useState<Queue[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { void (async () => {
    const r = await ops<{ queues: Queue[] }>('/ops/queues');
    if (r.ok && r.data) { setQ(r.data.queues); } else { setErr(r.message ?? 'خطأ'); }
  })(); }, []);
  if (err) return <ErrorBox msg={err} />;
  if (!q) return <p>جارٍ التحميل…</p>;
  const total = q.reduce((a, x) => a + x.n, 0);
  return (
    <>
      <h2 style={{ fontSize: 16 }}>ما ينتظر المراجعة</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {q.map((x) => (
          <div key={x.queue} style={card}>
            <div style={{ fontSize: 26, fontFamily: 'var(--font-data)' }}>{x.n}</div>
            <div style={{ color: 'var(--text-muted)' }}>{QUEUE_AR[x.queue] ?? x.queue}</div>
          </div>
        ))}
      </div>
      {total === 0 && <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>
        لا شيء بانتظار المراجعة.</p>}
    </>
  );
}

function Businesses() {
  const [rows, setRows] = useState<Biz[] | null>(null);
  const [sel, setSel] = useState<Biz | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async (q = '', trust = '') => {
    const r = await ops<{ businesses: Biz[] }>(`/ops/businesses?q=${encodeURIComponent(q)}&trust=${trust}`);
    if (r.ok && r.data) { setRows(r.data.businesses); } else { setErr(r.message ?? 'خطأ'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <ErrorBox msg={err} />;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="ابحث بالاسم" aria-label="ابحث" style={{ ...inputStyle, maxWidth: 240 }}
            onChange={(e) => void load(e.target.value)} />
          <select aria-label="حالة الثقة" style={{ ...inputStyle, maxWidth: 160 }}
            onChange={(e) => void load('', e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="UNCLAIMED">غير مُطالَب به</option>
            <option value="CLAIMED">مُطالَب به</option>
            <option value="VERIFIED">موثّق</option>
          </select>
        </div>
        {!rows && <p>جارٍ التحميل…</p>}
        {rows?.length === 0 && <p style={{ color: 'var(--text-muted)' }}>لا نتائج.</p>}
        {rows && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead><tr>
              {['الاسم', 'الثقة', 'الحالة', 'المنطقة', 'دقة الموقع', 'الجودة', 'المصدر'].map((h) => (
                <th key={h} scope="col" style={th}>{h}</th>))}
            </tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} onClick={() => setSel(b)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSel(b); }}
                  style={{ cursor: 'pointer',
                    background: sel?.id === b.id ? 'var(--sunken)' : undefined }}>
                  <td style={td}>{b.name_ar}</td>
                  <td style={td}><TrustChip v={b.trust} /></td>
                  <td style={td}>{b.state}</td>
                  <td style={td}>{b.delegation_code}</td>
                  <td style={td}>{b.coord}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-data)' }}>{b.quality_score}</td>
                  <td style={td}>{b.source_code ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && <BusinessPanel b={sel} onClose={() => setSel(null)} onSaved={() => void load()} />}
    </div>
  );
}

function BusinessPanel({ b, onClose, onSaved }: { b: Biz; onClose: () => void; onSaved: () => void }) {
  const [lon, setLon] = useState(String(b.lon));
  const [lat, setLat] = useState(String(b.lat));
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <aside style={{ width: 340, background: '#fff', border: '1px solid var(--border-default)',
      borderRadius: 'var(--r-md)', padding: 16, position: 'sticky', top: 20 }}>
      <button onClick={onClose} aria-label="إغلاق"
        style={{ float: 'inline-end', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{b.name_ar}</h3>
      {b.name_fr && <div style={{ direction: 'ltr', unicodeBidi: 'isolate',
        color: 'var(--text-muted)' }}>{b.name_fr}</div>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', margin: '12px 0' }}>
        <dt style={dtS}>الثقة</dt><dd style={ddS}><TrustChip v={b.trust} /></dd>
        <dt style={dtS}>المصدر</dt><dd style={ddS}>{b.source_code ?? '—'}</dd>
        <dt style={dtS}>دقة الموقع</dt><dd style={ddS}>{b.coord}</dd>
        <dt style={dtS}>الجودة</dt><dd style={{ ...ddS, fontFamily: 'var(--font-data)' }}>{b.quality_score}</dd>
      </dl>
      {/* Claiming is not verification. The panel never offers "verify" here. */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        المطالبة لا تعني التوثيق. التوثيق يمرّ عبر طابور التوثيق وحده.
      </p>
      <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>تصحيح الإحداثيات</h4>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={lon} onChange={(e) => setLon(e.target.value)} aria-label="خط الطول"
          style={{ ...inputStyle, fontFamily: 'var(--font-data)' }} />
        <input value={lat} onChange={(e) => setLat(e.target.value)} aria-label="خط العرض"
          style={{ ...inputStyle, fontFamily: 'var(--font-data)' }} />
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="سبب التصحيح (إلزامي)" aria-label="سبب التصحيح"
        style={{ ...inputStyle, marginTop: 6 }} />
      {!confirming ? (
        <button onClick={() => setConfirming(true)} disabled={!reason}
          style={{ ...btnStyle, marginTop: 8 }}>حفظ التصحيح</button>
      ) : (
        <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-sm)' }}>
          <p style={{ margin: '0 0 8px' }}>سيُسجَّل هذا التغيير في سجل التدقيق باسمك. متابعة؟</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle} onClick={async () => {
              const r = await ops<{ ok: boolean }>(`/ops/businesses/${b.id}/location`, {
                method: 'POST',
                body: JSON.stringify({ lon: Number(lon), lat: Number(lat), reason, confidence: 'VERIFIED' }),
              });
              setConfirming(false);
              setMsg(r.ok ? { ok: true, text: 'تم الحفظ وسُجّل في التدقيق' }
                          : { ok: false, text: r.message ?? 'تعذّر الحفظ' });
              if (r.ok) onSaved();
            }}>تأكيد</button>
            <button style={{ ...btnStyle, background: 'transparent', color: 'var(--ink-900)',
              border: '1px solid var(--border-default)' }}
              onClick={() => setConfirming(false)}>إلغاء</button>
          </div>
        </div>
      )}
      {msg && <p role="status" style={{ marginTop: 8,
        color: msg.ok ? 'var(--green-700)' : 'var(--red-700)' }}>{msg.text}</p>}
    </aside>
  );
}

function Audit({ role }: { role: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState('');
  const [chain, setChain] = useState<string>('');
  useEffect(() => { void (async () => {
    const r = await ops<{ entries: AuditRow[] }>('/ops/audit');
    if (!r.ok || !r.data) { setErr(r.status === 403 ? 'سجل التدقيق متاح للمشرفين فقط.' : (r.message ?? 'خطأ')); return; }
    setRows(r.data.entries);
    const v = await ops<{ checked: number; broken: string[] }>('/ops/audit/verify');
    if (v.ok && v.data) setChain(v.data.broken.length === 0
      ? `السلسلة سليمة · ${v.data.checked} قيدًا`
      : `تحذير: ${v.data.broken.length} قيدًا مكسورًا`);
  })(); }, []);
  if (err) return <ErrorBox msg={err} hint={role === 'OPS' ? 'دورك OPS.' : undefined} />;
  if (!rows) return <p>جارٍ التحميل…</p>;
  return (
    <>
      <h2 style={{ fontSize: 16 }}>سجل التدقيق</h2>
      {chain && <p style={{ color: chain.startsWith('تحذير') ? 'var(--red-700)' : 'var(--green-700)' }}>{chain}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead><tr>{['من', 'ماذا', 'على ماذا', 'السبب', 'متى'].map((h) =>
          <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>{r.actor_type}</td>
              <td style={{ ...td, fontFamily: 'var(--font-data)' }}>{r.action}</td>
              <td style={td}>{r.target_table}</td>
              <td style={td}>{r.reason ?? '—'}</td>
              <td style={{ ...td, fontFamily: 'var(--font-data)', direction: 'ltr', unicodeBidi: 'isolate' }}>
                {new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ color: 'var(--text-muted)' }}>لا قيود بعد.</p>}
    </>
  );
}

const TrustChip = ({ v }: { v: string }) => (
  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-full)',
    border: '1px solid var(--border-default)',
    color: v === 'VERIFIED' ? 'var(--trust-verified)' : 'var(--text-secondary)' }}>
    {v === 'VERIFIED' ? 'موثّق' : v === 'CLAIMED' ? 'مُطالَب به' : 'غير مُطالَب به'}
  </span>
);

const ErrorBox = ({ msg, hint }: { msg: string; hint?: string }) => (
  <div role="alert" style={{ ...card, borderColor: 'var(--red-700)' }}>
    <strong>تعذّر تنفيذ الطلب</strong>
    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>{msg}{hint ? ` ${hint}` : ''}</p>
  </div>
);

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)', fontSize: 13, width: '100%', minHeight: 36,
};
const btnStyle: React.CSSProperties = {
  background: 'var(--action-primary-bg)', color: '#fff', border: 'none',
  padding: '9px 16px', borderRadius: 'var(--r-sm)', minHeight: 36, cursor: 'pointer', fontSize: 13,
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-md)', padding: 16, minWidth: 140,
};
const th: React.CSSProperties = {
  textAlign: 'start', padding: '8px 10px', borderBottom: '1px solid var(--border-default)',
  fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, position: 'sticky', top: 0, background: '#fff',
};
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border-default)' };
const dtS: React.CSSProperties = { color: 'var(--text-muted)' };
const ddS: React.CSSProperties = { margin: 0 };
