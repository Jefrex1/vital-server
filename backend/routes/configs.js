'use strict';

const express = require('express');
const { db, encrypt } = require('../lib/db');
const { authMiddleware, adminMiddleware, getClientIp, auditLog } = require('../middleware');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const { id: userId } = req.user;
  const rows = db.prepare(`
    SELECT DISTINCT sc.*,
           CASE WHEN sc.group_id IS NOT NULL THEN g.provision_root_path ELSE NULL END as provision_root_path,
           gc.access_role,
           gc.group_id as gc_group_id,
           g.name as group_name
    FROM ssh_configs sc
    LEFT JOIN group_configs gc ON gc.config_id = sc.id
    LEFT JOIN group_members gm ON gm.group_id = gc.group_id AND gm.user_id = ?
    LEFT JOIN groups g ON g.id = COALESCE(sc.group_id, gc.group_id)
    WHERE sc.owner_id = ?
       OR gm.user_id = ?
       OR (sc.owner_id IS NULL AND sc.group_id IS NULL)
    ORDER BY sc.id
  `).all(userId, userId, userId);

  // Never expose raw secrets to the client
  const result = rows.map(r => ({
    ...r,
    ssh_key:  r.ssh_key  ? '[KEY SET]'      : null,
    password: r.password ? '[PASSWORD SET]' : null,
  }));
  res.json(result);
});

router.post('/', authMiddleware, (req, res) => {
  const { label, host, port, username, password, ssh_key, auth_type, group_id, shared } = req.body;
  if (!label || !host || !username) return res.status(400).json({ error: 'label, host, username required' });

  const ownerId = shared && req.user.role === 'admin' ? null : req.user.id;
  const type    = auth_type || (ssh_key ? 'key' : 'password');

  const result = db.prepare(
    'INSERT INTO ssh_configs (owner_id, group_id, label, host, port, username, password, ssh_key, auth_type) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(ownerId, group_id || null, label, host, Number(port) || 22, username,
        encrypt(password) || null,
        encrypt(ssh_key)  || null,
        type);

  auditLog(req.user.id, req.user.username, 'create_config', label, `host=${host}`, getClientIp(req));
  res.json({ id: result.lastInsertRowid });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const cfg = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(req.params.id);
  if (!cfg) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && cfg.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM ssh_configs WHERE id = ?').run(req.params.id);
  auditLog(req.user.id, req.user.username, 'delete_config', cfg.label, null, getClientIp(req));
  res.json({ ok: true });
});

module.exports = router;
