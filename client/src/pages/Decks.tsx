import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowsLeftRight, Cards, PencilSimple, Plus, TrashSimple } from '@phosphor-icons/react';
import { api } from '../api';
import type { DeckNode } from '../types';
import Modal from '../components/Modal';
import CardEditor from '../components/CardEditor';
import { useToast } from '../components/Toast';

interface FlatDeck extends DeckNode { depth: number }
function flatten(nodes: DeckNode[], depth = 0): FlatDeck[] {
  return nodes.flatMap(n => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

export default function Decks() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tree, setTree] = useState<DeckNode[]>([]);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'rename'; deck?: DeckNode } | null>(null);
  const [moveModal, setMoveModal] = useState<DeckNode | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeckNode | null>(null);
  const [cardEditor, setCardEditor] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | ''>('');

  const reload = () => api.decks.tree().then(r => setTree(r.items)).catch(e => toast(e.message));
  useEffect(() => { reload(); }, []); // eslint-disable-line

  const flat = useMemo(() => flatten(tree), [tree]);
  const totalCards = flat.reduce((s, d) => s + d.counts.total, 0);

  const openCreate = (parent?: DeckNode) => { setName(''); setParentId(parent?.id ?? ''); setEditModal({ mode: 'create' }); };
  const openRename = (d: DeckNode) => { setName(d.name); setEditModal({ mode: 'rename', deck: d }); };

  async function saveDeck() {
    if (!name.trim()) { toast('名称不能为空'); return; }
    try {
      if (editModal?.mode === 'create') {
        await api.decks.create(name.trim(), parentId === '' ? null : Number(parentId));
        toast('卡组已创建');
      } else if (editModal?.deck) {
        await api.decks.update(editModal.deck.id, { name: name.trim() });
        toast('卡组已改名');
      }
      setEditModal(null);
      reload();
    } catch (e: any) { toast(e.message); }
  }

  async function saveMove() {
    if (!moveModal) return;
    try {
      await api.decks.update(moveModal.id, { parent_id: parentId === '' ? null : Number(parentId) });
      toast('卡组已移动');
      setMoveModal(null);
      reload();
    } catch (e: any) { toast(e.message); }
  }

  async function doDelete() {
    if (!deleteModal) return;
    try {
      const r = await api.decks.remove(deleteModal.id);
      toast(`已删除「${deleteModal.name}」及 ${r.deletedCards} 张卡片`);
      setDeleteModal(null);
      reload();
    } catch (e: any) { toast(e.message); }
  }

  // 移动目标候选:排除自己与后代
  const moveTargets = useMemo(() => {
    if (!moveModal) return [];
    const exclude = new Set<number>([moveModal.id]);
    const walk = (n: DeckNode) => n.children.forEach(c => { exclude.add(c.id); walk(c); });
    walk(moveModal);
    return flat.filter(d => !exclude.has(d.id));
  }, [moveModal, flat]);

  return (
    <div>
      <div className="panel-title" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 22 }}>卡组管理</h3>
        <span>{flat.length} 组 / {totalCards} 张</span>
        <button className="btn-flip btn-sm" style={{ marginLeft: 'auto', padding: '8px 18px' }} onClick={() => openCreate()}>
          <Plus size={15} />新建卡组
        </button>
      </div>

      <div className="pile">
        {flat.map(d => (
          <div className="deck" key={d.id} style={d.depth ? { marginLeft: d.depth * 26 } : undefined}>
            <span className="tab" />
            <div style={{ minWidth: 0 }}>
              <div className="deck-name">{d.depth ? '└ '.repeat(0) : ''}{d.name}</div>
              <div className="deck-meta">
                {d.counts.total} 张 · 待复习 {d.counts.due} · 新卡 {d.counts.new}
              </div>
            </div>
            <div className="deck-right">
              <button className="btn-ghost btn-sm" onClick={() => setCardEditor(d.id)}><Plus size={13} />加卡</button>
              <button className="btn-ghost btn-sm" onClick={() => navigate(`/study/${d.id}`)}><Cards size={13} />学习</button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="新建子卡组" onClick={() => openCreate(d)}><Plus size={14} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="改名" onClick={() => openRename(d)}><PencilSimple size={14} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="移动到…"
                onClick={() => { setMoveModal(d); setParentId(d.parent_id ?? ''); }}><ArrowsLeftRight size={14} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="删除"
                onClick={() => setDeleteModal(d)}><TrashSimple size={14} /></button>
            </div>
          </div>
        ))}
        {flat.length === 0 && <div style={{ color: 'var(--muted)' }}>还没有卡组,点右上角「新建卡组」开始。</div>}
      </div>

      {editModal && (
        <Modal small title={editModal.mode === 'create' ? '新建卡组' : '重命名卡组'} onClose={() => setEditModal(null)}>
          <div style={{ marginBottom: 12 }}>
            <label className="field">名称</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && saveDeck()} placeholder="如:计算机网络" />
          </div>
          {editModal.mode === 'create' && (
            <div style={{ marginBottom: 12 }}>
              <label className="field">父卡组(可选,支持嵌套)</label>
              <select value={parentId} onChange={e => setParentId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— 顶层 —</option>
                {flat.map(d => <option key={d.id} value={d.id}>{'　'.repeat(d.depth)}{d.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setEditModal(null)}>取消</button>
            <button className="btn-flip" onClick={saveDeck}>保存</button>
          </div>
        </Modal>
      )}

      {moveModal && (
        <Modal small title={`移动「${moveModal.name}」`} onClose={() => setMoveModal(null)}>
          <div style={{ marginBottom: 12 }}>
            <label className="field">目标父卡组</label>
            <select value={parentId} onChange={e => setParentId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— 移到顶层 —</option>
              {moveTargets.map(d => <option key={d.id} value={d.id}>{'　'.repeat(d.depth)}{d.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setMoveModal(null)}>取消</button>
            <button className="btn-flip" onClick={saveMove}>移动</button>
          </div>
        </Modal>
      )}

      {deleteModal && (
        <Modal small title="删除卡组" onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.8 }}>
            确定删除「<b>{deleteModal.name}</b>」?
            其下 <b style={{ color: 'var(--accent)' }}>{deleteModal.counts.total}</b> 张卡片(含子卡组)与全部复习记录将一并删除,此操作不可恢复。
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => setDeleteModal(null)}>取消</button>
            <button className="btn-flip" style={{ background: '#b42318' }} onClick={doDelete}>确认删除</button>
          </div>
        </Modal>
      )}

      {cardEditor !== null && (
        <CardEditor payload={{ deckId: cardEditor }} onClose={() => setCardEditor(null)} onSaved={() => setCardEditor(null)} />
      )}

      <p style={{ marginTop: 24, color: 'var(--muted)', fontSize: 12.5 }}>
        提示:嵌套卡组以缩进展示;在父卡组学习会覆盖全部子卡组。卡片批量管理请用 <Link to="/browse" style={{ color: 'var(--accent)' }}>卡片浏览器</Link>。
      </p>
    </div>
  );
}
