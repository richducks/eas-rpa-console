const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { storeCredential, getCredential, checkCredentialReference, deleteCredential } = require('../src/core/credentials');

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
