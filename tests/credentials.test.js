const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { storeCredential, getCredential, checkCredentialReference, deleteCredential } = require('../src/core/credentials');

test('核心凭据服务只委托平台凭据适配器', async () => {
  const calls = [];
  const platform = {
    credentials: {
      check: async (...args) => { calls.push(['check', ...args]); return { available: true, code: 'CREDENTIAL_AVAILABLE' }; },
      get: async (...args) => { calls.push(['get', ...args]); return { available: true, password: 'secret' }; },
      store: async (...args) => { calls.push(['store', ...args]); return { stored: true, code: 'CREDENTIAL_STORED' }; },
      delete: async (...args) => { calls.push(['delete', ...args]); return { deleted: true, code: 'CREDENTIAL_DELETED' }; }
    }
  };

  assert.equal((await checkCredentialReference('svc', 'key', platform)).available, true);
  assert.equal((await getCredential('svc', 'key', platform)).password, 'secret');
  assert.equal((await storeCredential('svc', 'key', 'pw', 'label', platform)).stored, true);
  assert.equal((await deleteCredential('svc', 'key', platform)).deleted, true);
  assert.deepEqual(calls, [
    ['check', 'svc', 'key'],
    ['get', 'svc', 'key'],
    ['store', 'svc', 'key', 'pw', 'label'],
    ['delete', 'svc', 'key']
  ]);
});

test('Windows DPAPI 凭据可写入、读取、检查并删除', { skip: process.platform !== 'win32' }, async () => {
  const service = 'eascloud-rpa-test';
  const key = `credential-${crypto.randomUUID()}`;
  const password = '测试密码 P@ssw0rd!';

  try {
    const stored = await storeCredential(service, key, password);
    assert.equal(stored.stored, true, stored.code);

    const credential = await getCredential(service, key);
    assert.equal(credential.available, true, credential.code);
    assert.equal(credential.password, password);

    const checked = await checkCredentialReference(service, key);
    assert.equal(checked.available, true, checked.code);
    assert.equal(checked.password, null);
  } finally {
    await deleteCredential(service, key);
  }

  const missing = await checkCredentialReference(service, key);
  assert.equal(missing.available, false);
  assert.equal(missing.code, 'CREDENTIAL_MISSING');
});
