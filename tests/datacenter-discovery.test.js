const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_CONFIG, validateConfig } = require('../src/core/config');
const { resolveLaunchSpec } = require('../src/core/launcher');
const { discoverDataCenters } = require('../src/core/datacenter-discovery');
const { currentPlatform } = require('../src/platform');

function configWithClient(directory, overrides = {}) {
  const config = structuredClone(DEFAULT_CONFIG);
  const client = { id: 'c1', remark: '测试客户端', client_directory: directory, desktop_file: null, command: null, working_directory: null, detected_version: null, data_centers: [], ...overrides };
  config.clients = [client]; config.active_client_id = client.id; return { config, client };
}

test('复制的 EAS 目录可在没有 Desktop 启动器时读取数据中心并定位启动文件', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-copied-client-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clientDir = path.join(root, 'client'); fs.mkdirSync(path.join(clientDir, 'bin'), { recursive: true }); fs.mkdirSync(path.join(clientDir, 'deploy', 'client'), { recursive: true });
  fs.writeFileSync(path.join(clientDir, 'bin', 'client.sh'), '#!/bin/sh\n'); fs.writeFileSync(path.join(clientDir, 'bin', 'client.bat'), '@echo off\r\n');
  fs.writeFileSync(path.join(clientDir, 'deploy', 'client', 'datacenters.xml'), '<datacenters><datacenter name="演示中心" /></datacenters>');
  const { config, client } = configWithClient(root);
  const discovered = await discoverDataCenters(config, { clientId: client.id });
  assert.deepEqual(discovered.dataCenters, ['演示中心']); assert.equal(discovered.clientDirectory, clientDir);
  const expectedLauncher = path.join(clientDir, 'bin', currentPlatform.startupScriptName);
  assert.equal(resolveLaunchSpec(client).args.includes(expectedLauncher), true);
  assert.equal(validateConfig(config, { checkPaths: true, clientId: client.id }).valid, true);
  for (const selected of [clientDir, path.join(clientDir, 'bin'), expectedLauncher]) {
    client.client_directory = selected;
    assert.equal(resolveLaunchSpec(client).args.includes(expectedLauncher), true);
  }
});

test('不同客户端的数据中心和账号回退不会串线', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-client-isolation-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['a', 'b']) { fs.mkdirSync(path.join(root, name, 'bin'), { recursive: true }); fs.writeFileSync(path.join(root, name, 'bin', 'client.bat'), '@echo off\r\n'); }
  const config = structuredClone(DEFAULT_CONFIG);
  config.clients = [
    { id: 'a', remark: '8.8', client_directory: path.join(root, 'a'), desktop_file: null, command: null, working_directory: null, detected_version: '8.8', data_centers: ['A中心'] },
    { id: 'b', remark: '9.0', client_directory: path.join(root, 'b'), desktop_file: null, command: null, working_directory: null, detected_version: '9.0', data_centers: ['B中心'] }
  ];
  config.active_client_id = 'a';
  config.accounts = [
    { id: 'aa', client_id: 'a', data_center: 'A账号中心', username: 'a', password_keyring_service: 'x', password_keyring_key: 'aa' },
    { id: 'bb', client_id: 'b', data_center: 'B账号中心', username: 'b', password_keyring_service: 'x', password_keyring_key: 'bb' }
  ];
  const result = await discoverDataCenters(config, { clientId: 'a' });
  assert.deepEqual(result.dataCenters.sort(), ['A中心', 'A账号中心'].sort());
  assert.equal(result.dataCenters.includes('B中心'), false);
  assert.equal(result.dataCenters.includes('B账号中心'), false);
});

test('Windows EAS 可从服务器缓存目录识别数据中心', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-windows-cache-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clientDir = path.join(root, 'client'); fs.mkdirSync(path.join(clientDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(clientDir, 'bin', 'client.bat'), '@echo off\r\n'); fs.writeFileSync(path.join(clientDir, 'bin', 'set-client-env.bat'), 'SET EAS_SERVER=tcp://58.57.65.34:11034\r\n');
  for (const center of ['eas80', 'eas88', 'HK', 'null']) fs.mkdirSync(path.join(clientDir, 'cache', '58.57.65.34', center, 'l2user'), { recursive: true });
  const { config, client } = configWithClient(root);
  const result = await discoverDataCenters(config, { clientId: client.id });
  assert.deepEqual([...result.dataCenters].sort(), ['eas80', 'eas88', 'HK'].sort()); assert.equal(result.windowBackend, 'client-cache');
});

test('实时登录窗口数据中心替代该客户端内部缓存名称', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-live-centers-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clientDir = path.join(root, 'client'); fs.mkdirSync(path.join(clientDir, 'bin'), { recursive: true }); fs.writeFileSync(path.join(clientDir, 'bin', 'client.bat'), '@echo off\r\n');
  const helperJar = path.join(root, 'helper.jar'); const agentJar = path.join(root, 'agent.jar'); fs.writeFileSync(helperJar, 'test'); fs.writeFileSync(agentJar, 'test');
  const { config, client } = configWithClient(root, { data_centers: ['旧配置中心'] });
  config.accounts = [{ id: 'old', client_id: client.id, data_center: '旧账号中心', username: 'old', password_keyring_service: 'test', password_keyring_key: 'old' }];
  const result = await discoverDataCenters(config, { clientId: client.id, helperJar, agentJar, liveDiscover: async () => ['生产中心', '测试中心'] });
  assert.deepEqual(result.dataCenters, ['生产中心', '测试中心']); assert.equal(result.windowBackend, 'java-swing-agent');
});
