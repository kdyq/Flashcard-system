/* P1 API 专项测试:node test/p1-api.mjs */
const BASE = 'http://localhost:3001';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const j = async (method, path, body) => {
  const opts = { method };
  if (body !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
};

console.log('== P1: 填空卡 ==');
let clozeCardId, deckId;
{
  const deck = await j('POST', '/api/decks', { name: 'P1测试-填空' });
  deckId = deck.data.id;
  const c = await j('POST', '/api/cards', {
    deck_id: deckId, type: 'cloze',
    front_md: 'HTTP 状态码 {{c1::301}} 表示永久迁移,{{c2::404}} 表示不存在,{{c3::500}} 表示服务器错误',
    back_md: '补充:这些是常见状态码',
  });
  clozeCardId = c.data.items[0].id;
  ok('创建填空卡', c.status === 201);
  const q = await j('GET', `/api/study/queue?deckId=${deckId}`);
  const item = q.data.queue.find(x => x.id === clozeCardId);
  ok('队列携带 clozeIndex', item && item.clozeIndex === 1, JSON.stringify(item?.clozeIndex));
  // 评分 good → 毕业后 reps=1,下次轮换到 c2
  const r1 = await j('POST', '/api/study/review', { cardId: clozeCardId, rating: 4, clozeIndex: 1 });
  ok('填空卡评分带 clozeIndex', r1.status === 200);
  const card = await j('GET', `/api/cards/${clozeCardId}`);
  ok('Easy 直接毕业', card.data.state === 'review', card.data.state);
  // 撤销后重新进队列仍是 c1(reps 回 0)
  await j('POST', '/api/study/undo', {});
  const q2 = await j('GET', `/api/study/queue?deckId=${deckId}`);
  const item2 = q2.data.queue.find(x => x.id === clozeCardId);
  ok('撤销后回到 c1', item2?.clozeIndex === 1, JSON.stringify(item2?.clozeIndex));
  // 再学两次后轮换:good(learning) → 撤销太麻烦,直接把 reps 改为 1 模拟:重新评分 good
  await j('POST', '/api/study/review', { cardId: clozeCardId, rating: 3, clozeIndex: 1 });
  await j('POST', '/api/study/review', { cardId: clozeCardId, rating: 3, clozeIndex: 1 });
  const card3 = await j('GET', `/api/cards/${clozeCardId}`);
  ok('两次 good 毕业', card3.data.state === 'review' && card3.data.reps === 2, `reps=${card3.data.reps}`);
}

console.log('== P1: 双向卡 ==');
{
  const deck = await j('POST', '/api/decks', { name: 'P1测试-双向' });
  const c = await j('POST', '/api/cards', {
    deck_id: deck.data.id, type: 'reversed',
    front_md: 'ephemeral', back_md: 'adj. 短暂的', tags: ['英语'],
  });
  const items = c.data.items;
  ok('创建生成两张', items.length === 2, JSON.stringify(items.length));
  ok('共享 note_id', items[0].note_id && items[0].note_id === items[1].note_id);
  ok('内容互换', items[1].front_md === 'adj. 短暂的' && items[1].back_md === 'ephemeral');
  // 编辑第一张 → 第二张联动
  const e = await j('PATCH', `/api/cards/${items[0].id}`, { front_md: 'ephemeral (updated)', back_md: 'adj. 短暂的;转瞬即逝' });
  ok('返回 siblingId', e.data.siblingId === items[1].id);
  const sib = await j('GET', `/api/cards/${items[1].id}`);
  ok('联动编辑生效', sib.data.front_md === 'adj. 短暂的;转瞬即逝' && sib.data.back_md === 'ephemeral (updated)',
    JSON.stringify([sib.data.front_md, sib.data.back_md]));
  // 进度独立:学第一张不影响第二张
  await j('POST', '/api/study/review', { cardId: items[0].id, rating: 4 });
  const a = await j('GET', `/api/cards/${items[0].id}`);
  const b = await j('GET', `/api/cards/${items[1].id}`);
  ok('进度独立', a.data.state === 'review' && b.data.state === 'new', `${a.data.state}/${b.data.state}`);
  // 批量删除一张 → 整对删除
  await j('POST', '/api/cards/batch', { ids: [items[0].id], action: 'delete' });
  const b2 = await j('GET', `/api/cards/${items[1].id}`);
  ok('删除联动整对', b2.status === 404);
}

console.log('== P1: 批量操作 / 重置 / 暂停搁置 ==');
{
  const deck = await j('POST', '/api/decks', { name: 'P1测试-批量' });
  const deck2 = await j('POST', '/api/decks', { name: 'P1测试-批量目标' });
  const cards = [];
  for (let i = 0; i < 5; i++) {
    const r = await j('POST', '/api/cards', { deck_id: deck.data.id, front_md: `批量测试 ${i}`, back_md: `${i}` });
    cards.push(r.data.items[0].id);
  }
  // 移动
  const mv = await j('POST', '/api/cards/batch', { ids: cards, action: 'move', deckId: deck2.data.id });
  ok('批量移动', mv.data.affected === 5);
  const moved = await j('GET', `/api/cards/${cards[0]}`);
  ok('移动生效', moved.data.deck_id === deck2.data.id);
  // 加标签
  await j('POST', '/api/cards/batch', { ids: cards, action: 'tag', tag: '批量' });
  const t = await j('GET', '/api/cards?tag=批量');
  ok('批量加标签', t.data.total === 5, `total=${t.data.total}`);
  // 暂停
  await j('POST', '/api/cards/batch', { ids: cards.slice(0, 2), action: 'suspend' });
  const q = await j('GET', `/api/study/queue?deckId=${deck2.data.id}`);
  ok('暂停卡不进队列', !q.data.queue.some(c => cards.slice(0, 2).includes(c.id)), `队列 ${q.data.queue.length}`);
  // 单卡搁置
  await j('POST', '/api/study/bury', { cardId: cards[2] });
  const q2 = await j('GET', `/api/study/queue?deckId=${deck2.data.id}`);
  ok('搁置卡不进队列', !q2.data.queue.some(c => c.id === cards[2]));
  // 重置进度
  await j('POST', '/api/study/review', { cardId: cards[3], rating: 4 });
  const r1 = await j('GET', `/api/cards/${cards[3]}`);
  const reset = await j('POST', `/api/cards/${cards[3]}/reset`, {});
  const r2 = await j('GET', `/api/cards/${cards[3]}`);
  ok('重置回新卡', reset.status === 200 && r2.data.state === 'new' && r2.data.reps === 0 && r1.data.state === 'review');
  // 删除
  const del = await j('POST', '/api/cards/batch', { ids: cards, action: 'delete' });
  ok('批量删除', del.data.affected === 5);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
