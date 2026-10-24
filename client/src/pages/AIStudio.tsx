import { Link } from 'react-router-dom';

/** AI 工作台:P3 实装(粘贴笔记 → 生成草稿 → 勾选入库) */
export default function AIStudio() {
  return (
    <div style={{ textAlign: 'center', padding: '70px 20px' }}>
      <div className="page-title" style={{ fontSize: 40 }}>AI 工作台</div>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
        粘贴笔记自动生成闪卡的功能将在 P3 阶段开放。<br />
        需要先在 <Link to="/settings" style={{ color: 'var(--accent)' }}>设置</Link> 中配置 AI 服务。
      </p>
    </div>
  );
}
