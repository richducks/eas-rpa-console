const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_CONFIG, ConfigStore, normalizeConfig, validateConfig } = require('../src/core/config');

const copy = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const addClient = (config, overrides = {}) => {
  const client = {
    id: 'client-a', remark: 'EAS 8.8 开发', client_directory: null, desktop_file: null,
    command: [process.execPath, '-e', 'process.exit(0)'], working_directory: null,
    detected_version: '8.8', data_centers: ['生产'], ...overrides
  };
  config.clients = [client];
  config.active_client_id = client.id;
  return client;
};

const account = (overrides = {}) => ({ id: 'a', client_id: 'client-a', data_center: '生产', username: 'user', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'a', enabled: true, ...overrides });

test('默认配置有效且首次启动不注入客户端、账号或数据中心', () => {
  const config = copy();
  assert.equal(validateConfig(config).valid, true);
  assert.deepEqual(config.clients, []);
  assert.equal(config.active_client_id, null);
  assert.deepEqual(config.accounts, []);
  assert.equal('data_centers' in config.ui, false);
});

test('旧单客户端配置自动迁移且账号和数据中心不丢失', () => {
  const legacy = {
    global: structuredClone(DEFAULT_CONFIG.global),
    launcher: { desktop_file: null, command: null, working_directory: null, client_directory: '/opt/legacy/client' },
    ui: { login_window_title: '登录', data_centers: ['中心A', '中心B'] },
    accounts: [{ id: 'u1', data_center: '中心A', username: 'u', password_keyring_service: 'svc', password_keyring_key: 'u1' }]
  };
  const migrated = normalizeConfig(legacy);
  assert.equal(migrated.clients.length, 1);
  assert.equal(migrated.clients[0].id, 'legacy-default');
  assert.equal(migrated.clients[0].client_directory, '/opt/legacy/client');
  assert.deepEqual(migrated.clients[0].data_centers, ['中心A', '中心B']);
  assert.equal(migrated.active_client_id, 'legacy-default');
  assert.equal(migrated.accounts[0].client_id, 'legacy-default');
  assert.equal('launcher' in migrated, false);
});

test('ConfigStore 首次读取旧结构时原子写入新结构并保留迁移前备份', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-migrate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.yaml');
  fs.writeFileSync(file, `global:\n  startup_timeout_seconds: 120\n  login_timeout_seconds: 60\n  poll_interval_seconds: 0.5\n  retry_count: 1\n  continue_on_error: true\nlauncher:\n  client_directory: /opt/legacy/client\n  desktop_file: null\n  command: null\n  working_directory: null\nui:\n  login_window_title: 登录\n  data_centers: [中心A]\naccounts:\n  - id: u1\n    data_center: 中心A\n    username: u\n    password_keyring_service: svc\n    password_keyring_key: u1\n`);
  const store = new ConfigStore(file);
  const loaded = store.load();
  assert.equal(loaded.clients.length, 1);
  assert.equal(loaded.accounts[0].client_id, 'legacy-default');
  assert.equal(store.lastRecovery?.migrated, true);
  assert.equal(fs.existsSync(store.migrationBackupPath), true);
  const rewritten = fs.readFileSync(file, 'utf8');
  assert.equal(rewritten.includes('\nlauncher:'), false);
  assert.match(rewritten, /clients:/);
});

test('配置损坏时自动回退到最近一次有效备份', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.yaml');
  const store = new ConfigStore(file);
  store.ensure();
  const first = store.load(); first.global.retry_count = 2; assert.equal(store.save(first).valid, true);
  const second = store.load(); second.global.retry_count = 3; assert.equal(store.save(second).valid, true);
  fs.writeFileSync(file, 'global: [broken', 'utf8');
  const recovered = store.load();
  assert.equal(recovered.global.retry_count, 2);
  assert.equal(store.lastRecovery?.recovered, true);
});

test('首次启动允许尚未保存客户端，执行任务时才要求客户端', () => {
  const config = copy();
  assert.equal(validateConfig(config).valid, true);
  const strict = validateConfig(config, { checkPaths: true });
  assert.equal(strict.valid, false);
  assert.match(strict.errors.join(' '), /选择 EAS 客户端/);
});

test('客户端显式启动命令优先于不存在的备用目录', () => {
  const config = copy();
  addClient(config, { client_directory: 'Z:\\definitely-not-existing\\eas' });
  const strict = validateConfig(config, { checkPaths: true, clientId: 'client-a' });
  assert.equal(strict.valid, true, strict.errors.join('；'));
});

test('仅使用 Desktop 启动器的旧式客户端仍可保留并通过严格校验', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-desktop-only-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const desktop = path.join(directory, 'EAS.desktop');
  fs.writeFileSync(desktop, '[Desktop Entry]\nName=EAS\nExec=/bin/true\n');
  const config = copy();
  addClient(config, { client_directory: null, desktop_file: desktop, command: null });
  const strict = validateConfig(config, { checkPaths: true, clientId: 'client-a' });
  assert.equal(strict.valid, true, strict.errors.join('；'));
});

test('账号必须绑定存在的客户端并拒绝明文密码', () => {
  const config = copy(); addClient(config);
  config.accounts = [account({ client_id: 'missing', password: 'should-never-be-saved' })];
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /不存在的客户端/);
  assert.match(result.errors.join(' '), /禁止保存明文/);
});

test('拒绝重复客户端 ID 和账号 ID', () => {
  const config = copy();
  const first = addClient(config);
  config.clients.push({ ...first });
  config.accounts = [account(), account({ username: 'user2', password_keyring_key: 'a2' })];
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /客户端 ID 重复/);
  assert.match(result.errors.join(' '), /账号 ID 重复/);
});

test('重试次数限制在 0 到 3，防止失败循环失控', () => {
  const config = copy(); config.global.retry_count = 4;
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /0 到 3/);
});
