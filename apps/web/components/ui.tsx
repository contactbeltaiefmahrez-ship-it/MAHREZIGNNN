'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Pin, Trust } from '../lib/types';

const CAT_COLOR: Record<string, string> = {
  cafes: '#6D3BF5', beauty: '#FF56A5', clothing: '#12C2E9', bakery: '#FF8A3D',
  gyms: '#16D2A0', home: '#2B6BFF', creative: '#E0A800', repair: '#FF5C72',
};
export const colorFor = (slug: string): string => CAT_COLOR[slug] ?? 'var(--ink-500)';

/** The signature object: an awning, not a teardrop. */
export function Awning({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9 q2-3 4 0 q2-3 4 0 q2-3 4 0 v5 H4 Z" fill={color} />
      <rect x="3.2" y="14" width="17.6" height="2.6" rx="1" fill="var(--ink-900)" />
    </svg>
  );
}

const TRUST_LABEL: Record<Trust, string> = {
  UNCLAIMED: 'غير مُطالَب به', CLAIMED: 'مُطالَب به', VERIFIED: 'موثّق',
};
const TRUST_HELP: Record<Trust, string> = {
  UNCLAIMED: 'لم يطالب صاحب النشاط بهذه الواجهة بعد.',
  CLAIMED: 'أثبت صاحب النشاط تحكّمه في الرقم المدرَج. المطالبة ليست توثيقًا.',
  VERIFIED: 'تحقّقنا من مستند أو زيارة ميدانية. لا يمكن شراء التوثيق.',
};

/** Trust is a MARK beside the name — never a colour on its own. */
export function TrustMark({ trust }: { trust: Trust }) {
  if (trust === 'UNCLAIMED') return null;
  return (
    <span className={`trust ${trust === 'VERIFIED' ? 'trust-verified' : 'trust-claimed'}`}
      title={TRUST_HELP[trust]} aria-label={TRUST_LABEL[trust]}>
      {trust === 'VERIFIED' ? '✓' : '●'}
    </span>
  );
}

export function TrustBadge({ trust }: { trust: Trust }) {
  return (
    <span className="trust-badge" data-state={trust}>
      {trust === 'VERIFIED' ? '✓' : trust === 'CLAIMED' ? '●' : '○'} {TRUST_LABEL[trust]}
    </span>
  );
}

export function BusinessCard({ p, selected, onHover }:
  { p: Pin; selected?: boolean; onHover?: (id: string | null) => void }) {
  return (
    <Link href={`/business/${p.id}`} prefetch={false} className="bcard"
      data-selected={selected ? 'true' : 'false'}
      data-sponsored={p.sponsored ? 'true' : 'false'}
      onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}>
      <span className="bcard-thumb"><Awning color={colorFor(p.categorySlug)} size={28} /></span>
      <span className="bcard-body">
        <span className="bcard-title">
          <span className="bcard-name">{p.name}</span>
          <TrustMark trust={p.trust} />
        </span>
        <span className="bcard-meta">
          {p.nameFr && <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{p.nameFr}</span>}
          {p.hasOffer && <span className="pill">عرض</span>}
          {/* the WORD, at the edge — never a badge near the name */}
          {p.sponsored && <span className="bcard-sponsored">مموّل</span>}
        </span>
      </span>
    </Link>
  );
}

export function EmptyState({ icon, title, body, action }:
  { icon: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state">
      <span className="state-icon" aria-hidden>{icon}</span>
      <h3>{title}</h3><p>{body}</p>{action}
    </div>
  );
}

export function CardSkeleton({ n = 4 }: { n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => (
    <div key={i} className="skeleton" style={{ height: 76 }} aria-hidden />
  ))}</>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <span className="state-icon" aria-hidden>!</span>
      <h3>تعذّر تنفيذ الطلب</h3><p>{message}</p>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>أعد المحاولة</button>}
    </div>
  );
}
