import 'dotenv/config';
import express from 'express';
import { UPLOADS_DIR } from './db';
import decksRoutes from './routes/decks';
import cardsRoutes from './routes/cards';
import studyRoutes from './routes/study';
import statsRoutes from './routes/stats';
import ioRoutes from './routes/io';
import mediaRoutes from './routes/media';
import settingsRoutes from './routes/settings';

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

// 全局错误兜底
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server]', err);
  res.status(err?.status || 500).json({ error: err?.message || '服务器内部错误' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[fanfan-server] listening on http://localhost:${PORT}`);
});
