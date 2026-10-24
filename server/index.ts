import dotenv from 'dotenv';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 密钥在项目根 .env(npm --prefix 会把 CWD 切到 server/,必须显式指回根目录)
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
// 本机网络对部分域名 IPv6 黑洞(如 api.agnes-ai.cn),强制 IPv4 优先
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import { UPLOADS_DIR } from './db';
import { backupOnce } from './backup';
import decksRoutes from './routes/decks';
import cardsRoutes from './routes/cards';
import studyRoutes from './routes/study';
import statsRoutes from './routes/stats';
import ioRoutes from './routes/io';
import mediaRoutes from './routes/media';
import settingsRoutes from './routes/settings';
import aiRoutes from './routes/ai';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'fanfan-server', time: new Date().toISOString() }));
app.use('/api/decks', decksRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/study', studyRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', ioRoutes);       // /api/export /api/import
app.use('/api/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);

// 全局错误兜底
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server]', err);
  res.status(err?.status || 500).json({ error: err?.message || '服务器内部错误' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[fanfan-server] listening on http://localhost:${PORT}`);
  // 每日首次启动自动备份(静默失败不影响使用)
  backupOnce().then(dest => { if (dest) console.log('[backup] 每日备份完成:', dest); }).catch(e => console.warn('[backup] 失败:', e.message));
});
