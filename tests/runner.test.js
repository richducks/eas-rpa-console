const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG } = require('../src/core/config');
const { ProcessManager } = require('../src/core/process-manager');
const { FoundationRunner } = require('../src/core/runner');

test('状态机完成表单填写、提交和登录验证', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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
    stopOwned: () => ({ stopped: true })
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
