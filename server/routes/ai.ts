import { Router } from 'express';
import { db, getSetting } from '../db';

const router = Router();

/* ---------- 配置解析:settings 表 > .env;Key 永不回传前端 ---------- */
interface AIConfig { baseUrl: string; model: string; apiKey: string; source: string }

export function resolveAIConfig(override?: { baseUrl?: string; model?: string; apiKey?: string }): AIConfig {
  const sBaseUrl = String(getSetting('ai_base_url', 'https://api.agnes-ai.cn/v1'));
  const sModel = String(getSetting('ai_model', 'agnes-3.0-flash'));
  const sKey = String(getSetting<string>('ai_api_key', ''));

  let baseUrl = (override?.baseUrl || sBaseUrl).trim().replace(/\/+$/, '');
  let model = (override?.model || sModel).trim();
  let apiKey = (override?.apiKey || sKey).trim();
  let source = override?.apiKey ? '请求参数' : sKey ? '设置页' : '未配置';

  if (!apiKey) {
    // .env 兜底:按 base_url 匹配服务商密钥
    if (/tokenrhythm/i.test(baseUrl) && process.env.TOKENRHYTHM_API_KEY) {
      apiKey = process.env.TOKENRHYTHM_API_KEY;
      source = '.env(tokenrhythm)';
    } else if (process.env.AGNES_API_KEY) {
      apiKey = process.env.AGNES_API_KEY;
      source = '.env(agnes)';
    }
  }
  return { baseUrl, model, apiKey, source };
}

/** OpenAI 兼容 Chat Completions 转发 */
async function chat(cfg: AIConfig, messages: { role: string; content: string }[], opts: {
  jsonMode?: boolean; maxTokens?: number; timeoutMs?: number; allowEmpty?: boolean;
} = {}): Promise<{ content: string; latencyMs: number }> {
  if (!cfg.apiKey) throw new Error('未配置 API Key(设置页或 .env)');
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - t0;
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      throw new Error(`上游返回 ${r.status}:${text}`);
    }
    const data: any = await r.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content ?? msg?.reasoning_content;
    if ((typeof content !== 'string' || !content.trim()) && !opts.allowEmpty) {
      throw new Error('上游返回了空内容');
    }
    return { content: typeof content === 'string' ? content : '', latencyMs };
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('请求超时(90s)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 连通性测试 ---------- */
router.post('/test', async (req, res) => {
  const { baseUrl, model, apiKey } = req.body ?? {};
  const cfg = resolveAIConfig({ baseUrl, model, apiKey });
  try {
    const { content, latencyMs } = await chat(cfg, [
      { role: 'user', content: '请只回复四个字:连接正常' },
    ], { maxTokens: 64, timeoutMs: 60000, allowEmpty: true });
    res.json({ ok: true, model: cfg.model, latencyMs, reply: content.slice(0, 50) || '(HTTP 200,模型返回空文本)', keySource: cfg.source });
  } catch (e: any) {
    res.status(502).json({ error: e.message, model: cfg.model, keySource: cfg.source });
  }
});

/* ---------- 生成卡片草稿 ---------- */
const SYSTEM_PROMPT = `你是闪卡制作助手。根据用户提供的笔记内容,生成间隔重复闪卡。
要求:
1. 输出 JSON,形如 {"cards":[{"front":"问题","back":"答案","tags":["标签"],"type":"basic"}]}
2. 每张卡聚焦单一知识点,正面是一个明确的问题或待回忆项
3. 数学公式用 LaTeX:行内 $...$,独立公式 $$...$$
4. type 取 "basic"(问答)或 "cloze"(填空,正面用 {{c1::被挖空内容}} 语法)
5. tags 为 1-3 个简短标签
6. 严禁编造笔记之外的内容;语言与笔记一致`;

function extractCards(raw: string): any[] {
  let text = raw.trim();
  // 剥掉 ```json 围栏
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  // 直接解析
  const attempts: any[] = [text];
  // 截取最外层 {} 或 []
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.push(text.slice(firstBrace, lastBrace + 1));
  if (firstBracket >= 0 && lastBracket > firstBracket) attempts.push(text.slice(firstBracket, lastBracket + 1));
  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      const list = Array.isArray(parsed) ? parsed : parsed.cards;
      if (Array.isArray(list)) return list;
    } catch { /* 试下一种 */ }
  }
  // 最后兜底:逐个抽取 {...} 对象
  const out: any[] = [];
  for (const m of text.matchAll(/\{[^{}]*"front"[\s\S]*?\}/g)) {
    try { out.push(JSON.parse(m[0])); } catch { /* 跳过 */ }
  }
  return out;
}

router.post('/generate', async (req, res) => {
  const { text, count = 5, deckId } = req.body ?? {};
  const note = String(text ?? '').trim();
  if (!note) return res.status(400).json({ error: '笔记内容不能为空' });
  const n = Math.min(20, Math.max(1, Math.floor(Number(count) || 5)));
  if (deckId && !db.prepare('SELECT id FROM decks WHERE id = ?').get(Number(deckId))) {
    return res.status(400).json({ error: '目标卡组不存在' });
  }
  if (!getSetting<boolean>('ai_enabled', false)) {
    return res.status(403).json({ error: 'AI 功能未启用,请先在设置页开启' });
  }
  const cfg = resolveAIConfig();
  try {
    const { content, latencyMs } = await chat(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `笔记内容:\n${note}\n\n请生成 ${n} 张闪卡。` },
    ], { jsonMode: true, maxTokens: 8192, timeoutMs: 180000 });
    const cards = extractCards(content)
      .filter((c: any) => typeof c.front === 'string' && c.front.trim())
      .slice(0, n)
      .map((c: any) => ({
        front: String(c.front).trim(),
        back: c.back == null ? '' : String(c.back).trim(),
        tags: Array.isArray(c.tags) ? c.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 3) : [],
        type: c.type === 'cloze' ? 'cloze' : 'basic',
      }));
    if (!cards.length) throw new Error('未能从模型输出中解析出卡片');
    res.json({ ok: true, cards, latencyMs, model: cfg.model, raw: content.length });
  } catch (e: any) {
    res.status(502).json({ error: e.message, model: cfg.model });
  }
});

export default router;
