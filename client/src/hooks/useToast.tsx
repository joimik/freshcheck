import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };

type Ctx = {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={{ toasts, push }}>
      {children}
      <div className="fixed top-3 inset-x-0 z-50 flex flex-col items-center gap-2 px-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white max-w-md w-full text-center ' +
              (t.tone === 'success'
                ? 'bg-fresh'
                : t.tone === 'error'
                  ? 'bg-danger'
                  : 'bg-gray-900')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.push;
}
