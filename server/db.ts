import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, 'data');
export const UPLOADS_DIR = path.join(__dirname, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUP_DIR]) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'flashcard.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---------- 类型 ---------- */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type CardType = 'basic' | 'cloze' | 'reversed';

export interface DeckRow {
  id: number; name: string; parent_id: number | null; sort_order: number; created_at: string;
}
export interface CardRow {
  id: number; deck_id: number; note_id: string | null; type: CardType;
  front_md: string; back_md: string | null;
  due: string; stability: number | null; difficulty: number | null; state: CardState;
  reps: number; lapses: number; last_review: string | null;
  elapsed_days: number; scheduled_days: number; learning_steps: number;
  suspended: number; buried_until: string | null;
  tts: number; audio_url: string | null; audio_mode: string | null;
  created_at: string; updated_at: string;
}
export interface LogRow {
  id: number; card_id: number; rating: number;
  state_before: string; stability_before: number | null; difficulty_before: number | null;
  due_before: string; reps_before: number; lapses_before: number;
  last_review_before: string | null; elapsed_days_before: number; scheduled_days_before: number; learning_steps_before: number;
  stability_after: number | null; difficulty_after: number | null; due_after: string;
  elapsed_days: number; scheduled_days: number;
  review_time: string; day_key: string; cloze_index: number | null; is_undo_of: number | null;
}

/* ---------- Migration:user_version 顺序迁移 ---------- */
const MIGRATIONS: { version: number; up: () => void }[] = [
  {
    version: 1,
    up: () => {
      db.exec(`
        CREATE TABLE decks(
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          parent_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE cards(
          id INTEGER PRIMARY KEY,
          deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          note_id TEXT,
          type TEXT NOT NULL DEFAULT 'basic',
          front_md TEXT NOT NULL,
          back_md TEXT,
          due TEXT NOT NULL,
          stability REAL,
          difficulty REAL,
          state TEXT NOT NULL DEFAULT 'new',
          reps INTEGER NOT NULL DEFAULT 0,
          lapses INTEGER NOT NULL DEFAULT 0,
          last_review TEXT,
          elapsed_days INTEGER NOT NULL DEFAULT 0,
          scheduled_days INTEGER NOT NULL DEFAULT 0,
          learning_steps INTEGER NOT NULL DEFAULT 0,
          suspended INTEGER NOT NULL DEFAULT 0,
          buried_until TEXT,
          tts INTEGER NOT NULL DEFAULT 0,
          audio_url TEXT,
          audio_mode TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_cards_deck ON cards(deck_id);
        CREATE INDEX idx_cards_due ON cards(state, due);
        CREATE TABLE review_logs(
          id INTEGER PRIMARY KEY,
          card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          rating INTEGER NOT NULL,
          state_before TEXT NOT NULL,
          stability_before REAL, difficulty_before REAL, due_before TEXT,
          reps_before INTEGER NOT NULL DEFAULT 0, lapses_before INTEGER NOT NULL DEFAULT 0,
          last_review_before TEXT,
          elapsed_days_before INTEGER NOT NULL DEFAULT 0, scheduled_days_before INTEGER NOT NULL DEFAULT 0,
          learning_steps_before INTEGER NOT NULL DEFAULT 0,
          stability_after REAL, difficulty_after REAL, due_after TEXT NOT NULL,
          elapsed_days INTEGER NOT NULL DEFAULT 0, scheduled_days INTEGER NOT NULL DEFAULT 0,
          review_time TEXT NOT NULL,
          day_key TEXT NOT NULL,
          cloze_index INTEGER,
          is_undo_of INTEGER
        );
        CREATE INDEX idx_logs_card ON review_logs(card_id);
        CREATE INDEX idx_logs_day ON review_logs(day_key);
        CREATE TABLE tags(
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE card_tags(
          card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY(card_id, tag_id)
        );
        CREATE TABLE settings(
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE media(
          id INTEGER PRIMARY KEY,
          filename TEXT NOT NULL,
          mime TEXT,
          size INTEGER,
          created_at TEXT NOT NULL
        );
      `);
      const seed = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)');
      const now = new Date().toISOString();
      seed.run('daily_new_limit', '20');
      seed.run('daily_review_limit', '200');
      seed.run('fsrs_params', 'null');
      seed.run('ai_base_url', JSON.stringify('https://api.agnes-ai.cn/v1'));
      seed.run('ai_model', JSON.stringify('agnes-3.0-flash'));
      seed.run('ai_api_key', JSON.stringify(''));
      seed.run('ai_enabled', 'false');
      seed.run('reminder_enabled', 'false');
      seed.run('reminder_time', JSON.stringify('20:00'));
      seed.run('backup_keep', '7');
      // 首个默认卡组
      db.prepare(
        "INSERT INTO decks(name, parent_id, sort_order, created_at) SELECT '默认卡组', NULL, 0, ? WHERE NOT EXISTS (SELECT 1 FROM decks)"
      ).run(now);
    },
  },
];

const currentVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0;
for (const m of MIGRATIONS) {
  if (m.version > currentVersion) {
    const run = db.transaction(() => m.up());
    run();
    db.pragma(`user_version = ${m.version}`);
    console.log(`[db] migration v${m.version} applied`);
  }
}

/* ---------- 时间工具 ---------- */
export const nowISO = () => new Date().toISOString();

/** 本地时区日期键(YYYY-MM-DD),每日学习计数与热力图以此为准 */
export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 今日 23:59:59.999(本地)的 ISO 表示,用于"学习中卡片今日内到期"判定 */
export function endOfTodayISO(d: Date = new Date()): string {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e.toISOString();
}

/* ---------- settings 读写 ---------- */
export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function getAllSettings(): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

/* ---------- 卡组子树 ---------- */
/** 返回 deckId 及其全部后代 deck 的 id 列表(deckId 为空则返回 null 表示不过滤) */
export function subtreeDeckIds(deckId?: number | null): number[] | null {
  if (!deckId) return null;
  const all = db.prepare('SELECT id, parent_id FROM decks').all() as { id: number; parent_id: number | null }[];
  const ids: number[] = [];
  const walk = (pid: number) => {
    ids.push(pid);
    for (const d of all) if (d.parent_id === pid) walk(d.id);
  };
  walk(deckId);
  return ids;
}

/** 卡组完整路径(计算机::网络) */
export function deckPath(deckId: number): string {
  const q = db.prepare('SELECT id, name, parent_id FROM decks WHERE id = ?');
  let cur = q.get(deckId) as { id: number; name: string; parent_id: number | null } | undefined;
  const parts: string[] = [];
  const guard = new Set<number>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parent_id ? (q.get(cur.parent_id) as typeof cur) : undefined;
  }
  return parts.join('::');
}
