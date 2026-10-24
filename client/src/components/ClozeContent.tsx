import MarkdownView from './MarkdownView';

/**
 * 填空卡渲染:activeIndex 项 → 正面挖空(虚线空位)/ 背面高亮答案;其余挖空项原样显示。
 * 挖空在纯文本层切分(与 Anki 行为一致),其余片段仍走 Markdown 管线。
 */
export default function ClozeContent({ md, activeIndex, revealed }: {
  md: string; activeIndex: number | null; revealed: boolean;
}) {
  if (activeIndex == null) {
    return <MarkdownView md={md.replace(/\{\{c\d+::([\s\S]*?)\}\}/g, '$1')} />;
  }
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of md.matchAll(/\{\{c(\d+)::([\s\S]*?)\}\}/g)) {
    const before = md.slice(last, m.index);
    if (before) out.push(<MarkdownView md={before} key={key++} inline />);
    const idx = Number(m[1]);
    if (idx === activeIndex) {
      out.push(revealed
        ? <span className="key" key={key++}>{m[2]}</span>
        : <span className="blank" key={key++} />);
    } else {
      out.push(<span key={key++}>{m[2]}</span>);
    }
    last = m.index + m[0].length;
  }
  const tail = md.slice(last);
  if (tail) out.push(<MarkdownView md={tail} key={key++} inline />);
  return <>{out}</>;
}
