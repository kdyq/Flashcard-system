export interface DeckCounts { total: number; due: number; new: number }
export interface DeckNode {
  id: number; name: string; parent_id: number | null; sort_order: number;
  counts: DeckCounts; children: DeckNode[];
}
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type CardType = 'basic' | 'cloze' | 'reversed';

export interface CardItem {
  id: number; deck_id: number; note_id: string | null; type: CardType;
  front_md: string; back_md: string | null;
  due: string; stability: number | null; difficulty: number | null; state: CardState;
  reps: number; lapses: number; last_review: string | null;
  elapsed_days: number; scheduled_days: number; learning_steps: number;
  suspended: number; buried_until: string | null;
  tts: number; audio_url: string | null; audio_mode: string | null;
  created_at: string; updated_at: string;
  tags?: string[]; deckName?: string; kind?: string; clozeIndex?: number | null;
  siblingId?: number | null;
  previews?: Record<'1' | '2' | '3' | '4', string>;
  logs?: ReviewLogItem[];
}

export interface ReviewLogItem {
  id: number; card_id: number; rating: number; state_before: string;
  due_after: string; scheduled_days: number; review_time: string; day_key: string;
}

export interface StudyQueue {
  queue: CardItem[];
  today: { newDone: number; reviewDone: number; newLimit: number; reviewLimit: number };
  dueRemaining: number;
}

export interface ReviewResult {
  logId: number; cardId: number; state: CardState;
  interval: string; due: string; requeueToday: boolean;
  previews: Record<'1' | '2' | '3' | '4', string>;
  today: { newDone: number; reviewDone: number };
}

export interface DashboardStats {
  todayNew: number; todayReviews: number; dueNow: number; newNow: number;
  totalCards: number; totalReviews: number; retention: number | null;
  current: number; longest: number;
}

export interface HeatmapDay { date: string; count: number; level: number; future: boolean }
export interface ForecastDay { date: string; count: number }

export interface TagItem { id: number; name: string; usage: number }

export interface AppSettings {
  daily_new_limit: number; daily_review_limit: number;
  fsrs_params: { w?: number[]; request_retention?: number; maximum_interval?: number } | null;
  ai_base_url: string; ai_model: string; ai_enabled: boolean;
  ai_key_present: boolean; ai_key_source: 'settings' | 'env' | 'none';
  reminder_enabled: boolean; reminder_time: string; backup_keep: number;
  _logsCount?: number;
  _backups?: { filename: string; size: number; createdAt: string }[];
  [k: string]: unknown;
}
