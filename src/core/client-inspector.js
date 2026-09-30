const fs = require('fs');
const path = require('path');
const { resolveClientDirectory } = require('./launcher');
const { currentPlatform } = require('../platform');

const VERSION_FILES = [
  'version.properties',
  'product.properties',
  'bin/version.properties',
  'bin/set-client-env.bat',
  'bin/set-client-env.sh',
  'deploy/client/version.properties',
  'deploy/client/config.xml'
];

function extractVersion(text) {
  const source = String(text || '');
  const patterns = [
    /(?:EAS[_ .-]*VERSION|EAS\.VERSION|PRODUCT[_ .-]*VERSION|PRODUCT\.VERSION)\s*[=:]\s*["']?([0-9]+(?:\.[0-9]+){1,3})/i,
    /\bEAS\s*([0-9]+(?:\.[0-9]+){1,3})\b/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function detectVersion(clientDirectory) {
  for (const relative of VERSION_FILES) {
    const file = path.join(clientDirectory, relative);
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) continue;
      const version = extractVersion(fs.readFileSync(file, 'utf8'));
      if (version) return { version, source: relative };
    } catch { /* best effort */ }
  }
  const pathVersion = path.basename(path.dirname(clientDirectory)).match(/(?:eas|kingdee)[^0-9]{0,12}([0-9]+(?:\.[0-9]+){1,2})/i)?.[1]
    || path.basename(clientDirectory).match(/(?:eas|kingdee)[^0-9]{0,12}([0-9]+(?:\.[0-9]+){1,2})/i)?.[1];
  return pathVersion ? { version: pathVersion, source: 'directory-name' } : { version: null, source: null };
}

function inspectClientDirectory(input, platform = currentPlatform) {
  const raw = String(input || '').trim();
  if (!raw) return { valid: false, code: 'CLIENT_DIRECTORY_REQUIRED', message: '请选择 EAS 客户端目录' };
  const client = { client_directory: raw, desktop_file: null, command: null, working_directory: null };
  const clientDirectory = resolveClientDirectory(client);
  if (!clientDirectory || !fs.existsSync(clientDirectory) || !fs.statSync(clientDirectory).isDirectory()) {
    return { valid: false, code: 'CLIENT_DIRECTORY_NOT_FOUND', message: `EAS 客户端目录不存在：${clientDirectory || raw}` };
  }
  const startupFile = path.join(clientDirectory, 'bin', platform.startupScriptName);
  const alternateStartup = platform.startupScriptName === 'client.bat' ? path.join(clientDirectory, 'bin', 'client.sh') : path.join(clientDirectory, 'bin', 'client.bat');
  const markers = [
    startupFile,
    alternateStartup,
    path.join(clientDirectory, 'deploy', 'client', 'config.xml'),
    path.join(clientDirectory, 'deploy', 'client', 'datacenters.xml'),
    path.join(clientDirectory, 'cache')
  ];
  if (!markers.some(marker => fs.existsSync(marker))) {
    return { valid: false, code: 'CLIENT_DIRECTORY_INVALID', message: '所选目录不像金蝶 EAS 客户端，请选择 EAS 根目录、client 目录或 bin 目录' };
  }
  const detected = detectVersion(clientDirectory);
  return {
    valid: true,
    clientDirectory,
    startupFile: fs.existsSync(startupFile) ? startupFile : null,
    detectedVersion: detected.version,
    versionSource: detected.source,
    compatibility: detected.version ? `EAS ${detected.version}` : 'EAS 兼容模式'
  };
}

module.exports = { inspectClientDirectory, detectVersion, extractVersion };
