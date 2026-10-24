import { useEffect, useMemo, useState } from 'react';
import { Sparkle, CheckSquare, ArrowLeft } from '@phosphor-icons/react';
import { api } from '../api';
import type { DeckNode } from '../types';
import MarkdownView from '../components/MarkdownView';
import { useToast } from '../components/Toast';

interface Draft { front: string; back: string; tags: string[]; type: string; checked: boolean }

const SAMPLE_NOTE = `TCP 三次握手:客户端发 SYN,服务器回 SYN+ACK,客户端再发 ACK,连接建立。
HTTP 301 表示资源永久迁移到新 URL,搜索引擎会更新索引。
ephemeral:adj. 短暂的、转瞬即逝的。例句:Fame is often ephemeral.`;

export default function AIStudio() {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [decks, setDecks] = useState<DeckNode[]>([]);
  const [deckId, setDeckId] = useState<number | ''>('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.decks.tree().then(r => {
      setDecks(r.items);
      setDeckId(prev => prev || r.items[0]?.id || '');
    }).catch(() => {});
    api.settings.get().then(s => setEnabled(Boolean(s.ai_enabled))).catch(() => {});
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

  async function generate() {
    if (!note.trim()) { toast('先粘贴一段笔记'); return; }
    setLoading(true); setDrafts([]);
    try {
      const r = await api.ai.generate(note.trim(), count, deckId ? Number(deckId) : undefined);
      setDrafts(r.cards.map((c: any) => ({ ...c, checked: true })));
      toast(`生成了 ${r.cards.length} 张草稿(${(r.latencyMs / 1000).toFixed(1)}s,${r.model})`);
    } catch (e: any) {
      toast(e.message);
    }
    setLoading(false);
  }

  async function saveDrafts() {
    const chosen = drafts.filter(d => d.checked);
    if (!chosen.length) { toast('至少勾选一张'); return; }
    if (!deckId) { toast('请选择目标卡组'); return; }
    setSaving(true);
    try {
      await api.cards.create(chosen.map(d => ({
        deck_id: Number(deckId),
        type: (d.type === 'cloze' ? 'cloze' : 'basic') as 'basic' | 'cloze',
        front_md: d.front, back_md: d.back || null, tags: d.tags,
      })));
      toast(`已入库 ${chosen.length} 张卡片`);
      setDrafts([]);
      setNote('');
    } catch (e: any) { toast(e.message); }
    setSaving(false);
  }

  const upd = (i: number, patch: Partial<Draft>) =>
    setDrafts(ds => ds.map((d, k) => k === i ? { ...d, ...patch } : d));

  if (enabled === false) {
    return (
      <div style={{ textAlign: 'center', padding: '70px 20px' }}>
        <div className="page-title" style={{ fontSize: 40 }}>AI 工作台</div>
        <p style={{ color: 'var(--muted)', lineHeight: 2 }}>
          AI 功能未开启。请先到 <a href="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>设置页</a><br />
          配置 AI 服务(base_url / 模型 / API Key)并打开开关。
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="panel-title" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 22 }}>AI 工作台</h3>
        <span>粘贴笔记 → 生成草稿 → 勾选入库</span>
      </div>

      <div className="panel">
        <label className="field">笔记内容</label>
        <textarea rows={8} value={note} onChange={e => setNote(e.target.value)}
          placeholder={'粘贴任意课程笔记、文章段落……\n例如:\n' + SAMPLE_NOTE}
          style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <label className="field">目标卡组</label>
            <select value={deckId} onChange={e => setDeckId(e.target.value === '' ? '' : Number(e.target.value))}>
              {flatDecks.map(d => <option key={d.id} value={d.id}>{d.path}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label className="field">张数(≤20)</label>
            <input type="number" min={1} max={20} value={count} onChange={e => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 5)))} />
          </div>
          <button className="btn-flip" onClick={generate} disabled={loading || !note.trim()}>
            <Sparkle size={17} weight="fill" />{loading ? '生成中…' : '生成闪卡'}
          </button>
          {note.trim() === '' && (
            <button className="btn-ghost" onClick={() => setNote(SAMPLE_NOTE)}>填入示例笔记</button>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-title">
            <h3>草稿({drafts.filter(d => d.checked).length}/{drafts.length} 选中)</h3>
            <button className="btn-ghost btn-sm" onClick={() => setDrafts(ds => ds.map(d => ({ ...d, checked: !ds.every(x => x.checked) })))}>
              <CheckSquare size={13} />全选/反选
            </button>
            <button className="btn-flip btn-sm" style={{ marginLeft: 'auto', padding: '7px 16px' }}
              onClick={saveDrafts} disabled={saving}>
              {saving ? '入库中…' : `入库 ${drafts.filter(d => d.checked).length} 张`}
            </button>
          </div>
          {drafts.map((d, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, padding: '14px 4px',
              borderBottom: '1px solid var(--hairline)', alignItems: 'flex-start',
            }}>
              <input type="checkbox" checked={d.checked} onChange={() => upd(i, { checked: !d.checked })}
                style={{ width: 'auto', marginTop: 8 }} />
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className="chip">{d.type === 'cloze' ? '填空' : '问答'}</span>
                  {d.tags.map(t => <span className="tag plain" key={t} style={{ fontSize: 11 }}>{t}</span>)}
                </div>
                <input type="text" value={d.front} onChange={e => upd(i, { front: e.target.value })}
                  style={{ fontWeight: 600, marginBottom: 6 }} placeholder="正面" />
                <textarea rows={2} value={d.back} onChange={e => upd(i, { back: e.target.value })}
                  placeholder="背面" style={{ marginBottom: 6 }} />
                <div style={{ fontSize: 13 }}><MarkdownView md={d.front} inline /></div>
              </div>
            </div>
          ))}
          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
            <ArrowLeft size={12} style={{ verticalAlign: -2, transform: 'rotate(180deg)' }} /> 草稿可直接编辑;勾选后点「入库」批量保存为卡片。
          </p>
        </div>
      )}
    </div>
  );
}
