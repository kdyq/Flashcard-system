import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, UPLOADS_DIR, nowISO } from '../db';

const router = Router();

const EXT_OK = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.wav', '.ogg', '.m4a', '.webm']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safe = EXT_OK.has(ext) ? ext : '';
    cb(null, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|audio)\//.test(file.mimetype || '')) return cb(null, true);
    cb(new Error('只支持图片或音频文件'));
  },
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' });
  const { filename, mimetype, size } = req.file;
  db.prepare('INSERT INTO media(filename, mime, size, created_at) VALUES(?,?,?,?)')
    .run(filename, mimetype, size, nowISO());
  res.status(201).json({ url: `/uploads/${filename}`, filename, mime: mimetype, size });
});

export default router;
