const path = require('path');
const fs = require('fs');
const { resolveLaunchSpec, resolveClientDirectory } = require('./launcher');
const { parseDesktopFile } = require('./desktop-file');

function decodeXml(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseDataCenterXml(xml) {
  const names = [];
  const add = value => {
    const name = decodeXml(value).trim();
    if (name && !names.includes(name)) names.push(name);
  };
  for (const tag of xml.matchAll(/<(?:datacenter|data-center|dc)\b([^>]*)>/gi)) {
    const match = tag[1].match(/\b(?:displayName|display-name|name|title|label)\s*=\s*["']([^"']+)["']/i);
    if (match) add(match[1]);
  }
  for (const attribute of xml.matchAll(/<attribute\b[^>]*\bkey\s*=\s*["'](?:name|displayName|display-name|title|label)["'][^>]*\bvalue\s*=\s*["']([^"']+)["'][^>]*>/gi)) add(attribute[1]);
  return names;
}

function installationRoot(spec) {
  const workingDirectory = path.resolve(spec.workingDirectory || process.cwd());
  return path.basename(workingDirectory) === 'bin' && path.basename(path.dirname(workingDirectory)) === 'client'
    ? path.dirname(path.dirname(workingDirectory))
    : workingDirectory;
}

async function discoverDataCenters(config) {
  const configured = config.launcher?.client_directory;
  const spec = configured ? null : resolveLaunchSpec(config);
  const root = spec ? installationRoot(spec) : null;
  const launcher = config.launcher || {};
  const desktopBase = launcher.desktop_file && fs.existsSync(launcher.desktop_file) ? parseDesktopFile(launcher.desktop_file).workingDirectory : process.cwd();
  const clientDirectory = configured ? resolveClientDirectory(config, launcher.working_directory || desktopBase) : path.join(root, 'client');
  if (!fs.existsSync(clientDirectory) || !fs.statSync(clientDirectory).isDirectory()) throw Object.assign(new Error(`EAS 客户端目录不存在：${clientDirectory}`), { code: 'CLIENT_DIRECTORY_NOT_FOUND' });
  const markers = ['bin/client.sh', 'bin/client.bat', 'deploy/client/config.xml', 'deploy/client/datacenters.xml'];
  if (!markers.some(marker => fs.existsSync(path.join(clientDirectory, marker)))) throw Object.assign(new Error('所选目录不是 EAS 客户端目录，请选择含 bin 或 deploy 的目录'), { code: 'CLIENT_DIRECTORY_INVALID' });
  const candidates = [path.join(clientDirectory, 'deploy', 'client', 'datacenters.xml'), path.join(clientDirectory, 'datacenters.xml')];
  const files = [...new Set(candidates)].filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
  const installed = files.flatMap(file => parseDataCenterXml(fs.readFileSync(file, 'utf8')));
  const saved = Array.isArray(config.ui?.data_centers) ? config.ui.data_centers : [];
  const accountCenters = Array.isArray(config.accounts) ? config.accounts.map(account => account.data_center) : [];
  const dataCenters = [...new Set([...installed, ...saved, ...accountCenters].map(value => String(value || '').trim()).filter(Boolean))];
  if (!dataCenters.length) throw Object.assign(new Error('安装目录中尚无数据中心配置，请确认 EAS 客户端已完成初始化'), { code: 'DATACENTER_CONFIG_NOT_FOUND' });
  return { dataCenters, windowBackend: files.length ? 'install-directory' : 'local-saved-config', clientDirectory, sourceFiles: files.map(file => path.relative(clientDirectory, file)) };
}

module.exports = { discoverDataCenters, parseDataCenterXml };
