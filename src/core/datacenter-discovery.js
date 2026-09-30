const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { resolveLaunchSpec, resolveClientDirectory } = require('./launcher');
const { parseDesktopFile } = require('./desktop-file');
const { ProcessManager } = require('./process-manager');
const { currentPlatform } = require('../platform');

const execFileAsync = promisify(execFile);

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

function readServerHost(clientDirectory) {
  const environmentFile = path.join(clientDirectory, 'bin', 'set-client-env.bat');
  if (!fs.existsSync(environmentFile)) return null;
  const source = fs.readFileSync(environmentFile, 'utf8');
  const value = source.match(/^\s*(?:@?set\s+)?EAS_SERVER\s*=\s*(.+?)\s*$/im)?.[1]?.replace(/^['"]|['"]$/g, '');
  if (!value) return null;
  return value.replace(/^\w+:\/\//, '').split(':')[0].trim() || null;
}

function discoverCachedDataCenters(clientDirectory) {
  const cacheRoot = path.join(clientDirectory, 'cache');
  if (!fs.existsSync(cacheRoot)) return { names: [], sources: [] };
  const serverHost = readServerHost(clientDirectory);
  const serverRoots = serverHost && fs.existsSync(path.join(cacheRoot, serverHost))
    ? [path.join(cacheRoot, serverHost)]
    : fs.readdirSync(cacheRoot, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => path.join(cacheRoot, item.name));
  const names = [];
  const sources = [];
  for (const serverRoot of serverRoots) {
    for (const center of fs.readdirSync(serverRoot, { withFileTypes: true })) {
      if (!center.isDirectory() || center.name.toLowerCase() === 'null') continue;
      const centerPath = path.join(serverRoot, center.name);
      let hasUserCache = false;
      try { hasUserCache = fs.readdirSync(centerPath, { withFileTypes: true }).some(item => item.isDirectory() && /^l\d/i.test(item.name)); }
      catch { /* Ignore transient or inaccessible cache folders. */ }
      if (hasUserCache && !names.includes(center.name)) {
        names.push(center.name);
        sources.push(path.relative(clientDirectory, centerPath));
      }
    }
  }
  return { names, sources };
}

async function discoverLiveDataCenters(config, assets, dependencies = {}) {
  if (!assets?.helperJar || !assets?.agentJar || !fs.existsSync(assets.helperJar) || !fs.existsSync(assets.agentJar)) {
    throw Object.assign(new Error('数据中心探测 Agent 不完整'), { code: 'DATACENTER_AGENT_MISSING' });
  }
  const manager = dependencies.processManager || new ProcessManager();
  const spec = resolveLaunchSpec(config);
  const runId = `discover-${Date.now()}`;
  const record = manager.launch(spec, { runId, accountId: null });
  let javaPid = null;
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-datacenters-'));
  const outputPath = path.join(temporaryDirectory, 'options.txt');
  try {
    const javaProcess = await manager.waitForDescendant(record.pid, row => /(?:^|[\\/])javaw?(?:\.exe)?(?:\s|$)/i.test(row.command) && row.command.includes('com.kingdee.eas'), 30000);
    javaPid = javaProcess.pid;
    manager.registerOwnedPid(javaPid, { runId, accountId: null });
    const javaHome = path.resolve(spec.workingDirectory, '..', '..', 'clientjdk');
    const javaExecutable = path.join(javaHome, 'bin', currentPlatform.javaExecutableName);
    const classPath = [assets.helperJar, path.join(javaHome, 'lib', 'tools.jar')].join(currentPlatform.classPathDelimiter);
    const deadline = Date.now() + 60000;
    let lastError = 'DATACENTER_OPTIONS_EMPTY';
    while (Date.now() < deadline) {
      fs.writeFileSync(outputPath, '', 'utf8');
      try {
        await execFileAsync(javaExecutable, ['-cp', classPath, 'easrpa.AttachHelper', String(javaPid), assets.agentJar, outputPath], { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true });
        const lines = fs.readFileSync(outputPath, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines[0]?.startsWith('ERROR:')) lastError = lines[0].slice(6);
        else {
          const names = [...new Set(lines.map(line => Buffer.from(line, 'base64').toString('utf8').trim()).filter(Boolean))];
          if (names.length) return names;
        }
      } catch (error) { lastError = error.code || 'DATACENTER_AGENT_ATTACH_FAILED'; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Object.assign(new Error('从 EAS 登录窗口读取数据中心超时'), { code: lastError });
  } finally {
    if (javaPid) manager.stopOwned(javaPid, runId);
    else manager.stopOwned(record.pid, runId);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function discoverDataCenters(config, options = {}) {
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
  const cached = discoverCachedDataCenters(clientDirectory);
  let live = [];
  let liveError = null;
  if (options.helperJar && options.agentJar) {
    try { live = await (options.liveDiscover || discoverLiveDataCenters)(config, options, options.dependencies); }
    catch (error) { liveError = { code: error.code || 'LIVE_DISCOVERY_FAILED', message: error.message }; }
  }
  const saved = Array.isArray(config.ui?.data_centers) ? config.ui.data_centers : [];
  const accountCenters = Array.isArray(config.accounts) ? config.accounts.map(account => account.data_center) : [];
  const discovered = live.length ? live : [...installed, ...cached.names];
  const legacyFallback = live.length ? [] : [...saved, ...accountCenters];
  const dataCenters = [...new Set([...discovered, ...legacyFallback].map(value => String(value || '').trim()).filter(Boolean))];
  if (!dataCenters.length) throw Object.assign(new Error('安装目录中尚无数据中心配置，请确认 EAS 客户端已完成初始化'), { code: 'DATACENTER_CONFIG_NOT_FOUND' });
  const launcherFile = path.join(clientDirectory, 'bin', currentPlatform.startupScriptName);
  return { dataCenters, windowBackend: live.length ? 'java-swing-agent' : files.length ? 'install-directory' : cached.names.length ? 'client-cache' : 'local-saved-config', clientDirectory, launcherFile, sourceFiles: [...files.map(file => path.relative(clientDirectory, file)), ...cached.sources], liveError };
}

module.exports = { discoverDataCenters, discoverLiveDataCenters, parseDataCenterXml, readServerHost, discoverCachedDataCenters };
