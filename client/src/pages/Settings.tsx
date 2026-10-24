import { useEffect, useRef, useState } from 'react';
import { DownloadSimple, UploadSimple, ArrowClockwise } from '@phosphor-icons/react';
import { api } from '../api';
import type { AppSettings } from '../types';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { fmtDateTime } from '../utils/anim';

interface BackupInfo { filename: string; size: number; createdAt: string }

export default function Settings() {
  const { toast } = useToast();
  const [s, setS] = useState<AppSettings | null>(null);
  const [newLimit, setNewLimit] = useState(20);
  const [reviewLimit, setReviewLimit] = useState(200);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [confirmOverwrite, setConfirmOverwrite] = useState<File | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [forceOpt, setForceOpt] = useState(false);
  const [optResult, setOptResult] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [backupKeep, setBackupKeep] = useState(7);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => api.settings.get().then(r => {
    setS(r);
    setNewLimit(Number(r.daily_new_limit));
    setReviewLimit(Number(r.daily_review_limit));
    setReminderEnabled(Boolean(r.reminder_enabled));
    setReminderTime(String(r.reminder_time || '20:00'));
    setBackupKeep(Number(r.backup_keep ?? 7));
  }).catch(e => toast(e.message));
  useEffect(() => { refresh(); }, []); // eslint-disable-line

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

      <div className="panel">
        <div className="panel-title"><h3>FSRS 个性化调参</h3>
          <span>{s ? `已有 ${s._logsCount ?? 0} 条复习日志(满 400 条后推荐)` : ''}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          根据你的复习历史拟合专属记忆参数,让间隔更贴合你的遗忘曲线。调参后可在统计页对比未来负荷变化。
          {s?.fsrs_params && <b style={{ color: 'var(--accent)' }}> 当前已启用个性化参数。</b>}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-flip btn-sm" style={{ padding: '8px 18px' }} disabled={optimizing}
            onClick={async () => {
              setOptimizing(true); setOptResult(null);
              try {
                const r = await api.settings.optimize(forceOpt ? 50 : 400);
                setOptResult(`优化完成:${r.cards} 张卡 / ${r.logs} 条日志,耗时 ${(r.elapsedMs / 1000).toFixed(1)}s`);
                toast('FSRS 个性化参数已生效');
                refresh();
              } catch (e: any) { toast(e.message); }
              setOptimizing(false);
            }}>
            <ArrowClockwise size={15} />{optimizing ? '计算中,可能需要几十秒…' : '一键优化'}
          </button>
          {s?.fsrs_params && (
            <button className="btn-ghost btn-sm" onClick={async () => {
              try { await api.settings.resetFsrs(); toast('已恢复默认参数'); refresh(); } catch (e: any) { toast(e.message); }
            }}>恢复默认参数</button>
          )}
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={forceOpt} onChange={e => setForceOpt(e.target.checked)} style={{ width: 'auto' }} />
            数据不足也尝试(实验)
          </label>
        </div>
        {optResult && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--accent)' }}>{optResult}</p>}
      </div>

      <div className="panel">
        <div className="panel-title"><h3>自动备份</h3><span>每日首次启动自动备份</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 120 }}>
            <label className="field">保留份数</label>
            <input type="number" min={1} max={60} value={backupKeep}
              onChange={e => setBackupKeep(Number(e.target.value))}
              onBlur={async () => { try { await api.settings.update({ backup_keep: backupKeep }); toast('已保存'); } catch (err: any) { toast(err.message); } }} />
          </div>
          <button className="btn-ghost" onClick={async () => {
            try { await api.settings.backupCreate(); toast('备份完成'); refresh(); } catch (e: any) { toast(e.message); }
          }}><DownloadSimple size={15} />立即备份</button>
        </div>
        {(s?._backups as BackupInfo[] | undefined)?.length ? (
          <table className="table">
            <thead><tr><th>备份文件</th><th>大小</th><th>时间</th><th></th></tr></thead>
            <tbody>
              {(s!._backups as BackupInfo[]).map(b => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: 'Consolas,monospace', fontSize: 12.5 }}>{b.filename}</td>
                  <td>{(b.size / 1024).toFixed(0)} KB</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{fmtDateTime(b.createdAt)}</td>
                  <td><button className="btn-ghost btn-sm" onClick={() => setRestoreFile(b.filename)}>还原</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 13, color: 'var(--muted)' }}>还没有备份。</p>}
      </div>

      <div className="panel">
        <div className="panel-title"><h3>复习提醒</h3><span>浏览器通知,需授权</span></div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, cursor: 'pointer', paddingBottom: 9 }}>
            <input type="checkbox" checked={reminderEnabled} style={{ width: 'auto' }}
              onChange={async e => {
                const on = e.target.checked;
                if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                  const perm = await Notification.requestPermission();
                  if (perm !== 'granted') { toast('未获得通知权限,提醒不会生效'); }
                }
                setReminderEnabled(on);
                try { await api.settings.update({ reminder_enabled: on }); } catch (err: any) { toast(err.message); }
              }} />
            每天到点提醒我翻牌
          </label>
          <div style={{ width: 110 }}>
            <label className="field">提醒时间</label>
            <input type="time" value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              onBlur={async () => { try { await api.settings.update({ reminder_time: reminderTime }); toast('已保存'); } catch (err: any) { toast(err.message); } }} />
          </div>
        </div>
      </div>

      {s && (
        <div className="panel">
          <div className="panel-title"><h3>关于</h3></div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
            翻翻 FanFan · 本地间隔重复闪卡系统<br />
            算法 FSRS(ts-fsrs + 个性化调参)· 数据存于 <code>server/data/flashcard.db</code>,备份 = 复制文件<br />
            AI 卡片生成在「AI」页(P3)。
          </p>
        </div>
      )}

      {restoreFile && (
        <Modal small title="还原备份" onClose={() => setRestoreFile(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.8 }}>
            将用 <b style={{ fontFamily: 'Consolas,monospace' }}>{restoreFile}</b> 的内容<b style={{ color: 'var(--accent)' }}>替换当前全部数据</b>。
            当前未保存的修改会丢失。继续?
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => setRestoreFile(null)}>取消</button>
            <button className="btn-flip" style={{ background: '#b42318' }} onClick={async () => {
              try {
                const r = await api.settings.backupRestore(restoreFile);
                toast(`已还原:${Object.values(r.tables).reduce((a, b) => a + b, 0)} 行数据`);
                setRestoreFile(null);
                refresh();
              } catch (e: any) { toast(e.message); }
            }}>还原此备份</button>
          </div>
        </Modal>
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
