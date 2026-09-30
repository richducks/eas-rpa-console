const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_CONFIG, ConfigStore, validateConfig } = require('../src/core/config');

const copy = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

test('默认配置有效', () => {
  assert.equal(validateConfig(copy()).valid, true);
});

test('首次启动默认配置不注入演示账号或数据中心', () => {
  const config = copy();
  assert.deepEqual(config.accounts, []);
  assert.deepEqual(config.ui.data_centers, []);
});

test('配置损坏时自动回退到最近一次有效备份', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.yaml');
  const store = new ConfigStore(file);
  store.ensure();
  const first = store.load();
  first.global.retry_count = 2;
  assert.equal(store.save(first).valid, true);
  const second = store.load();
  second.global.retry_count = 3;
  assert.equal(store.save(second).valid, true);
  fs.writeFileSync(file, 'global: [broken', 'utf8');
  const recovered = store.load();
  assert.equal(recovered.global.retry_count, 2);
  assert.equal(store.lastRecovery?.recovered, true);
  assert.equal(store.load().global.retry_count, 2);
});

test('首次启动允许尚未选择客户端，执行任务时再要求启动器', () => {
  const config = copy();
  config.launcher.desktop_file = null;
  config.launcher.command = null;
  config.launcher.client_directory = null;
  assert.equal(validateConfig(config).valid, true);
  const strict = validateConfig(config, { checkPaths: true });
  assert.equal(strict.valid, false);
  assert.match(strict.errors.join(' '), /请指定/);
});

test('显式启动命令优先于备用客户端目录', () => {
  const config = copy();
  config.launcher.desktop_file = null;
  config.launcher.command = [process.execPath, '-e', 'process.exit(0)'];
  config.launcher.client_directory = 'Z:\\definitely-not-existing\\eas';
  const strict = validateConfig(config, { checkPaths: true });
  assert.equal(strict.valid, true, strict.errors.join('；'));
});

test('拒绝明文密码', () => {
  const config = copy();
  config.accounts = [{ id: 'a', data_center: '生产', username: 'user', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'a', password: 'should-never-be-saved' }];
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /禁止保存明文/);
});

test('拒绝重复内部 ID，但不限制启用账号数量', () => {
  const config = copy();
  const account = { id: 'same', data_center: '生产', username: 'user', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'same', enabled: true };
  config.accounts = [account, { ...account, username: 'user2', password_keyring_key: 'same-2' }];
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /账号 ID 重复/);
});


test('重试次数限制在 0 到 3，防止失败循环失控', () => {
  const config = copy();
  config.global.retry_count = 4;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /0 到 3/);
});
