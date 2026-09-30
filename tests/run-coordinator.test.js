const test = require('node:test');
const assert = require('node:assert/strict');
const { RunCoordinator } = require('../src/core/run-coordinator');

function baseConfig() {
  return { global: { retry_count: 1, continue_on_error: true }, active_client_id: 'c1', accounts: [
    { id: 'a', client_id: 'c1', enabled: true, data_center: '生产' },
    { id: 'b', client_id: 'c1', enabled: true, data_center: '生产' },
    { id: 'other', client_id: 'c2', enabled: true, data_center: '生产' }
  ] };
}

const selection = { clientId: 'c1', dataCenter: '生产' };

test('批量运行只处理所选客户端和数据中心，并对瞬时失败重试', async () => {
  const attempts = new Map(); const runner = { async run(config) { const account = config.accounts.find(item => item.enabled); assert.equal(config.accounts.filter(item => item.enabled).length, 1); const count = (attempts.get(account.id) || 0) + 1; attempts.set(account.id, count); if (account.id === 'a' && count === 1) return { status: 'FAILED', errorCode: 'LOGIN_VERIFY_TIMEOUT' }; return { status: 'SUCCESS' }; } };
  const result = await new RunCoordinator(runner).runDataCenter(baseConfig(), selection);
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.succeeded, 2); assert.deepEqual([...attempts.keys()], ['a','b']); assert.equal(result.results[0].attempts, 2);
});

test('密码错误属于确定性失败，不执行无意义重试', async () => {
  let calls = 0; const config = baseConfig(); config.accounts = [config.accounts[0]];
  const result = await new RunCoordinator({ run: async () => { calls += 1; return { status: 'FAILED', errorCode: 'LOGIN_REJECTED' }; } }).runDataCenter(config, selection);
  assert.equal(result.status, 'FAILED'); assert.equal(calls, 1);
});

test('continue_on_error=false 时首个最终失败即停止后续账号', async () => {
  const config = baseConfig(); config.global.retry_count = 0; config.global.continue_on_error = false; const seen = [];
  const result = await new RunCoordinator({ run: async isolated => { const id = isolated.accounts.find(item => item.enabled).id; seen.push(id); return { status: id === 'a' ? 'FAILED' : 'SUCCESS', errorCode: 'PROCESS_START_TIMEOUT' }; } }).runDataCenter(config, selection);
  assert.equal(result.status, 'FAILED'); assert.deepEqual(seen, ['a']);
});

test('未知错误默认不重试，避免把程序缺陷放大成重复操作', async () => {
  let calls = 0; const config = baseConfig(); config.accounts = [config.accounts[0]]; config.global.retry_count = 3;
  const result = await new RunCoordinator({ run: async () => { calls += 1; return { status: 'FAILED', errorCode: 'UNEXPECTED_ERROR' }; } }).runDataCenter(config, selection);
  assert.equal(result.status, 'FAILED'); assert.equal(calls, 1);
});
