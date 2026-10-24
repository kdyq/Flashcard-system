import { fsrs, generatorParameters, createEmptyCard, State, type Card as FsrsCard } from 'ts-fsrs';
import { getSetting, type CardRow } from './db';

/** 个性化参数(P2 调参结果),null = 库默认 */
interface FsrsSettingParams {
  w?: number[];
  request_retention?: number;
  maximum_interval?: number;
}

const STATE_ENUM: Record<CardRow['state'], number> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const STATE_NAME: Record<number, CardRow['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function buildScheduler() {
  const custom = getSetting<FsrsSettingParams | null>('fsrs_params', null);
  const opts: Record<string, unknown> = {};
  if (custom) {
    if (Array.isArray(custom.w) && custom.w.length) opts.w = custom.w;
    if (typeof custom.request_retention === 'number') opts.request_retention = custom.request_retention;
    if (typeof custom.maximum_interval === 'number') opts.maximum_interval = custom.maximum_interval;
  }
  return fsrs(generatorParameters(opts as never));
}

/** DB 行 → ts-fsrs Card */
function toFsrsCard(row: CardRow): FsrsCard {
  return {
    due: new Date(row.due),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsed_days ?? 0,
    scheduled_days: row.scheduled_days ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: STATE_ENUM[row.state] ?? State.New,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps ?? 0,
  } as FsrsCard;
}

export function newCardState(): { due: string } {
  return { due: createEmptyCard(new Date()).due.toISOString() };
}

export interface GradeResult {
  patch: {
    due: string; stability: number; difficulty: number; state: CardRow['state'];
    reps: number; lapses: number; last_review: string | null;
    elapsed_days: number; scheduled_days: number; learning_steps: number;
  };
}

/** 对卡片评分,得到应写回 DB 的新 FSRS 状态 */
export function gradeRow(row: CardRow, rating: 1 | 2 | 3 | 4, now: Date = new Date()): GradeResult {
  const f = buildScheduler();
  const rec = f.repeat(toFsrsCard(row), now) as unknown as Record<number, { card: FsrsCard }>;
  const c = rec[rating].card;
  return {
    patch: {
      due: c.due.toISOString(),
      stability: c.stability,
      difficulty: c.difficulty,
      state: STATE_NAME[c.state] ?? 'new',
      reps: c.reps,
      lapses: c.lapses,
      last_review: c.last_review ? new Date(c.last_review).toISOString() : null,
      elapsed_days: c.elapsed_days,
      scheduled_days: c.scheduled_days,
      learning_steps: c.learning_steps ?? 0,
    },
  };
}

/** 四个评分的下次间隔预览,格式化为人读字符串 */
export function previewIntervals(row: CardRow, now: Date = new Date()): Record<'1' | '2' | '3' | '4', string> {
  const f = buildScheduler();
  const rec = f.repeat(toFsrsCard(row), now) as unknown as Record<number, { card: FsrsCard }>;
  const out = {} as Record<'1' | '2' | '3' | '4', string>;
  for (const r of [1, 2, 3, 4] as const) {
    out[String(r) as '1'] = formatInterval(new Date(rec[r].card.due), now);
  }
  return out;
}

/** 间隔格式化:<1分钟 / 10分钟 / 5小时 / 1.2天 / 30天 / 1.5年 */
export function formatInterval(due: Date, now: Date): string {
  const min = (due.getTime() - now.getTime()) / 60000;
  if (min < 1) return '<1分钟';
  if (min < 60) return `${Math.round(min)}分钟`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}小时`;
  const d = h / 24;
  if (d < 31) return `${d >= 10 ? Math.round(d) : d.toFixed(1).replace(/\.0$/, '')}天`;
  if (d < 365) return `${Math.round(d)}天`;
  return `${(d / 365).toFixed(1)}年`;
}
