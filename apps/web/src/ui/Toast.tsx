import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './format';

type ToastT = { id: number; tone: 'bad' | 'ok' | 'info'; title: string; body?: ReactNode };
const Ctx = createContext<(t: Omit<ToastT, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Bottom-centre toasts. The planning board's "Drop blocked" uses the `bad` tone. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((t: Omit<ToastT, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === 'bad' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 grid gap-2 w-[min(440px,calc(100vw-32px))]" aria-live="assertive">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'}
            className={cx('rounded-xl shadow-toast px-4 py-3 border-l-4 bg-surface', t.tone === 'bad' ? 'border-bad' : t.tone === 'ok' ? 'border-ok' : 'border-primary')}>
            <div className="flex items-start gap-3">
              <span className={cx('mt-0.5 grid place-items-center h-5 w-5 rounded-full text-white text-xs font-bold shrink-0', t.tone === 'bad' ? 'bg-bad' : t.tone === 'ok' ? 'bg-ok' : 'bg-primary')}>
                {t.tone === 'bad' ? '!' : t.tone === 'ok' ? '✓' : 'i'}
              </span>
              <div className="grid gap-0.5 text-[13px]">
                <strong className="text-ink">{t.title}</strong>
                {t.body && <div className="text-ink-2">{t.body}</div>}
              </div>
              <button className="ml-auto text-ink-3 hover:text-ink" aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>×</button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
