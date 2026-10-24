const BASE = 'http://localhost:3001';
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const dump = {
  format: 'fanfan-export', version: 1, exported_at: daysAgo(0),
  decks: [{ id: 1, name: '调试导入', parent_id: null, sort_order: 0, created_at: daysAgo(30) }],
  cards: [{ id: 9000, deck_id: 1, type: 'basic', front_md: '调试卡', back_md: 'x', due: daysAgo(0), state: 'new', reps: 0, lapses: 0, elapsed_days: 0, scheduled_days: 0, created_at: daysAgo(30), updated_at: daysAgo(1) }],
  review_logs: [],
  tags: [], card_tags: [],
};
const s = JSON.stringify(dump);
console.log('json valid:', (() => { try { JSON.parse(s); return true; } catch { return false; } })());
const fd = new FormData();
fd.append('file', new File([s], 'debug.json', { type: 'application/json' }));
fd.append('mode', 'merge');
const r = await fetch(BASE + '/api/import', { method: 'POST', body: fd });
console.log('status', r.status, 'body', await r.text());
