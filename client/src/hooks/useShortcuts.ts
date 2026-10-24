import { useEffect, useRef } from 'react';

export interface ShortcutMap {
  onSpace?: () => void;
  onDigit?: (n: 1 | 2 | 3 | 4) => void;
  onKey?: (key: string) => void;
}

/** 全局快捷键:空格 / 数字 / 自定义字母键。target 输入框聚焦时忽略 */
export default function useShortcuts(map: ShortcutMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); mapRef.current.onSpace?.(); }
      else if (e.key >= '1' && e.key <= '4') mapRef.current.onDigit?.(Number(e.key) as 1 | 2 | 3 | 4);
      else mapRef.current.onKey?.(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
