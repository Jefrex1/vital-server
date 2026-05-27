'use strict';

const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { sshConnect, sshExec, normalizeConfig } = require('./ssh');
const { getEffectivePerms, auditLog, JWT_SECRET } = require('../middleware');

function attachWebSocket(wss) {
  wss.on('connection', (ws) => {
    let shellStream   = null;
    let shellConn     = null;
    let metricsConn   = null;
    let metricsTimer  = null;
    let wsUser        = null;

    function send(type, payload) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
    }

    async function resolveWsConfig(msg) {
      if (msg.configId) {
        const cfgRow = db.prepare('SELECT * FROM ssh_configs WHERE id = ?').get(msg.configId);
        if (!cfgRow) { send('error', { error: 'Config not found' }); return null; }
        const perms = getEffectivePerms(wsUser?.id, cfgRow.id);
        if (!perms?.can_read) { send('error', { error: 'No access' }); return null; }
        return { cfg: normalizeConfig(cfgRow), perms };
      }
      // Admin-only fallback: direct host/creds in the message
      if (wsUser?.role !== 'admin') { send('error', { error: 'configId required' }); return null; }
      return { cfg: normalizeConfig(msg), perms: { can_read: 1, can_write: 1, can_delete: 1, can_terminal: 1, can_upload: 1 } };
    }

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // ── Auth ──────────────────────────────────────────────────────────────
      if (msg.type === 'auth') {
        try {
          wsUser = jwt.verify(msg.token, JWT_SECRET);
          send('auth:ok', { username: wsUser.username, role: wsUser.role });
        } catch {
          send('auth:error', { error: 'Invalid token' });
        }
        return;
      }

      if (!wsUser) { send('error', { error: 'Not authenticated' }); return; }

      // ── Terminal ──────────────────────────────────────────────────────────
      if (msg.type === 'terminal:start') {
        const resolved = await resolveWsConfig(msg);
        if (!resolved) return;
        if (!resolved.perms.can_terminal) { send('terminal:error', { error: 'Terminal access denied' }); return; }

        auditLog(wsUser.id, wsUser.username, 'terminal_start', resolved.cfg.host, null, null);
        try {
          if (shellConn) { shellConn.end(); shellConn = null; shellStream = null; }
          shellConn = await sshConnect(resolved.cfg);
          shellConn.shell({ term: 'xterm-256color', cols: msg.cols || 80, rows: msg.rows || 24 }, (err, stream) => {
            if (err) { send('terminal:error', { error: 'Failed to open shell' }); return; }
            shellStream = stream;
            stream.on('data', d => send('terminal:data', { data: d.toString() }));
            stream.stderr.on('data', d => send('terminal:data', { data: d.toString() }));
            stream.on('close', () => { send('terminal:closed', {}); shellStream = null; });
            send('terminal:ready', {});
            if (msg.provision_root_path) {
              setTimeout(() => {
                if (shellStream) shellStream.write(`cd ${JSON.stringify(msg.provision_root_path)}\n`);
              }, 300);
            }
          });
        } catch { send('terminal:error', { error: 'SSH connection failed' }); }
      }

      if (msg.type === 'terminal:input'  && shellStream) shellStream.write(msg.data);
      if (msg.type === 'terminal:resize' && shellStream) shellStream.setWindow(msg.rows, msg.cols, 0, 0);

      // ── Metrics ───────────────────────────────────────────────────────────
      if (msg.type === 'metrics:start') {
        const resolved = await resolveWsConfig(msg);
        if (!resolved) return;

        async function fetchMetrics() {
          if (!metricsConn) {
            try { metricsConn = await sshConnect(resolved.cfg); }
            catch { send('metrics:error', { error: 'Metrics connection failed' }); return; }
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
          } catch { metricsConn = null; }
        }

        if (metricsTimer) clearInterval(metricsTimer);
        fetchMetrics();
        metricsTimer = setInterval(fetchMetrics, 3000);
      }

      if (msg.type === 'metrics:stop') {
        if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
        if (metricsConn)  { metricsConn.end(); metricsConn = null; }
      }
    });

    ws.on('close', () => {
      if (shellStream) shellStream.end();
      if (shellConn)   shellConn.end();
      if (metricsTimer) clearInterval(metricsTimer);
      if (metricsConn)  metricsConn.end();
    });
  });
}

module.exports = { attachWebSocket };
