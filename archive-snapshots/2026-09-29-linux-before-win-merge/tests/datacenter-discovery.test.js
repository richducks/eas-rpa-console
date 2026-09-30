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
  fs.writeFileSync(path.join(client, 'deploy', 'client', 'datacenters.xml'), '<datacenters><datacenter name="演示中心" /></datacenters>');
  const config = structuredClone(DEFAULT_CONFIG);
  config.accounts = [];
  config.launcher.desktop_file = path.join(root, 'missing.desktop');
  config.launcher.client_directory = root;

  const discovered = await discoverDataCenters(config);
  assert.deepEqual(discovered.dataCenters, ['演示中心']);
  assert.equal(discovered.clientDirectory, client);
  assert.equal(resolveLaunchSpec(config).args[0], path.join(client, 'bin', 'client.sh'));
  assert.equal(validateConfig(config, { checkPaths: true }).valid, true);

  const desktopFile = path.join(root, 'EAS.desktop');
  fs.writeFileSync(desktopFile, `[Desktop Entry]\nName=EAS\nExec=sh client.sh\nPath=${path.join(client, 'bin')}\n`);
  config.launcher.desktop_file = desktopFile;
  config.launcher.client_directory = '..';
  assert.equal(resolveLaunchSpec(config).args[0], path.join(client, 'bin', 'client.sh'));
  assert.deepEqual((await discoverDataCenters(config)).dataCenters, ['演示中心']);
});
