'use client';
import { useEffect, useState } from 'react';
import { currentMode } from '../lib/data';

/**
 * Demo mode can never be silent. If the product is showing demo records, this
 * banner is present on every screen — that is the whole point of it.
 */
export function DemoBanner() {
  const [mode, setMode] = useState<'api' | 'demo' | null>(null);
  useEffect(() => { void currentMode().then(setMode); }, []);
  if (mode !== 'demo') return null;
  return (
    <div className="demobar" role="status">
      <strong>وضع تجريبي</strong> — البيانات المعروضة ليست أنشطة حقيقية.
      لا يوجد أي نشاط حقيقي في النظام بعد.
      <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}> · DEMO DATA · REAL = 0</span>
    </div>
  );
}
