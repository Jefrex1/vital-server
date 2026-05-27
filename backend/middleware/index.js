'use strict';

const jwt = require('jsonwebtoken');
const { db } = require('../lib/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[oServer] FATAL: JWT_SECRET env var is not set. Refusing to start.');
  process.exit(1);
}

// ─── Simple in-memory rate limiter (no extra deps) ────────────────────────────
// Tracks attempts per IP. Resets after windowMs.
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many requests' } = {}) {
  const store = new Map(); // ip -> { count, resetAt }

  return function rateLimiter(req, res, next) {
    const ip = getClientIp(req) || 'unknown';
    const now = Date.now();
    let record = store.get(ip);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      store.set(ip, record);
    }

    record.count++;
    if (record.count > max) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// Specific limiter for auth endpoints — 10 attempts per 15 min per IP
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Try again later.',
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admins only' });
  }
  next();
}

// ─── Centralised error handler ────────────────────────────────────────────────
// Catches anything passed to next(err). Never leaks internal details.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  console.error('[oServer] Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}

// ─── Permissions helpers ──────────────────────────────────────────────────────
function roleToPerms(role) {
  if (role === 'admin')    return { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 };
  if (role === 'operator') return { can_read: 1, can_write: 1, can_delete: 0, can_terminal: 1, can_upload: 1 };
  return                          { can_read: 1, can_write: 0, can_delete: 0, can_terminal: 0, can_upload: 0 };
}

function normalizeAccessRole(role) {
  return ['admin', 'operator', 'observer'].includes(role) ? role : 'operator';
}

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

  const groupConfigRoles = db.prepare(`
    SELECT gc.access_role FROM group_configs gc
    JOIN group_members gm ON gm.group_id = gc.group_id
    WHERE gm.user_id = ? AND gc.config_id = ?
  `).all(userId, configId).map(r => roleToPerms(r.access_role));

  const allPerms = [...(userPerm ? [userPerm] : []), ...groupPerms, ...groupConfigRoles];
  if (allPerms.length === 0) return null;

  return {
    can_read:     allPerms.some(p => p.can_read)     ? 1 : 0,
    can_write:    allPerms.some(p => p.can_write)    ? 1 : 0,
    can_delete:   allPerms.some(p => p.can_delete)   ? 1 : 0,
    can_terminal: allPerms.some(p => p.can_terminal) ? 1 : 0,
    can_upload:   allPerms.some(p => p.can_upload)   ? 1 : 0,
  };
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

function auditLog(userId, username, action, target, detail, ip) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, username, action, target, detail, ip) VALUES (?,?,?,?,?,?)')
      .run(userId || null, username || null, action, target || null, detail || null, ip || null);
  } catch {}
}

// ─── Resolve SSH config from request ─────────────────────────────────────────
const { normalizeConfig } = require('../lib/ssh');

async function resolveConfig(req, res) {
  if (req.body.configId) {
    const cfg = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(req.body.configId);
    if (!cfg) { res.status(404).json({ error: 'Config not found' }); return null; }

    const perms = getEffectivePerms(req.user.id, cfg.id);
    if (!perms || !perms.can_read) { res.status(403).json({ error: 'No access to this config' }); return null; }

    return { cfg: normalizeConfig(cfg), perms, configId: cfg.id, configLabel: cfg.label };
  }

  if (req.user.role !== 'admin') {
    res.status(400).json({ error: 'configId required' }); return null;
  }
  return {
    cfg: normalizeConfig(req.body),
    perms: { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 },
    configId: null,
    configLabel: req.body.host,
  };
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  authRateLimiter,
  errorHandler,
  getEffectivePerms,
  getClientIp,
  auditLog,
  resolveConfig,
  roleToPerms,
  normalizeAccessRole,
  JWT_SECRET,
};
