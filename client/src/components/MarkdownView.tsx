import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** 卡片内容统一渲染入口:Markdown + GFM + KaTeX($行内 / $$块级) */
export default function MarkdownView({ md, className = '', inline = false }: {
  md: string; className?: string; inline?: boolean;
}) {
  return (
    <div className={`md-content ${inline ? 'md-inline' : ''} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {md || ''}
      </ReactMarkdown>
    </div>
  );
}
