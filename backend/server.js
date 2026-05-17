const express = require('express');
const cors = require('cors');
const { Client } = require('ssh2');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const http = require('http');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// ─── DB Init ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'oserver.db');
const JWT_SECRET = process.env.JWT_SECRET || 'oserver-secret-change-me-in-production';
const BCRYPT_ROUNDS = 10;

// Allow public registration? Set ALLOW_REGISTER=false to disable after initial setup
const ALLOW_PUBLIC_REGISTER = process.env.ALLOW_REGISTER !== 'false';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'user', -- 'admin' | 'user'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login  INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    email       TEXT,
    bio         TEXT,
    theme       TEXT    NOT NULL DEFAULT 'dark',
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    group_role  TEXT    NOT NULL DEFAULT 'member', -- 'owner' | 'moderator' | 'member'
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS group_join_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(group_id, from_user_id, to_user_id)
  );

  CREATE TABLE IF NOT EXISTS ssh_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    label       TEXT    NOT NULL,
    host        TEXT    NOT NULL,
    port        INTEGER NOT NULL DEFAULT 22,
    username    TEXT    NOT NULL,
    password    TEXT,
    ssh_key     TEXT,
    auth_type   TEXT    NOT NULL DEFAULT 'password',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS group_configs (
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    config_id   INTEGER NOT NULL REFERENCES ssh_configs(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, config_id)
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT    NOT NULL,
    target_id   INTEGER NOT NULL,
    config_id   INTEGER REFERENCES ssh_configs(id) ON DELETE CASCADE,
    can_read    INTEGER NOT NULL DEFAULT 1,
    can_write   INTEGER NOT NULL DEFAULT 0,
    can_delete  INTEGER NOT NULL DEFAULT 0,
    can_terminal INTEGER NOT NULL DEFAULT 0,
    can_upload  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username    TEXT,
    action      TEXT    NOT NULL,
    target      TEXT,
    detail      TEXT,
    ip          TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Create default admin if no users exist
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const hashed = bcrypt.hashSync('admin', BCRYPT_ROUNDS);
  db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')").run(hashed);
  console.log('[oServer] Created default admin user: admin / admin');
}

// Migration: add group_role to group_members if missing
try {
  const cols = db.prepare('PRAGMA table_info(group_members)').all().map(c => c.name);
  if (!cols.includes('group_role')) {
    db.exec("ALTER TABLE group_members ADD COLUMN group_role TEXT NOT NULL DEFAULT 'member'");
    const groupCols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
    if (groupCols.includes('owner_id')) {
      const groups = db.prepare('SELECT id, owner_id FROM groups WHERE owner_id IS NOT NULL').all();
      for (const g of groups) {
        db.prepare("UPDATE group_members SET group_role='owner' WHERE group_id=? AND user_id=?").run(g.id, g.owner_id);
      }
    }
    console.log('[oServer] Migrated: added group_role to group_members');
  }
} catch(e) { console.error('[oServer] Migration error (group_role):', e.message); }

// Migration: restore owner_id in groups if a previous version removed it
try {
  const groupCols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
  if (!groupCols.includes('owner_id')) {
    db.exec("ALTER TABLE groups ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
    const owners = db.prepare("SELECT group_id, user_id FROM group_members WHERE group_role='owner'").all();
    for (const o of owners) {
      db.prepare('UPDATE groups SET owner_id=? WHERE id=?').run(o.user_id, o.group_id);
    }
    console.log('[oServer] Migrated: restored owner_id in groups');
  }
} catch(e) { console.error('[oServer] Migration error (owner_id):', e.message); }

// Migration: add provisioning columns to groups if missing
try {
  const gCols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
  if (!gCols.includes('provision_config_id')) {
    db.exec('ALTER TABLE groups ADD COLUMN provision_config_id INTEGER REFERENCES ssh_configs(id) ON DELETE SET NULL');
    db.exec('ALTER TABLE groups ADD COLUMN provision_root_path TEXT');
    db.exec('ALTER TABLE groups ADD COLUMN linux_user TEXT');
    db.exec('ALTER TABLE groups ADD COLUMN linux_pubkey TEXT');
    db.exec('ALTER TABLE groups ADD COLUMN linux_privkey TEXT');
    db.exec('ALTER TABLE groups ADD COLUMN provisioned_at INTEGER');
    console.log('[oServer] Migrated: added provisioning columns to groups');
  }
} catch(e) { console.error('[oServer] Migration error (group provisioning):', e.message); }

// Migration: add root_path to permissions if missing
try {
  const pCols = db.prepare('PRAGMA table_info(permissions)').all().map(c => c.name);
  if (!pCols.includes('root_path')) {
    db.exec('ALTER TABLE permissions ADD COLUMN root_path TEXT');
    console.log('[oServer] Migrated: added root_path to permissions');
  }
} catch(e) { console.error('[oServer] Migration error (root_path):', e.message); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function auditLog(userId, username, action, target, detail, ip) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, username, action, target, detail, ip) VALUES (?,?,?,?,?,?)')
      .run(userId || null, username || null, action, target || null, detail || null, ip || null);
  } catch {}
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

// ─── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden: admins only' });
  next();
}

// Check effective permissions for a user on a config
function getEffectivePerms(userId, configId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (user?.role === 'admin') {
    return { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 };
  }

  const userPerm = db.prepare(
    "SELECT * FROM permissions WHERE target_type='user' AND target_id=? AND (config_id=? OR config_id IS NULL)"
  ).get(userId, configId);

  const groupPerms = db.prepare(`
    SELECT p.* FROM permissions p
    JOIN group_members gm ON gm.group_id = p.target_id
    WHERE p.target_type = 'group' AND gm.user_id = ? AND (p.config_id = ? OR p.config_id IS NULL)
  `).all(userId, configId);

  const allPerms = [...(userPerm ? [userPerm] : []), ...groupPerms];
  if (allPerms.length === 0) return null;

  return {
    can_read:     allPerms.some(p => p.can_read)     ? 1 : 0,
    can_write:    allPerms.some(p => p.can_write)    ? 1 : 0,
    can_delete:   allPerms.some(p => p.can_delete)   ? 1 : 0,
    can_terminal: allPerms.some(p => p.can_terminal) ? 1 : 0,
    can_upload:   allPerms.some(p => p.can_upload)   ? 1 : 0,
  };
}

// ─── SSH helpers ──────────────────────────────────────────────────────────────
function sshConnect(config) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => {
      console.error('[sshConnect] error:', {
        host: config.host,
        username: config.username,
        auth_type: config.auth_type,
        has_password: !!config.password,
        has_key: !!config.ssh_key,
        key_length: config.ssh_key?.length,
        error: err.message,
      });
      reject(err);
    });

    const connectOpts = {
      host: config.host || '127.0.0.1',
      port: Number(config.port) || 22,
      username: config.username,
      readyTimeout: 10000,
    };

    if (config.auth_type === 'key' && config.ssh_key) {
      connectOpts.privateKey = config.ssh_key;
      if (config.passphrase) connectOpts.passphrase = config.passphrase;
    } else {
      connectOpts.password = config.password;
    }

    conn.connect(connectOpts);
  });
}

function sshExec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('close', () => resolve({ stdout, stderr }));
      stream.on('data', d => (stdout += d));
      stream.stderr.on('data', d => (stderr += d));
    });
  });
}

function getSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
  });
}

function sftpStat(sftp, path) {
  return new Promise((resolve) => {
    sftp.stat(path, (err, stats) => resolve(err ? null : stats));
  });
}

function normalizeConfig(src) {
  return {
    host:      src.host,
    port:      Number(src.port) || 22,
    username:  src.username,
    password:  src.password || null,
    ssh_key:   src.ssh_key || src.sshKey || null,
    auth_type: src.auth_type || src.authType || (src.ssh_key || src.sshKey ? 'key' : 'password'),
    passphrase: src.passphrase || null,
  };
}

// ─── Express + WS ─────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    auditLog(user.id, user.username, 'login_failed', null, null, getClientIp(req));
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);
  auditLog(user.id, user.username, 'login', null, null, getClientIp(req));

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// Public registration (can be disabled via ALLOW_REGISTER=false env var)
app.post('/auth/register/public', async (req, res) => {
  if (!ALLOW_PUBLIC_REGISTER) {
    return res.status(403).json({ error: 'Public registration is disabled' });
  }

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?,?,?)').run(username, hashed, 'user');
    auditLog(result.lastInsertRowid, username, 'register', null, 'public registration', getClientIp(req));

    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username, role: 'user' } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: e.message });
  }
});

// Admin-only: create user with role
app.post('/auth/register', authMiddleware, adminMiddleware, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const safeRole = role === 'admin' ? 'admin' : 'user';
  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?,?,?)').run(username, hashed, safeRole);
    auditLog(req.user.id, req.user.username, 'create_user', username, `role=${safeRole}`, getClientIp(req));
    res.json({ id: result.lastInsertRowid, username, role: safeRole });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ─── Users routes ─────────────────────────────────────────────────────────────
app.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY id').all();
  res.json(users);
});

app.patch('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { password, role } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, id);
  }
  if (role && (role === 'admin' || role === 'user')) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  }
  auditLog(req.user.id, req.user.username, 'update_user', user.username, JSON.stringify({ role }), getClientIp(req));
  res.json({ ok: true });
});

app.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  auditLog(req.user.id, req.user.username, 'delete_user', user.username, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── Groups routes ────────────────────────────────────────────────────────────
app.get('/groups', authMiddleware, (req, res) => {
  const groups = db.prepare('SELECT * FROM groups ORDER BY id').all();
  const result = groups.map(g => ({
    ...g,
    members: db.prepare(`
      SELECT u.id, u.username, u.role, gm.group_role FROM group_members gm
      JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?
    `).all(g.id),
    configs: db.prepare(`
      SELECT sc.id, sc.label, sc.host, sc.port, sc.username, sc.auth_type FROM group_configs gc
      JOIN ssh_configs sc ON sc.id = gc.config_id WHERE gc.group_id = ?
    `).all(g.id),
  }));
  res.json(result);
});

app.post('/groups', authMiddleware, (req, res) => {
  const { name, description, provision_config_id, provision_root_path } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare(
      'INSERT INTO groups (name, description, owner_id, provision_config_id, provision_root_path) VALUES (?,?,?,?,?)'
    ).run(name, description || null, req.user.id, provision_config_id || null, provision_root_path || null);
    // Auto-add creator as member with owner role
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, group_role) VALUES (?,?,'owner')").run(result.lastInsertRowid, req.user.id);
    auditLog(req.user.id, req.user.username, 'create_group', name, null, getClientIp(req));
    res.json({ id: result.lastInsertRowid, name, description, owner_id: req.user.id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Group already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/groups/:id', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Only group owner or admin can delete' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  auditLog(req.user.id, req.user.username, 'delete_group', g.name, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── Group provisioning ───────────────────────────────────────────────────────
// Owner or admin: creates Linux user + directory + SSH key for the group
app.post('/groups/:id/provision', authMiddleware, async (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // Allow group owner OR admin
  if (req.user.role !== 'admin' && group.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Only group owner or admin can provision' });

  const configId = req.body.provision_config_id || group.provision_config_id;
  const rootPath = req.body.provision_root_path || group.provision_root_path;

  if (!configId) return res.status(400).json({ error: 'provision_config_id required' });
  if (!rootPath) return res.status(400).json({ error: 'provision_root_path required' });

  const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(configId);
  if (!cfgRow) return res.status(404).json({ error: 'SSH config not found' });

  // Owner can only provision using a config they own or that belongs to their group
  if (req.user.role !== 'admin') {
    const hasAccess = cfgRow.owner_id === req.user.id || (cfgRow.group_id && db.prepare(
      'SELECT 1 FROM group_members WHERE group_id=? AND user_id=?'
    ).get(cfgRow.group_id, req.user.id));
    if (!hasAccess) return res.status(403).json({ error: 'No access to this SSH config' });
  }

  const linuxUser = `vt_group_${group.id}`;
  const sudoPassword = req.body.sudo_password || null;
  // Helper: prefix command with sudo, optionally passing password via stdin
  const sudo = (cmd) => sudoPassword
    ? `echo ${JSON.stringify(sudoPassword)} | sudo -S sh -c ${JSON.stringify(cmd)} 2>/dev/null`
    : `sudo ${cmd}`;

  let conn;
  try {
    const normalized = normalizeConfig(cfgRow);
    conn = await sshConnect(normalized);

    // 1. Create Linux group and user
    await sshExec(conn, sudo(`sh -c "getent group ${linuxUser} || groupadd ${linuxUser}"`));
    await sshExec(conn, sudo(`sh -c "id ${linuxUser} 2>/dev/null || useradd -m -s /bin/bash -g ${linuxUser} ${linuxUser}"`));

    // 1b. Add all current group members to the Linux group so they can access the folder
    const groupMembers = db.prepare('SELECT u.username FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(group.id);
    for (const member of groupMembers) {
      await sshExec(conn, sudo(`sh -c "id '${member.username}' 2>/dev/null && usermod -aG ${linuxUser} '${member.username}' || true"`));
    }

    // 2. Create root directory and set permissions
    await sshExec(conn, sudo(`sh -c "mkdir -p '${rootPath}' && chown ${linuxUser}:${linuxUser} '${rootPath}' && chmod 2770 '${rootPath}'"`) );

    // 3. Generate SSH key pair as vt_group_* user
    await sshExec(conn, sudo(
      `sh -c "` +
      `mkdir -p /home/${linuxUser}/.ssh && ` +
      `chmod 700 /home/${linuxUser}/.ssh && ` +
      `([ -f /home/${linuxUser}/.ssh/vt_key ] || ssh-keygen -t ed25519 -C 'vt_group_${group.id}' -f /home/${linuxUser}/.ssh/vt_key -N '') && ` +
      `grep -qF \"$(cat /home/${linuxUser}/.ssh/vt_key.pub)\" /home/${linuxUser}/.ssh/authorized_keys 2>/dev/null || cat /home/${linuxUser}/.ssh/vt_key.pub >> /home/${linuxUser}/.ssh/authorized_keys && ` +
      `chmod 700 /home/${linuxUser}/.ssh && ` +
      `chmod 600 /home/${linuxUser}/.ssh/authorized_keys /home/${linuxUser}/.ssh/vt_key && ` +
      `chown -R ${linuxUser}:${linuxUser} /home/${linuxUser}/.ssh` +
      `"`
    ));

    // Read keys via sudo since files are owned by vt_group_*
    const { stdout: privKey, stderr: privErr } = await sshExec(conn, sudo(`cat /home/${linuxUser}/.ssh/vt_key`));
    const { stdout: pubKey,  stderr: pubErr  } = await sshExec(conn, sudo(`cat /home/${linuxUser}/.ssh/vt_key.pub`));

    console.log('[provision] privKey length:', privKey.trim().length, 'privErr:', privErr);
    console.log('[provision] pubKey length:', pubKey.trim().length,  'pubErr:', pubErr);

    if (!privKey.trim()) throw new Error(`Failed to read private key — sudo stderr: ${privErr}`);
    if (!pubKey.trim())  throw new Error(`Failed to read public key — sudo stderr: ${pubErr}`);

    // 5. Save everything to DB
    const updateResult = db.prepare(`
      UPDATE groups SET
        provision_config_id = ?,
        provision_root_path = ?,
        linux_user = ?,
        linux_pubkey = ?,
        linux_privkey = ?,
        provisioned_at = unixepoch()
      WHERE id = ?
    `).run(configId, rootPath, linuxUser, pubKey.trim(), privKey.trim(), group.id);
    console.log('[provision] groups UPDATE changes:', updateResult.changes);

    // 6. Create or UPDATE a group SSH config — connects as vt_group_* with generated key
    const existingGroupCfg = db.prepare(
      "SELECT id FROM ssh_configs WHERE group_id = ?"
    ).get(group.id);
    console.log('[provision] existingGroupCfg:', existingGroupCfg);

    let groupCfgId;
    if (!existingGroupCfg) {
      console.log('[provision] Creating new ssh_config for group');
      const cfgResult = db.prepare(
        'INSERT INTO ssh_configs (owner_id, group_id, label, host, port, username, ssh_key, auth_type) VALUES (?,?,?,?,?,?,?,?)'
      ).run(null, group.id, `[Group] ${group.name}`, cfgRow.host, cfgRow.port, linuxUser, privKey.trim(), 'key');
      groupCfgId = cfgResult.lastInsertRowid;
      console.log('[provision] New ssh_config id:', groupCfgId);

      db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id) VALUES (?,?)').run(group.id, groupCfgId);

      db.prepare(
        'INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload, root_path) VALUES (?,?,?,1,1,1,1,1,?)'
      ).run('group', group.id, groupCfgId, rootPath);
    } else {
      groupCfgId = existingGroupCfg.id;
      console.log('[provision] Updating existing ssh_config id:', groupCfgId);
      db.prepare(
        "UPDATE ssh_configs SET ssh_key = ?, host = ?, port = ?, username = ?, auth_type = 'key' WHERE id = ?"
      ).run(privKey.trim(), cfgRow.host, cfgRow.port, linuxUser, groupCfgId);
      // Ensure group_configs link exists (may have been deleted)
      db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id) VALUES (?,?)').run(group.id, groupCfgId);
      db.prepare(
        "UPDATE permissions SET root_path = ? WHERE target_type='group' AND target_id = ? AND config_id = ?"
      ).run(rootPath, group.id, groupCfgId);
    }

    auditLog(req.user.id, req.user.username, 'group_provision', group.name, `linux_user=${linuxUser}, root=${rootPath}`, getClientIp(req));
    res.json({ ok: true, linux_user: linuxUser, root_path: rootPath, config_id: groupCfgId });

  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (conn) conn.end();
  }
});

app.post('/groups/:id/members', authMiddleware, async (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Only group owner or admin can add members' });
  const { user_id, group_role } = req.body;
  const safeRole = ['owner','moderator','member'].includes(group_role) ? group_role : 'member';
  try {
    db.prepare('INSERT OR REPLACE INTO group_members (group_id, user_id, group_role) VALUES (?,?,?)').run(req.params.id, user_id, safeRole);

    // Якщо група провізіонована — додаємо юзера в Linux-групу на сервері
    if (g.linux_user && g.provision_config_id) {
      const newMember = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id);
      const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(g.provision_config_id);
      if (newMember && cfgRow) {
        try {
          const conn = await sshConnect(normalizeConfig(cfgRow));
          await sshExec(conn, `sudo sh -c "id '${newMember.username}' 2>/dev/null && usermod -aG ${g.linux_user} '${newMember.username}' || true"`);
          conn.end();
        } catch (e) { console.error('[members] usermod failed:', e.message); }
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Change member role (owner only)
app.patch('/groups/:id/members/:uid/role', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.owner_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Only group owner can change roles' });
  const { group_role } = req.body;
  const safeRole = ['owner','moderator','member'].includes(group_role) ? group_role : 'member';
  db.prepare('UPDATE group_members SET group_role=? WHERE group_id=? AND user_id=?').run(safeRole, req.params.id, req.params.uid);
  res.json({ ok: true });
});

app.delete('/groups/:id/members/:uid', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  const isSelf = Number(req.params.uid) === req.user.id;
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id && !isSelf)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.uid);
  res.json({ ok: true });
});

// ─── Group join requests ───────────────────────────────────────────────────────
// Send a join request to a user (by username or id) to invite them to a group
app.post('/groups/:id/invite', authMiddleware, (req, res) => {
  const groupId = req.params.id;
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // Only admin or group owner can send invites
  if (req.user.role !== 'admin' && group.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only group owner or admin can invite' });
  }

  const { username, user_id } = req.body;
  let targetUser;
  if (user_id) {
    targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id);
  } else if (username) {
    targetUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  }
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // Check if already a member
  const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, targetUser.id);
  if (isMember) return res.status(409).json({ error: 'User is already a member' });

  // Check if pending invite already exists
  const existing = db.prepare(
    "SELECT id FROM group_join_requests WHERE group_id = ? AND to_user_id = ? AND status = 'pending'"
  ).get(groupId, targetUser.id);
  if (existing) return res.status(409).json({ error: 'Invite already pending' });

  try {
    const result = db.prepare(
      'INSERT INTO group_join_requests (group_id, from_user_id, to_user_id, status) VALUES (?,?,?,?)'
    ).run(groupId, req.user.id, targetUser.id, 'pending');
    auditLog(req.user.id, req.user.username, 'group_invite', group.name, `invited=${targetUser.username}`, getClientIp(req));
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get pending invites for current user
app.get('/invites', authMiddleware, (req, res) => {
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

// Get all pending invites (admin only)
app.get('/invites/all', authMiddleware, adminMiddleware, (req, res) => {
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

// Accept or decline an invite
app.patch('/invites/:id', authMiddleware, (req, res) => {
  const invite = db.prepare('SELECT * FROM group_join_requests WHERE id = ?').get(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.to_user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (invite.status !== 'pending') return res.status(400).json({ error: 'Invite already processed' });

  const { action } = req.body; // 'accept' | 'decline'
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' });

  db.prepare('UPDATE group_join_requests SET status = ? WHERE id = ?').run(
    action === 'accept' ? 'accepted' : 'declined', req.params.id
  );

  if (action === 'accept') {
    db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, group_role) VALUES (?,?,'member')").run(invite.group_id, req.user.id);
    auditLog(req.user.id, req.user.username, 'group_join_accepted', invite.group_id, null, getClientIp(req));

    // Якщо група провізіонована — додаємо юзера в Linux-групу на сервері
    const grp = db.prepare('SELECT * FROM groups WHERE id = ?').get(invite.group_id);
    if (grp?.linux_user && grp?.provision_config_id) {
      const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(grp.provision_config_id);
      if (cfgRow) {
        sshConnect(normalizeConfig(cfgRow)).then(conn => {
          sshExec(conn, `sudo sh -c "id '${req.user.username}' 2>/dev/null && usermod -aG ${grp.linux_user} '${req.user.username}' || true"`)
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

// ─── Group configs (servers assigned to group) ────────────────────────────────
app.post('/groups/:id/configs', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Only group owner or admin can add servers' });

  const { config_id } = req.body;
  if (!config_id) return res.status(400).json({ error: 'config_id required' });
  try {
    db.prepare('INSERT OR IGNORE INTO group_configs (group_id, config_id) VALUES (?,?)').run(req.params.id, config_id);

    // Also auto-create a read permission for this group on this config if not exists
    const exists = db.prepare(
      "SELECT id FROM permissions WHERE target_type='group' AND target_id=? AND config_id=?"
    ).get(req.params.id, config_id);
    if (!exists) {
      db.prepare(
        'INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload) VALUES (?,?,?,1,0,0,1,0)'
      ).run('group', req.params.id, config_id);
    }

    auditLog(req.user.id, req.user.username, 'group_add_config', req.params.id, `config_id=${config_id}`, getClientIp(req));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/groups/:id/configs/:cid', authMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && g.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Only group owner or admin can remove servers' });
  db.prepare('DELETE FROM group_configs WHERE group_id = ? AND config_id = ?').run(req.params.id, req.params.cid);
  auditLog(req.user.id, req.user.username, 'group_remove_config', req.params.id, `config_id=${req.params.cid}`, getClientIp(req));
  res.json({ ok: true });
});

// ─── Account Settings ─────────────────────────────────────────────────────────
app.get('/account/settings', authMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  res.json(settings || { user_id: req.user.id, display_name: null, email: null, bio: null, theme: 'dark' });
});

app.patch('/account/settings', authMiddleware, async (req, res) => {
  const { display_name, email, bio, theme } = req.body;
  const existing = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare('UPDATE user_settings SET display_name=?, email=?, bio=?, theme=?, updated_at=unixepoch() WHERE user_id=?')
      .run(display_name || null, email || null, bio || null, theme || 'dark', req.user.id);
  } else {
    db.prepare('INSERT INTO user_settings (user_id, display_name, email, bio, theme) VALUES (?,?,?,?,?)')
      .run(req.user.id, display_name || null, email || null, bio || null, theme || 'dark');
  }
  res.json({ ok: true });
});

app.patch('/account/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = bcrypt.compareSync(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  auditLog(req.user.id, req.user.username, 'change_password', null, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── SSH Configs routes ───────────────────────────────────────────────────────
app.get('/configs', authMiddleware, (req, res) => {
  const { id: userId, role } = req.user;

  // All users (including admin) see only their own configs + group-shared configs
  const rows = db.prepare(`
    SELECT DISTINCT sc.*, g.provision_root_path FROM ssh_configs sc
    LEFT JOIN group_configs gc ON gc.config_id = sc.id
    LEFT JOIN group_members gm ON gm.group_id = gc.group_id AND gm.user_id = ?
    LEFT JOIN groups g ON g.id = gc.group_id
    WHERE sc.owner_id = ?
      OR gm.user_id = ?
      OR (sc.owner_id IS NULL AND sc.group_id IS NULL)
    ORDER BY sc.id
  `).all(userId, userId, userId);

  const result = rows.map(r => ({ ...r, ssh_key: r.ssh_key ? '[KEY SET]' : null, password: r.password ? '[PASSWORD SET]' : null }));
  res.json(result);
});

app.post('/configs', authMiddleware, (req, res) => {
  const { label, host, port, username, password, ssh_key, auth_type, group_id, shared } = req.body;
  if (!label || !host || !username) return res.status(400).json({ error: 'label, host, username required' });

  const ownerId = shared && req.user.role === 'admin' ? null : req.user.id;
  const gid = group_id || null;
  const type = auth_type || (ssh_key ? 'key' : 'password');

  const result = db.prepare(
    'INSERT INTO ssh_configs (owner_id, group_id, label, host, port, username, password, ssh_key, auth_type) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(ownerId, gid, label, host, Number(port) || 22, username, password || null, ssh_key || null, type);

  auditLog(req.user.id, req.user.username, 'create_config', label, `host=${host}`, getClientIp(req));
  res.json({ id: result.lastInsertRowid });
});

app.delete('/configs/:id', authMiddleware, (req, res) => {
  const cfg = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(req.params.id);
  if (!cfg) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && cfg.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM ssh_configs WHERE id = ?').run(req.params.id);
  auditLog(req.user.id, req.user.username, 'delete_config', cfg.label, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── Permissions routes ───────────────────────────────────────────────────────
app.get('/permissions', authMiddleware, adminMiddleware, (req, res) => {
  const perms = db.prepare('SELECT * FROM permissions ORDER BY id').all();
  res.json(perms);
});

app.post('/permissions', authMiddleware, adminMiddleware, (req, res) => {
  const { target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload } = req.body;
  if (!target_type || !target_id) return res.status(400).json({ error: 'target_type and target_id required' });
  const result = db.prepare(
    'INSERT INTO permissions (target_type, target_id, config_id, can_read, can_write, can_delete, can_terminal, can_upload) VALUES (?,?,?,?,?,?,?,?)'
  ).run(target_type, target_id, config_id || null, can_read ? 1 : 0, can_write ? 1 : 0, can_delete ? 1 : 0, can_terminal ? 1 : 0, can_upload ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/permissions/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM permissions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Audit log ────────────────────────────────────────────────────────────────
app.get('/audit', authMiddleware, adminMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  res.json({ rows, total });
});

// ─── Middleware to resolve SSH config from request ────────────────────────────
async function resolveConfig(req, res) {
  if (req.body.configId) {
    const cfg = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(req.body.configId);
    if (!cfg) { res.status(404).json({ error: 'Config not found' }); return null; }

    const perms = getEffectivePerms(req.user.id, cfg.id);
    if (!perms || !perms.can_read) { res.status(403).json({ error: 'No access to this config' }); return null; }

    return { cfg: normalizeConfig(cfg), perms, configId: cfg.id, configLabel: cfg.label };
  }

  if (req.user.role !== 'admin' && !req.body.host) {
    res.status(400).json({ error: 'configId or host required' }); return null;
  }
  const cfg = normalizeConfig(req.body);
  return { cfg, perms: { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 }, configId: null, configLabel: req.body.host };
}

// ─── WebSocket handler ────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  let shellStream = null;
  let shellConn = null;
  let metricsConn = null;
  let metricsInterval = null;
  let wsUser = null;

  function send(type, payload) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
  }

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'auth') {
      try {
        wsUser = jwt.verify(msg.token, JWT_SECRET);
        send('auth:ok', { username: wsUser.username, role: wsUser.role });
      } catch { send('auth:error', { error: 'Invalid token' }); }
      return;
    }

    async function resolveWsConfig() {
      if (msg.configId) {
        const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(msg.configId);
        if (!cfgRow) { send('error', { error: 'Config not found' }); return null; }
        const perms = getEffectivePerms(wsUser?.id, cfgRow.id);
        if (!perms?.can_read) { send('error', { error: 'No access' }); return null; }
        return { cfg: normalizeConfig(cfgRow), perms };
      }
      return { cfg: normalizeConfig(msg), perms: { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 } };
    }

    if (msg.type === 'terminal:start') {
      if (!wsUser) { send('terminal:error', { error: 'Not authenticated' }); return; }
      const resolved = await resolveWsConfig();
      if (!resolved) return;
      if (!resolved.perms.can_terminal) { send('terminal:error', { error: 'Terminal access denied' }); return; }

      auditLog(wsUser.id, wsUser.username, 'terminal_start', resolved.cfg.host, null, null);
      try {
        if (shellConn) { shellConn.end(); shellConn = null; shellStream = null; }
        shellConn = await sshConnect(resolved.cfg);
        shellConn.shell({ term: 'xterm-256color', cols: msg.cols || 80, rows: msg.rows || 24 }, (err, stream) => {
          if (err) { send('terminal:error', { error: err.message }); return; }
          shellStream = stream;
          stream.on('data', data => send('terminal:data', { data: data.toString() }));
          stream.stderr.on('data', data => send('terminal:data', { data: data.toString() }));
          stream.on('close', () => { send('terminal:closed', {}); shellStream = null; });
          send('terminal:ready', {});
          // Якщо є папка групи — одразу переходимо в неї після старту шелу
          if (msg.provision_root_path) {
            setTimeout(() => {
              if (shellStream) shellStream.write(`cd ${JSON.stringify(msg.provision_root_path)}\n`);
            }, 300);
          }
        });
      } catch (e) { send('terminal:error', { error: e.message }); }
    }

    if (msg.type === 'terminal:input' && shellStream) shellStream.write(msg.data);
    if (msg.type === 'terminal:resize' && shellStream) shellStream.setWindow(msg.rows, msg.cols, 0, 0);

    if (msg.type === 'metrics:start') {
      if (!wsUser) return;
      const resolved = await resolveWsConfig();
      if (!resolved) return;

      async function fetchMetrics() {
        if (!metricsConn) {
          try { metricsConn = await sshConnect(resolved.cfg); }
          catch (e) { send('metrics:error', { error: e.message }); return; }
        }
        try {
          const { stdout: osOut } = await sshExec(metricsConn, 'uname');
          const isMac = osOut.trim() === 'Darwin';
          let cmd;
          if (isMac) {
            cmd = [
              "osx-cpu-temp 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+' | head -1 || echo 0",
              "echo 0",
              "sysctl hw.memsize | awk '{print int($2/1024/1024)}'",
              "vm_stat | awk '/Pages active/{print int($3)*4096/1024/1024}'",
              "top -l 1 -n 0 | grep 'CPU usage' | awk '{print int($3)}'",
              "df -h | grep -v tmpfs | grep -v devfs | tail -n +2 | awk '{print $1,$2,$3,$4,$9}'",
            ].join(' && echo "---SEP---" && ');
          } else {
            cmd = [
              "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0",
              "nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null || echo 0",
              "free -m | awk 'NR==2{print $2\" \"$3}'",
              "echo 0",
              "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d. -f1",
              "df -h --output=source,size,used,avail,target 2>/dev/null | grep -v tmpfs | grep -v udev | tail -n +2",
            ].join(' && echo "---SEP---" && ');
          }
          const { stdout } = await sshExec(metricsConn, cmd);
          const parts = stdout.split('---SEP---').map(s => s.trim());
          let cpuTemp, gpuTemp, memTotal, memUsed, cpuUsage, disks;
          if (isMac) {
            cpuTemp = parseFloat(parts[0]) || 0; gpuTemp = 0;
            memTotal = parseInt(parts[2]) || 0; memUsed = parseInt(parts[3]) || 0;
            cpuUsage = parseInt(parts[4]) || 0;
            disks = (parts[5] || '').split('\n').filter(Boolean).map(line => {
              const c = line.trim().split(/\s+/);
              return { source: c[0], size: c[1], used: c[2], avail: c[3], mount: c[4] || '' };
            });
          } else {
            const raw = parseInt(parts[0]) || 0;
            cpuTemp = raw > 1000 ? Math.round(raw / 1000) : raw;
            gpuTemp = parseInt(parts[1]) || 0;
            const mp = (parts[2] || '0 0').split(' ').map(Number);
            memTotal = mp[0]; memUsed = mp[1];
            cpuUsage = parseInt(parts[4]) || 0;
            disks = (parts[5] || '').split('\n').filter(Boolean).map(line => {
              const c = line.trim().split(/\s+/);
              return { source: c[0], size: c[1], used: c[2], avail: c[3], mount: c[4] };
            });
          }
          send('metrics:data', { cpuTemp, gpuTemp, memTotal, memUsed, cpuUsage, disks });
        } catch (e) { metricsConn = null; }
      }

      if (metricsInterval) clearInterval(metricsInterval);
      fetchMetrics();
      metricsInterval = setInterval(fetchMetrics, 3000);
    }

    if (msg.type === 'metrics:stop') {
      if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
      if (metricsConn) { metricsConn.end(); metricsConn = null; }
    }
  });

  ws.on('close', () => {
    if (shellStream) shellStream.end();
    if (shellConn) shellConn.end();
    if (metricsInterval) clearInterval(metricsInterval);
    if (metricsConn) metricsConn.end();
  });
});

// ─── File routes (all protected) ──────────────────────────────────────────────
app.post('/run', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, configLabel } = resolved;
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout, stderr } = await sshExec(conn, req.body.command || 'echo hi');
    auditLog(req.user.id, req.user.username, 'run_command', configLabel, req.body.command, getClientIp(req));
    res.json({ stdout, stderr });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/list', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, configId } = resolved;
  const dir = req.body.path || '/home/' + cfg.username;
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout, stderr } = await sshExec(conn, `ls -1Ap "${dir}" 2>/dev/null | head -200`);
    if (stderr) return res.status(500).json({ error: stderr });
    const names = stdout.split('\n').filter(Boolean);
    const statCmd = `stat --printf="%n\\t%F\\t%s\\t%Y\\t%A\\n" "${dir}"/* "${dir}"/.[!.]* 2>/dev/null | head -300`;
    const { stdout: statOut } = await sshExec(conn, statCmd);
    const statsMap = {};
    statOut.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const fullName = parts[0].split('/').pop();
        statsMap[fullName] = {
          type: parts[1].includes('directory') ? 'dir' : parts[1].includes('link') ? 'link' : 'file',
          size: parseInt(parts[2]) || 0,
          modified: parseInt(parts[3]) || 0,
          permissions: parts[4] || '',
        };
      }
    });
    const items = names.map(name => {
      const isDir = name.endsWith('/');
      const cleanName = name.replace(/\/$/, '');
      const stat = statsMap[cleanName] || {};
      return {
        name: cleanName,
        type: isDir ? 'dir' : (stat.type || 'file'),
        size: stat.size || 0,
        modified: stat.modified ? new Date(stat.modified * 1000).toISOString() : null,
        permissions: stat.permissions || '',
      };
    });
    res.json({ items, path: dir });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/read', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms, configLabel } = resolved;
  if (!perms.can_read) return res.status(403).json({ error: 'Read access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout, stderr } = await sshExec(conn, `cat "${req.body.path}" 2>&1 | head -500`);
    if (stderr && !stdout) return res.status(500).json({ error: stderr });
    auditLog(req.user.id, req.user.username, 'read_file', req.body.path, null, getClientIp(req));
    res.json({ content: stdout });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/write', authMiddleware, async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/delete', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_delete) return res.status(403).json({ error: 'Delete access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stderr } = await sshExec(conn, `rm -rf "${req.body.path}" 2>&1`);
    if (stderr) return res.status(500).json({ error: stderr });
    auditLog(req.user.id, req.user.username, 'delete_file', req.body.path, null, getClientIp(req));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/rename', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_write) return res.status(403).json({ error: 'Write access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stderr } = await sshExec(conn, `mv "${req.body.from}" "${req.body.to}" 2>&1`);
    if (stderr) return res.status(500).json({ error: stderr });
    auditLog(req.user.id, req.user.username, 'rename_file', req.body.from, `→ ${req.body.to}`, getClientIp(req));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/mkdir', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_write) return res.status(403).json({ error: 'Write access denied' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stderr } = await sshExec(conn, `mkdir -p "${req.body.path}" 2>&1`);
    if (stderr) return res.status(500).json({ error: stderr });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

async function handleDownload(req, res) {
  const src = req.method === 'GET' ? req.query : req.body;
  if (req.method === 'GET' && src.token) {
    try { req.user = jwt.verify(src.token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Unauthorized' }); }
  }
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const filePath = src.path;
  let cfg, perms;

  if (src.configId) {
    const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(src.configId);
    if (!cfgRow) return res.status(404).json({ error: 'Config not found' });
    const p = getEffectivePerms(req.user.id, cfgRow.id);
    if (!p?.can_read) return res.status(403).json({ error: 'No access' });
    cfg = normalizeConfig(cfgRow); perms = p;
  } else {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    cfg = normalizeConfig(src);
  }

  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    const stats = await sftpStat(sftp, filePath);
    const filename = filePath.split('/').pop();
    const encoded = encodeURIComponent(filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    if (stats?.size) res.setHeader('Content-Length', stats.size);

    auditLog(req.user.id, req.user.username, 'download_file', filePath, null, getClientIp(req));

    const readStream = sftp.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    readStream.on('error', (err) => {
      try { readStream.destroy(); conn.end(); } catch {}
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy();
    });
    res.on('finish', () => { try { conn.end(); } catch {} });
    res.on('close', () => { try { readStream.destroy(); conn.end(); } catch {} });
    readStream.pipe(res);
  } catch (err) {
    try { if (conn) conn.end(); } catch {}
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
}

app.get('/files/download', authMiddleware, handleDownload);
app.post('/files/download', authMiddleware, handleDownload);

app.post('/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg, perms } = resolved;
  if (!perms.can_upload) return res.status(403).json({ error: 'Upload access denied' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  let conn;
  try {
    conn = await sshConnect(cfg);
    const sftp = await getSftp(conn);
    const destPath = `${req.body.path}/${req.file.originalname}`;
    await new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(destPath);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(req.file.buffer);
    });
    auditLog(req.user.id, req.user.username, 'upload_file', destPath, `size=${req.file.size}`, getClientIp(req));
    res.json({ ok: true, path: destPath });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

app.post('/files/tree', authMiddleware, async (req, res) => {
  const resolved = await resolveConfig(req, res);
  if (!resolved) return;
  const { cfg } = resolved;
  const dir = req.body.path || '/home/' + cfg.username;
  const maxDepth = req.body.depth || 2;
  let conn;
  try {
    conn = await sshConnect(cfg);
    const { stdout } = await sshExec(conn, `find "${dir}" -maxdepth ${maxDepth} -type d 2>/dev/null | head -100`);
    const dirs = stdout.split('\n').filter(Boolean);
    res.json({ dirs, root: dir });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { if (conn) conn.end(); }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log(`oServer backend on port ${PORT}`));