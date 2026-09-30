const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformAdapter } = require('../src/platform');

test('Windows 适配器统一启动器、Java、命令探测和窗口策略', () => {
  const platform = createPlatformAdapter('win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
  assert.equal(platform.id, 'windows');
  assert.equal(platform.startupScriptName, 'client.bat');
  assert.equal(platform.javaExecutableName, 'java.exe');
  assert.equal(platform.classPathDelimiter, ';');
  assert.equal(platform.defaultDesktopFile, null);
  assert.equal(platform.defaultClientDirectory, 'D:\\Kingdee\\eas');
  assert.equal(platform.sessionType, 'windows');
  assert.equal(platform.supportsAtspi, false);
  assert.deepEqual(platform.wrapStartupScript('C:\\EAS\\client\\bin\\client.bat'), {
    executable: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', 'call', 'C:\\EAS\\client\\bin\\client.bat']
  });
});

test('Linux 适配器统一 Desktop、Shell、Java 与 AT-SPI 策略', () => {
  const platform = createPlatformAdapter('linux', {});
  assert.equal(platform.id, 'linux');
  assert.equal(platform.startupScriptName, 'client.sh');
  assert.equal(platform.javaExecutableName, 'java');
  assert.equal(platform.classPathDelimiter, ':');
  assert.equal(platform.defaultDesktopFile, '/opt/Kingdee/EASCloud.desktop');
  assert.equal(platform.defaultClientDirectory, null);
  assert.equal(platform.supportsAtspi, true);
  assert.deepEqual(platform.wrapStartupScript('/opt/eas/client/bin/client.sh'), {
    executable: '/bin/sh',
    args: ['/opt/eas/client/bin/client.sh']
  });
});

test('macOS 复用 POSIX 核心但不冒充 Linux AT-SPI 能力', () => {
  const platform = createPlatformAdapter('darwin', {});
  assert.equal(platform.id, 'macos');
  assert.equal(platform.startupScriptName, 'client.sh');
  assert.equal(platform.javaExecutableName, 'java');
  assert.equal(platform.classPathDelimiter, ':');
  assert.equal(platform.defaultDesktopFile, null);
  assert.equal(platform.defaultClientDirectory, null);
  assert.equal(platform.supportsAtspi, false);
  assert.equal(platform.shouldQuitOnAllWindowsClosed, false);
});
