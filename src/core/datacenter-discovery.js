const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { resolveLaunchSpec } = require('./launcher');
const { probeEnvironment } = require('./environment');
const { waitForLoginWindow } = require('./windows');
const { ProcessManager } = require('./process-manager');

const execFileAsync = promisify(execFile);

async function discoverDataCenters(config, options = {}) {
  const environment = await probeEnvironment(config);
  const spec = resolveLaunchSpec(config);
  const manager = new ProcessManager();
  const runId = `discover-${Date.now().toString(36)}`;
  const record = manager.launch(spec, { runId, accountId: 'datacenter-discovery' });
  let javaRecord = null;
  let temporaryDirectory = null;
  try {
    await manager.waitUntilAlive(record, 3000);
    const javaProcess = await manager.waitForDescendant(record.pid, row => /\/java(?:\s|$)/.test(row.command) && row.command.includes('com.kingdee.eas'), 15000);
    javaRecord = manager.registerOwnedPid(javaProcess.pid, { runId, accountId: 'datacenter-discovery' });
    const window = await waitForLoginWindow({
      pid: javaRecord.pid,
      title: config.ui.login_window_title,
      sessionType: environment.session.type,
      tools: environment.tools,
      timeoutMs: config.global.startup_timeout_seconds * 1000,
      pollIntervalMs: config.global.poll_interval_seconds * 1000,
      isProcessAlive: () => manager.isAlive(javaRecord.pid)
    });
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-dc-'));
    const outputPath = path.join(temporaryDirectory, 'datacenters.txt');
    const javaHome = path.resolve(spec.workingDirectory, '..', '..', 'clientjdk');
    const javaBinary = path.join(javaHome, 'bin', 'java');
    const toolsJar = path.join(javaHome, 'lib', 'tools.jar');
    const helperJar = options.helperJar;
    const agentJar = options.agentJar;
    await execFileAsync(javaBinary, ['-cp', `${helperJar}:${toolsJar}`, 'easrpa.AttachHelper', String(javaRecord.pid), agentJar, outputPath], { timeout: 15000, maxBuffer: 64 * 1024 });
    const lines = fs.readFileSync(outputPath, 'utf8').split(/\r?\n/).filter(Boolean);
    if (!lines.length || lines[0].startsWith('ERROR:')) throw Object.assign(new Error('未能从 EAS 组合框读取数据中心'), { code: lines[0]?.slice(6) || 'DATACENTER_OPTIONS_EMPTY' });
    const dataCenters = [...new Set(lines.map(line => Buffer.from(line, 'base64').toString('utf8')).filter(Boolean))];
    return { dataCenters, pid: javaRecord.pid, windowBackend: window.backend };
  } finally {
    if (javaRecord) manager.stopOwned(javaRecord.pid, runId);
    manager.stopOwned(record.pid, runId);
    if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { discoverDataCenters };
