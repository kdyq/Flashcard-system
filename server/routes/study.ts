import { Router } from 'express';
import { db, nowISO, localDayKey, endOfTodayISO, subtreeDeckIds, getSetting, type CardRow, type LogRow } from '../db';
import { gradeRow, previewIntervals, formatInterval } from '../fsrs';

const router = Router();

/** 今日已学计数(以 review_logs 当日记录为准,本地时区日界) */
function todayCounts(): { newDone: number; reviewDone: number } {
  const rows = db.prepare('SELECT state_before, COUNT(*) c FROM review_logs WHERE day_key = ? GROUP BY state_before')
    .all(localDayKey()) as { state_before: string; c: number }[];
  let newDone = 0, reviewDone = 0;
  for (const r of rows) {
    if (r.state_before === 'new') newDone += r.c;
    else reviewDone += r.c; // review + learning/relearning 的复习都计入复习数
  }
  return { newDone, reviewDone };
}

const notBlocked = 'suspended = 0 AND (buried_until IS NULL OR buried_until <= ?)';

function deckFilterSQL(deckId?: number | null): { sql: string; params: any[] } {
  const ids = deckId ? subtreeDeckIds(Number(deckId)) : null;
  if (ids && ids.length) return { sql: `deck_id IN (${ids.map(() => '?').join(',')})`, params: ids };
  if (ids && !ids.length) return { sql: '0', params: [] };
  return { sql: '1', params: [] };
}

/** 今日学习队列:学习中插队 → 复习 → 每 3 张复习插 1 张新卡 */
router.get('/queue', (req, res) => {
  const now = new Date();
  const nowISOStr = now.toISOString();
  const newLimit = getSetting<number>('daily_new_limit', 20);
  const reviewLimit = getSetting<number>('daily_review_limit', 200);
  const { newDone, reviewDone } = todayCounts();
  const newQuota = Math.max(0, newLimit - newDone);
  const reviewQuota = Math.max(0, reviewLimit - reviewDone);
  const { sql: deckSQL, params: deckParams } = deckFilterSQL(req.query.deckId ? Number(req.query.deckId) : null);

  const attach = (rows: CardRow[], kind: string) => rows.map(c => {
    const tags = db.prepare('SELECT t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = ? ORDER BY t.name')
      .all(c.id).map((r: any) => r.name);
    const deckName = (db.prepare('SELECT name FROM decks WHERE id = ?').get(c.deck_id) as any)?.name ?? '';
    return { ...c, tags, deckName, kind, previews: previewIntervals(c, now) };
  });

  // 1. 学习中卡片(learning/relearning,due 在今日内)——最高优先插队
  const learning = db.prepare(`
    SELECT * FROM cards WHERE state IN ('learning','relearning') AND due <= ? AND ${notBlocked} AND ${deckSQL}
    ORDER BY due ASC
  `).all(endOfTodayISO(), nowISOStr, ...deckParams) as CardRow[];

  // 2. 复习队列
  const reviews = db.prepare(`
    SELECT * FROM cards WHERE state = 'review' AND due <= ? AND ${notBlocked} AND ${deckSQL}
    ORDER BY due ASC LIMIT ?
  `).all(nowISOStr, nowISOStr, ...deckParams, reviewQuota) as CardRow[];

  // 3. 新卡队列
  const news = db.prepare(`
    SELECT * FROM cards WHERE state = 'new' AND ${notBlocked} AND ${deckSQL}
    ORDER BY created_at ASC, id ASC LIMIT ?
  `).all(nowISOStr, ...deckParams, newQuota) as CardRow[];

  // 4. 交织:每 3 张复习后插 1 张新卡(Anki 行为,比例常数可调)
  const MIX_EVERY = 3;
  const kindOf = new Map<number, string>();
  let ni = 0;
  learning.forEach(c => kindOf.set(c.id, 'learning'));
  reviews.forEach(c => kindOf.set(c.id, 'review'));
  news.forEach(c => kindOf.set(c.id, 'new'));
  const out: CardRow[] = [...learning];
  reviews.forEach((c, i) => {
    out.push(c);
    if ((i + 1) % MIX_EVERY === 0 && ni < news.length) out.push(news[ni++]);
  });
  while (ni < news.length) out.push(news[ni++]);

  const queue = out.map(c => attach([c], kindOf.get(c.id) ?? 'review')[0]);

  // 剩余未入队到期数(超出上限被截断的部分)
  const dueRemaining = (db.prepare(`
    SELECT COUNT(*) c FROM cards WHERE state = 'review' AND due <= ? AND ${notBlocked} AND ${deckSQL}
  `).get(nowISOStr, nowISOStr, ...deckParams) as any).c - reviews.length;

  res.json({
    queue,
    today: { newDone, reviewDone, newLimit, reviewLimit },
    dueRemaining: Math.max(0, dueRemaining),
    generatedAt: nowISOStr,
  });
});

/** 评分 */
router.post('/review', (req, res) => {
  const { cardId, rating, clozeIndex = null } = req.body ?? {};
  if (!cardId) return res.status(400).json({ error: '缺少 cardId' });
  const ratingNum = Number(rating);
  if (![1, 2, 3, 4].includes(ratingNum)) return res.status(400).json({ error: 'rating 必须是 1-4' });
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(Number(cardId)) as CardRow | undefined;
  if (!card) return res.status(404).json({ error: '卡片不存在' });

  const now = new Date();
  const { patch } = gradeRow(card, ratingNum as 1 | 2 | 3 | 4, now);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE cards SET due=?, stability=?, difficulty=?, state=?, reps=?, lapses=?, last_review=?,
        elapsed_days=?, scheduled_days=?, learning_steps=?, updated_at=? WHERE id=?
    `).run(patch.due, patch.stability, patch.difficulty, patch.state, patch.reps, patch.lapses,
      patch.last_review, patch.elapsed_days, patch.scheduled_days, patch.learning_steps, nowISO(), card.id);

    const info = db.prepare(`
      INSERT INTO review_logs(card_id, rating, state_before, stability_before, difficulty_before, due_before,
        reps_before, lapses_before, last_review_before, elapsed_days_before, scheduled_days_before, learning_steps_before,
        stability_after, difficulty_after, due_after, elapsed_days, scheduled_days, review_time, day_key, cloze_index)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      card.id, ratingNum, card.state, card.stability, card.difficulty, card.due,
      card.reps, card.lapses, card.last_review, card.elapsed_days, card.scheduled_days, card.learning_steps,
      patch.stability, patch.difficulty, patch.due, patch.elapsed_days, patch.scheduled_days,
      now.toISOString(), localDayKey(now), clozeIndex
    );
    return Number(info.lastInsertRowid);
  });
  const logId = tx();

  const dueDate = new Date(patch.due);
  const { newDone, reviewDone } = todayCounts();
  const updatedRow = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as CardRow;
  res.json({
    logId,
    cardId: card.id,
    state: patch.state,
    interval: formatInterval(dueDate, now),
    due: patch.due,
    requeueToday: (patch.state === 'learning' || patch.state === 'relearning') && dueDate <= new Date(endOfTodayISO()),
    previews: previewIntervals(updatedRow, new Date(Math.max(Date.now(), dueDate.getTime()))),
    today: { newDone, reviewDone },
  });
});

/** 撤销:删除指定(或全局最近一条)评分日志并回滚卡片状态。多步撤销 = 客户端按逆序传 logId */
router.post('/undo', (req, res) => {
  const { logId } = req.body ?? {};
  const log = (logId
    ? db.prepare('SELECT * FROM review_logs WHERE id = ?').get(Number(logId)) as LogRow | undefined
    : db.prepare('SELECT * FROM review_logs ORDER BY id DESC LIMIT 1').get() as LogRow | undefined);
  if (!log) return res.status(404).json({ error: '没有可撤销的评分' });
  const later = db.prepare('SELECT id FROM review_logs WHERE card_id = ? AND id > ? LIMIT 1').get(log.card_id, log.id);
  if (later) return res.status(409).json({ error: '该评分之后此卡片已有更新的记录,请先撤销那一条' });

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE cards SET state=?, stability=?, difficulty=?, due=?, reps=?, lapses=?, last_review=?,
        elapsed_days=?, scheduled_days=?, learning_steps=?, updated_at=? WHERE id=?
    `).run(
      log.state_before, log.stability_before, log.difficulty_before, log.due_before,
      log.reps_before, log.lapses_before, log.last_review_before,
      log.elapsed_days_before, log.scheduled_days_before, log.learning_steps_before,
      nowISO(), log.card_id
    );
    db.prepare('DELETE FROM review_logs WHERE id = ?').run(log.id);
  });
  tx();
  const restored = db.prepare('SELECT * FROM cards WHERE id = ?').get(log.card_id) as CardRow;
  res.json({ ok: true, cardId: log.card_id, state: restored.state, due: restored.due });
});

export default router;
