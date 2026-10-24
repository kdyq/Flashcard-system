import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsLeftRight, PencilSimple, Plus, Pause, Play, ArrowClockwise, TrashSimple, EyeSlash, ClockCounterClockwise,
} from '@phosphor-icons/react';
import { api } from '../api';
import type { CardItem, DeckNode, TagItem } from '../types';
import MarkdownView from '../components/MarkdownView';
import Modal from '../components/Modal';
import CardEditor from '../components/CardEditor';
import { useToast } from '../components/Toast';
import { STATE_LABEL, fmtDateTime } from '../utils/anim';

const RATING_LABEL: Record<number, string> = { 1: '重来', 2: '困难', 3: '良好', 4: '简单' };

export default function Browse() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [deckId, setDeckId] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: CardItem[]; total: number; pages: number } | null>(null);
  const [decks, setDecks] = useState<DeckNode[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<CardItem | null>(null);
  const [editing, setEditing] = useState<CardItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ ids: number[]; deckId: string } | null>(null);
  const [batchTag, setBatchTag] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<number[] | null>(null);

  const reload = () => {
    api.cards.list({ q, state, deckId, tag, page, limit: 20 }).then(r => {
      setData(r);
      setSelected(new Set());
    }).catch(e => toast(e.message));
  };
  useEffect(() => { const t = setTimeout(reload, 200); return () => clearTimeout(t); }, [q, state, deckId, tag, page]); // eslint-disable-line
  useEffect(() => {
    api.decks.tree().then(r => setDecks(r.items)).catch(() => {});
    api.cards.tags().then(r => setTags(r.items)).catch(() => {});
  }, []);

  const flatDecks = useMemo(() => {
    const out: { id: number; path: string }[] = [];
    const walk = (nodes: DeckNode[], depth: number) => nodes.forEach(n => {
      out.push({ id: n.id, path: `${'　'.repeat(depth)}${n.name}` });
      walk(n.children, depth + 1);
    });
    walk(decks, 0);
    return out;
  }, [decks]);

  const allChecked = !!data && data.items.length > 0 && data.items.every(c => selected.has(c.id));
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(data?.items.map(c => c.id) ?? []));
  };
  const toggle = (id: number) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  async function runBatch(action: string, extra?: Record<string, unknown>, tip?: string) {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const r = await api.cards.batch(ids, action, extra);
      toast(tip || `批量${action}完成,影响 ${r.affected} 张`);
      reload();
    } catch (e: any) { toast(e.message); }
  }

  async function cardAction(fn: () => Promise<unknown>, tip: string, closeDetail = true) {
    try {
      await fn();
      toast(tip);
      if (closeDetail) setDetail(null);
      reload();
    } catch (e: any) { toast(e.message); }
  }

  const openDetail = async (c: CardItem) => {
    try { setDetail(await api.cards.get(c.id)); } catch (e: any) { toast(e.message); }
  };

  return (
    <div>
      <div className="panel-title" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 22 }}>卡片浏览器</h3>
        <span>{data ? `${data.total} 张` : ''}</span>
        <button className="btn-flip btn-sm" style={{ marginLeft: 'auto', padding: '7px 16px' }} onClick={() => setEditing({ id: 0 } as CardItem)}>
          <Plus size={14} />新建卡片
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="text" style={{ maxWidth: 260 }} placeholder="搜索正反面…"
          value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <select style={{ maxWidth: 130 }} value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          <option value="new">新卡</option>
          <option value="learning">学习中</option>
          <option value="review">复习中</option>
          <option value="relearning">重新学习</option>
        </select>
        <select style={{ maxWidth: 170 }} value={deckId} onChange={e => { setDeckId(e.target.value); setPage(1); }}>
          <option value="">全部卡组</option>
          {flatDecks.map(d => <option key={d.id} value={d.id}>{d.path}</option>)}
        </select>
        <select style={{ maxWidth: 130 }} value={tag} onChange={e => { setTag(e.target.value); setPage(1); }}>
          <option value="">全部标签</option>
          {tags.map(t => <option key={t.id} value={t.name}>{t.name}({t.usage})</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="panel" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 13 }}>已选 {selected.size} 张:</b>
          <button className="btn-ghost btn-sm" onClick={() => setMoveTarget({ ids: [...selected], deckId: '' })}><ArrowsLeftRight size={13} />移动</button>
          <button className="btn-ghost btn-sm" onClick={() => setBatchTag('')}><Plus size={13} />加标签</button>
          <button className="btn-ghost btn-sm" onClick={() => runBatch('suspend', undefined, '已暂停')}><Pause size={13} />暂停</button>
          <button className="btn-ghost btn-sm" onClick={() => runBatch('unsuspend', undefined, '已恢复')}><Play size={13} />恢复</button>
          <button className="btn-ghost btn-sm" onClick={() => setDeleteIds([...selected])}><TrashSimple size={13} />删除</button>
          <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>取消选择</button>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 'auto' }} /></th>
              <th style={{ width: '38%' }}>正面</th>
              <th style={{ width: '32%' }}>背面</th>
              <th>卡组</th>
              <th>状态</th>
              <th>到期</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map(c => (
              <tr key={c.id} onClick={() => openDetail(c)} style={{ cursor: 'pointer' }}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 'auto' }} />
                </td>
                <td style={{ fontWeight: 600 }}>
                  <div style={{ maxHeight: 72, overflow: 'hidden' }}><MarkdownView md={c.front_md.slice(0, 200)} /></div>
                  {c.tags && c.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {c.tags.map(t => <span key={t} className="chip" style={{ fontSize: 11, padding: '1px 8px' }}>{t}</span>)}
                    </div>
                  )}
                </td>
                <td style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  <div style={{ maxHeight: 72, overflow: 'hidden' }}><MarkdownView md={(c.back_md ?? '—').slice(0, 200)} /></div>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{flatDecks.find(d => d.id === c.deck_id)?.path.trim() ?? c.deck_id}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {STATE_LABEL[c.state]}
                  {c.type !== 'basic' && <span style={{ color: 'var(--muted)' }}> · {c.type === 'cloze' ? '填空' : '双向'}</span>}
                  {c.suspended ? <span style={{ color: '#b42318' }}> · 暂停</span> : ''}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--muted)' }}>{fmtDateTime(c.due)}</td>
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

      {/* 单卡详情 + 复习历史 */}
      {detail && (
        <Modal title={`卡片 #${detail.id}`} onClose={() => setDetail(null)}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="btn-ghost btn-sm" onClick={() => { setEditing(detail); setDetail(null); }}><PencilSimple size={13} />编辑</button>
            <button className="btn-ghost btn-sm" onClick={() => cardAction(() => api.cards.reset(detail.id), '进度已重置为新卡')}>
              <ArrowClockwise size={13} />重置进度
            </button>
            <button className="btn-ghost btn-sm" onClick={() => cardAction(() => api.study.suspend(detail.id), detail.suspended ? '已恢复' : '已暂停')}>
              {detail.suspended ? <Play size={13} /> : <Pause size={13} />}{detail.suspended ? '恢复' : '暂停'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => cardAction(() => api.study.bury(detail.id), '已搁置到明天')}><EyeSlash size={13} />搁置到明日</button>
            <button className="btn-ghost btn-sm danger" onClick={() => setDeleteIds([detail.id])}><TrashSimple size={13} />删除</button>
          </div>
          <div className="editor-grid">
            <div className="editor-pane">
              <div className="pane-head">正面</div>
              <div className="pane-preview"><MarkdownView md={detail.front_md} /></div>
            </div>
            <div className="editor-pane">
              <div className="pane-head">背面</div>
              <div className="pane-preview"><MarkdownView md={detail.back_md ?? '—'} /></div>
            </div>
          </div>
          <div className="panel-title" style={{ marginTop: 18, marginBottom: 8 }}>
            <h3 style={{ fontSize: 14 }}>复习历史</h3><span>{detail.logs?.length ?? 0} 条</span>
          </div>
          {detail.logs && detail.logs.length > 0 ? (
            <div style={{ maxHeight: 220, overflow: 'auto', paddingRight: 6 }}>
              {detail.logs.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 2px', borderBottom: '1px solid var(--hairline)', fontSize: 13 }}>
                  <ClockCounterClockwise size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{RATING_LABEL[l.rating] ?? l.rating}</span>
                  <span style={{ color: 'var(--muted)' }}>{STATE_LABEL[l.state_before] ?? l.state_before} →</span>
                  <span>{fmtDateTime(l.due_after)} 到期</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{fmtDateTime(l.review_time)}</span>
                </div>
              ))}
            </div>
          ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>还没有复习记录</p>}
        </Modal>
      )}

      {editing && (
        <CardEditor
          payload={editing.id ? { card: editing } : {}}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}

      {/* 批量移动 */}
      {moveTarget && (
        <Modal small title={`移动 ${moveTarget.ids.length} 张卡片`} onClose={() => setMoveTarget(null)}>
          <div style={{ marginBottom: 12 }}>
            <label className="field">目标卡组</label>
            <select value={moveTarget.deckId} onChange={e => setMoveTarget({ ...moveTarget, deckId: e.target.value })}>
              <option value="">请选择…</option>
              {flatDecks.map(d => <option key={d.id} value={d.id}>{d.path}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setMoveTarget(null)}>取消</button>
            <button className="btn-flip" onClick={async () => {
              if (!moveTarget.deckId) { toast('请选择目标卡组'); return; }
              try {
                const r = await api.cards.batch(moveTarget.ids, 'move', { deckId: Number(moveTarget.deckId) });
                toast(`已移动 ${r.affected} 张`);
                setMoveTarget(null);
                reload();
              } catch (e: any) { toast(e.message); }
            }}>移动</button>
          </div>
        </Modal>
      )}

      {/* 批量加标签 */}
      {batchTag !== null && (
        <Modal small title={`为 ${selected.size} 张卡片加标签`} onClose={() => setBatchTag(null)}>
          <input type="text" autoFocus value={batchTag} onChange={e => setBatchTag(e.target.value)} placeholder="标签名(单个)"
            onKeyDown={e => { if (e.key === 'Enter') { runBatch('tag', { tag: batchTag.trim() }, '标签已添加'); setBatchTag(null); } }} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn-ghost" onClick={() => setBatchTag(null)}>取消</button>
            <button className="btn-flip" onClick={() => {
              if (!batchTag.trim()) { toast('标签名不能为空'); return; }
              runBatch('tag', { tag: batchTag.trim() }, '标签已添加');
              setBatchTag(null);
            }}>添加</button>
          </div>
        </Modal>
      )}

      {/* 删除确认 */}
      {deleteIds && (
        <Modal small title="删除卡片" onClose={() => setDeleteIds(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.8 }}>
            确定删除 <b style={{ color: 'var(--accent)' }}>{deleteIds.length}</b> 张卡片及其复习记录?
            双向卡的另一张会一并删除。此操作不可恢复。
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => setDeleteIds(null)}>取消</button>
            <button className="btn-flip" style={{ background: '#b42318' }} onClick={async () => {
              try {
                const r = await api.cards.batch(deleteIds, 'delete');
                toast(`已删除 ${r.affected} 张`);
                setDeleteIds(null);
                setDetail(null);
                reload();
              } catch (e: any) { toast(e.message); }
            }}>确认删除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
