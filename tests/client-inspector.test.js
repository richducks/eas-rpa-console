const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectClientDirectory, extractVersion } = require('../src/core/client-inspector');
const { createPlatformAdapter } = require('../src/platform');

test('从常见属性文本识别 EAS 版本号', () => {
  assert.equal(extractVersion('EAS_VERSION=8.8.0'), '8.8.0');
  assert.equal(extractVersion('product.version: 9.0'), '9.0');
});

test('同一目录模型兼容 Windows 和 Linux 启动脚本', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-client-inspect-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const client = path.join(root, 'EAS8.8', 'client');
  fs.mkdirSync(path.join(client, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(client, 'bin', 'client.bat'), '@echo off\r\nEAS_VERSION=8.8\r\n');
  fs.writeFileSync(path.join(client, 'bin', 'client.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(client, 'version.properties'), 'EAS_VERSION=8.8\n');
  const windows = inspectClientDirectory(client, createPlatformAdapter('win32', {}));
  const linux = inspectClientDirectory(client, createPlatformAdapter('linux', {}));
  assert.equal(windows.valid, true); assert.equal(linux.valid, true);
  assert.equal(windows.detectedVersion, '8.8'); assert.equal(linux.detectedVersion, '8.8');
  assert.match(windows.startupFile, /client\.bat$/); assert.match(linux.startupFile, /client\.sh$/);
});

test('无版本号但具备 EAS 结构时进入兼容模式而不是拒绝', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-client-generic-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'client.sh'), '#!/bin/sh\n');
  const result = inspectClientDirectory(root, createPlatformAdapter('linux', {}));
  assert.equal(result.valid, true); assert.equal(result.detectedVersion, null); assert.equal(result.compatibility, 'EAS 兼容模式');
});
