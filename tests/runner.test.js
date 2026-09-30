const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG } = require('../src/core/config');
const { FoundationRunner } = require('../src/core/runner');

function runtimeConfig() {
  const config = structuredClone(DEFAULT_CONFIG);
  config.clients = [{ id: 'c1', remark: '开发客户端', client_directory: null, desktop_file: null, command: [process.execPath, '-e', 'setInterval(()=>{},1000)'], working_directory: null, detected_version: '8.8', data_centers: ['测试中心'] }];
  config.active_client_id = 'c1';
  config.accounts = [{ id: 'test-account', client_id: 'c1', name: '测试账号', enabled: true, data_center: '测试中心', username: 'tester', password_keyring_service: 'eascloud-rpa-test', password_keyring_key: 'test-account' }];
  return config;
}

test('状态机使用账号绑定的客户端完成登录', async () => {
  const config = runtimeConfig(); const entries = []; const events = []; let probedClientId = null;
  const processManager = { launch: () => ({ pid: 100, exited: false }), waitUntilAlive: async () => true, waitForDescendant: async () => ({ pid: 101, command: '/java com.kingdee.eas' }), registerOwnedPid: () => ({ pid: 101 }), isAlive: () => true, stopOwned: () => ({ stopped: true }), stopRun: () => ({ stopped: true, count: 2 }) };
  const runner = new FoundationRunner({ processManager, logger: { createRunId: () => 'test-run', write: (_l,_e,entry) => entries.push(entry) }, emit: e => events.push(e), dependencies: {
    getCredential: async () => ({ available: true, password: 'not-a-real-password' }),
    probeEnvironment: async (_config, options) => { probedClientId = options.clientId; return { session: { type: 'x11' }, tools: { wmctrl: true } }; },
    waitForLoginWindow: async options => ({ id: '0xbeef', pid: options.pid, title: '金蝶EAS Cloud系统登录', backend: 'test' }), automateLogin: async () => ({ backend: 'test' })
  }});
  const result = await runner.run(config);
  assert.equal(result.status, 'SUCCESS'); assert.equal(probedClientId, 'c1');
  assert.deepEqual(events.map(e => e.stage), ['VALIDATE_CONFIG','VALIDATE_CREDENTIAL','DISCOVER_ENV','START_CLIENT','WAIT_PROCESS','WAIT_LOGIN_WINDOW','SELECT_DATACENTER','SET_USERNAME','SET_PASSWORD','SUBMIT_LOGIN','VERIFY_LOGIN','SUCCESS']);
  assert.equal(runner.stop().stopped, true);
});

test('账号绑定不存在客户端时明确失败且不启动进程', async () => {
  const config = runtimeConfig(); config.accounts[0].client_id = 'missing'; let launched = false;
  const runner = new FoundationRunner({ processManager: { launch: () => { launched = true; }, stopRun: () => ({ stopped: false }) }, logger: { createRunId: () => 'missing', write: () => {} } });
  const result = await runner.run(config);
  assert.equal(result.status, 'FAILED'); assert.equal(result.errorCode, 'CLIENT_NOT_FOUND'); assert.equal(launched, false);
});

test('运行中途失败时清空凭据并回收该 run 的全部进程', async () => {
  const config = runtimeConfig(); const credential = { available: true, password: 'secret' }; const stopped = [];
  const processManager = { launch: () => ({ pid: 10, exited: false }), waitUntilAlive: async () => true, waitForDescendant: async () => { throw Object.assign(new Error('timeout'), { code: 'EAS_JAVA_PROCESS_TIMEOUT' }); }, registerOwnedPid: () => ({ pid: 11 }), isAlive: () => true, stopRun: runId => { stopped.push(runId); return { stopped: true, count: 1 }; } };
  const runner = new FoundationRunner({ processManager, logger: { createRunId: () => 'run-fail', write: () => {} }, dependencies: { getCredential: async () => credential, probeEnvironment: async () => ({ session: { type: 'x11' }, tools: {} }) } });
  const result = await runner.run(config);
  assert.equal(result.status, 'FAILED'); assert.deepEqual(stopped, ['run-fail']); assert.equal(credential.password, null);
});
