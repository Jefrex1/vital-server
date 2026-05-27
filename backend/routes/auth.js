'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db, BCRYPT_ROUNDS } = require('../lib/db');
const { authMiddleware, adminMiddleware, authRateLimiter, getClientIp, auditLog, JWT_SECRET } = require('../middleware');

const router = express.Router();

const ALLOW_PUBLIC_REGISTER = process.env.ALLOW_REGISTER === 'true'; // disabled by default

router.post('/login', authRateLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Always run bcrypt even on unknown username to avoid timing oracle
  const hash = user?.password || '$2b$10$invalidhashpadding000000000000000000000000000000000000';
  const valid = bcrypt.compareSync(password, hash);

  if (!user || !valid) {
    if (user) auditLog(user.id, user.username, 'login_failed', null, null, getClientIp(req));
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);
  auditLog(user.id, user.username, 'login', null, null, getClientIp(req));

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/register/public', authRateLimiter, async (req, res) => {
  if (!ALLOW_PUBLIC_REGISTER) {
    return res.status(403).json({ error: 'Public registration is disabled' });
  }
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (username.length < 3)    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 8)    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?,?,?)').run(username, hashed, 'user');
    auditLog(result.lastInsertRowid, username, 'register', null, 'public registration', getClientIp(req));
    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: result.lastInsertRowid, username, role: 'user' } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/register', authMiddleware, adminMiddleware, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 8)    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const safeRole = role === 'admin' ? 'admin' : 'user';
  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?,?,?)').run(username, hashed, safeRole);
    auditLog(req.user.id, req.user.username, 'create_user', username, `role=${safeRole}`, getClientIp(req));
    res.json({ id: result.lastInsertRowid, username, role: safeRole });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
