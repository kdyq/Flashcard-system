import { useEffect, useRef, useState } from 'react';
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { api } from '../api';
import type { AppSettings } from '../types';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

export default function Settings() {
  const { toast } = useToast();
  const [s, setS] = useState<AppSettings | null>(null);
  const [newLimit, setNewLimit] = useState(20);
  const [reviewLimit, setReviewLimit] = useState(200);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [confirmOverwrite, setConfirmOverwrite] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.settings.get().then(r => {
      setS(r);
      setNewLimit(Number(r.daily_new_limit));
      setReviewLimit(Number(r.daily_review_limit));
    }).catch(e => toast(e.message));
  }, [toast]);

  async function saveLimits() {
    try {
      await api.settings.update({ daily_new_limit: newLimit, daily_review_limit: reviewLimit });
      toast('每日上限已保存');
    } catch (e: any) { toast(e.message); }
  }

  async function doImport(file: File, mode: 'merge' | 'overwrite') {
    try {
      const r = await api.io.importFile(file, mode);
      toast(r.kind === 'csv'
        ? `CSV 导入完成:新增 ${r.imported} 张,跳过 ${r.skipped} 张`
        : `JSON 导入完成(${mode === 'overwrite' ? '覆盖' : '合并'}):新增 ${r.imported},跳过 ${r.skipped}`);
    } catch (e: any) { toast(e.message); }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="panel-title" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 22 }}>设置</h3>
        <span>数据都在本地 SQLite 里</span>
      </div>

      <div className="panel">
        <div className="panel-title"><h3>每日学习上限</h3><span>到量即止,贪多不消化</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="field">新卡上限</label>
            <input type="number" min={0} value={newLimit} onChange={e => setNewLimit(Number(e.target.value))} />
          </div>
          <div>
            <label className="field">复习上限</label>
            <input type="number" min={0} value={reviewLimit} onChange={e => setReviewLimit(Number(e.target.value))} />
          </div>
        </div>
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="btn-flip btn-sm" style={{ padding: '8px 20px' }} onClick={saveLimits}>保存</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title"><h3>导入 / 导出</h3><span>备份 = 复制文件</span></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn-ghost" href="/api/export" download><DownloadSimple size={16} />导出 JSON 全量备份</a>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <UploadSimple size={16} />导入(CSV / JSON)
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.json" hidden
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (importMode === 'overwrite') setConfirmOverwrite(f);
              else doImport(f, 'merge');
            }} />
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
          导入模式:
          <label style={{ marginLeft: 10, marginRight: 14, cursor: 'pointer' }}>
            <input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} style={{ width: 'auto', marginRight: 5 }} />
            合并(按内容去重)
          </label>
          <label style={{ cursor: 'pointer' }}>
            <input type="radio" checked={importMode === 'overwrite'} onChange={() => setImportMode('overwrite')} style={{ width: 'auto', marginRight: 5 }} />
            覆盖(清库重建)
          </label>
        </div>
        <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          CSV 表头 <code>front,back,tags</code>;兼容 Anki「Notes in plain text」导出(自动剥离 HTML)。
        </p>
      </div>

      {s && (
        <div className="panel">
          <div className="panel-title"><h3>关于</h3></div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
            翻翻 FanFan · 本地间隔重复闪卡系统<br />
            算法 FSRS(ts-fsrs)· 数据 {String(s.daily_new_limit)} 等设置存于 <code>server/data/flashcard.db</code><br />
            AI 与备份等进阶设置将在后续阶段开放。
          </p>
        </div>
      )}

      {confirmOverwrite && (
        <Modal small title="确认覆盖导入" onClose={() => setConfirmOverwrite(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.8 }}>
            「覆盖」将<b style={{ color: 'var(--accent)' }}>清空当前全部卡组、卡片与复习记录</b>,然后用文件内容重建。
            建议先导出一份备份。确定继续?
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => setConfirmOverwrite(null)}>取消</button>
            <button className="btn-flip" style={{ background: '#b42318' }}
              onClick={() => { doImport(confirmOverwrite, 'overwrite'); setConfirmOverwrite(null); }}>
              清库并导入
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
