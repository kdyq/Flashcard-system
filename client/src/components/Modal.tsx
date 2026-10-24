import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { gsap } from 'gsap';
import { D } from '../utils/anim';

export default function Modal({
  title, children, onClose, small = false,
}: { title: string; children: ReactNode; onClose: () => void; small?: boolean }) {
  const maskRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.modal', { y: 26, autoAlpha: 0, scale: 0.98, duration: D(0.3), ease: 'back.out(1.4)' });
      gsap.from(maskRef.current, { autoAlpha: 0, duration: D(0.2) });
    }, maskRef);
    return () => ctx.revert();
  }, []);

  return (
    <div className="modal-mask" ref={maskRef} onMouseDown={e => { if (e.target === maskRef.current) onClose(); }}>
      <div className={`modal ${small ? 'modal-sm' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title="关闭"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
