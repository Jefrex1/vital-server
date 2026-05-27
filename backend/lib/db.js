'use strict';

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');

// ─── Encryption for SSH secrets ───────────────────────────────────────────────
// Derives a 32-byte key from ENCRYPTION_KEY env via PBKDF2.
// If the env var is missing the process exits immediately — no silent fallback.
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_RAW) {
  console.error('[oServer] FATAL: ENCRYPTION_KEY env var is not set. Refusing to start.');
  process.exit(1);
}

const ENC_KEY = crypto.pbkdf2Sync(ENCRYPTION_KEY_RAW, 'oserver-salt-v1', 100_000, 32, 'sha256');
const ENC_ALG = 'aes-256-gcm';

function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALG, ENC_KEY, iv);
  const enc  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  // Format: hex(iv):hex(tag):hex(ciphertext)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return null;
  // Legacy plain-text values (not containing ':') are returned as-is so
  // existing rows still work — a re-save will encrypt them.
  const parts = stored.split(':');
  if (parts.length !== 3) return stored;
  const [ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv(ENC_ALG, ENC_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

// ─── DB bootstrap ─────────────────────────────────────────────────────────────
const DB_PATH     = process.env.DB_PATH || path.join(__dirname, '..', 'oserver.db');
const BCRYPT_ROUNDS = 10;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'user',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login  INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    email        TEXT,
    bio          TEXT,
    theme        TEXT    NOT NULL DEFAULT 'dark',
    language     TEXT    NOT NULL DEFAULT 'uk',
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS groups (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT    NOT NULL UNIQUE,
    description         TEXT,
    owner_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provision_config_id INTEGER REFERENCES ssh_configs(id) ON DELETE SET NULL,
    provision_root_path TEXT,
    linux_user          TEXT,
    linux_pubkey        TEXT,
    linux_privkey       TEXT,
    provisioned_at      INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    group_role TEXT    NOT NULL DEFAULT 'member',
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS group_join_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
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
    access_role TEXT    NOT NULL DEFAULT 'operator',
    PRIMARY KEY (group_id, config_id)
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type  TEXT    NOT NULL,
    target_id    INTEGER NOT NULL,
    config_id    INTEGER REFERENCES ssh_configs(id) ON DELETE CASCADE,
    can_read     INTEGER NOT NULL DEFAULT 1,
    can_write    INTEGER NOT NULL DEFAULT 0,
    can_delete   INTEGER NOT NULL DEFAULT 0,
    can_terminal INTEGER NOT NULL DEFAULT 0,
    can_upload   INTEGER NOT NULL DEFAULT 0,
    root_path    TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username   TEXT,
    action     TEXT    NOT NULL,
    target     TEXT,
    detail     TEXT,
    ip         TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS saved_commands (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT    NOT NULL,
    command    TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ─── Versioned migrations ─────────────────────────────────────────────────────
const MIGRATIONS = [
  {
    version: 1,
    up: () => {
      const cols = db.prepare('PRAGMA table_info(group_members)').all().map(c => c.name);
      if (!cols.includes('group_role')) {
        db.exec("ALTER TABLE group_members ADD COLUMN group_role TEXT NOT NULL DEFAULT 'member'");
        const groups = db.prepare('SELECT id, owner_id FROM groups WHERE owner_id IS NOT NULL').all();
        for (const g of groups) {
          db.prepare("UPDATE group_members SET group_role='owner' WHERE group_id=? AND user_id=?").run(g.id, g.owner_id);
        }
      }
    },
  },
  {
    version: 2,
    up: () => {
      const cols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
      if (!cols.includes('owner_id')) {
        db.exec('ALTER TABLE groups ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL');
        const owners = db.prepare("SELECT group_id, user_id FROM group_members WHERE group_role='owner'").all();
        for (const o of owners) {
          db.prepare('UPDATE groups SET owner_id=? WHERE id=?').run(o.user_id, o.group_id);
        }
      }
    },
  },
  {
    version: 3,
    up: () => {
      const cols = db.prepare('PRAGMA table_info(permissions)').all().map(c => c.name);
      if (!cols.includes('root_path')) {
        db.exec('ALTER TABLE permissions ADD COLUMN root_path TEXT');
      }
    },
  },
  {
    version: 4,
    up: () => {
      const cols = db.prepare('PRAGMA table_info(group_configs)').all().map(c => c.name);
      if (!cols.includes('access_role')) {
        db.exec("ALTER TABLE group_configs ADD COLUMN access_role TEXT NOT NULL DEFAULT 'operator'");
      }
    },
  },
  {
    version: 5,
    up: () => {
      const cols = db.prepare('PRAGMA table_info(user_settings)').all().map(c => c.name);
      if (!cols.includes('language')) {
        db.exec("ALTER TABLE user_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'uk'");
      }
    },
  },
];

const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
);

for (const m of MIGRATIONS) {
  if (applied.has(m.version)) continue;
  try {
    db.transaction(() => {
      m.up();
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(m.version);
    })();
    console.log(`[oServer] Migration v${m.version} applied`);
  } catch (e) {
    console.error(`[oServer] Migration v${m.version} failed:`, e.message);
  }
}

// ─── Default admin ────────────────────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  // Generate a secure random password instead of 'admin'
  const randomPass = crypto.randomBytes(12).toString('base64');
  const hashed = bcrypt.hashSync(randomPass, BCRYPT_ROUNDS);
  db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')").run(hashed);
  console.log('[oServer] Created default admin. Username: admin  Password:', randomPass);
  console.log('[oServer] ⚠️  Save this password — it will not be shown again.');
}

module.exports = { db, encrypt, decrypt, BCRYPT_ROUNDS };
