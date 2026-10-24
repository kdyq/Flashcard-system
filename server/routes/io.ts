import { Router } from 'express';
import multer from 'multer';
import { db, nowISO, localDayKey, deckPath, getAllSettings, setSetting, type CardRow } from '../db';

const router = Router();
const upload = multer(); // 内存存储,导入文件都很小

/* ================= 导出 ================= */
router.get('/export', (_req, res) => {
  const payload = {
    format: 'fanfan-export',
    version: 1,
    exported_at: nowISO(),
    settings: getAllSettings(),
    decks: db.prepare('SELECT * FROM decks ORDER BY id').all(),
    cards: db.prepare('SELECT * FROM cards ORDER BY id').all(),
    review_logs: db.prepare('SELECT * FROM review_logs ORDER BY id').all(),
    tags: db.prepare('SELECT * FROM tags ORDER BY id').all(),
    card_tags: db.prepare('SELECT * FROM card_tags ORDER BY card_id, tag_id').all(),
  };
  const stamp = localDayKey().replace(/-/g, '');
  res.setHeader('Content-Disposition', `attachment; filename="fanfan-export-${stamp}.json"`);
  res.json(payload);
});

/* ================= CSV 解析(RFC4180:引号、转义引号、字段内换行、CRLF) ================= */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r') { /* skip, 处理 CRLF */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** 剥离 HTML(兼容 Anki 导出):<br> 转换行,去标签,解码常见实体 */
export function stripHTML(s: string): string {
  let out = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

const looksHTML = (s: string) => /<[a-z][^>]*>/i.test(s) || /&nbsp;|&amp;|&lt;|&gt;/.test(s);

function parseTagsField(s: string | undefined): string[] {
  if (!s) return [];
  return [...new Set(s.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean))];
}

/* ================= 导入 ================= */
/** 文件导入:multipart(file 字段)+ mode(merge|overwrite)/deckId 表单字段 */
router.post('/import', upload.single('file'), (req: any, res: any) => {
  const mode = req.body?.mode === 'overwrite' ? 'overwrite' : 'merge';
  const deckId = req.body?.deckId ? Number(req.body.deckId) : null;
  let text = '';
  if (req.file?.buffer) text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  else return res.status(400).json({ error: '没有收到文件' });

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return res.status(400).json({ error: 'JSON 解析失败,文件格式不正确' });
    }
    try {
      return importJSON(res, parsed as any, mode);
    } catch (e: any) {
      return res.status(500).json({ error: `JSON 导入失败:${e.message}` });
    }
  }
  return importCSV(res, trimmed, deckId);
});

function ensureDeck(name: string, parentId: number | null = null): number {
  const exist = db.prepare('SELECT id FROM decks WHERE name = ? AND IFNULL(parent_id, -1) = IFNULL(?, -1)')
    .get(name, parentId) as { id: number } | undefined;
  if (exist) return exist.id;
  const info = db.prepare('INSERT INTO decks(name, parent_id, sort_order, created_at) VALUES(?,?,0,?)')
    .run(name, parentId, nowISO());
  return Number(info.lastInsertRowid);
}

function importCSV(res: any, text: string, deckId: number | null) {
  const lines = text.split('\n');
  const header = (lines[0] ?? '').toLowerCase();
  let rows: string[][];
  let isAnki = false;
  if (header.includes('front') && header.includes('back') && header.includes(',')) {
    rows = parseCSV(text).slice(1); // 本系统格式:表头 front,back,tags
  } else if (header.includes('\t') && !header.includes(',')) {
    isAnki = true;
    rows = lines.map(l => l.trim()).filter(Boolean).map(l => l.split('\t'));
  } else {
    // 无表头:退化为逐行 tab/逗号自适应
    rows = lines.map(l => l.trim()).filter(Boolean).map(l => (l.includes('\t') ? l.split('\t') : parseCSV(l)[0] ?? []));
    isAnki = true;
  }
  const targetDeck = deckId ?? ensureDeck(`导入 ${localDayKey()}`);
  let imported = 0, skipped = 0;
  const seen = new Set<string>();
  const dupCheck = db.prepare("SELECT id FROM cards WHERE deck_id = ? AND front_md = ? AND IFNULL(back_md,'') = IFNULL(?,'')");
  const insCard = db.prepare(`
    INSERT INTO cards(deck_id, type, front_md, back_md, due, state, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?)
  `);
  const insCT = db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING');
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const insCardTag = db.prepare('INSERT OR IGNORE INTO card_tags(card_id, tag_id) VALUES(?,?)');
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (isAnki && r.length < 2) { skipped++; continue; }
      let front = (r[0] ?? '').trim();
      let back = (r[1] ?? '').trim();
      let tags = parseTagsField(r[2]);
      if (isAnki) {
        // Anki「Notes in plain text」:含 HTML 时剥离
        if (looksHTML(front)) front = stripHTML(front);
        if (looksHTML(back)) back = stripHTML(back);
      }
      if (!front) { skipped++; continue; }
      const fp = `${targetDeck}|${front}|${back}`;
      if (seen.has(fp) || dupCheck.get(targetDeck, front, back)) { skipped++; continue; }
      seen.add(fp);
      const info = insCard.run(targetDeck, 'basic', front, back || null, nowISO(), 'new', nowISO(), nowISO());
      const cardId = Number(info.lastInsertRowid);
      for (const t of tags) {
        insCT.run(t);
        const tag = getTag.get(t) as { id: number } | undefined;
        if (tag) insCardTag.run(cardId, tag.id);
      }
      imported++;
    }
  });
  tx();
  res.json({ ok: true, kind: 'csv', imported, skipped, deckId: targetDeck });
}

function importJSON(res: any, data: any, mode: 'merge' | 'overwrite') {
  if (data?.format !== 'fanfan-export') return res.status(400).json({ error: '不是 fanfan-export 格式的 JSON' });
  if (mode === 'overwrite') {
    const tx = db.transaction(() => {
      db.exec(`
        DELETE FROM card_tags; DELETE FROM review_logs; DELETE FROM cards;
        DELETE FROM tags; DELETE FROM decks;
      `);
      for (const d of data.decks ?? []) {
        db.prepare('INSERT INTO decks(id,name,parent_id,sort_order,created_at) VALUES(?,?,?,?,?)')
          .run(d.id, d.name, d.parent_id ?? null, d.sort_order ?? 0, d.created_at ?? nowISO());
      }
      for (const t of data.tags ?? []) {
        db.prepare('INSERT INTO tags(id,name) VALUES(?,?)').run(t.id, t.name);
      }
      const insCard = db.prepare(`
        INSERT INTO cards(id,deck_id,note_id,type,front_md,back_md,due,stability,difficulty,state,reps,lapses,last_review,
          elapsed_days,scheduled_days,learning_steps,suspended,buried_until,tts,audio_url,audio_mode,created_at,updated_at)
        VALUES(${Array.from({ length: 23 }, () => '?').join(',')})
      `);
      for (const c of data.cards ?? []) {
        insCard.run(c.id, c.deck_id, c.note_id ?? null, c.type ?? 'basic', c.front_md, c.back_md ?? null,
          c.due, c.stability ?? null, c.difficulty ?? null, c.state ?? 'new', c.reps ?? 0, c.lapses ?? 0,
          c.last_review ?? null, c.elapsed_days ?? 0, c.scheduled_days ?? 0, c.learning_steps ?? 0,
          c.suspended ?? 0, c.buried_until ?? null, c.tts ?? 0, c.audio_url ?? null, c.audio_mode ?? null,
          c.created_at ?? nowISO(), c.updated_at ?? nowISO());
      }
      for (const ct of data.card_tags ?? []) {
        db.prepare('INSERT OR IGNORE INTO card_tags(card_id,tag_id) VALUES(?,?)').run(ct.card_id, ct.tag_id);
      }
      const insLog = db.prepare(`
        INSERT INTO review_logs(id,card_id,rating,state_before,stability_before,difficulty_before,due_before,
          reps_before,lapses_before,last_review_before,elapsed_days_before,scheduled_days_before,learning_steps_before,
          stability_after,difficulty_after,due_after,elapsed_days,scheduled_days,review_time,day_key,cloze_index,is_undo_of)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const l of data.review_logs ?? []) {
        insLog.run(l.id, l.card_id, l.rating, l.state_before ?? 'new', l.stability_before ?? null, l.difficulty_before ?? null,
          l.due_before ?? nowISO(), l.reps_before ?? 0, l.lapses_before ?? 0, l.last_review_before ?? null,
          l.elapsed_days_before ?? 0, l.scheduled_days_before ?? 0, l.learning_steps_before ?? 0,
          l.stability_after ?? null, l.difficulty_after ?? null, l.due_after ?? nowISO(),
          l.elapsed_days ?? 0, l.scheduled_days ?? 0, l.review_time ?? nowISO(), l.day_key ?? localDayKey(new Date(l.review_time ?? nowISO())),
          l.cloze_index ?? null, l.is_undo_of ?? null);
      }
      if (data.settings && typeof data.settings === 'object') {
        for (const [k, v] of Object.entries(data.settings)) setSetting(k, v);
      }
    });
    tx();
    return res.json({ ok: true, kind: 'json', mode, imported: (data.cards ?? []).length, skipped: 0 });
  }

  // merge:按内容指纹(front+back+卡组路径)去重,只插入新内容
  let imported = 0, skipped = 0;
  const deckIdMap = new Map<number, number>(); // 旧 deck id → 本库 deck id
  const findDeckByNamePath = db.prepare('SELECT id FROM decks WHERE name = ?');
  const cardByFingerprint = db.prepare(`
    SELECT c.id FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.front_md = ? AND IFNULL(c.back_md,'') = IFNULL(?, '') AND d.name = ?
  `);
  const tx = db.transaction(() => {
    for (const d of data.decks ?? []) {
      const parentName = d.parent_id ? (data.decks.find((x: any) => x.id === d.parent_id)?.name ?? null) : null;
      let parentId: number | null = null;
      if (parentName) {
        const p = findDeckByNamePath.get(parentName) as { id: number } | undefined;
        parentId = p?.id ?? ensureDeck(parentName);
      }
      const mine = findDeckByNamePath.get(d.name) as { id: number } | undefined;
      deckIdMap.set(d.id, mine?.id ?? ensureDeck(d.name, parentId));
    }
    const tagIdMap = new Map<number, number>();
    const insTag = db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING');
    for (const t of data.tags ?? []) {
      insTag.run(t.name);
      tagIdMap.set(t.id, (db.prepare('SELECT id FROM tags WHERE name = ?').get(t.name) as any).id);
    }
    const oldToNewCard = new Map<number, number>();
    const insCard = db.prepare(`
      INSERT INTO cards(deck_id,note_id,type,front_md,back_md,due,stability,difficulty,state,reps,lapses,last_review,
        elapsed_days,scheduled_days,learning_steps,suspended,buried_until,tts,audio_url,audio_mode,created_at,updated_at)
      VALUES(${Array.from({ length: 22 }, () => '?').join(',')})
    `);
    const cardTagsByCard = new Map<number, any[]>();
    for (const ct of data.card_tags ?? []) {
      if (!cardTagsByCard.has(ct.card_id)) cardTagsByCard.set(ct.card_id, []);
      cardTagsByCard.get(ct.card_id)!.push(ct.tag_id);
    }
    const insCT = db.prepare('INSERT OR IGNORE INTO card_tags(card_id,tag_id) VALUES(?,?)');
    for (const c of data.cards ?? []) {
      const deckName = (data.decks.find((d: any) => d.id === c.deck_id)?.name) ?? '';
      if (cardByFingerprint.get(c.front_md, c.back_md ?? '', deckName)) { skipped++; continue; }
      const targetDeck = deckIdMap.get(c.deck_id) ?? ensureDeck(deckName || '导入');
      const info = insCard.run(targetDeck, c.note_id ?? null, c.type ?? 'basic', c.front_md, c.back_md ?? null,
        c.due, c.stability ?? null, c.difficulty ?? null, c.state ?? 'new', c.reps ?? 0, c.lapses ?? 0,
        c.last_review ?? null, c.elapsed_days ?? 0, c.scheduled_days ?? 0, c.learning_steps ?? 0,
        c.suspended ?? 0, c.buried_until ?? null, c.tts ?? 0, c.audio_url ?? null, c.audio_mode ?? null,
        c.created_at ?? nowISO(), c.updated_at ?? nowISO());
      const newId = Number(info.lastInsertRowid);
      oldToNewCard.set(c.id, newId);
      for (const tid of cardTagsByCard.get(c.id) ?? []) {
        const mapped = tagIdMap.get(tid);
        if (mapped) insCT.run(newId, mapped);
      }
      imported++;
    }
    // 复习日志:仅导入「新插入卡片」的日志(重编号)
    const insLog = db.prepare(`
      INSERT INTO review_logs(card_id,rating,state_before,stability_before,difficulty_before,due_before,
        reps_before,lapses_before,last_review_before,elapsed_days_before,scheduled_days_before,learning_steps_before,
        stability_after,difficulty_after,due_after,elapsed_days,scheduled_days,review_time,day_key,cloze_index,is_undo_of)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const l of data.review_logs ?? []) {
      const newCardId = oldToNewCard.get(l.card_id);
      if (!newCardId) continue;
      insLog.run(newCardId, l.rating, l.state_before ?? 'new', l.stability_before ?? null, l.difficulty_before ?? null,
        l.due_before ?? nowISO(), l.reps_before ?? 0, l.lapses_before ?? 0, l.last_review_before ?? null,
        l.elapsed_days_before ?? 0, l.scheduled_days_before ?? 0, l.learning_steps_before ?? 0,
        l.stability_after ?? null, l.difficulty_after ?? null, l.due_after ?? nowISO(),
        l.elapsed_days ?? 0, l.scheduled_days ?? 0, l.review_time ?? nowISO(),
        l.day_key ?? localDayKey(new Date(l.review_time ?? nowISO())), l.cloze_index ?? null, l.is_undo_of ?? null);
    }
  });
  tx();
  res.json({ ok: true, kind: 'json', mode, imported, skipped });
}

export default router;
