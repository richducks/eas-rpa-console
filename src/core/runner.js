const { validateConfig } = require('./config');
const { resolveLaunchSpec, publicLaunchSpec } = require('./launcher');
const { getCredential } = require('./credentials');
const { probeEnvironment } = require('./environment');
const { waitForLoginWindow } = require('./windowing');
const { automateLogin } = require('./login-automation');
const { currentPlatform } = require('../platform');

class FoundationRunner {
  constructor({ processManager, logger, emit, assets = {}, dependencies = {}, platform = currentPlatform }) {
    this.platform = platform;
    this.processManager = processManager;
    this.logger = logger;
    this.emit = emit || (() => {});
    this.assets = assets;
    this.dependencies = { getCredential, probeEnvironment, waitForLoginWindow, automateLogin, ...dependencies };
    this.active = null;
    this.ready = [];
  }

  event(runId, accountId, stage, status, extra = {}) {
    const payload = { runId, accountId, stage, status, timestamp: new Date().toISOString(), ...extra };
    this.emit(payload);
    this.logger.write(status === 'FAILED' ? 'ERROR' : 'INFO', 'RUN_STATE_CHANGED', {
      run_id: runId, account_id: accountId, stage, status, pid: extra.pid || null, window_id: extra.window?.id || null,
      backend: extra.window?.backend || extra.backend || null, elapsed_ms: extra.elapsedMs || null, retry_count: 0, error_code: extra.errorCode || null
    });
    return payload;
  }

  async run(config) {
    if (this.active) throw Object.assign(new Error('已有任务正在运行'), { code: 'RUN_ALREADY_ACTIVE' });
    const runId = this.logger.createRunId();
    const startedAt = Date.now();
    let currentAccountId = null;
    let credential = null;
    this.active = { runId, cancelled: false, pid: null };
    try {
      this.event(runId, null, 'VALIDATE_CONFIG', 'RUNNING');
      const validation = validateConfig(config, { checkPaths: true });
      if (!validation.valid) throw Object.assign(new Error(validation.errors[0]), { code: 'CONFIG_INVALID', details: validation.errors });
      const account = config.accounts.find(item => item.enabled);
      if (!account) throw Object.assign(new Error('没有已启用账号'), { code: 'NO_ENABLED_ACCOUNT' });
      currentAccountId = account.id;
      this.event(runId, account.id, 'VALIDATE_CREDENTIAL', 'RUNNING');
      credential = await this.dependencies.getCredential(account.password_keyring_service, account.password_keyring_key, this.platform);
      if (!credential.available) throw Object.assign(new Error('Keyring 凭据缺失'), { code: credential.code });

      this.event(runId, account.id, 'DISCOVER_ENV', 'RUNNING');
      const environment = await this.dependencies.probeEnvironment(config, { platform: this.platform });
      const spec = resolveLaunchSpec(config, this.platform);
      this.event(runId, account.id, 'START_CLIENT', 'RUNNING', { launch: publicLaunchSpec(spec) });
      const record = this.processManager.launch(spec, { runId, accountId: account.id });
      this.active.pid = record.pid;
      this.event(runId, account.id, 'WAIT_PROCESS', 'RUNNING', { pid: record.pid });
      await this.processManager.waitUntilAlive(record, 3000);
      const javaProcess = await this.processManager.waitForDescendant(record.pid, row => /(?:^|[\\/])javaw?(?:\.exe)?(?:\s|$)/i.test(row.command) && row.command.includes('com.kingdee.eas'), 15000);
      const javaRecord = this.processManager.registerOwnedPid(javaProcess.pid, { runId, accountId: account.id });
      this.active.pid = javaRecord.pid;
      this.event(runId, account.id, 'WAIT_LOGIN_WINDOW', 'RUNNING', { pid: javaRecord.pid });
      const window = await this.dependencies.waitForLoginWindow({
        pid: javaRecord.pid,
        title: config.ui.login_window_title,
        sessionType: environment.session.type,
        tools: environment.tools,
        timeoutMs: config.global.startup_timeout_seconds * 1000,
        pollIntervalMs: config.global.poll_interval_seconds * 1000,
        isProcessAlive: () => this.processManager.isAlive(javaRecord.pid),
        isCancelled: () => this.active?.cancelled,
        platform: this.platform
      });
      this.event(runId, account.id, 'SELECT_DATACENTER', 'RUNNING', { pid: javaRecord.pid, window, backend: 'java-swing-agent' });
      this.event(runId, account.id, 'SET_USERNAME', 'RUNNING', { pid: javaRecord.pid, backend: 'java-swing-agent' });
      this.event(runId, account.id, 'SET_PASSWORD', 'RUNNING', { pid: javaRecord.pid, backend: 'java-swing-agent' });
      this.event(runId, account.id, 'SUBMIT_LOGIN', 'RUNNING', { pid: javaRecord.pid, backend: 'java-swing-agent' });
      const automation = await this.dependencies.automateLogin({
        pid: javaRecord.pid, account, password: credential.password, spec, environment, config,
        helperJar: this.assets.helperJar, agentJar: this.assets.agentJar,
        isCancelled: () => this.active?.cancelled,
        platform: this.platform
      });
      this.event(runId, account.id, 'VERIFY_LOGIN', 'RUNNING', { pid: javaRecord.pid, backend: automation.backend });
      this.ready.push({ runId, pid: javaRecord.pid, accountId: account.id });
      return this.event(runId, account.id, 'SUCCESS', 'SUCCESS', { pid: javaRecord.pid, backend: automation.backend, elapsedMs: Date.now() - startedAt, message: '自动登录成功' });
    } catch (error) {
      this.processManager.stopRun(runId);
      return this.event(runId, currentAccountId, error.code === 'TASK_CANCELLED' ? 'STOPPED' : 'FAILED', error.code === 'TASK_CANCELLED' ? 'STOPPED' : 'FAILED', { pid: this.active?.pid, errorCode: error.code || 'UNEXPECTED_ERROR', message: error.message, elapsedMs: Date.now() - startedAt });
    } finally {
      if (credential?.password) credential.password = null;
      this.active = null;
    }
  }

  stop() {
    const target = this.active || this.ready[this.ready.length - 1];
    if (!target) return { stopped: false, code: 'NO_ACTIVE_RUN' };
    if (this.active) this.active.cancelled = true;
    if (!target.pid) return { stopped: true, code: 'STOP_REQUESTED' };
    if (this.active) return this.processManager.stopRun(target.runId);
    const runIds = [...new Set(this.ready.map(item => item.runId))];
    const results = runIds.map(runId => this.processManager.stopRun(runId));
    this.ready = [];
    return { stopped: results.some(item => item.stopped), code: 'OWNED_PROCESSES_STOP_REQUESTED', count: results.reduce((sum, item) => sum + (item.count || 0), 0) };
  }
}

module.exports = { FoundationRunner };
