const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const { seed, UPLOAD_DIR } = require('./db');
const { registerRoutes } = require('./routes');
const { requireAuth } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态资源：同源前端
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// 上传存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

seed();
registerRoutes(app, upload);

// 下载已上传文档文件（doc_files）
app.get('/api/doc-files/:id/download', requireAuth, (req, res) => {
  const { db } = require('./db');
  const row = db.prepare('SELECT * FROM doc_files WHERE id = ?').get(Number(req.params.id));
  if (!row || !row.path) return res.status(404).json({ error: '文件不存在' });
  const p = path.join(UPLOAD_DIR, row.path);
  if (!fs.existsSync(p)) return res.status(404).json({ error: '文件已丢失' });
  res.download(p, row.name);
});

// SPA 回退
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`智项目 · 多项目管理系统 V1.0.1 已启动：http://localhost:${PORT}`);
  console.log(`演示账号：pmo / pmo2026（管理员），viewer / pmo2026（只读）`);
});
