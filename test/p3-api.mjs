/* P3 双服务真实验收:node test/p3-api.mjs(需 .env 已配好两把 Key) */
const BASE = 'http://127.0.0.1:3001';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const showErr = (r) => r.err ? ` [${r.err}]` : (r.data === null ? ` [status ${r.status},空响应]` : '');
const j = async (method, path, body) => {
  const opts = { method };
  if (body !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  try {
    const r = await fetch(BASE + path, opts);
    let data = null;
    try { data = await r.json(); } catch {}
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: null, err: e.cause?.message || e.message };
  }
};

// 等后端就绪
for (let i = 0; i < 20; i++) {
  const h = await j('GET', '/api/health');
  if (h.status === 200) break;
  await new Promise(r2 => setTimeout(r2, 1000));
}

const NOTE = `光合作用是绿色植物利用光能,把二氧化碳和水转化为储存能量的有机物(主要是淀粉),并释放氧气的过程。
反应场所是叶绿体,光反应在类囊体薄膜上进行,暗反应(卡尔文循环)在基质中进行。
ephemeral 意为"短暂的、转瞬即逝的"。`;

console.log('== P3: Agnes(默认服务) ==');
{
  await j('PUT', '/api/settings', {
    ai_base_url: 'https://api.agnes-ai.cn/v1',
    ai_model: 'agnes-3.0-flash',
    ai_enabled: true,
  });
  const t = await j('POST', '/api/ai/test', {});
  ok('连通测试', t.status === 200 && t.data.ok === true,
    JSON.stringify(t.data).slice(0, 200));
  if (t.data?.latencyMs) console.log(`    延迟 ${t.data.latencyMs}ms,Key 来源 ${t.data.keySource}`);
  const g = await j('POST', '/api/ai/generate', { text: NOTE, count: 5 });
  ok('生成5张草稿', g.status === 200 && g.data?.cards?.length >= 3,
    JSON.stringify(g.data).slice(0, 300));
  if (g.status === 200 && g.data?.cards?.length) {
    console.log(`    示例草稿: ${g.data.cards[0].front.slice(0, 50)}`);
    ok('草稿含front/back', g.data.cards.every(c => c.front && c.back !== undefined));
    ok('输出不含Key', !JSON.stringify(g.data).includes('sk-'));
  }
  // 草稿入库
  const mk = await j('POST', '/api/decks', { name: 'P3-AI生成验收' });
  if (g.status === 200 && g.data?.cards?.length) {
    const saved = await j('POST', '/api/cards', {
      cards: g.data.cards.slice(0, 3).map(c => ({ deck_id: mk.data.id, type: c.type, front_md: c.front, back_md: c.back, tags: c.tags })),
    });
    ok('草稿批量入库', saved.status === 201 && saved.data.count === 3, JSON.stringify(saved.data).slice(0, 120));
  } else {
    ok('草稿批量入库', false, '生成失败,跳过入库');
  }
}

console.log('== P3: 基元律动 TokenRhythm(第二服务) ==');
{
  await j('PUT', '/api/settings', {
    ai_base_url: 'https://tokenrhythm.studio/v1',
    ai_model: 'deepseek-v4.1-flash-1017',
    ai_api_key: '__CLEAR__',
  });
  const t = await j('POST', '/api/ai/test', {});
  ok('换服务连通', t.status === 200 && t.data.ok === true,
    JSON.stringify(t.data).slice(0, 200));
  if (t.data?.latencyMs) console.log(`    延迟 ${t.data.latencyMs}ms,Key 来源 ${t.data.keySource}`);
  const g = await j('POST', '/api/ai/generate', { text: NOTE, count: 3 });
  ok('换服务生成', g.status === 200 && g.data.cards?.length >= 2,
    JSON.stringify(g.data).slice(0, 300));
  if (g.data?.cards?.length) console.log(`    示例草稿: ${g.data.cards[0].front.slice(0, 50)}`);
}

console.log('== P3: 收尾 ==');
{
  // 未启用拦截
  await j('PUT', '/api/settings', { ai_enabled: false });
  const g = await j('POST', '/api/ai/generate', { text: NOTE, count: 2 });
  ok('未启用时拒绝生成', g.status === 403);
  // 恢复 Agnes 默认并启用
  await j('PUT', '/api/settings', {
    ai_base_url: 'https://api.agnes-ai.cn/v1',
    ai_model: 'agnes-3.0-flash',
    ai_enabled: true,
  });
  const s = await j('GET', '/api/settings');
  ok('Key 不出现在设置响应', !JSON.stringify(s.data).match(/sk-[A-Za-z0-9]{10,}/));
  ok('恢复默认服务', s.data.ai_base_url.includes('agnes') && s.data.ai_enabled === true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
