import { useEffect } from 'react';

/**
 * 浏览器复习提醒:开启后每 30s 检查一次,到点且当天未提醒过 → 发系统通知。
 * 权限在设置页开启开关时请求(用户手动授权)。
 */
export default function useReminder(enabled: boolean, time: string) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === 'undefined') return;
    const key = () => `fanfan-notified-${new Date().toLocaleDateString('sv-SE')}`;
    const tick = () => {
      if (Notification.permission !== 'granted') return;
      if (localStorage.getItem(key())) return;
      const [h, m] = (time || '20:00').split(':').map(Number);
      const now = new Date();
      if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
        try {
          new Notification('翻翻 FanFan', {
            body: '到复习时间了,今天还没翻牌哦。',
            tag: 'fanfan-reminder',
          });
          localStorage.setItem(key(), '1');
        } catch { /* 通知失败不影响 */ }
      }
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [enabled, time]);
}
