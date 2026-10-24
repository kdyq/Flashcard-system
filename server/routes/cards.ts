import { Router } from 'express';
import { db, nowISO, subtreeDeckIds, type CardRow } from '../db';

const router = Router();

const VALID_TYPES = ['basic', 'cloze', 'reversed'];

function syncTags(cardId: number, tags: string[]) {
  const clean = [...new Set(tags.map(t => String(t).trim()).filter(Boolean))];
  db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insTag = db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING');
  const insCT = db.prepare('INSERT OR IGNORE INTO card_tags(card_id, tag_id) VALUES(?, ?)');
  for (const t of clean) {
    insTag.run(t);
    const row = getTag.get(t) as { id: number } | undefined;
    if (row) insCT.run(cardId, row.id);
  }
}

function tagsOf(cardIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!cardIds.length) return map;
  const ph = cardIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT ct.card_id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id IN (${ph}) ORDER BY t.name`
  ).all(...cardIds) as { card_id: number; name: string }[];
  for (const r of rows) {
    if (!map.has(r.card_id)) map.set(r.card_id, []);
    map.get(r.card_id)!.push(r.name);
  }
  return map;
}

function insertCard(input: any): CardRow {
  const now = nowISO();
  const type = VALID_TYPES.includes(input.type) ? input.type : 'basic';
  const info = db.prepare(`
    INSERT INTO cards(deck_id, note_id, type, front_md, back_md, due, state, tts, audio_url, audio_mode, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    input.deck_id, input.note_id ?? null, type,
    String(input.front_md ?? ''), input.back_md ?? null,
    now /* 新卡 due=创建时刻,立即可学 */, 'new',
    input.tts ? 1 : 0, input.audio_url ?? null, input.audio_mode ?? null,
    now, now
  );
  const id = Number(info.lastInsertRowid);
  if (Array.isArray(input.tags)) syncTags(id, input.tags);
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow;
}

/** 卡片列表 / 搜索 / 分页 */
router.get('/', (req, res) => {
  const { deckId, q, tag, state, page: pageS = '1', limit: limitS = '50', sort = 'created' } = req.query as Record<string, string>;
  const page = Math.max(1, Number(pageS) || 1);
  const limit = Math.min(200, Math.max(1, Number(limitS) || 50));
  const where: string[] = [];
  const params: any[] = [];
  if (deckId) {
    const ids = subtreeDeckIds(Number(deckId));
    if (ids) { where.push(`c.deck_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  }
  if (q) {
    where.push('(c.front_md LIKE ? OR c.back_md LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }
  if (state) { where.push('c.state = ?'); params.push(state); }
  if (tag) {
    where.push('c.id IN (SELECT ct.card_id FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE t.name = ?)');
    params.push(tag);
  }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = sort === 'due' ? 'c.due ASC' : 'c.id DESC';
  const total = (db.prepare(`SELECT COUNT(*) c FROM cards c ${whereSQL}`).get(...params) as any).c;
  const rows = db.prepare(`SELECT c.* FROM cards c ${whereSQL} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as CardRow[];
  const tmap = tagsOf(rows.map(r => r.id));
  const items = rows.map(r => ({ ...r, tags: tmap.get(r.id) ?? [] }));
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

/** 全部标签(自动补全用) */
router.get('/tags', (_req, res) => {
  const rows = db.prepare(
    'SELECT t.id, t.name, COUNT(ct.card_id) AS usage FROM tags t LEFT JOIN card_tags ct ON ct.tag_id = t.id GROUP BY t.id ORDER BY usage DESC, t.name'
  ).all();
  res.json({ items: rows });
});

router.post('/', (req, res) => {
  const body = req.body ?? {};
  const list = Array.isArray(body.cards) ? body.cards : [body];
  if (!list.length) return res.status(400).json({ error: '没有卡片数据' });
  for (const c of list) {
    if (!c.front_md || !String(c.front_md).trim()) return res.status(400).json({ error: '正面内容不能为空' });
    if (!c.deck_id || !db.prepare('SELECT id FROM decks WHERE id = ?').get(c.deck_id)) {
      return res.status(400).json({ error: '目标卡组不存在' });
    }
  }
  const created: CardRow[] = [];
  const tx = db.transaction(() => {
    for (const c of list) created.push(insertCard(c));
  });
  tx();
  res.status(201).json({ items: created, count: created.length });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined;
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const tags = tagsOf([id]).get(id) ?? [];
  const logs = db.prepare('SELECT * FROM review_logs WHERE card_id = ? ORDER BY id DESC').all(id);
  res.json({ ...card, tags, logs });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined;
  if (!card) return res.status(404).json({ error: '卡片不存在' });
  const b = req.body ?? {};
  if (b.deck_id !== undefined && !db.prepare('SELECT id FROM decks WHERE id = ?').get(b.deck_id)) {
    return res.status(400).json({ error: '目标卡组不存在' });
  }
  db.prepare(`
    UPDATE cards SET front_md = ?, back_md = ?, deck_id = ?, suspended = ?, tts = ?, audio_url = ?, audio_mode = ?, updated_at = ?
    WHERE id = ?
  `).run(
    b.front_md !== undefined ? String(b.front_md) : card.front_md,
    b.back_md !== undefined ? b.back_md : card.back_md,
    b.deck_id !== undefined ? b.deck_id : card.deck_id,
    b.suspended !== undefined ? (b.suspended ? 1 : 0) : card.suspended,
    b.tts !== undefined ? (b.tts ? 1 : 0) : card.tts,
    b.audio_url !== undefined ? b.audio_url : card.audio_url,
    b.audio_mode !== undefined ? b.audio_mode : card.audio_mode,
    nowISO(), id
  );
  if (Array.isArray(b.tags)) syncTags(id, b.tags);
  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow;
  res.json({ ...updated, tags: tagsOf([id]).get(id) ?? [] });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM cards WHERE id = ?').get(id)) return res.status(404).json({ error: '卡片不存在' });
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
