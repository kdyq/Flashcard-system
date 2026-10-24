import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { Cards, Plus } from '@phosphor-icons/react';
import { api } from '../api';
import type { DashboardStats, DeckNode, HeatmapDay } from '../types';
import Heatmap from '../components/Heatmap';
import CardEditor from '../components/CardEditor';
import { D, RM } from '../utils/anim';

interface FlatDeck extends DeckNode { depth: number }

function flatten(nodes: DeckNode[], depth = 0): FlatDeck[] {
  return nodes.flatMap(n => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [decks, setDecks] = useState<DeckNode[]>([]);
  const [heat, setHeat] = useState<HeatmapDay[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    api.stats.dashboard().then(setStats).catch(() => {});
    api.decks.tree().then(r => setDecks(r.items)).catch(() => {});
    api.stats.heatmap(18).then(r => setHeat(r.days)).catch(() => {});
  }, []);

  useEffect(() => {
    if (RM) return;
    const ctx = gsap.context(() => {
      gsap.from('.deck', { y: 26, autoAlpha: 0, rotation: idx => (idx % 2 ? 2.5 : -2.5), duration: 0.5, stagger: 0.08, ease: 'back.out(1.7)' });
      gsap.from('.index-card', { y: 30, rotation: 3, autoAlpha: 0, duration: 0.55, ease: 'back.out(1.5)' });
      gsap.from('.hero h1, .hero .sub', { y: 20, autoAlpha: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out', delay: 0.1 });
    });
    return () => ctx.revert();
  }, [decks, stats]);

  const flat = flatten(decks);
  const totalCards = flat.reduce((s, d) => s + d.counts.total, 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div>
      <div className="hero">
        <div>
          <h1>今天也要<mark>翻一翻</mark></h1>
          <div className="sub">{dateStr}。遗忘曲线不等人,先复习再玩耍。</div>
        </div>
        <div className="index-card">
          <span className="ic-cap">to-do</span>
          <div className="ic-row">
            <div className="ic-num review">
              <div className="n">{stats?.dueNow ?? '–'}<em>张</em></div>
              <div className="t">待复习</div>
            </div>
            <div className="ic-num">
              <div className="n">{stats?.newNow ?? '–'}<em>张</em></div>
              <div className="t">新卡</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn-flip" onClick={() => navigate('/study')}>
              <Cards size={18} weight="fill" />开始翻牌
            </button>
            <button className="btn-ghost" onClick={() => setEditorOpen(true)}><Plus size={15} />加卡</button>
          </div>
        </div>
      </div>

      <div className="cols">
        <div>
          <div className="panel-title">
            <h3>卡组</h3>
            <span>{flat.length} 组 / {totalCards} 张</span>
            <span style={{ marginLeft: 'auto' }}><Link to="/decks" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>管理卡组 →</Link></span>
          </div>
          <div className="pile">
            {flat.map((d, idx) => {
              const prog = d.counts.total > 0
                ? Math.round(10 * (d.counts.total - d.counts.due - d.counts.new) / d.counts.total)
                : 0;
              return (
                <div className="deck" key={d.id} style={d.depth ? { marginLeft: d.depth * 26 } : undefined}>
                  <span className="tab" />
                  <div style={{ minWidth: 0 }}>
                    <div className="deck-name">{d.depth ? '└ ' : ''}{d.name}</div>
                    <div className="deck-meta">
                      {d.counts.total} 张
                      {d.counts.due ? `,${d.counts.due} 待复习` : ',今天没有到期的'}
                      {d.counts.new ? ` · 新卡 ${d.counts.new}` : ''}
                    </div>
                  </div>
                  <div className="deck-right">
                    <div className="dots" title={`已完成 ${prog}0%`}>
                      {Array.from({ length: 10 }, (_, k) => <i key={k} className={k < prog ? 'f' : ''} />)}
                    </div>
                    <button className="go" onClick={() => navigate(`/study/${d.id}`)}>翻牌</button>
                  </div>
                </div>
              );
            })}
            {flat.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 14, padding: '20px 0' }}>
                还没有卡组。去 <Link to="/decks" style={{ color: 'var(--accent)', fontWeight: 600 }}>卡组管理</Link> 创建一个,或直接点右上「加卡」。
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="panel-title"><h3>打卡日历</h3><span>近 18 周</span></div>
          {heat && <Heatmap days={heat} />}
          <div className="motto">
            <div className="h">每次翻面,都是和遗忘打的一仗。</div>
            <div className="s">FSRS 会替你记住每一张卡的脾气。</div>
          </div>
          {stats && (
            <div className="motto" style={{ background: 'var(--surface)', border: '1px dashed var(--hairline)' }}>
              <div className="h" style={{ color: 'var(--ink)', fontSize: 19 }}>今日已学 {stats.todayNew + stats.todayReviews} 张</div>
              <div className="s">
                新学 {stats.todayNew} · 复习 {stats.todayReviews}
                {stats.retention != null && ` · 近30天保留率 ${(stats.retention * 100).toFixed(0)}%`}
              </div>
            </div>
          )}
        </div>
      </div>

      {editorOpen && (
        <CardEditor payload={{}} onClose={() => setEditorOpen(false)} onSaved={() => setEditorOpen(false)} />
      )}
    </div>
  );
}
void D;
