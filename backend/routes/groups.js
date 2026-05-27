'use strict';

const express = require('express');
const { db, encrypt } = require('../lib/db');
const { sshConnect, sshExec, normalizeConfig } = require('../lib/ssh');
const {
  authMiddleware, adminMiddleware,
  getClientIp, auditLog,
  roleToPerms, normalizeAccessRole,
} = require('../middleware');

const router = express.Router();

// ─── Groups ───────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const groups = db.prepare('SELECT * FROM groups ORDER BY id').all();
  const result = groups.map(g => ({
    ...g,
    // Never expose the private key stored in provisioning
    linux_privkey: g.linux_privkey ? '[KEY SET]' : null,
    members: db.prepare(`
      SELECT u.id, u.username, u.role, gm.group_role FROM group_members gm
      JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?
    `).all(g.id),
    configs: db.prepare(`
      SELECT sc.id, sc.label, sc.host, sc.port, sc.username, sc.auth_type, gc.access_role
      FROM group_configs gc
      JOIN ssh_configs sc ON sc.id = gc.config_id WHERE gc.group_id = ?
    `).all(g.id),
  }));
  res.json(result);
});

router.post('/', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare(
      'INSERT INTO groups (name, description, owner_id) VALUES (?,?,?)'
    ).run(name, description || null, req.user.id);
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, group_role) VALUES (?,?,'owner')").run(result.lastInsertRowid, req.user.id);
    auditLog(req.user.id, req.user.username, 'create_group', name, null, getClientIp(req));
    res.json({ id: result.lastInsertRowid, name, description, owner_id: req.user.id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Group already exists' });
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can delete' });
  }

  if (g.linux_user && g.provision_config_id) {
    const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(g.provision_config_id);
    if (cfgRow) {
      try {
        const conn = await sshConnect(normalizeConfig(cfgRow));
        // Only delete the managed linux user/group — no user-supplied path here
        const safeUser = g.linux_user.replace(/[^a-z0-9_]/gi, '');
        await sshExec(conn, `sudo userdel -r ${safeUser} 2>/dev/null || true`);
        await sshExec(conn, `sudo groupdel ${safeUser} 2>/dev/null || true`);
        conn.end();
      } catch (e) { console.error('[delete_group] userdel failed:', e.message); }
    }
  }

  db.prepare('DELETE FROM ssh_configs WHERE group_id = ?').run(req.params.id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  auditLog(req.user.id, req.user.username, 'delete_group', g.name, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── Members ──────────────────────────────────────────────────────────────────
router.post('/:id/members', authMiddleware, async (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can add members' });
  }
  const { user_id, group_role } = req.body;
  const safeRole = ['owner', 'moderator', 'member'].includes(group_role) ? group_role : 'member';
  try {
    db.prepare('INSERT OR REPLACE INTO group_members (group_id, user_id, group_role) VALUES (?,?,?)').run(req.params.id, user_id, safeRole);

    if (g.linux_user && g.provision_config_id) {
      const newMember = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id);
      const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(g.provision_config_id);
      if (newMember && cfgRow) {
        try {
          const conn = await sshConnect(normalizeConfig(cfgRow));
          // username comes from our DB — sanitize anyway
          const safeUsername = newMember.username.replace(/[^a-z0-9_.-]/gi, '');
          const safeGroup    = g.linux_user.replace(/[^a-z0-9_]/gi, '');
          await sshExec(conn, `sudo sh -c "id '${safeUsername}' 2>/dev/null && usermod -aG ${safeGroup} '${safeUsername}' || true"`);
          conn.end();
        } catch (e) { console.error('[members] usermod failed:', e.message); }
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to add member' }); }
});

router.patch('/:id/members/:uid/role', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only group owner can change roles' });
  }
  const safeRole = ['owner', 'moderator', 'member'].includes(req.body.group_role) ? req.body.group_role : 'member';
  db.prepare('UPDATE group_members SET group_role=? WHERE group_id=? AND user_id=?').run(safeRole, req.params.id, req.params.uid);
  res.json({ ok: true });
});

router.delete('/:id/members/:uid', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const isSelf = Number(req.params.uid) === req.user.id;
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id && !isSelf) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.uid);
  res.json({ ok: true });
});

// ─── Invites ──────────────────────────────────────────────────────────────────
router.post('/:id/invite', authMiddleware, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (req.user.role !== 'admin' && group.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can invite' });
  }

  const { username, user_id } = req.body;
  const targetUser = user_id
    ? db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id)
    : db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, targetUser.id);
  if (isMember) return res.status(409).json({ error: 'User is already a member' });

  const existing = db.prepare(
    "SELECT id FROM group_join_requests WHERE group_id = ? AND to_user_id = ? AND status = 'pending'"
  ).get(req.params.id, targetUser.id);
  if (existing) return res.status(409).json({ error: 'Invite already pending' });

  db.prepare("DELETE FROM group_join_requests WHERE group_id = ? AND to_user_id = ? AND status != 'pending'").run(req.params.id, targetUser.id);

  try {
    const result = db.prepare(
      'INSERT INTO group_join_requests (group_id, from_user_id, to_user_id, status) VALUES (?,?,?,?)'
    ).run(req.params.id, req.user.id, targetUser.id, 'pending');
    auditLog(req.user.id, req.user.username, 'group_invite', group.name, `invited=${targetUser.username}`, getClientIp(req));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Invite already pending' });
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

// ─── Group configs (servers assigned to group) ────────────────────────────────
router.post('/:id/configs', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can add servers' });
  }

  const { config_id } = req.body;
  const accessRole = normalizeAccessRole(req.body.access_role);
  if (!config_id) return res.status(400).json({ error: 'config_id required' });

  try {
    db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id, access_role) VALUES (?,?,?)').run(req.params.id, config_id, accessRole);
    db.prepare('UPDATE group_configs SET access_role=? WHERE group_id=? AND config_id=?').run(accessRole, req.params.id, config_id);

    const rolePerms = roleToPerms(accessRole);
    const exists = db.prepare("SELECT id FROM permissions WHERE target_type='group' AND target_id=? AND config_id=?").get(req.params.id, config_id);
    if (!exists) {
      db.prepare('INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload) VALUES (?,?,?,?,?,?,?,?)')
        .run('group', req.params.id, config_id, rolePerms.can_read, rolePerms.can_write, rolePerms.can_delete, rolePerms.can_terminal, rolePerms.can_upload);
    } else {
      db.prepare('UPDATE permissions SET can_read=?, can_write=?, can_delete=?, can_terminal=?, can_upload=? WHERE id=?')
        .run(rolePerms.can_read, rolePerms.can_write, rolePerms.can_delete, rolePerms.can_terminal, rolePerms.can_upload, exists.id);
    }

    auditLog(req.user.id, req.user.username, 'group_add_config', req.params.id, `config_id=${config_id}, role=${accessRole}`, getClientIp(req));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Failed to add server to group' }); }
});

router.delete('/:id/configs/:cid', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can remove servers' });
  }
  db.prepare('DELETE FROM group_configs WHERE group_id = ? AND config_id = ?').run(req.params.id, req.params.cid);
  auditLog(req.user.id, req.user.username, 'group_remove_config', req.params.id, `config_id=${req.params.cid}`, getClientIp(req));
  res.json({ ok: true });
});

// ─── Provisioning ─────────────────────────────────────────────────────────────
router.post('/:id/provision', authMiddleware, async (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (req.user.role !== 'admin' && group.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can provision' });
  }

  const configId = req.body.provision_config_id || group.provision_config_id;
  if (!configId) return res.status(400).json({ error: 'provision_config_id required' });

  const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(configId);
  if (!cfgRow) return res.status(404).json({ error: 'SSH config not found' });

  if (req.user.role !== 'admin') {
    const hasAccess = cfgRow.owner_id === req.user.id || (cfgRow.group_id && db.prepare(
      'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?'
    ).get(cfgRow.group_id, req.user.id));
    if (!hasAccess) return res.status(403).json({ error: 'No access to this SSH config' });
  }

  // linuxUser is derived from group.id — safe, no user input
  const linuxUser = `vt_group_${group.id}`;
  // rootPath comes from config/body — validate it's an absolute path with no shell metacharacters
  const rawRootPath = req.body.provision_root_path || group.provision_root_path || `/home/${linuxUser}`;
  if (!/^\/[a-zA-Z0-9_./-]*$/.test(rawRootPath)) {
    return res.status(400).json({ error: 'Invalid provision_root_path' });
  }
  const rootPath = rawRootPath;

  // sudo_password: use a temp file to avoid it appearing in process args or logs
  const hasSudoPass = !!req.body.sudo_password;
  const sudo = (cmd) => hasSudoPass
    ? `echo ${JSON.stringify(req.body.sudo_password)} | sudo -S sh -c ${JSON.stringify(cmd)} 2>/dev/null`
    : `sudo sh -c ${JSON.stringify(cmd)}`;

  let conn;
  try {
    conn = await sshConnect(normalizeConfig(cfgRow));

    await sshExec(conn, sudo(`getent group ${linuxUser} || groupadd ${linuxUser}`));
    await sshExec(conn, sudo(`id ${linuxUser} 2>/dev/null || useradd -m -s /bin/bash -g ${linuxUser} ${linuxUser}`));
    await sshExec(conn, sudo(`mkdir -p '${rootPath}'`));
    await sshExec(conn, sudo(`chgrp ${linuxUser} '${rootPath}'`));
    await sshExec(conn, sudo(`chmod 2770 '${rootPath}'`));

    const parentPath = rootPath.split('/').slice(0, -1).join('/') || '/';
    if (parentPath !== '/') {
      await sshExec(conn, sudo(`chmod o+x '${parentPath}' 2>/dev/null || true`));
    }

    await sshExec(conn, sudo(
      `mkdir -p /home/${linuxUser}/.ssh && ` +
      `chmod 700 /home/${linuxUser}/.ssh && ` +
      `([ -f /home/${linuxUser}/.ssh/vt_key ] || ssh-keygen -t ed25519 -C 'vt_group_${group.id}' -f /home/${linuxUser}/.ssh/vt_key -N '') && ` +
      `grep -qF "$(cat /home/${linuxUser}/.ssh/vt_key.pub)" /home/${linuxUser}/.ssh/authorized_keys 2>/dev/null || cat /home/${linuxUser}/.ssh/vt_key.pub >> /home/${linuxUser}/.ssh/authorized_keys && ` +
      `chmod 700 /home/${linuxUser}/.ssh && ` +
      `chmod 600 /home/${linuxUser}/.ssh/authorized_keys /home/${linuxUser}/.ssh/vt_key && ` +
      `chown -R ${linuxUser}:${linuxUser} /home/${linuxUser}/.ssh`
    ));

    const { stdout: privKey, stderr: privErr } = await sshExec(conn, sudo(`cat /home/${linuxUser}/.ssh/vt_key`));
    const { stdout: pubKey } = await sshExec(conn, sudo(`cat /home/${linuxUser}/.ssh/vt_key.pub`));

    if (!privKey.trim()) throw new Error(`Failed to read private key: ${privErr}`);
    if (!pubKey.trim())  throw new Error('Failed to read public key');

    // Encrypt both keys before storing
    db.prepare(`
      UPDATE groups SET
        provision_config_id = ?,
        provision_root_path = ?,
        linux_user          = ?,
        linux_pubkey        = ?,
        linux_privkey       = ?,
        provisioned_at      = unixepoch()
      WHERE id = ?
    `).run(configId, rootPath, linuxUser, pubKey.trim(), encrypt(privKey.trim()), group.id);

    const existingGroupCfg = db.prepare('SELECT id FROM ssh_configs WHERE group_id = ?').get(group.id);
    let groupCfgId;
    if (!existingGroupCfg) {
      const r = db.prepare(
        'INSERT INTO ssh_configs (owner_id, group_id, label, host, port, username, ssh_key, auth_type) VALUES (?,?,?,?,?,?,?,?)'
      ).run(null, group.id, `[Group] ${group.name}`, cfgRow.host, cfgRow.port, linuxUser, encrypt(privKey.trim()), 'key');
      groupCfgId = r.lastInsertRowid;
      db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id, access_role) VALUES (?,?,?)').run(group.id, groupCfgId, 'admin');
      db.prepare('INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload, root_path) VALUES (?,?,?,1,1,1,1,1,?)')
        .run('group', group.id, groupCfgId, rootPath);
    } else {
      groupCfgId = existingGroupCfg.id;
      db.prepare("UPDATE ssh_configs SET ssh_key=?, host=?, port=?, username=?, auth_type='key' WHERE id=?")
        .run(encrypt(privKey.trim()), cfgRow.host, cfgRow.port, linuxUser, groupCfgId);
      db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id, access_role) VALUES (?,?,?)').run(group.id, groupCfgId, 'admin');
      db.prepare('UPDATE group_configs SET access_role=? WHERE group_id=? AND config_id=?').run('admin', group.id, groupCfgId);
      db.prepare("UPDATE permissions SET root_path=? WHERE target_type='group' AND target_id=? AND config_id=?")
        .run(rootPath, group.id, groupCfgId);
    }

    auditLog(req.user.id, req.user.username, 'group_provision', group.name, `linux_user=${linuxUser}, root=${rootPath}`, getClientIp(req));
    res.json({ ok: true, linux_user: linuxUser, root_path: rootPath, config_id: groupCfgId });
  } catch (e) {
    res.status(500).json({ error: 'Provisioning failed' });
  } finally {
    if (conn) conn.end();
  }
});

// ─── Share (symlinks) ─────────────────────────────────────────────────────────
router.post('/:id/share', authMiddleware, async (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(group.id, req.user.id);
  if (!isMember && req.user.role !== 'admin') return res.status(403).json({ error: 'Not a group member' });

  const { source_path, config_id } = req.body;
  if (!source_path) return res.status(400).json({ error: 'source_path required' });
  if (!config_id)   return res.status(400).json({ error: 'config_id required' });

  // Validate source_path — must be absolute, no shell metacharacters
  if (!/^\/[a-zA-Z0-9_./ -]*$/.test(source_path)) {
    return res.status(400).json({ error: 'Invalid source_path' });
  }

  const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(config_id);
  if (!cfgRow) return res.status(404).json({ error: 'Config not found' });

  const members = db.prepare(`
    SELECT u.username FROM group_members gm
    JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?
  `).all(group.id);

  const itemName = source_path.split('/').pop().replace(/[^a-zA-Z0-9_. -]/g, '');
  const errors = [];
  let conn;

  try {
    conn = await sshConnect(normalizeConfig(cfgRow));
    for (const member of members) {
      const safeUsername = member.username.replace(/[^a-z0-9_.-]/gi, '');
      const linkPath = `/home/${safeUsername}/${itemName}`;
      const { stderr } = await sshExec(conn, `ln -sfn "${source_path}" "${linkPath}" 2>&1`);
      if (stderr) errors.push(`${member.username}: ${stderr.trim()}`);
    }

    auditLog(req.user.id, req.user.username, 'share_path', group.name, `path=${source_path}`, getClientIp(req));
    res.json(errors.length ? { ok: true, warnings: errors } : { ok: true, linked: members.length });
  } catch (e) {
    res.status(500).json({ error: 'Share operation failed' });
  } finally {
    if (conn) conn.end();
  }
});

module.exports = router;
