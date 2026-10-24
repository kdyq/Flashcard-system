import { Router } from 'express';
import path from 'node:path';
import { db, getAllSettings, setSetting } from '../db';
import { computeParameters } from 'ts-fsrs-optimizer';
import { backupOnce, listBackups, restoreBackup } from '../backup';

const router = Router();

const NUM_KEYS = ['daily_new_limit', 'daily_review_limit', 'backup_keep'];
const BOOL_KEYS = ['ai_enabled', 'reminder_enabled'];
const STR_KEYS = ['ai_base_url', 'ai_model', 'reminder_time'];
const PARAM_KEYS = ['fsrs_params'];

/** ai_api_key 永不回传前端;只回传是否存在与来源 */
router.get('/', (_req, res) => {
  const s = getAllSettings();
  const fromEnv = Boolean(process.env.AGNES_API_KEY);
  const hasKey = Boolean(s.ai_api_key) || fromEnv;
  const keySource = s.ai_api_key ? 'settings' : fromEnv ? 'env' : 'none';
  delete s.ai_api_key;
  const logsCount = (db.prepare('SELECT COUNT(*) c FROM review_logs').get() as any).c;
  res.json({
    ...s,
    ai_key_present: hasKey,
    ai_key_source: keySource,
    _logsCount: logsCount,
    _backups: listBackups(),
  });
});

router.put('/', (req, res) => {
  const body = req.body ?? {};
  const out: Record<string, unknown> = {};
  for (const k of NUM_KEYS) if (body[k] !== undefined) out[k] = Math.max(0, Math.floor(Number(body[k]) || 0));
  for (const k of BOOL_KEYS) if (body[k] !== undefined) out[k] = Boolean(body[k]);
  for (const k of STR_KEYS) if (body[k] !== undefined) out[k] = String(body[k]);
  for (const k of PARAM_KEYS) if (body[k] !== undefined) out[k] = body[k];
  if (typeof body.ai_api_key === 'string') {
    if (body.ai_api_key === '__CLEAR__') out.ai_api_key = '';
    else if (body.ai_api_key.trim()) out.ai_api_key = body.ai_api_key.trim();
  }
  for (const [k, v] of Object.entries(out)) setSetting(k, v);
  res.json({ ok: true, updated: Object.keys(out) });
});

/* ================= P2:FSRS 个性化调参 ================= */
router.post('/optimize', (req, res) => {
  const minLogs = Math.max(10, Number(req.body?.minLogs) || 400);
  const logs = db.prepare('SELECT card_id, rating, review_time FROM review_logs ORDER BY card_id, id').all() as
    { card_id: number; rating: number; review_time: string }[];
  if (logs.length < minLogs) {
    return res.status(400).json({ error: `复习日志不足:当前 ${logs.length} 条,需要 ≥${minLogs} 条后再来` });
  }
  // 组装训练集:每张卡一条按时间排序的评分序列,deltaT = 距上次评分的天数
  const byCard = new Map<number, { rating: number; t: number }[]>();
  for (const l of logs) {
    if (!byCard.has(l.card_id)) byCard.set(l.card_id, []);
    byCard.get(l.card_id)!.push({ rating: l.rating, t: new Date(l.review_time).getTime() });
  }
  const trainSet: { reviews: { rating: 1 | 2 | 3 | 4; deltaT: number }[] }[] = [];
  const cardIds: number[] = [];
  for (const [cid, arr] of byCard) {
    if (arr.length < 2) continue;
    const reviews = arr.map((r, i) => ({
      rating: r.rating as 1 | 2 | 3 | 4,
      deltaT: i === 0 ? 0 : Math.max(0, Math.round((r.t - arr[i - 1].t) / 86400000)),
    }));
    // 单日内的重复复习对遗忘曲线没有信息量,跳过该卡(与 fsrs-rs 行为一致)
    if (!reviews.some(r => r.deltaT > 0)) continue;
    trainSet.push({ reviews });
    cardIds.push(cid);
  }
  if (!trainSet.length) {
    return res.status(422).json({ error: '没有跨天的复习记录,再学几天后就能优化了' });
  }
  try {
    const t0 = Date.now();
    const w = computeParameters({ trainSet, cardIds });
    const prev = getAllSettings().fsrs_params as any;
    setSetting('fsrs_params', { w, request_retention: prev?.request_retention ?? 0.9 });
    res.json({ ok: true, w, logs: logs.length, cards: trainSet.length, elapsedMs: Date.now() - t0 });
  } catch (e: any) {
    res.status(422).json({ error: `优化失败:${e.message}` });
  }
});

/** 恢复默认 FSRS 参数 */
router.post('/reset-fsrs', (_req, res) => {
  setSetting('fsrs_params', null);
  res.json({ ok: true });
});

/* ================= P2:备份 ================= */
router.post('/backups/create', async (_req, res) => {
  try {
    const dest = await backupOnce(true);
    res.json({ ok: true, filename: path.basename(dest ?? '') , backups: listBackups() });
  } catch (e: any) {
    res.status(500).json({ error: `备份失败:${e.message}` });
  }
});

router.post('/backups/restore', (req, res) => {
  const { filename } = req.body ?? {};
  try {
    const r = restoreBackup(String(filename || ''));
    res.json({ ok: true, ...r });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
