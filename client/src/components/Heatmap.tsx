import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import type { HeatmapDay } from '../types';
import { D, RM } from '../utils/anim';

/** 打卡日历:18 周 × 7 格,朱红 4 级;入场单格随机 stagger */
export default function Heatmap({ days }: { days: HeatmapDay[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || RM) return;
    const ctx = gsap.context(() => {
      gsap.from('.heat i', {
        scale: 0, autoAlpha: 0, duration: D(0.25),
        stagger: { each: 0.004, from: 'random' }, ease: 'back.out(2.5)',
      });
    }, ref);
    return () => ctx.revert();
  }, [days]);

  const cells = useMemo(() => days.map(d => (
    <i key={d.date} className={`${d.level ? `l${d.level}` : ''} ${d.future ? 'future' : ''}`} title={`${d.date}${d.count ? ` · ${d.count} 次复习` : ''}`} />
  )), [days]);

  return (
    <div className="cal-panel" ref={ref}>
      <div className="heat-scroll"><div className="heat">{cells}</div></div>
    </div>
  );
}
