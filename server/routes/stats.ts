import { Router } from 'express';
import { db, localDayKey } from '../db';

const router = Router();

/** 连续天数:从今天(或昨天)往回数有复习记录的连续天数 */
function streaks(): { current: number; longest: number } {
  const days = (db.prepare('SELECT DISTINCT day_key FROM review_logs ORDER BY day_key DESC') as any)
    .all().map((r: any) => r.day_key) as string[];
  if (!days.length) return { current: 0, longest: 0 };
  const set = new Set(days);
  // longest
  let longest = 1, run = 1;
  const asc = [...days].sort();
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1] + 'T00:00:00');
    const cur = new Date(asc[i] + 'T00:00:00');
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    run = diff === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  // current
  const today = localDayKey();
  const yest = localDayKey(new Date(Date.now() - 86400000));
  let cursor = set.has(today) ? today : set.has(yest) ? yest : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = localDayKey(new Date(new Date(cursor + 'T12:00:00').getTime() - 86400000));
  }
  return { current, longest };
}

/** 仪表盘:今日数字、到期、连续天数、保留率 */
router.get('/dashboard', (_req, res) => {
  const today = localDayKey();
  const counts = db.prepare('SELECT state_before, COUNT(*) c FROM review_logs WHERE day_key = ? GROUP BY state_before')
    .all(today) as { state_before: string; c: number }[];
  let todayNew = 0, todayReviews = 0;
  for (const r of counts) { if (r.state_before === 'new') todayNew += r.c; else todayReviews += r.c; }
  const now = new Date().toISOString();
  const dueNow = (db.prepare(
    "SELECT COUNT(*) c FROM cards WHERE state != 'new' AND due <= ? AND suspended = 0 AND (buried_until IS NULL OR buried_until <= ?)"
  ).get(now, now) as any).c;
  const newNow = (db.prepare("SELECT COUNT(*) c FROM cards WHERE state = 'new' AND suspended = 0").get() as any).c;
  const totalCards = (db.prepare('SELECT COUNT(*) c FROM cards').get() as any).c;
  const totalReviews = (db.prepare('SELECT COUNT(*) c FROM review_logs').get() as any).c;

  // 保留率:近 30 天复习态卡片中非「重来」比例
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const ret = db.prepare(
    "SELECT COUNT(*) total, SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) again FROM review_logs WHERE state_before = 'review' AND review_time >= ?"
  ).get(since) as { total: number; again: number | null };
  const retention = ret.total > 0 ? 1 - (ret.again ?? 0) / ret.total : null;

  res.json({
    todayNew, todayReviews, dueNow, newNow, totalCards, totalReviews,
    retention, ...streaks(),
  });
});

/** 热力图:最近 N 周(列=周,周一起始),count=当日复习次数,level 0-4 */
router.get('/heatmap', (req, res) => {
  const weeks = Math.min(52, Math.max(4, Number(req.query.weeks) || 18));
  const today = new Date();
  const dowMon = (today.getDay() + 6) % 7; // 周一=0
  const lastMonday = new Date(today); lastMonday.setDate(today.getDate() - dowMon);
  const start = new Date(lastMonday); start.setDate(lastMonday.getDate() - (weeks - 1) * 7);
  const rows = db.prepare('SELECT day_key, COUNT(*) c FROM review_logs GROUP BY day_key') as any;
  const map = new Map<string, number>();
  for (const r of rows.all()) map.set(r.day_key, r.c);
  const days: { date: string; count: number; level: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = localDayKey(d);
    const count = map.get(key) ?? 0;
    const level = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
    days.push({ date: key, count, level, future: d > today });
  }
  res.json({ weeks, days, max: Math.max(1, ...days.map(d => d.count)) });
});

/** 未来负荷:未来 N 天每天到期的复习卡数(逾期计入今天) */
router.get('/forecast', (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const now = new Date();
  const rows = db.prepare(
    "SELECT due, state FROM cards WHERE state != 'new' AND suspended = 0"
  ).all() as { due: string; state: string }[];
  const buckets = new Map<string, number>();
  const todayKey = localDayKey(now);
  for (let i = 0; i < days; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    buckets.set(localDayKey(d), 0);
  }
  for (const r of rows) {
    const dueLocal = localDayKey(new Date(r.due));
    if (dueLocal <= todayKey) buckets.set(todayKey, (buckets.get(todayKey) ?? 0) + 1);
    else if (buckets.has(dueLocal)) buckets.set(dueLocal, (buckets.get(dueLocal) ?? 0) + 1);
  }
  res.json({ days: [...buckets.entries()].map(([date, count]) => ({ date, count })) });
});

export default router;
