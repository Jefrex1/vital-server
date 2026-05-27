'use strict';

const express = require('express');
const { db } = require('../lib/db');
const { sshConnect, sshExec, normalizeConfig } = require('../lib/ssh');
const { authMiddleware, adminMiddleware, getClientIp, auditLog } = require('../middleware');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const invites = db.prepare(`
    SELECT r.id, r.group_id, r.from_user_id, r.created_at, r.status,
           g.name as group_name, g.description as group_description,
           u.username as from_username
    FROM group_join_requests r
    JOIN groups g ON g.id = r.group_id
    JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json(invites);
});

router.get('/all', authMiddleware, adminMiddleware, (req, res) => {
  const invites = db.prepare(`
    SELECT r.*, g.name as group_name, uf.username as from_username, ut.username as to_username
    FROM group_join_requests r
    JOIN groups g ON g.id = r.group_id
    JOIN users uf ON uf.id = r.from_user_id
    JOIN users ut ON ut.id = r.to_user_id
    ORDER BY r.created_at DESC
  `).all();
  res.json(invites);
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const invite = db.prepare('SELECT * FROM group_join_requests WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.to_user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Invite already processed' });

  const { action } = req.body;
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' });

  db.prepare('UPDATE group_join_requests SET status = ? WHERE id = ?').run(
    action === 'accept' ? 'accepted' : 'declined', req.params.id
  );

  if (action === 'accept') {
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, group_role) VALUES (?,?,'member')").run(invite.group_id, req.user.id);
    auditLog(req.user.id, req.user.username, 'group_join_accepted', invite.group_id, null, getClientIp(req));

    const grp = db.prepare('SELECT * FROM groups WHERE id = ?').get(invite.group_id);
    if (grp?.linux_user && grp?.provision_config_id) {
      const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(grp.provision_config_id);
      if (cfgRow) {
        const safeUsername = req.user.username.replace(/[^a-z0-9_.-]/gi, '');
        const safeGroup    = grp.linux_user.replace(/[^a-z0-9_]/gi, '');
        sshConnect(normalizeConfig(cfgRow)).then(conn => {
          sshExec(conn, `sudo sh -c "id '${safeUsername}' 2>/dev/null && usermod -aG ${safeGroup} '${safeUsername}' || true"`)
            .catch(e => console.error('[invite accept] usermod failed:', e.message))
            .finally(() => conn.end());
        }).catch(e => console.error('[invite accept] ssh connect failed:', e.message));
      }
    }
  } else {
    auditLog(req.user.id, req.user.username, 'group_join_declined', invite.group_id, null, getClientIp(req));
  }

  res.json({ ok: true });
});

module.exports = router;
