/* 翻翻 API 冒烟测试:node test/smoke-api.mjs(需后端已启动于 3001) */
const BASE = 'http://localhost:3001';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const j = async (method, path, body, isForm = false) => {
  const opts = { method };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
};

console.log('== 1. health ==');
{
  const { status, data } = await j('GET', '/api/health');
  ok('health 200', status === 200 && data.ok === true);
}

console.log('== 2. 卡组 ==');
let deckId;
{
  const created = await j('POST', '/api/decks', { name: '冒烟测试卡组' });
  deckId = created.data?.id;
  ok('创建卡组', created.status === 201 && deckId > 0, JSON.stringify(created.data));
  const sub = await j('POST', '/api/decks', { name: '子卡组', parent_id: deckId });
  ok('创建子卡组', sub.status === 201 && sub.data.parent_id === deckId);
  const bad = await j('PATCH', `/api/decks/${deckId}`, { parent_id: sub.data.id });
  ok('阻止环引用', bad.status === 400);
}

console.log('== 3. 卡片批量创建 ==');
{
  const cards = [
    { deck_id: deckId, front_md: 'TCP 三次握手的目的?', back_md: '同步双方**序列号**,建立可靠连接', tags: ['网络', '测试'] },
    { deck_id: deckId, front_md: '一元二次方程求根公式', back_md: '$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$', tags: ['数学'] },
    { deck_id: deckId, front_md: 'multi-line', back_md: '第一行\n\n第二行' },
    { deck_id: deckId, front_md: '单字段', back_md: null },
    { deck_id: deckId, front_md: '第5张', back_md: 'five' },
  ];
  const { status, data } = await j('POST', '/api/cards', { cards });
  ok('批量创建5张', status === 201 && data.count === 5, JSON.stringify(data));
  const empty = await j('POST', '/api/cards', { deck_id: deckId, front_md: '  ' });
  ok('空正面被拒', empty.status === 400);
  const search = await j('GET', '/api/cards?q=握手');
  ok('搜索命中', search.data.total === 1);
}

console.log('== 4. 学习队列 ==');
let firstCard, logId;
{
  const { data } = await j('GET', `/api/study/queue?deckId=${deckId}`);
  ok('队列含5张新卡', data.queue.length === 5, `实际 ${data.queue.length}`);
  ok('有四档间隔预览', data.queue[0] && Object.keys(data.queue[0].previews).length === 4);
  firstCard = data.queue[0];
  const pv = firstCard.previews;
  console.log(`    预览: ${pv['1']} / ${pv['2']} / ${pv['3']} / ${pv['4']}`);
}

console.log('== 5. 评分与 FSRS 状态流转 ==');
{
  const r1 = await j('POST', '/api/study/review', { cardId: firstCard.id, rating: 3 });
  logId = r1.data?.logId;
  ok('新卡 good → learning', r1.data.state === 'learning', JSON.stringify(r1.data));
  ok('间隔为分钟级(学习步)', /分钟/.test(r1.data.interval), r1.data.interval);
  ok('今日内重进队列', r1.data.requeueToday === true);
  const r2 = await j('POST', '/api/study/review', { cardId: firstCard.id, rating: 3 });
  ok('再次 good → 毕业 review', r2.data.state === 'review', JSON.stringify(r2.data));
  ok('间隔为天级', /天|小时/.test(r2.data.interval), r2.data.interval);
}

console.log('== 6. 撤销 ==');
{
  const u1 = await j('POST', '/api/study/undo', {});
  ok('撤销最近评分', u1.status === 200 && u1.data.cardId === firstCard.id);
  const card = await j('GET', `/api/cards/${firstCard.id}`);
  ok('回滚到 learning', card.data.state === 'learning', card.data.state);
  const u2 = await j('POST', '/api/study/undo', {});
  ok('二次撤销回 new', u2.status === 200 && (await j('GET', `/api/cards/${firstCard.id}`)).data.state === 'new');
  // 重新学一遍,为后续统计制造数据
  await j('POST', '/api/study/review', { cardId: firstCard.id, rating: 3 });
  await j('POST', '/api/study/review', { cardId: firstCard.id, rating: 3 });
}

console.log('== 7. 每日上限 ==');
{
  await j('PUT', '/api/settings', { daily_new_limit: 2 });
  const { data } = await j('GET', `/api/study/queue?deckId=${deckId}`);
  const newCount = data.queue.filter(c => c.kind === 'new').length;
  ok('新卡上限生效(≤2)', newCount <= 2, `实际 ${newCount}`);
  await j('PUT', '/api/settings', { daily_new_limit: 20 });
  const s = await j('GET', '/api/settings');
  ok('设置还原', s.data.daily_new_limit === 20);
  ok('api_key 不回传', !('ai_api_key' in s.data));
}

console.log('== 8. 统计 ==');
{
  const d = await j('GET', '/api/stats/dashboard');
  ok('仪表盘今日数字>0', d.data.todayNew > 0 && d.data.todayReviews > 0, JSON.stringify(d.data));
  ok('连续天数≥1', d.data.current >= 1);
  const h = await j('GET', '/api/stats/heatmap?weeks=18');
  ok('热力图 126 格', h.data.days.length === 18 * 7);
  const todayKey = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD 本地
  const today = h.data.days.find(d => d.date === todayKey);
  ok('今日格有计数', today && today.count > 0, JSON.stringify(today));
  const f = await j('GET', '/api/stats/forecast?days=30');
  ok('未来负荷30天', f.data.days.length === 30);
}

console.log('== 9. CSV 导入(本系统格式)==');
{
  const fs = await import('node:fs');
  const csv = fs.readFileSync(new URL('./sample-basic.csv', import.meta.url));
  const fd = new FormData();
  fd.append('file', new File([csv], 'sample-basic.csv', { type: 'text/csv' }));
  fd.append('deckId', String(deckId));
  const r = await j('POST', '/api/import', fd, true);
  ok('导入成功', r.status === 200 && r.data.imported === 8, JSON.stringify(r.data));
  const again = await j('POST', '/api/import', fd, true);
  ok('重复导入全部跳过', again.data.imported === 0 && again.data.skipped === 8, JSON.stringify(again.data));
}

console.log('== 10. CSV 导入(Anki 格式,含HTML)==');
{
  const fs = await import('node:fs');
  const txt = fs.readFileSync(new URL('./sample-anki-export.txt', import.meta.url));
  const fd = new FormData();
  fd.append('file', new File([txt], 'anki.txt', { type: 'text/plain' }));
  const r = await j('POST', '/api/import', fd, true);
  ok('Anki 导入成功', r.status === 200 && r.data.imported === 7, JSON.stringify(r.data));
  const list = await j('GET', `/api/cards?deckId=${r.data.deckId}&q=capital`);
  const back = list.data.items[0]?.back_md ?? '';
  ok('HTML 已剥离(保留加粗语义)', !/[<>]/.test(back) && back.includes('Paris'), back);
  const nl = await j('GET', `/api/cards?deckId=${r.data.deckId}&q=newline`);
  ok('<br> 转换行', nl.data.items[0]?.back_md?.includes('\n'), JSON.stringify(nl.data.items?.[0]?.back_md));
}

console.log('== 11. 导出 → 清库 → 导入还原 ==');
{
  const exp = await fetch(BASE + '/api/export');
  const dump = await exp.json();
  ok('导出含全部表', dump.format === 'fanfan-export' && dump.cards.length > 10 && Array.isArray(dump.review_logs));
  const blob = JSON.stringify(dump);
  const fd = new FormData();
  fd.append('file', new File([blob], 'backup.json', { type: 'application/json' }));
  fd.append('mode', 'overwrite');
  const r = await j('POST', '/api/import', fd, true);
  ok('覆盖导入成功', r.status === 200, JSON.stringify(r.data));
  const after = await j('GET', '/api/cards?limit=200');
  ok('卡片数量一致', after.data.total === dump.cards.length, `${after.data.total} vs ${dump.cards.length}`);
  const d2 = await j('GET', '/api/stats/dashboard');
  ok('复习日志保留', d2.data.totalReviews === dump.review_logs.length, `${d2.data.totalReviews} vs ${dump.review_logs.length}`);
}

console.log('== 12. 媒体上传 ==');
{
  // 1x1 红色 PNG
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const fd = new FormData();
  fd.append('file', new File([png], 'dot.png', { type: 'image/png' }));
  const r = await j('POST', '/api/media', fd, true);
  ok('上传返回 url', r.status === 201 && r.data.url.startsWith('/uploads/'), JSON.stringify(r.data));
  const img = await fetch(BASE + r.data.url);
  ok('静态可访问', img.status === 200 && img.headers.get('content-type')?.includes('image'));
  const bad = new FormData();
  bad.append('file', new File([new Uint8Array([1, 2, 3])], 'x.exe', { type: 'application/x-msdownload' }));
  const rb = await j('POST', '/api/media', bad, true);
  ok('拒绝非图片/音频', rb.status !== 201);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
