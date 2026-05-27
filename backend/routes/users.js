'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { db, BCRYPT_ROUNDS } = require('../lib/db');
const { authMiddleware, adminMiddleware, getClientIp, auditLog } = require('../middleware');

const router = express.Router();

// ─── Account settings (must be before /:id to avoid conflict) ─────────────────
router.get('/account/settings', authMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  res.json(settings || { user_id: req.user.id, display_name: null, email: null, bio: null, theme: 'dark', language: 'uk' });
});

router.patch('/account/settings', authMiddleware, (req, res) => {
  const { display_name, email, bio, theme, language } = req.body;
  const safeLanguage = ['uk', 'en'].includes(language) ? language : 'uk';
  const existing = db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare('UPDATE user_settings SET display_name=?, email=?, bio=?, theme=?, language=?, updated_at=unixepoch() WHERE user_id=?')
      .run(display_name || null, email || null, bio || null, theme || 'dark', safeLanguage, req.user.id);
  } else {
    db.prepare('INSERT INTO user_settings (user_id, display_name, email, bio, theme, language) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, display_name || null, email || null, bio || null, theme || 'dark', safeLanguage);
  }
  res.json({ ok: true });
});

router.patch('/account/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = bcrypt.compareSync(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  auditLog(req.user.id, req.user.username, 'change_password', null, null, getClientIp(req));
  res.json({ ok: true });
});

// ─── Admin user management ────────────────────────────────────────────────────
router.get('/', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY id').all();
  res.json(users);
});

router.patch('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { password, role } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, id);
  }
  if (role && (role === 'admin' || role === 'user')) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  }
  auditLog(req.user.id, req.user.username, 'update_user', user.username, JSON.stringify({ role }), getClientIp(req));
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  auditLog(req.user.id, req.user.username, 'delete_user', user.username, null, getClientIp(req));
  res.json({ ok: true });
});

module.exports = router;
