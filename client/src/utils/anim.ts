import gsap from 'gsap';

/** prefers-reduced-motion:全部时长归零(统一封装,与设计稿一致) */
export const RM = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const D = (t: number): number => (RM ? 0.01 : t);

gsap.defaults({ ease: 'power2.out' });

export const RATING_LABELS: Record<1 | 2 | 3 | 4, string> = { 1: '重来', 2: '困难', 3: '良好', 4: '简单' };

export function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
export function fmtDateTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const STATE_LABEL: Record<string, string> = {
  new: '新卡', learning: '学习中', review: '复习中', relearning: '重新学习',
};
