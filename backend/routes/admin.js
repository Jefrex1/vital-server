'use strict';

const express = require('express');
const { db } = require('../lib/db');
const { authMiddleware, adminMiddleware } = require('../middleware');

const router = express.Router();

router.get('/permissions', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM permissions ORDER BY id').all());
});

router.post('/permissions', authMiddleware, adminMiddleware, (req, res) => {
  const { target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload, root_path } = req.body;
  if (!target_type || !target_id) return res.status(400).json({ error: 'target_type and target_id required' });
  const result = db.prepare(
    'INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload, root_path) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(target_type, target_id, config_id || null,
        can_read ? 1 : 0, can_write ? 1 : 0, can_delete ? 1 : 0, can_terminal ? 1 : 0, can_upload ? 1 : 0,
        root_path || null);
  res.json({ id: result.lastInsertRowid });
});

router.delete('/permissions/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM permissions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/audit', authMiddleware, adminMiddleware, (req, res) => {
  const limit  = Math.min(Number(req.query.limit)  || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const rows   = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total  = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  res.json({ rows, total });
});

module.exports = router;
