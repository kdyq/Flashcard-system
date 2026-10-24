/* P2 API 测试:node test/p2-api.mjs */
const BASE = 'http://localhost:3001';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const j = async (method, path, body, queryPath) => {
  const opts = { method };
  if (body !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + (queryPath ?? path), opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
};

console.log('== P2: 自动备份 / 还原 ==');
const RUN = Date.now().toString(36);
{
  // 造一张卡并备份
  const decks = await j('GET', '/api/decks');
  const firstDeck = decks.data.items[0]?.id;
  const card = await j('POST', '/api/cards', { deck_id: firstDeck, front_md: `P2备份测试卡-${RUN}`, back_md: 'x' });
  ok('造卡成功', card.status === 201);
  const bk = await j('POST', '/api/settings/backups/create');
  ok('立即备份', bk.status === 200 && bk.data.backups.length >= 1, JSON.stringify(bk.data.backups?.[0]));
  // 再造一张卡(备份里没有),然后还原 → 这张卡应消失
  const card2 = await j('POST', '/api/cards', { deck_id: firstDeck, front_md: `P2还原后应消失的卡-${RUN}`, back_md: 'x' });
  ok('造第二张卡', card2.status === 201);
  const before = (await j('GET', '/api/cards', undefined, `/api/cards?q=${encodeURIComponent('P2还原后应消失的卡-' + RUN)}`)).data.total;
  const rs = await j('POST', '/api/settings/backups/restore', { filename: bk.data.backups[0].filename });
  ok('还原备份', rs.status === 200 && rs.data.tables.cards > 0, JSON.stringify(rs.data.tables));
  const after = (await j('GET', '/api/cards', undefined, `/api/cards?q=${encodeURIComponent('P2还原后应消失的卡-' + RUN)}`)).data.total;
  ok('还原后多出的卡消失', before === 1 && after === 0, `before=${before} after=${after}`);
  const marker = (await j('GET', '/api/cards', undefined, `/api/cards?q=${encodeURIComponent('P2备份测试卡-' + RUN)}`)).data.total;
  ok('备份时的卡保留', marker === 1, String(marker));
  // 非法文件名
  const bad = await j('POST', '/api/settings/backups/restore', { filename: '../flashcard.db' });
  ok('拒绝非法文件名', bad.status === 400);
}

console.log('== P2: FSRS 调参 ==');
let savedW = null;
let trainCardIds = [];
{
  // 合成跨天训练数据:导入一份带历史日期 review_logs 的 JSON(优化器要求至少一次跨天复习)
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const cards = [];
  const logs = [];
  for (let c = 0; c < 4; c++) {
    const id = 9000 + c;
    cards.push({
      id, deck_id: 1, type: 'basic', front_md: `P2调参训练-${RUN}-${c}`, back_md: `答案 ${c}`,
      due: daysAgo(0), stability: 5, difficulty: 5, state: 'review', reps: 6, lapses: 1,
      last_review: daysAgo(1), elapsed_days: 1, scheduled_days: 6,
      created_at: daysAgo(30), updated_at: daysAgo(1),
    });
    const schedule = [[29, 3], [28, 3], [25, 4], [18, 3], [10, 1], [9, 3], [3, 4], [1, 3]];
    for (const [d, rating] of schedule) {
      logs.push({
        card_id: id, rating, state_before: 'review', stability_before: 2, difficulty_before: 5,
        due_before: daysAgo(d + 1), reps_before: 1, lapses_before: 0, last_review_before: daysAgo(d + 2),
        elapsed_days_before: 0, scheduled_days_before: 1, learning_steps_before: 0,
        stability_after: 3, difficulty_after: 5, due_after: daysAgo(Math.max(0, d - 6)),
        elapsed_days: 1, scheduled_days: 6, review_time: daysAgo(d), day_key: daysAgo(d).slice(0, 10),
      });
    }
  }
  const dump = { format: 'fanfan-export', version: 1, exported_at: daysAgo(0), decks: [{ id: 1, name: `P2调参导入-${RUN}`, parent_id: null, sort_order: 0, created_at: daysAgo(30) }], cards, review_logs: logs, tags: [], card_tags: [] };
  const fd = new FormData();
  fd.append('file', new File([JSON.stringify(dump)], 'train.json', { type: 'application/json' }));
  fd.append('mode', 'merge');
  const imp = await fetch(BASE + '/api/import', { method: 'POST', body: fd }).then(r => r.json());
  ok('导入训练数据', imp.imported === 4, JSON.stringify(imp).slice(0, 120));

  const s0 = await j('GET', '/api/settings');
  const logsCount = s0.data._logsCount;
  console.log(`    当前日志 ${logsCount} 条`);
  ok('已凑够训练日志', logsCount >= 12, String(logsCount));
  const tooFew = await j('POST', '/api/settings/optimize', { minLogs: 99999 });
  ok('门槛拦截生效', tooFew.status === 400, JSON.stringify(tooFew.data?.error).slice(0, 80));
  const force = await j('POST', '/api/settings/optimize', { minLogs: 10 });
  ok('优化成功返回21参数', force.status === 200 && Array.isArray(force.data.w) && force.data.w.length === 21,
    JSON.stringify(force.data).slice(0, 200));
  savedW = force.data?.w;
  const s1 = await j('GET', '/api/settings');
  ok('参数已保存', Array.isArray(s1.data.fsrs_params?.w) && s1.data.fsrs_params.w.length === 21);
  const q = await j('GET', '/api/study/queue');
  ok('个性化参数下队列正常', q.status === 200 && Array.isArray(q.data.queue));
  const rd = await j('POST', '/api/settings/reset-fsrs');
  const s2 = await j('GET', '/api/settings');
  ok('恢复默认参数', rd.status === 200 && s2.data.fsrs_params === null);

  // 清理训练数据(级联删日志)与临时卡组
  const found = await j('GET', '/api/cards', undefined, `/api/cards?q=${encodeURIComponent('P2调参训练-' + RUN)}&limit=50`);
  trainCardIds = found.data.items.map(x => x.id);
  if (trainCardIds.length) {
    const del = await j('POST', '/api/cards/batch', { ids: trainCardIds, action: 'delete' });
    ok('清理训练数据', del.data.affected === trainCardIds.length);
  }
  const deckAll = await j('GET', '/api/decks');
  const flatDecks = [];
  (function w(ns) { ns.forEach(n => { flatDecks.push(n); w(n.children || []); }); })(deckAll.data.items);
  const td = flatDecks.find(d => d.name === `P2调参导入-${RUN}`);
  if (td) await j('DELETE', `/api/decks/${td.id}`);
}

console.log('== P2: 提醒设置 ==');
{
  const put = await j('PUT', '/api/settings', { reminder_enabled: true, reminder_time: '19:30' });
  ok('保存提醒设置', put.status === 200);
  const s = await j('GET', '/api/settings');
  ok('设置回读一致', s.data.reminder_enabled === true && s.data.reminder_time === '19:30');
  await j('PUT', '/api/settings', { reminder_enabled: false, reminder_time: '20:00' });
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
