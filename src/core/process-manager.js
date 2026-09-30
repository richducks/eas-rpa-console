const { spawn } = require('child_process');
const { currentPlatform } = require('../platform');

class ProcessManager {
  constructor(platform = currentPlatform) {
    this.owned = new Map();
    this.platform = platform;
  }

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
    return this.platform.stopProcess({ pid, child: record.child });
  }

  registerOwnedPid(pid, context = {}) {
    const record = { child: null, pid, accountId: context.accountId, runId: context.runId, startedAt: Date.now(), stderr: '', exited: false, exitCode: null, signal: null };
    this.owned.set(pid, record);
    return record;
  }

  descendants(rootPid) {
    return this.platform.descendants(rootPid);
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
