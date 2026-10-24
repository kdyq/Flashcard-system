import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { D } from '../utils/anim';

/** 卡片内容统一渲染入口:Markdown + GFM + KaTeX($行内 / $$块级) */
export default function MarkdownView({ md, className = '' }: { md: string; className?: string }) {
  void D; // 保持与动效模块同源(reduced-motion 常量在样式层生效)
  return (
    <div className={`md-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {md || ''}
      </ReactMarkdown>
    </div>
  );
}
