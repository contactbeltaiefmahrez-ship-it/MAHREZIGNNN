import type { ReactNode } from 'react';
import Link from 'next/link';
import '../../../packages/tokens/tokens.css';
import { DemoBanner } from '../components/DemoBanner';

export const metadata = {
  title: 'MARKYRA — لا تبحث فقط. تجوّل.',
  description: 'طبقة الاكتشاف الرقمية التي تربط الناس بالأعمال والخدمات من حولهم في تونس الكبرى.',
  openGraph: { title: 'MARKYRA', description: 'اكتشف ما حولك.', type: 'website' },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#14123A' };

/** Arabic is the design language; RTL is the default direction, not a mirror. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <DemoBanner />
        <header className="appbar">
          <div className="wrap appbar-in">
            <Link href="/" className="brand" aria-label="MARKYRA — الصفحة الرئيسية">
              <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden>
                <path d="M4 9 q2-3 4 0 q2-3 4 0 q2-3 4 0 v5 H4 Z" fill="var(--violet-600)" />
                <rect x="3.2" y="14" width="17.6" height="2.6" rx="1" fill="var(--ink-900)" />
              </svg>
              MARKYRA
            </Link>
            <nav className="nav" aria-label="التنقّل الرئيسي">
              <Link href="/map">الخريطة</Link>
              <Link href="/search">البحث</Link>
              <Link href="/for-business">للأنشطة</Link>
            </nav>
            <span className="spacer" />
            <Link href="/search" className="btn btn-ghost btn-sm">ابحث</Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
