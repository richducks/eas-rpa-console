const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG } = require('../src/core/config');
const { ProcessManager } = require('../src/core/process-manager');
const { FoundationRunner } = require('../src/core/runner');

test('状态机完成表单填写、提交和登录验证', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.accounts = [{ id: 'test-account', name: '测试账号', enabled: true, data_center: '测试中心', username: 'tester', password_keyring_service: 'eascloud-rpa-test', password_keyring_key: 'test-account' }];
  config.launcher.desktop_file = null;
  config.launcher.command = [process.execPath, '-e', 'setInterval(()=>{},1000)'];
  const entries = [];
  const logger = { createRunId: () => 'test-run', write: (_level, _event, entry) => entries.push(entry) };
  const events = [];
  const processManager = {
    launch: () => ({ pid: 100, exited: false }),
    waitUntilAlive: async () => true,
    waitForDescendant: async () => ({ pid: 101, command: '/java com.kingdee.eas' }),
    registerOwnedPid: () => ({ pid: 101 }),
    isAlive: () => true,
    stopOwned: () => ({ stopped: true }),
    stopRun: () => ({ stopped: true, count: 2 })
  };
  const runner = new FoundationRunner({
    processManager, logger, emit: event => events.push(event),
    dependencies: {
      getCredential: async () => ({ available: true, password: 'not-a-real-password' }),
      probeEnvironment: async () => ({ session: { type: 'x11' }, tools: { wmctrl: true } }),
      waitForLoginWindow: async options => ({ id: '0xbeef', pid: options.pid, title: '金蝶EAS Cloud系统登录', backend: 'test' }),
      automateLogin: async () => ({ backend: 'test' })
    }
  });
  const result = await runner.run(config);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(events.map(event => event.stage), ['VALIDATE_CONFIG', 'VALIDATE_CREDENTIAL', 'DISCOVER_ENV', 'START_CLIENT', 'WAIT_PROCESS', 'WAIT_LOGIN_WINDOW', 'SELECT_DATACENTER', 'SET_USERNAME', 'SET_PASSWORD', 'SUBMIT_LOGIN', 'VERIFY_LOGIN', 'SUCCESS']);
  assert.equal(runner.stop().stopped, true);
});


test('运行中途失败时清空凭据并回收该 run 的全部进程', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.accounts = [{ id: 'a', enabled: true, data_center: '生产', username: 'u', password_keyring_service: 'svc', password_keyring_key: 'a' }];
  config.launcher.desktop_file = null;
  config.launcher.command = [process.execPath, '-e', 'setInterval(()=>{},1000)'];
  const credential = { available: true, password: 'secret' };
  const stopped = [];
  const processManager = {
    launch: () => ({ pid: 10, exited: false }), waitUntilAlive: async () => true,
    waitForDescendant: async () => { throw Object.assign(new Error('timeout'), { code: 'EAS_JAVA_PROCESS_TIMEOUT' }); },
    registerOwnedPid: () => ({ pid: 11 }), isAlive: () => true,
    stopRun: runId => { stopped.push(runId); return { stopped: true, count: 1 }; }
  };
  const runner = new FoundationRunner({
    processManager, logger: { createRunId: () => 'run-fail', write: () => {} },
    dependencies: { getCredential: async () => credential, probeEnvironment: async () => ({ session: { type: 'x11' }, tools: {} }) }
  });
  const result = await runner.run(config);
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(stopped, ['run-fail']);
  assert.equal(credential.password, null);
});
