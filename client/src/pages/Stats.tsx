import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { DashboardStats, ForecastDay, HeatmapDay } from '../types';
import Heatmap from '../components/Heatmap';
import { fmtDate } from '../utils/anim';

export default function Stats() {
  const [dash, setDash] = useState<DashboardStats | null>(null);
  const [heat, setHeat] = useState<HeatmapDay[] | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  useEffect(() => {
    api.stats.dashboard().then(setDash).catch(() => {});
    api.stats.heatmap(18).then(r => setHeat(r.days)).catch(() => {});
    api.stats.forecast(30).then(r => setForecast(r.days)).catch(() => {});
  }, []);

  const maxF = useMemo(() => Math.max(1, ...forecast.map(f => f.count)), [forecast]);

  return (
    <div>
      <div className="panel-title" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 22 }}>学习统计</h3>
        <span>坚持就会有效果</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 22 }}>
        {dash && [
          { label: '连续天数', value: dash.current, sub: `最长 ${dash.longest} 天` },
          { label: '今日已学', value: dash.todayNew + dash.todayReviews, sub: `新 ${dash.todayNew} · 复习 ${dash.todayReviews}` },
          { label: '保留率(30天)', value: dash.retention == null ? '–' : `${(dash.retention * 100).toFixed(0)}%`, sub: '复习态非重来占比' },
          { label: '总卡片', value: dash.totalCards, sub: `累计复习 ${dash.totalReviews} 次` },
          { label: '当前到期', value: dash.dueNow, sub: `新卡 ${dash.newNow}` },
        ].map(s => (
          <div className="panel" key={s.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--hand)', fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="panel-title"><h3>打卡日历</h3><span>近 18 周 · 朱红越深复习越多</span></div>
      {heat && <Heatmap days={heat} />}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
        <span>少</span>
        {['#efece4', '#f3cdc3', '#e9968a', '#d94f3d', '#a93123'].map(c => (
          <i key={c} style={{ ...cell, background: c }} />
        ))}
        <span>多</span>
      </div>

      <div className="panel-title" style={{ marginTop: 26 }}><h3>未来负荷</h3><span>未来 30 天每日到期卡片数</span></div>
      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {forecast.map(f => (
            <div key={f.date} title={`${f.date}:${f.count} 张`}
              style={{
                flex: 1, minWidth: 6,
                height: `${Math.max(3, (f.count / maxF) * 100)}%`,
                background: f.count ? 'var(--accent-bright)' : '#efece4',
                borderRadius: 3,
              }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
          <span>今天</span>
          <span>{forecast.length > 0 ? fmtDate(forecast[forecast.length - 1].date) : ''}</span>
        </div>
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { width: 12, height: 12, borderRadius: 3, background: '#efece4', display: 'inline-block' };
