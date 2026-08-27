'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Kind = 'ok' | 'err' | 'info';
interface Item { id: number; kind: Kind; text: string }

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, kind, text }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 3600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'ok' && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7FC49A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5l3.2 3.2L13 5" />
              </svg>
            )}
            {t.kind === 'err' && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#F0A0A6" strokeWidth="2.2" strokeLinecap="round">
                <path d="M8 3.5v5.2" /><path d="M8 12.2v.1" />
              </svg>
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
