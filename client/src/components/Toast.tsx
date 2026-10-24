import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { gsap } from 'gsap';
import { D } from '../utils/anim';

interface ToastCtx { toast: (msg: string) => void }
const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

let toastTween: gsap.core.Timeline | null = null;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const elRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    requestAnimationFrame(() => {
      const el = elRef.current;
      if (!el) return;
      toastTween?.kill();
      toastTween = gsap.timeline()
        .to(el, { autoAlpha: 1, y: 0, duration: D(0.25), startAt: { y: 16 } })
        .to(el, { autoAlpha: 0, y: 8, duration: D(0.3), delay: 1.6 });
    });
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast" ref={elRef}>{msg}</div>
    </Ctx.Provider>
  );
}
