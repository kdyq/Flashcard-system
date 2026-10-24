/** 统一 API 客户端:错误一律抛 Error(message),由调用方 toast */
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = method === 'GET'
    ? {}
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(`/api${path}`, opts);
  let data: any = null;
  try { data = await r.json(); } catch { /* 空响应 */ }
  if (!r.ok) throw new Error(data?.error || `请求失败(${r.status})`);
  return data as T;
}

import type {
  AppSettings, CardItem, DashboardStats, DeckNode, ForecastDay,
  HeatmapDay, ReviewResult, StudyQueue, TagItem,
} from './types';

export const api = {
  decks: {
    tree: () => req<{ items: DeckNode[] }>('GET', '/decks'),
    create: (name: string, parentId: number | null) =>
      req<DeckNode>('POST', '/decks', { name, parent_id: parentId }),
    update: (id: number, patch: { name?: string; parent_id?: number | null }) =>
      req<DeckNode>('PATCH', `/decks/${id}`, patch),
    remove: (id: number) => req<{ ok: boolean; deletedCards: number }>('DELETE', `/decks/${id}`),
  },
  cards: {
    list: (params: Record<string, string | number | undefined>) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
      return req<{ items: CardItem[]; total: number; page: number; pages: number }>('GET', `/cards?${qs}`);
    },
    get: (id: number) => req<CardItem>('GET', `/cards/${id}`),
    create: (cards: Partial<CardItem>[] | Partial<CardItem>) =>
      req<{ items: CardItem[]; count: number }>('POST', '/cards', Array.isArray(cards) ? { cards } : cards),
    update: (id: number, patch: Partial<CardItem>) => req<CardItem>('PATCH', `/cards/${id}`, patch),
    remove: (id: number) => req<{ ok: boolean }>('DELETE', `/cards/${id}`),
    reset: (id: number) => req<{ ok: boolean }>('POST', `/cards/${id}/reset`, {}),
    batch: (ids: number[], action: string, extra?: Record<string, unknown>) =>
      req<{ ok: boolean; action: string; affected: number }>('POST', '/cards/batch', { ids, action, ...extra }),
    tags: () => req<{ items: TagItem[] }>('GET', '/cards/tags'),
  },
  study: {
    queue: (deckId?: number | string | null) =>
      req<StudyQueue>('GET', `/study/queue${deckId ? `?deckId=${deckId}` : ''}`),
    review: (cardId: number, rating: 1 | 2 | 3 | 4, clozeIndex?: number) =>
      req<ReviewResult>('POST', '/study/review', { cardId, rating, clozeIndex }),
    undo: (logId?: number) => req<{ ok: boolean; cardId: number }>('POST', '/study/undo', logId ? { logId } : {}),
    suspend: (cardId: number, suspended?: boolean) =>
      req<{ ok: boolean; suspended: boolean }>('POST', '/study/suspend', { cardId, suspended }),
    bury: (cardId: number) => req<{ ok: boolean }>('POST', '/study/bury', { cardId }),
  },
  stats: {
    dashboard: () => req<DashboardStats>('GET', '/stats/dashboard'),
    heatmap: (weeks = 18) => req<{ weeks: number; days: HeatmapDay[] }>('GET', `/stats/heatmap?weeks=${weeks}`),
    forecast: (days = 30) => req<{ days: ForecastDay[] }>('GET', `/stats/forecast?days=${days}`),
  },
  settings: {
    get: () => req<AppSettings>('GET', '/settings'),
    update: (patch: Record<string, unknown>) => req<{ ok: boolean }>('PUT', '/settings', patch),
    optimize: (minLogs?: number) =>
      req<{ ok: boolean; w: number[]; logs: number; cards: number; elapsedMs: number }>('POST', '/settings/optimize', { minLogs }),
    resetFsrs: () => req<{ ok: boolean }>('POST', '/settings/reset-fsrs', {}),
    backupCreate: () =>
      req<{ ok: boolean; backups: { filename: string; size: number; createdAt: string }[] }>('POST', '/settings/backups/create', {}),
    backupRestore: (filename: string) =>
      req<{ ok: boolean; tables: Record<string, number> }>('POST', '/settings/backups/restore', { filename }),
  },
  ai: {
    test: (baseUrl?: string, model?: string, apiKey?: string) =>
      req<{ ok: boolean; model: string; latencyMs: number; reply: string; keySource: string }>('POST', '/ai/test', { baseUrl, model, apiKey }),
    generate: (text: string, count: number, deckId?: number) =>
      req<{ ok: boolean; cards: { front: string; back: string; tags: string[]; type: string }[]; latencyMs: number; model: string }>(
        'POST', '/ai/generate', { text, count, deckId }),
  },
  media: {
    upload: async (file: File | Blob, filename?: string): Promise<{ url: string }> => {
      const fd = new FormData();
      fd.append('file', file instanceof File ? file : new File([file], filename || 'paste.png'));
      const r = await fetch('/api/media', { method: 'POST', body: fd });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || '上传失败');
      return data;
    },
  },
  io: {
    importFile: async (file: File, mode: 'merge' | 'overwrite', deckId?: number) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      if (deckId) fd.append('deckId', String(deckId));
      const r = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || '导入失败');
      return data as { kind: string; imported: number; skipped: number; deckId?: number };
    },
  },
};
