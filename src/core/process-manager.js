const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const { currentPlatform } = require('../platform');

class ProcessManager {
  constructor(platform = currentPlatform) { this.owned = new Map(); this.platform = platform; }

  launch(spec, context = {}) {
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.workingDirectory,
      env: process.env,
      shell: false,
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    const record = { child, pid: child.pid, accountId: context.accountId, runId: context.runId, startedAt: Date.now(), stderr: '', exited: false, exitCode: null, signal: null };
    this.owned.set(child.pid, record);
    child.stderr.on('data', chunk => { record.stderr = `${record.stderr}${chunk.toString('utf8')}`.slice(-4096); });
    child.once('exit', (code, signal) => { record.exited = true; record.exitCode = code; record.signal = signal; });
    return record;
  }

  isOwned(pid, runId) {
    const record = this.owned.get(pid);
    return Boolean(record && record.runId === runId);
  }

  isAlive(pid) {
    const record = this.owned.get(pid);
    if (!record || record.exited) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  async waitUntilAlive(record, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (record.exited) throw Object.assign(new Error('客户端进程提前退出'), { code: 'PROCESS_EXITED', details: { exitCode: record.exitCode, signal: record.signal, stderr: record.stderr } });
      if (this.isAlive(record.pid)) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Object.assign(new Error('等待客户端进程存活超时'), { code: 'PROCESS_START_TIMEOUT' });
  }

  stopOwned(pid, runId) {
    const record = this.owned.get(pid);
    if (!record || record.runId !== runId) return { stopped: false, code: 'PROCESS_NOT_OWNED' };
    if (record.exited) return { stopped: true, code: 'PROCESS_ALREADY_EXITED' };
    if (this.platform.isWindows) {
      try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }); }
      catch { return { stopped: false, code: 'PROCESS_STOP_FAILED' }; }
    } else if (record.child) record.child.kill('SIGTERM');
    else { try { process.kill(pid, 'SIGTERM'); } catch { return { stopped: false, code: 'PROCESS_STOP_FAILED' }; } }
    return { stopped: true, code: 'STOP_SIGNAL_SENT' };
  }

  registerOwnedPid(pid, context = {}) {
    const record = { child: null, pid, accountId: context.accountId, runId: context.runId, startedAt: Date.now(), stderr: '', exited: false, exitCode: null, signal: null };
    this.owned.set(pid, record);
    return record;
  }

  descendants(rootPid) {
    if (this.platform.isWindows) return this.windowsDescendants(rootPid);
    const rows = [];
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const status = fs.readFileSync(`/proc/${name}/status`, 'utf8');
        const ppid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
        const command = fs.readFileSync(`/proc/${name}/cmdline`).toString('utf8').replace(/\0/g, ' ').trim();
        rows.push({ pid: Number(name), ppid, command });
      } catch { /* process exited during snapshot */ }
    }
    const result = [];
    const parents = new Set([Number(rootPid)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (parents.has(row.ppid) && !parents.has(row.pid)) { parents.add(row.pid); result.push(row); changed = true; }
      }
    }
    return result;
  }

  windowsDescendants(rootPid) {
    const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
    let parsed;
    try {
      const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      parsed = JSON.parse(output || '[]');
    } catch { return []; }
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({ pid: Number(row.ProcessId), ppid: Number(row.ParentProcessId), command: String(row.CommandLine || '') }));
    const result = [];
    const parents = new Set([Number(rootPid)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (parents.has(row.ppid) && !parents.has(row.pid)) { parents.add(row.pid); result.push(row); changed = true; }
      }
    }
    return result;
  }

  async waitForDescendant(rootPid, predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = this.descendants(rootPid).find(predicate);
      if (match) return match;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw Object.assign(new Error('等待 EAS Java 子进程超时'), { code: 'EAS_JAVA_PROCESS_TIMEOUT' });
  }
}

module.exports = { ProcessManager };
