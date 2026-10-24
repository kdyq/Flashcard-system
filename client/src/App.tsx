import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { D } from './utils/anim';
import { ToastProvider } from './components/Toast';
import NavBar from './components/NavBar';
import Dashboard from './pages/Dashboard';
import Study from './pages/Study';
import Decks from './pages/Decks';
import Browse from './pages/Browse';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import AIStudio from './pages/AIStudio';

/** 页面切换入场(与设计稿 switchView 一致) */
function PageShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current!.children,
        { y: 22, autoAlpha: 0, rotation: -0.5 },
        { y: 0, autoAlpha: 1, rotation: 0, duration: D(0.5), stagger: D(0.07), ease: 'back.out(1.6)' });
    }, ref);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  return <div ref={ref}>{children}</div>;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isStudy = location.pathname.startsWith('/study');

  // Esc 退出学习页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStudy) navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStudy, navigate]);

  return (
    <ToastProvider>
      {!isStudy && <NavBar />}
      <main className="wrap">
        <PageShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/study/:deckId?" element={<Study />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/ai" element={<AIStudio />} />
          </Routes>
        </PageShell>
      </main>
    </ToastProvider>
  );
}
