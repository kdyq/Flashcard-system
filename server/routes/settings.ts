import { Router } from 'express';
import { getAllSettings, setSetting } from '../db';

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
  res.json({ ...s, ai_key_present: hasKey, ai_key_source: keySource });
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

export default router;
