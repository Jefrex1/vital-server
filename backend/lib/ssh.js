'use strict';

const { Client } = require('ssh2');
const { decrypt } = require('./db');

// ─── Connection ───────────────────────────────────────────────────────────────
function sshConnect(config) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => {
      // Log only non-sensitive connection metadata
      console.error('[sshConnect] failed:', {
        host: config.host,
        username: config.username,
        auth_type: config.auth_type,
      });
      reject(new Error('SSH connection failed'));
    });

    const opts = {
      host:         config.host || '127.0.0.1',
      port:         Number(config.port) || 22,
      username:     config.username,
      readyTimeout: 10_000,
    };

    if (config.auth_type === 'key' && config.ssh_key) {
      opts.privateKey = config.ssh_key;
      if (config.passphrase) opts.passphrase = config.passphrase;
    } else {
      opts.password = config.password;
    }

    conn.connect(opts);
  });
}

// ─── Exec (for controlled commands only — never with user-supplied paths) ─────
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

// ─── SFTP helpers (all file ops go through here — no shell injection risk) ────
function getSftp(conn) {
  return new Promise((resolve, reject) =>
    conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
  );
}

function sftpStat(sftp, remotePath) {
  return new Promise(resolve =>
    sftp.stat(remotePath, (err, stats) => resolve(err ? null : stats))
  );
}

function sftpReaddir(sftp, remotePath) {
  return new Promise((resolve, reject) =>
    sftp.readdir(remotePath, (err, list) => (err ? reject(err) : resolve(list)))
  );
}

function sftpRealpath(sftp, remotePath) {
  return new Promise((resolve, reject) =>
    sftp.realpath(remotePath, (err, resolved) => (err ? reject(err) : resolve(resolved)))
  );
}

function sftpMkdir(sftp, remotePath) {
  return new Promise((resolve, reject) =>
    sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve()))
  );
}

function sftpRename(sftp, oldPath, newPath) {
  return new Promise((resolve, reject) =>
    sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()))
  );
}

function sftpUnlink(sftp, remotePath) {
  return new Promise((resolve, reject) =>
    sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
  );
}

function sftpRmdir(sftp, remotePath) {
  return new Promise((resolve, reject) =>
    sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()))
  );
}

// Recursive SFTP delete (replaces `rm -rf`)
async function sftpDeleteRecursive(sftp, remotePath) {
  const stats = await sftpStat(sftp, remotePath);
  if (!stats) return;
  if (stats.isDirectory()) {
    const entries = await sftpReaddir(sftp, remotePath);
    for (const entry of entries) {
      await sftpDeleteRecursive(sftp, `${remotePath}/${entry.filename}`);
    }
    await sftpRmdir(sftp, remotePath);
  } else {
    await sftpUnlink(sftp, remotePath);
  }
}

// Recursive SFTP mkdir -p
async function sftpMkdirP(sftp, remotePath) {
  const parts = remotePath.replace(/\/$/, '').split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    const st = await sftpStat(sftp, current);
    if (!st) {
      await sftpMkdir(sftp, current).catch(() => {});
    }
  }
}

// Shallow directory tree via SFTP (replaces `find`)
async function sftpTree(sftp, rootPath, maxDepth, currentDepth = 0) {
  const dirs = [rootPath];
  if (currentDepth >= maxDepth) return dirs;
  let entries;
  try { entries = await sftpReaddir(sftp, rootPath); } catch { return dirs; }
  for (const entry of entries) {
    if (entry.attrs.isDirectory()) {
      const sub = `${rootPath}/${entry.filename}`;
      const children = await sftpTree(sftp, sub, maxDepth, currentDepth + 1);
      dirs.push(...children);
    }
  }
  return dirs;
}

// ─── normalizeConfig — decrypts secrets before use ────────────────────────────
function normalizeConfig(src) {
  return {
    host:       src.host,
    port:       Number(src.port) || 22,
    username:   src.username,
    password:   decrypt(src.password) || null,
    ssh_key:    decrypt(src.ssh_key || src.sshKey) || null,
    auth_type:  src.auth_type || src.authType || (src.ssh_key || src.sshKey ? 'key' : 'password'),
    passphrase: src.passphrase ? decrypt(src.passphrase) : null,
  };
}

module.exports = {
  sshConnect,
  sshExec,
  getSftp,
  sftpStat,
  sftpReaddir,
  sftpRealpath,
  sftpMkdir,
  sftpMkdirP,
  sftpRename,
  sftpUnlink,
  sftpRmdir,
  sftpDeleteRecursive,
  sftpTree,
  normalizeConfig,
};
