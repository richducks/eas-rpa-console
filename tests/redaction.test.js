const test = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('../src/core/redaction');

test('递归脱敏敏感字段与字符串', () => {
  const result = redact({ password: 'plain', nested: { token: 'abc', message: 'secret=hidden' }, username: 'safe' });
  assert.equal(result.password, '[REDACTED]');
  assert.equal(result.nested.token, '[REDACTED]');
  assert.equal(result.nested.message, 'secret=[REDACTED]');
  assert.equal(result.username, 'safe');
});
