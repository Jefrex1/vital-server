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

  CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS ssh_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = shared
    group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL, -- group-shared
    label       TEXT    NOT NULL,
    host        TEXT    NOT NULL,
    port        INTEGER NOT NULL DEFAULT 22,
    username    TEXT    NOT NULL,
    password    TEXT,                           -- encrypted or null if key-based
    ssh_key     TEXT,                           -- private key PEM
    auth_type   TEXT    NOT NULL DEFAULT 'password', -- 'password' | 'key'
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT    NOT NULL, -- 'user' | 'group'
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
    req.user = decoded; // { id, username, role }
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
  // Admin gets everything
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (user?.role === 'admin') {
    return { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 };
  }

  // Direct user permission
  const userPerm = db.prepare(
    "SELECT * FROM permissions WHERE target_type='user' AND target_id=? AND (config_id=? OR config_id IS NULL)"
  ).get(userId, configId);

  // Group permissions
  const groupPerms = db.prepare(`
    SELECT p.* FROM permissions p
    JOIN group_members gm ON gm.group_id = p.target_id
    WHERE p.target_type = 'group' AND gm.user_id = ? AND (p.config_id = ? OR p.config_id IS NULL)
  `).all(userId, configId);

  const allPerms = [...(userPerm ? [userPerm] : []), ...groupPerms];
  if (allPerms.length === 0) return null;

  // Merge: OR across all matching permissions
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
    conn.on('error', reject);

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

// Normalize config from DB or request body for sshConnect
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
      SELECT u.id, u.username, u.role FROM group_members gm
      JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?
    `).all(g.id),
  }));
  res.json(result);
});

app.post('/groups', authMiddleware, adminMiddleware, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO groups (name, description) VALUES (?,?)').run(name, description || null);
    auditLog(req.user.id, req.user.username, 'create_group', name, null, getClientIp(req));
    res.json({ id: result.lastInsertRowid, name, description });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Group already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/groups/:id', authMiddleware, adminMiddleware, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  auditLog(req.user.id, req.user.username, 'delete_group', g.name, null, getClientIp(req));
  res.json({ ok: true });
});

app.post('/groups/:id/members', authMiddleware, adminMiddleware, (req, res) => {
  const { user_id } = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?,?)').run(req.params.id, user_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/groups/:id/members/:uid', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(req.params.id, req.params.uid);
  res.json({ ok: true });
});

// ─── SSH Configs routes ───────────────────────────────────────────────────────
app.get('/configs', authMiddleware, (req, res) => {
  const { id: userId, role } = req.user;

  let rows;
  if (role === 'admin') {
    rows = db.prepare('SELECT * FROM ssh_configs ORDER BY id').all();
  } else {
    // Own configs + group-shared configs user belongs to + global shared (owner_id IS NULL AND group_id IS NULL)
    rows = db.prepare(`
      SELECT DISTINCT sc.* FROM ssh_configs sc
      LEFT JOIN group_members gm ON gm.group_id = sc.group_id AND gm.user_id = ?
      WHERE sc.owner_id = ? OR gm.user_id = ? OR (sc.owner_id IS NULL AND sc.group_id IS NULL)
      ORDER BY sc.id
    `).all(userId, userId, userId);
  }

  // Strip private key from response for security
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
// Accepts either { configId } (load from DB) or raw { host, username, password, port, ssh_key, auth_type }
async function resolveConfig(req, res) {
  if (req.body.configId) {
    const cfg = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(req.body.configId);
    if (!cfg) { res.status(404).json({ error: 'Config not found' }); return null; }

    // Check permission
    const perms = getEffectivePerms(req.user.id, cfg.id);
    if (!perms || !perms.can_read) { res.status(403).json({ error: 'No access to this config' }); return null; }

    return { cfg: normalizeConfig(cfg), perms, configId: cfg.id, configLabel: cfg.label };
  }

  // Raw credentials (admin or direct use)
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

    // Auth via token on first message
    if (msg.type === 'auth') {
      try {
        wsUser = jwt.verify(msg.token, JWT_SECRET);
        send('auth:ok', { username: wsUser.username, role: wsUser.role });
      } catch { send('auth:error', { error: 'Invalid token' }); }
      return;
    }

    // Resolve SSH config
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
  // Auth check for GET (token in query)
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
server.listen(PORT, () => console.log(`oServer backend on port ${PORT}\nDefault login: admin / admin`));