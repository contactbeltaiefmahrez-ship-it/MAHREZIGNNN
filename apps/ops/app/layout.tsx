import type { ReactNode } from 'react';
import '../../../packages/tokens/tokens.css';

export const metadata = { title: 'MARKYRA — Ops' };

/**
 * Ops runs on its own origin with its own cookie. Dense, keyboard-first,
 * desktop-only: an operator reviewing eighty applications should never reach
 * for the mouse (UX/UI System 17).
 */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ background: 'var(--bg-canvas)' }}>{children}</body>
    </html>
  );
}
