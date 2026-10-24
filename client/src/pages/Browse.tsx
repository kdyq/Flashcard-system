import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CardItem } from '../types';
import MarkdownView from '../components/MarkdownView';
import { STATE_LABEL, fmtDateTime } from '../utils/anim';

/** 卡片浏览器:P0 基础版(列表+搜索+筛选);P1 补批量操作/复习历史/暂停等 */
export default function Browse() {
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: CardItem[]; total: number; pages: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.cards.list({ q, state, page, limit: 20 }).then(setData).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, state, page]);

  return (
    <div>
      <div className="panel-title" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 22 }}>卡片浏览器</h3>
        <span>{data ? `${data.total} 张` : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="text" style={{ maxWidth: 320 }} placeholder="搜索正反面内容…"
          value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <select style={{ maxWidth: 140 }} value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          <option value="new">新卡</option>
          <option value="learning">学习中</option>
          <option value="review">复习中</option>
          <option value="relearning">重新学习</option>
        </select>
      </div>

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '46%' }}>正面</th>
              <th style={{ width: '34%' }}>背面</th>
              <th>状态</th>
              <th>到期</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>
                  <MarkdownView md={c.front_md.slice(0, 200)} />
                </td>
                <td style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  <MarkdownView md={(c.back_md ?? '—').slice(0, 200)} />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {STATE_LABEL[c.state]}
                  {c.suspended ? <span style={{ color: '#b42318' }}> · 暂停</span> : ''}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--muted)' }}>
                  {fmtDateTime(c.due)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>没有匹配的卡片</div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>{page} / {data.pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}
