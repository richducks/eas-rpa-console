const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_CONFIG, validateConfig } = require('../src/core/config');
const { resolveLaunchSpec } = require('../src/core/launcher');
const { discoverDataCenters } = require('../src/core/datacenter-discovery');

test('复制的 EAS 目录可在没有 Desktop 启动器时读取数据中心并定位启动文件', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-copied-client-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const client = path.join(root, 'client');
  fs.mkdirSync(path.join(client, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(client, 'deploy', 'client'), { recursive: true });
  fs.writeFileSync(path.join(client, 'bin', 'client.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(client, 'bin', 'client.bat'), '@echo off\r\n');
  fs.writeFileSync(path.join(client, 'deploy', 'client', 'datacenters.xml'), '<datacenters><datacenter name="演示中心" /></datacenters>');
  const config = structuredClone(DEFAULT_CONFIG);
  config.accounts = [];
  config.launcher.desktop_file = path.join(root, 'missing.desktop');
  config.launcher.client_directory = root;

  const discovered = await discoverDataCenters(config);
  assert.deepEqual(discovered.dataCenters, ['演示中心']);
  assert.equal(discovered.clientDirectory, client);
  const expectedLauncher = path.join(client, 'bin', process.platform === 'win32' ? 'client.bat' : 'client.sh');
  assert.equal(resolveLaunchSpec(config).args.includes(expectedLauncher), true);
  assert.equal(validateConfig(config, { checkPaths: true }).valid, true);

  for (const selected of [client, path.join(client, 'bin'), expectedLauncher]) {
    config.launcher.client_directory = selected;
    assert.equal(resolveLaunchSpec(config).args.includes(expectedLauncher), true);
    assert.equal(validateConfig(config, { checkPaths: true }).valid, true);
  }

  const desktopFile = path.join(root, 'EAS.desktop');
  fs.writeFileSync(desktopFile, `[Desktop Entry]\nName=EAS\nExec=sh client.sh\nPath=${path.join(client, 'bin')}\n`);
  config.launcher.desktop_file = desktopFile;
  config.launcher.client_directory = '..';
  assert.equal(resolveLaunchSpec(config).args.includes(expectedLauncher), true);
  assert.deepEqual((await discoverDataCenters(config)).dataCenters, ['演示中心']);
});

test('Windows EAS 可从服务器缓存目录识别数据中心', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-windows-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const client = path.join(root, 'client');
  fs.mkdirSync(path.join(client, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(client, 'bin', 'client.bat'), '@echo off\r\n');
  fs.writeFileSync(path.join(client, 'bin', 'set-client-env.bat'), 'SET EAS_SERVER=tcp://58.57.65.34:11034\r\n');
  for (const center of ['eas80', 'eas88', 'HK', 'null']) fs.mkdirSync(path.join(client, 'cache', '58.57.65.34', center, 'l2user'), { recursive: true });
  const config = structuredClone(DEFAULT_CONFIG);
  config.accounts = [];
  config.launcher.desktop_file = null;
  config.launcher.client_directory = root;
  const result = await discoverDataCenters(config);
  assert.deepEqual([...result.dataCenters].sort(), ['eas80', 'eas88', 'HK'].sort());
  assert.equal(result.windowBackend, 'client-cache');
});

test('实时登录窗口数据中心替代内部缓存名称', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-live-centers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const client = path.join(root, 'client');
  fs.mkdirSync(path.join(client, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(client, 'bin', 'client.bat'), '@echo off\r\n');
  fs.mkdirSync(path.join(client, 'cache', 'server', 'cached', 'l2user'), { recursive: true });
  const helperJar = path.join(root, 'helper.jar');
  const agentJar = path.join(root, 'agent.jar');
  fs.writeFileSync(helperJar, 'test');
  fs.writeFileSync(agentJar, 'test');
  const config = structuredClone(DEFAULT_CONFIG);
  config.accounts = [{ id: 'old', data_center: '旧账号中心', username: 'old', password_keyring_service: 'test', password_keyring_key: 'old' }];
  config.ui.data_centers = ['旧配置中心'];
  config.launcher.desktop_file = null;
  config.launcher.client_directory = root;
  const result = await discoverDataCenters(config, { helperJar, agentJar, liveDiscover: async () => ['生产中心', '测试中心'] });
  assert.deepEqual(result.dataCenters, ['生产中心', '测试中心']);
  assert.equal(result.windowBackend, 'java-swing-agent');
});
