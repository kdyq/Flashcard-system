import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gsap } from 'gsap';
import { ArrowCounterClockwise, X, HandTap, CheckFat, ArrowLeft, Pause, PencilSimple, EyeSlash, SpeakerHigh } from '@phosphor-icons/react';
import { api } from '../api';
import type { CardItem } from '../types';
import MarkdownView from '../components/MarkdownView';
import ClozeContent from '../components/ClozeContent';
import CardEditor from '../components/CardEditor';
import { useToast } from '../components/Toast';
import useShortcuts from '../hooks/useShortcuts';
import { D, RM, RATING_LABELS } from '../utils/anim';

const RATINGS: { r: 1 | 2 | 3 | 4; cls: string }[] = [
  { r: 1, cls: 'again' }, { r: 2, cls: 'hard' }, { r: 3, cls: 'good' }, { r: 4, cls: 'easy' },
];

export default function Study() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [queue, setQueue] = useState<CardItem[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0); // 触发重入动画(撤销/重载)
  const [doneStats, setDoneStats] = useState({ review: 0, news: 0 });
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const completedRef = useRef(0);
  const flippedRef = useRef(false);
  const busyRef = useRef(false);
  const undoStackRef = useRef<{ cardId: number; logId: number; kind: string }[]>([]);

  const cardRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const ratesRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);

  const cur = queue[i];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.study.queue(deckId);
      setQueue(r.queue);
      setI(0);
      setFlipped(false);
      flippedRef.current = false;
      completedRef.current = 0;
      undoStackRef.current = [];
      setDoneStats({ review: 0, news: 0 });
      setPendingNote(null);
      if (r.queue.length === 0) {
        setFinished(true);
        setDoneStats({ review: r.today.reviewDone, news: r.today.newDone });
      } else {
        setFinished(false);
      }
      setNonce(n => n + 1);
    } catch (e: any) {
      toast(e.message);
    }
    setLoading(false);
  }, [deckId, toast]);

  useEffect(() => { load(); }, [load]);

  /* 新卡入场 */
  useEffect(() => {
    if (loading || finished || !cur) return;
    // P2:自动朗读正面 / 音频卡自动播放
    if (cur.tts && 'speechSynthesis' in window) {
      const plain = cur.front_md
        .replace(/\{\{c\d+::([\s\S]*?)\}\}/g, '$1')
        .replace(/[$`*_~#>[\]()!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      if (plain) {
        const u = new SpeechSynthesisUtterance(plain);
        u.lang = 'zh-CN';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    }
    if (cur.audio_url && (cur.audio_mode === 'auto' || cur.audio_mode === 'question')) {
      new Audio(cur.audio_url).play().catch(() => {});
    }
    const ctx = gsap.context(() => {
      gsap.set(cardRef.current, { rotationY: 0, x: 0, rotation: 0, autoAlpha: 1, scale: 1, y: 0 });
      gsap.set(ratesRef.current, { autoAlpha: 0, y: 10 });
      const progress = completedRef.current / Math.max(1, completedRef.current + queue.length - i);
      gsap.to(barRef.current, { scaleX: progress, duration: D(0.4) });
      if (!RM) gsap.from(cardRef.current, { y: 40, scale: 0.94, autoAlpha: 0, duration: 0.55, ease: 'back.out(1.5)' });
    });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, cur?.id, nonce, loading, finished]);

  /* 完成页入场 */
  useEffect(() => {
    if (!finished) return;
    const ctx = gsap.context(() => {
      gsap.set(cardRef.current, { x: 0, rotation: 0, autoAlpha: 1, rotationY: 0 });
      gsap.to(barRef.current, { scaleX: 1, duration: D(0.4) });
      gsap.set(ratesRef.current, { autoAlpha: 0 });
      if (!RM) gsap.from('.card-done > *', { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.4, ease: 'back.out(1.6)' });
    });
    return () => ctx.revert();
  }, [finished]);

  /* 翻面:半翻交换法(90° 时换内容,规避 backface-visibility 兼容性) */
  const flip = useCallback(() => {
    if (!cur || flippedRef.current || busyRef.current || finished) return;
    flippedRef.current = true;
    const tl = gsap.timeline();
    tl.to(cardRef.current, { rotationY: 90, scale: 1.03, y: -8, duration: D(0.3), ease: 'power2.in' })
      .add(() => setFlipped(true))
      .to(cardRef.current, { rotationY: 0, scale: 1, y: 0, duration: D(0.36), ease: 'back.out(1.6)' })
      .to(ratesRef.current, { autoAlpha: 1, y: 0, duration: D(0.3) }, RM ? '' : '-=.15');
  }, [cur, finished]);

  const finishSession = (laterCards?: CardItem[]) => {
    setFinished(true);
    setPendingNote(laterCards?.length
      ? `还有 ${laterCards.length} 张学习中卡片将在几分钟后到期,到时再来翻一翻`
      : null);
    busyRef.current = false;
  };

  const advance = (nq: CardItem[], fromIndex: number) => {
    const now = Date.now();
    const ready = (c: CardItem) => new Date(c.due).getTime() <= now + 2000;
    const remaining = nq.slice(fromIndex);
    const readyList = remaining.filter(ready);
    const later = remaining.filter(c => !ready(c));
    const full = [...nq.slice(0, fromIndex), ...readyList, ...later];
    if (fromIndex >= full.length) { finishSession(later.length ? later : undefined); return; }
    if (!ready(full[fromIndex])) { finishSession(later); return; }
    setQueue(full);
    setI(fromIndex);
    busyRef.current = false;
  };

  /* 评分:落章 → 卡牌出场 → 下一张 */
  const rate = useCallback(async (r: 1 | 2 | 3 | 4) => {
    if (!cur || !flippedRef.current || busyRef.current || finished) return;
    busyRef.current = true;
    try {
      const res = await api.study.review(cur.id, r, cur.clozeIndex ?? undefined);
      undoStackRef.current.push({ cardId: cur.id, logId: res.logId, kind: cur.kind ?? 'review' });
      completedRef.current += 1;
      setDoneStats(s => cur.kind === 'new'
        ? { ...s, news: s.news + 1 }
        : { ...s, review: s.review + 1 });

      let nq = queue;
      if (res.requeueToday) {
        nq = [...queue, { ...cur, due: res.due, state: res.state, previews: res.previews }];
        setQueue(nq);
      }
      const dir = r === 1 ? -1 : 1;
      const tl = gsap.timeline();
      if (!RM) {
        if (markRef.current) markRef.current.textContent = RATING_LABELS[r];
        tl.fromTo(markRef.current,
          { scale: 2.2, autoAlpha: 0, rotation: -24 },
          { scale: 1, autoAlpha: 1, rotation: -10, duration: 0.32, ease: 'back.out(2.4)' })
          .to(markRef.current, { autoAlpha: 0, duration: 0.2, delay: 0.15 });
      }
      tl.to(cardRef.current, { x: dir * 480, rotation: dir * 10, autoAlpha: 0, duration: D(0.45), ease: 'power2.in' }, '+=.1')
        .add(() => {
          flippedRef.current = false;
          setFlipped(false);
          advance(nq, i + 1);
        });
    } catch (e: any) {
      toast(e.message);
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, finished, queue, i, toast]);

  /* 撤销:按会话内逆序回滚,重新拉取队列 */
  const undo = useCallback(async () => {
    if (busyRef.current || loading) return;
    const last = undoStackRef.current.pop();
    if (!last) { toast('没有可撤销的评分'); return; }
    busyRef.current = true;
    try {
      await api.study.undo(last.logId);
      completedRef.current = Math.max(0, completedRef.current - 1);
      setDoneStats(s => last.kind === 'new' ? { ...s, news: Math.max(0, s.news - 1) } : { ...s, review: Math.max(0, s.review - 1) });
      const r = await api.study.queue(deckId);
      setQueue(r.queue);
      setI(0);
      setFlipped(false);
      flippedRef.current = false;
      setFinished(false);
      setPendingNote(null);
      setNonce(n => n + 1);
      toast('已撤销,重新评分');
    } catch (e: any) {
      toast(e.message);
    }
    busyRef.current = false;
  }, [deckId, loading, toast]);

  useShortcuts({
    onSpace: () => { if (!finished) flip(); },
    onDigit: n => rate(n),
    onKey: k => {
      if (k === 'z') undo();
      if (k === 'escape') navigate('/');
      if (k === 'e') editCurrent();
      if (k === '@') suspendCurrent();
    },
  }, !loading);

  /* E:编辑当前卡(双向卡自动联动另一张) */
  const editCurrent = () => {
    if (!cur || finished) return;
    setEditorOpen(true);
  };
  const onEditorSaved = async () => {
    setEditorOpen(false);
    if (!cur) return;
    try {
      const fresh = await api.cards.get(cur.id);
      setQueue(q => q.map((c, idx) => idx === i ? { ...c, ...fresh } : c));
      toast('卡片已更新');
    } catch { /* 保留旧内容 */ }
  };

  /* @ / 按钮:暂停或搁置当前卡并跳过 */
  const skipCurrent = useCallback((note: string) => {
    const tl = gsap.timeline();
    tl.to(cardRef.current, { x: -480, rotation: -10, autoAlpha: 0, duration: D(0.45), ease: 'power2.in' })
      .add(() => {
        flippedRef.current = false;
        setFlipped(false);
        advance(queue, i + 1);
      });
    toast(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, i]);

  const suspendCurrent = useCallback(async () => {
    if (!cur || busyRef.current || finished) return;
    busyRef.current = true;
    try {
      await api.study.suspend(cur.id);
      skipCurrent('已暂停,可在浏览器中恢复');
    } catch (e: any) {
      toast(e.message);
      busyRef.current = false;
    }
  }, [cur, finished, skipCurrent, toast]);

  const buryCurrent = useCallback(async () => {
    if (!cur || busyRef.current || finished) return;
    busyRef.current = true;
    try {
      await api.study.bury(cur.id);
      skipCurrent('已搁置到明天');
    } catch (e: any) {
      toast(e.message);
      busyRef.current = false;
    }
  }, [cur, finished, skipCurrent, toast]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>正在洗牌…</div>;
  }

  return (
    <div>
      <div className="study-top">
        <span className="deck-name">{cur?.deckName ?? (deckId ? '卡组学习' : '全部卡组')}</span>
        <span className="study-count">
          {finished ? `${doneStats.review + doneStats.news} 张` : `${Math.min(i + 1, queue.length)} / ${queue.length + completedRef.current - i}`}
        </span>
        <div className="study-acts">
          <button className="icon-btn" onClick={undo} title="撤销上次评分(Z)"><ArrowCounterClockwise size={17} /></button>
          <button className="icon-btn" onClick={() => editCurrent()} disabled={!cur || finished} title="编辑当前卡(E)"><PencilSimple size={17} /></button>
          <button className="icon-btn" onClick={buryCurrent} disabled={!cur || finished} title="搁置到明天"><EyeSlash size={17} /></button>
          <button className="icon-btn" onClick={suspendCurrent} disabled={!cur || finished} title="暂停(@)"><Pause size={17} /></button>
          <button className="icon-btn" onClick={() => navigate('/')} title="结束学习(Esc)"><X size={17} /></button>
        </div>
      </div>
      <div className="study-bar"><i ref={barRef as any} /></div>

      <div className="stage">
        <div className="scene">
          <div className="ghost g2" />
          <div className="ghost g1" />
          <div className="card" ref={cardRef} onClick={flip}>
            <div className="mark" ref={markRef} />
            {finished ? (
              <div className="card-done">
                <div className="seal"><CheckFat size={38} weight="fill" /></div>
                <h2>今日翻牌完毕</h2>
                <p>复习 {doneStats.review} 张 · 新学 {doneStats.news} 张</p>
                {pendingNote && <p>{pendingNote}</p>}
                <button className="btn-flip" onClick={() => navigate('/')}><ArrowLeft size={17} />回仪表盘</button>
              </div>
            ) : cur ? (
              <>
                <div className="card-tag">
                  {cur.tags?.slice(0, 2).map(t => <span className="tag hot" key={t}>{t}</span>)}
                  <span className="tag plain">{cur.deckName}</span>
                </div>
                <div className={flipped ? 'card-a' : 'card-q'} key={`${cur.id}-${flipped}`}>
                  {cur.type === 'cloze' ? (
                    <>
                      <ClozeContent md={cur.front_md} activeIndex={cur.clozeIndex ?? null} revealed={flipped} />
                      {flipped && cur.back_md && (
                        <div style={{ marginTop: 14, borderTop: '1px dashed var(--hairline)', paddingTop: 12 }}>
                          <MarkdownView md={cur.back_md} />
                        </div>
                      )}
                    </>
                  ) : (
                    <MarkdownView md={flipped ? (cur.back_md ?? '(没有背面内容)') : cur.front_md} />
                  )}
                </div>
                {!flipped && cur.audio_url && cur.audio_mode === 'click' && (
                  <div className="card-hint" style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); new Audio(cur.audio_url!).play().catch(() => {}); }}>
                    <SpeakerHigh size={17} />点击播放音频
                  </div>
                )}
                {!flipped && !cur.audio_url && (
                  <div className="card-hint"><HandTap size={17} />点一下卡片,或按 <kbd>空格</kbd> 翻面</div>
                )}
                {!flipped && cur.audio_url && cur.audio_mode !== 'click' && (
                  <div className="card-hint"><HandTap size={17} />点一下卡片,或按 <kbd>空格</kbd> 翻面</div>
                )}
              </>
            ) : null}
          </div>
        </div>

        {!finished && cur && (
          <div className="rates" ref={ratesRef as any}>
            {RATINGS.map(({ r, cls }) => (
              <button key={r} className={`rate ${cls}`} onClick={() => rate(r)} disabled={!flipped}>
                <kbd>{r}</kbd>
                <div className="rl">{RATING_LABELS[r]}</div>
                <div className="ri">{cur.previews?.[String(r) as '1'] ?? ''}</div>
              </button>
            ))}
          </div>
        )}
        {!finished && (
          <div className="study-foot">
            <span><kbd>空格</kbd> 翻面</span>
            <span><kbd>1</kbd>-<kbd>4</kbd> 评分</span>
            <span><kbd>Z</kbd> 撤销</span>
            <span><kbd>E</kbd> 编辑</span>
            <span><kbd>@</kbd> 暂停</span>
            <span><kbd>Esc</kbd> 退出</span>
          </div>
        )}
      </div>

      {editorOpen && cur && (
        <CardEditor payload={{ card: cur }} onClose={() => setEditorOpen(false)} onSaved={onEditorSaved} />
      )}
    </div>
  );
}
