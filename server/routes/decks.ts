import { Router } from 'express';
import { db, nowISO, subtreeDeckIds } from '../db';

const router = Router();

interface DeckNode {
  id: number; name: string; parent_id: number | null; sort_order: number;
  counts: { total: number; due: number; new: number };
  children: DeckNode[];
}

/** 卡组树(含子树汇总计数:总卡数 / 当前到期 / 新卡) */
router.get('/', (_req, res) => {
  const decks = db.prepare('SELECT * FROM decks ORDER BY sort_order, id').all() as any[];
  const now = new Date().toISOString();
  const countFor = (ids: number[]) => {
    if (!ids.length) return { total: 0, due: 0, new: 0 };
    const ph = ids.map(() => '?').join(',');
    const total = (db.prepare(`SELECT COUNT(*) c FROM cards WHERE deck_id IN (${ph})`).get(...ids) as any).c;
    const due = (db.prepare(
      `SELECT COUNT(*) c FROM cards WHERE deck_id IN (${ph}) AND state != 'new' AND due <= ? AND suspended = 0`
    ).get(...ids, now) as any).c;
    const fresh = (db.prepare(
      `SELECT COUNT(*) c FROM cards WHERE deck_id IN (${ph}) AND state = 'new' AND suspended = 0`
    ).get(...ids) as any).c;
    return { total, due, new: fresh };
  };
  const nodes = new Map<number, DeckNode>();
  for (const d of decks) {
    nodes.set(d.id, { ...d, counts: { total: 0, due: 0, new: 0 }, children: [] });
  }
  const roots: DeckNode[] = [];
  for (const d of decks) {
    const node = nodes.get(d.id)!;
    if (d.parent_id && nodes.has(d.parent_id)) nodes.get(d.parent_id)!.children.push(node);
    else roots.push(node);
  }
  // 自底向上汇总计数
  const fill = (n: DeckNode): { total: number; due: number; new: number } => {
    const ids = subtreeDeckIds(n.id)!;
    n.counts = countFor(ids);
    return n.counts;
  };
  const walk = (n: DeckNode) => { n.children.forEach(walk); fill(n); };
  roots.forEach(walk);
  res.json({ items: roots });
});

router.post('/', (req, res) => {
  const { name, parent_id = null, sort_order = 0 } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '卡组名称不能为空' });
  if (parent_id != null) {
    const parent = db.prepare('SELECT id FROM decks WHERE id = ?').get(parent_id);
    if (!parent) return res.status(404).json({ error: '父卡组不存在' });
  }
  const info = db.prepare('INSERT INTO decks(name, parent_id, sort_order, created_at) VALUES(?,?,?,?)')
    .run(String(name).trim(), parent_id, sort_order ?? 0, nowISO());
  res.status(201).json(db.prepare('SELECT * FROM decks WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(id) as any;
  if (!deck) return res.status(404).json({ error: '卡组不存在' });
  const { name, parent_id, sort_order } = req.body ?? {};
  if (parent_id !== undefined && parent_id !== null) {
    if (parent_id === id) return res.status(400).json({ error: '不能把卡组移动到自己名下' });
    const ids = subtreeDeckIds(id) ?? [];
    if (ids.includes(Number(parent_id))) return res.status(400).json({ error: '不能把卡组移动到自己的子卡组下' });
    if (!db.prepare('SELECT id FROM decks WHERE id = ?').get(parent_id)) return res.status(404).json({ error: '目标父卡组不存在' });
  }
  db.prepare('UPDATE decks SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?').run(
    name !== undefined ? String(name).trim() : deck.name,
    parent_id !== undefined ? parent_id : deck.parent_id,
    sort_order !== undefined ? sort_order : deck.sort_order,
    id
  );
  res.json(db.prepare('SELECT * FROM decks WHERE id = ?').get(id));
});

/** 删除卡组(级联删除其卡片,前端需二次确认) */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(id);
  if (!deck) return res.status(404).json({ error: '卡组不存在' });
  const ids = subtreeDeckIds(id) ?? [];
  let cards = 0;
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    cards = (db.prepare(`SELECT COUNT(*) c FROM cards WHERE deck_id IN (${ph})`).get(...ids) as any).c;
  }
  db.prepare('DELETE FROM decks WHERE id = ?').run(id);
  res.json({ ok: true, deletedCards: cards });
});

export default router;
