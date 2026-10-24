import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageSquare, MathOperations } from '@phosphor-icons/react';
import { api } from '../api';
import type { CardItem, CardType, DeckNode, TagItem } from '../types';
import Modal from './Modal';
import MarkdownView from './MarkdownView';
import { useToast } from './Toast';

export interface EditorPayload {
  card?: CardItem | null;      // 编辑现有卡
  deckId?: number;             // 新卡默认卡组
}

/** 卡片编辑弹层:正/背面 Markdown 双栏 + 实时预览 + 图片(点击/拖拽/粘贴)+ LaTeX + 标签 */
export default function CardEditor({ payload, onClose, onSaved }: {
  payload: EditorPayload; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const editing = payload.card ?? null;
  const [deckTree, setDeckTree] = useState<DeckNode[]>([]);
  const [deckId, setDeckId] = useState<number>(editing?.deck_id ?? payload.deckId ?? 0);
  const [type, setType] = useState<CardType>((editing?.type as CardType) ?? 'basic');
  const [front, setFront] = useState(editing?.front_md ?? '');
  const [back, setBack] = useState(editing?.back_md ?? '');
  const [tagsStr, setTagsStr] = useState((editing?.tags ?? []).join(', '));
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.decks.tree().then(r => setDeckTree(r.items)).catch(e => toast(e.message));
    api.cards.tags().then(r => setAllTags(r.items)).catch(() => {});
  }, [toast]);

  const flatDecks = useMemo(() => {
    const out: { id: number; path: string }[] = [];
    const walk = (nodes: DeckNode[], depth: number) => nodes.forEach(n => {
      out.push({ id: n.id, path: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${n.name}` });
      walk(n.children, depth + 1);
    });
    walk(deckTree, 0);
    return out;
  }, [deckTree]);

  const tags = useMemo(() =>
    [...new Set(tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean))], [tagsStr]);

  const suggestions = useMemo(() =>
    allTags.filter(t => !tags.includes(t.name)).slice(0, 8), [allTags, tags]);

  function insertAtCursor(textarea: HTMLTextAreaElement | null, text: string) {
    if (!textarea) return;
    const s = textarea.selectionStart, e = textarea.selectionEnd;
    const v = textarea.value;
    textarea.value = v.slice(0, s) + text + v.slice(e);
    textarea.selectionStart = textarea.selectionEnd = s + text.length;
    textarea.focus();
    // 同步 React state(直接改了 DOM value)
    if (textarea === frontRef.current) setFront(textarea.value); else setBack(textarea.value);
  }

  async function uploadImage(file: File | Blob) {
    if (uploading) return;
    setUploading(true);
    try {
      const { url } = await api.media.upload(file);
      insertAtCursor(frontRef.current, `\n![](${url})\n`);
      toast('图片已上传并插入');
    } catch (e: any) {
      toast(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!front.trim()) { toast('正面内容不能为空'); return; }
    if (!deckId) { toast('请选择卡组'); return; }
    const body = { deck_id: deckId, type, front_md: front, back_md: back || null, tags };
    try {
      if (editing) await api.cards.update(editing.id, body);
      else await api.cards.create(body);
      toast(editing ? '卡片已更新' : '卡片已创建');
      onSaved();
    } catch (e: any) {
      toast(e.message);
    }
  }

  return (
    <Modal title={editing ? '编辑卡片' : '新建卡片'} onClose={onClose}>
      <div className="editor-toolbar">
        <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <ImageSquare size={15} /> {uploading ? '上传中…' : '插入图片'}
        </button>
        <button className="btn-ghost btn-sm" onClick={() => insertAtCursor(frontRef.current, '$x^2$')}>
          <MathOperations size={15} /> LaTeX 行内
        </button>
        <button className="btn-ghost btn-sm" onClick={() => insertAtCursor(frontRef.current, '\n$$\nx^2\n$$\n')}>
          <MathOperations size={15} /> LaTeX 块级
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setShowPreview(v => !v)}>
          {showPreview ? '隐藏预览' : '显示预览'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label className="field">卡组</label>
          <select value={deckId} onChange={e => setDeckId(Number(e.target.value))}>
            {flatDecks.map(d => <option key={d.id} value={d.id}>{d.path}</option>)}
          </select>
        </div>
        <div>
          <label className="field">类型</label>
          <select value={type} onChange={e => setType(e.target.value as CardType)}>
            <option value="basic">问答卡</option>
            <option value="cloze">填空卡(挖空语法)</option>
            <option value="reversed">双向卡(正反两张)</option>
          </select>
        </div>
        <div>
          <label className="field">标签(逗号分隔)</label>
          <input type="text" value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="如: 数学, 公式" list="tag-suggestions" />
          <datalist id="tag-suggestions">
            {suggestions.map(t => <option key={t.id} value={t.name} />)}
          </datalist>
        </div>
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {tags.map(t => <span className="chip" key={t}>{t}</span>)}
        </div>
      )}

      <div className={`editor-grid ${showPreview ? '' : 'single'}`} style={showPreview ? undefined : { gridTemplateColumns: '1fr' }}>
        <div className="editor-pane"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) uploadImage(f); }}>
          <div className="pane-head">正面(问题)</div>
          <textarea
            ref={frontRef}
            value={front}
            onChange={e => setFront(e.target.value)}
            onPaste={e => {
              const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
              if (item) { e.preventDefault(); uploadImage(item.getAsFile()!); }
            }}
            placeholder={type === 'cloze' ? '用 {{c1::被挖空的内容}} 语法挖空,可多个 c1/c2/c3' : '支持 Markdown、$LaTeX$、![](图片)'}
            style={dragOver ? { background: 'var(--accent-soft)' } : undefined} />
        </div>
        <div className="editor-pane">
          <div className="pane-head">背面(答案)</div>
          <textarea value={back} onChange={e => setBack(e.target.value)}
            placeholder="留空则为纯正面卡;支持 Markdown 与 LaTeX" />
        </div>
        {showPreview && (
          <div className="editor-pane">
            <div className="pane-head">实时预览 · 正面</div>
            <div className="pane-preview"><MarkdownView md={front} /></div>
            <div className="pane-head">背面</div>
            <div className="pane-preview"><MarkdownView md={back ?? ''} /></div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-flip" onClick={save}>{editing ? '保存修改' : '创建卡片'}</button>
      </div>
    </Modal>
  );
}
