const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, validateConfig } = require('../src/core/config');

const copy = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

test('默认配置有效', () => {
  assert.equal(validateConfig(copy()).valid, true);
});

test('拒绝明文密码', () => {
  const config = copy();
  config.accounts[0].password = 'should-never-be-saved';
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /禁止保存明文/);
});

test('拒绝重复内部 ID，但不限制启用账号数量', () => {
  const config = copy();
  config.accounts[3].id = config.accounts[0].id;
  config.accounts[3].enabled = true;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /账号 ID 重复/);
  assert.doesNotMatch(result.errors.join(' '), /超过 max_instances/);
});
