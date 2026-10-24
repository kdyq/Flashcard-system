/* 交付种子数据:node test/seed-demo.mjs(在干净库上执行一次) */
const BASE = 'http://localhost:3001';
const j = async (method, path, body) => {
  const opts = { method };
  if (body !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, opts);
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
};

const net = await j('POST', '/api/decks', { name: '计算机网络' });
const eng = await j('POST', '/api/decks', { name: '英语词汇' });
await j('POST', '/api/cards', {
  cards: [
    { deck_id: net.id, type: 'basic', front_md: '什么是 TCP 三次握手?', back_md: '**SYN** → **SYN+ACK** → **ACK**\n\n客户端发 SYN 同步报文,服务器回应 SYN+ACK,客户端再发 ACK 确认,连接建立。', tags: ['网络', '传输层'] },
    { deck_id: net.id, type: 'basic', front_md: '一元二次方程求根公式', back_md: '$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$', tags: ['数学'] },
    { deck_id: net.id, type: 'cloze', front_md: 'HTTP 状态码 {{c1::301}} 表示永久迁移,{{c2::404}} 表示资源不存在,{{c3::500}} 表示服务器内部错误', back_md: '这些是最常见的一组状态码。', tags: ['网络', 'HTTP'] },
    { deck_id: net.id, type: 'reversed', front_md: 'ephemeral', back_md: 'adj. 短暂的、转瞬即逝的\n\n例句:Fame is often *ephemeral*.', tags: ['英语'] },
    { deck_id: eng.id, type: 'basic', front_md: 'quick 的同义词(至少两个)', back_md: 'rapid / swift / speedy / fast', tags: ['英语', '词汇'] },
    { deck_id: eng.id, type: 'basic', front_md: ' Markdown 支持的列表语法是?', back_md: '- 无序列表\n1. 有序列表\n- [ ] 任务列表(GFM)\n\n卡片内容支持 **加粗**、*斜体*、`代码`、$LaTeX$ 与图片。', tags: ['Markdown'] },
  ],
});
const decks = await j('GET', '/api/decks');
console.log('种子数据完成,当前卡组:', JSON.stringify(countNames(decks.items)));
function countNames(nodes) {
  return nodes.map(n => `${n.name}(${n.counts.total})`);
}
