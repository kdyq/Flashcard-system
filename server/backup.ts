import fs from 'node:fs';
import path from 'node:path';
import { db, BACKUP_DIR, getSetting, localDayKey } from './db';

/** 自动备份:每日首次启动复制 db 到 server/data/backups/,保留最近 N 份 */
export async function backupOnce(force = false): Promise<string | null> {
  const today = localDayKey().replace(/-/g, '');
  const dest = path.join(BACKUP_DIR, `fanfan-${today}.db`);
  if (!force && fs.existsSync(dest)) return null; // 今日已备份
  await db.backup(dest);
  pruneOld();
  return dest;
}

function pruneOld() {
  const keep = Math.max(1, getSetting<number>('backup_keep', 7));
  const files = fs.readdirSync(BACKUP_DIR).filter(f => /^fanfan-\d{8}\.db$/.test(f)).sort();
  while (files.length > keep) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()!));
  }
}

export interface BackupInfo { filename: string; size: number; createdAt: string }

export function listBackups(): BackupInfo[] {
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => /^fanfan-\d{8}\.db$/.test(f))
    .sort()
    .reverse()
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: st.size, createdAt: st.mtime.toISOString() };
    });
}

/** 从备份还原:把备份文件内容整表写回当前库(无需重启) */
export function restoreBackup(filename: string): { tables: Record<string, number> } {
  if (!/^fanfan-\d{8}\.db$/.test(filename)) throw new Error('非法的备份文件名');
  const srcPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(srcPath)) throw new Error('备份文件不存在');
  const Database = (db as any).constructor as any;
  const src = new Database(srcPath, { readonly: true });
  const tables = ['decks', 'cards', 'review_logs', 'tags', 'card_tags'];
  const counts: Record<string, number> = {};
  try {
    const tx = db.transaction(() => {
      db.exec('DELETE FROM card_tags; DELETE FROM review_logs; DELETE FROM cards; DELETE FROM tags; DELETE FROM decks;');
      for (const t of tables) {
        const cols = (src.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map(c => c.name);
        const rows = src.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
        const ins = db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
        for (const r of rows) ins.run(...cols.map(c => r[c] ?? null));
        counts[t] = rows.length;
      }
    });
    tx();
  } finally {
    src.close();
  }
  return { tables: counts };
}
