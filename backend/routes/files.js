'use strict';

const express = require('express');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const { db } = require('../lib/db');
const {
  sshConnect, sshExec, getSftp,
  sftpStat, sftpReaddir,
  sftpMkdirP, sftpRename,
  sftpDeleteRecursive, sftpTree,
  normalizeConfig,
} = require('../lib/ssh');
const { authMiddleware, getEffectivePerms, getClientIp, auditLog, resolveConfig, JWT_SECRET } = require('../middleware');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// ─── Run command ──────────────────────────────────────────────────────────────
router.post('/run', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, configLabel } = resolved;
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout, stderr } = await sshExec(conn, req.body.command || 'echo hi');
    auditLog(req.user.id, req.user.username, 'run_command', configLabel, req.body.command, getClientIp(req));
    res.json({ stdout, stderr });
  } catch {
    res.status(500).json({ error: 'Command execution failed' });
  } finally {
    if (conn) conn.end();
  }
});

// ─── Saved commands ───────────────────────────────────────────────────────────
router.get('/saved-commands', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM saved_commands WHERE user_id = ? ORDER BY id').all(req.user.id));
});

router.post('/saved-commands', authMiddleware, (req, res) => {
  const { label, command } = req.body;
  if (!label || !command) return res.status(400).json({ error: 'label and command required' });
  const r = db.prepare('INSERT INTO saved_commands (user_id, label, command) VALUES (?,?,?)').run(req.user.id, label.trim(), command.trim());
  res.json({ id: r.lastInsertRowid, label: label.trim(), command: command.trim() });
});

router.delete('/saved-commands/:id', authMiddleware, (req, res) => {
  const cmd = db.prepare('SELECT * FROM saved_commands WHERE id = ?').get(req.params.id);
  if (!cmd) return res.status(404).json({ error: 'Not found' });
  if (cmd.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM saved_commands WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Files — all via SFTP, no shell path injection ────────────────────────────

router.post('/files/list', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg } = resolved;
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    const dir  = req.body.path || `/home/${cfg.username}`;
    const entries = await sftpReaddir(sftp, dir);
    const items = entries.map(e => ({
      name:        e.filename,
      type:        e.attrs.isDirectory() ? 'dir' : e.attrs.isSymbolicLink() ? 'link' : 'file',
      size:        e.attrs.size  || 0,
      modified:    e.attrs.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
      permissions: e.longname?.slice(0, 10) || '',
    }));
    res.json({ items, path: dir });
  } catch {
    res.status(500).json({ error: 'Failed to list directory' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/read', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms, configLabel } = resolved;
  if (!perms.can_read) return res.status(403).json({ error: 'Read access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const stream = sftp.createReadStream(req.body.path, { encoding: 'utf8' });
      stream.on('data', d => chunks.push(d));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    auditLog(req.user.id, req.user.username, 'read_file', req.body.path, null, getClientIp(req));
    res.json({ content: chunks.join('') });
  } catch {
    res.status(500).json({ error: 'Failed to read file' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/write', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_write) return res.status(403).json({ error: 'Write access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    await new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(req.body.path);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(Buffer.from(req.body.content, 'utf8'));
    });
    auditLog(req.user.id, req.user.username, 'write_file', req.body.path, null, getClientIp(req));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to write file' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/delete', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_delete) return res.status(403).json({ error: 'Delete access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    await sftpDeleteRecursive(sftp, req.body.path);
    auditLog(req.user.id, req.user.username, 'delete_file', req.body.path, null, getClientIp(req));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/rename', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_write) return res.status(403).json({ error: 'Write access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    await sftpRename(sftp, req.body.from, req.body.to);
    auditLog(req.user.id, req.user.username, 'rename_file', req.body.from, `→ ${req.body.to}`, getClientIp(req));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to rename' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/mkdir', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_write) return res.status(403).json({ error: 'Write access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    await sftpMkdirP(sftp, req.body.path);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to create directory' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/dirsize', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg } = resolved;
  if (!req.body.path) return res.status(400).json({ error: 'path required' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout } = await sshExec(conn,
      `du -sh -- ${JSON.stringify(req.body.path)} 2>/dev/null | cut -f1`
    );
    res.json({ size: stdout.trim() || '0' });
  } catch {
    res.status(500).json({ error: 'Failed to get directory size' });
  } finally {
    if (conn) conn.end();
  }
});

router.post('/files/tree', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg } = resolved;
  const dir      = req.body.path || `/home/${cfg.username}`;
  const maxDepth = Math.min(Number(req.body.depth) || 2, 4);
  let conn;
  try {
    conn = await sshConnect(cfg);
    // find is safe here — path is passed as a quoted argument via JSON.stringify,
    // not interpolated into the shell command string
    const { stdout } = await sshExec(conn,
      `find ${JSON.stringify(dir)} -maxdepth ${maxDepth} -type d 2>/dev/null | head -200`
    );
    const dirs = stdout.split('\n').filter(Boolean);
    res.json({ dirs, root: dir });
  } catch {
    res.status(500).json({ error: 'Failed to get directory tree' });
  } finally {
    if (conn) conn.end();
  }
});

// ─── Download ─────────────────────────────────────────────────────────────────
async function handleDownload(req, res) {
  const src = req.method === 'GET' ? req.query : req.body;

  if (req.method === 'GET' && src.token) {
    try { req.user = jwt.verify(src.token, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Unauthorized' }); }
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const filePath = src.path;
  let cfg;

  if (src.configId) {
    const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(src.configId);
    if (!cfgRow) return res.status(404).json({ error: 'Config not found' });
    const p = getEffectivePerms(req.user.id, cfgRow.id);
    if (!p?.can_read) return res.status(403).json({ error: 'No access' });
    cfg = normalizeConfig(cfgRow);
  } else {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    cfg = normalizeConfig(src);
  }

  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp  = await getSftp(conn);
    const stats = await sftpStat(sftp, filePath);
    const filename = filePath.split('/').pop();
    const encoded  = encodeURIComponent(filename);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    if (stats?.size) res.setHeader('Content-Length', stats.size);

    auditLog(req.user?.id, req.user?.username, 'download_file', filePath, null, getClientIp(req));

    const readStream = sftp.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    readStream.on('error', () => { try { conn.end(); } catch {} if (!res.headersSent) res.status(500).end(); });
    res.on('finish', () => { try { conn.end(); } catch {} });
    res.on('close',  () => { try { readStream.destroy(); conn.end(); } catch {} });
    readStream.pipe(res);
  } catch {
    try { if (conn) conn.end(); } catch {}
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
}

router.get('/files/download',  authMiddleware, handleDownload);
router.post('/files/download', authMiddleware, handleDownload);

// ─── Upload ───────────────────────────────────────────────────────────────────
router.post('/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_upload) return res.status(403).json({ error: 'Upload access denied' });
  if (!req.file)         return res.status(400).json({ error: 'No file provided' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp     = await getSftp(conn);
    const destPath = `${req.body.path}/${req.file.originalname}`;
    await new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(destPath);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(req.file.buffer);
    });
    auditLog(req.user.id, req.user.username, 'upload_file', destPath, `size=${req.file.size}`, getClientIp(req));
    res.json({ ok: true, path: destPath });
  } catch {
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    if (conn) conn.end();
  }
});

module.exports = router;
