import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { gsap } from 'gsap';
import { api } from '../api';
import { D } from '../utils/anim';

export default function NavBar() {
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    api.stats.dashboard().then(d => setStreak(d.current)).catch(() => {});
    const ctx = gsap.context(() => {
      gsap.from('.top-in', { y: -18, autoAlpha: 0, duration: D(0.45), ease: 'power3.out' });
      gsap.from('.stamp', { scale: 1.9, autoAlpha: 0, rotation: 30, duration: D(0.5), ease: 'back.out(2.2)', delay: D(0.4) });
    });
    return () => ctx.revert();
  }, []);

  return (
    <header className="top">
      <div className="top-in">
        <NavLink to="/" className="brand" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="brand-card">翻</span>
          <span className="brand-name">翻翻</span>
          <span className="brand-sub">flip &amp; remember</span>
        </NavLink>
        <nav className="menu">
          <NavLink to="/" end>仪表盘</NavLink>
          <NavLink to="/study">开始学习</NavLink>
          <NavLink to="/decks">卡组</NavLink>
          <NavLink to="/browse">浏览器</NavLink>
          <NavLink to="/stats">统计</NavLink>
          <NavLink to="/ai">AI</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
        <div className="stamp" title="连续学习天数">
          <span className="n">{streak ?? '–'}</span>
          <span className="t">连续天数</span>
        </div>
      </div>
    </header>
  );
}
