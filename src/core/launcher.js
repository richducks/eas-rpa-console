const fs = require('fs');
const path = require('path');
const { parseDesktopFile } = require('./desktop-file');
const { currentPlatform } = require('../platform');

function launcherFrom(value = {}) {
  return value.launcher && typeof value.launcher === 'object' ? value.launcher : value;
}

function resolveClientDirectory(clientOrConfig, baseDirectory = process.cwd()) {
  const configured = launcherFrom(clientOrConfig).client_directory;
  if (!configured) return null;
  let chosen = path.resolve(baseDirectory, configured);
  if (fs.existsSync(chosen) && fs.statSync(chosen).isFile()) chosen = path.dirname(chosen);
  if (path.basename(chosen).toLowerCase() === 'bin' && ['client.sh', 'client.bat'].some(file => fs.existsSync(path.join(chosen, file)))) {
    return path.dirname(chosen);
  }
  if (['client.sh', 'client.bat'].some(file => fs.existsSync(path.join(chosen, 'bin', file)))) return chosen;
  if (['client.sh', 'client.bat'].some(file => fs.existsSync(path.join(chosen, 'client', 'bin', file)))) return path.join(chosen, 'client');
  return chosen;
}

function resolveLaunchSpec(clientOrConfig, platform = currentPlatform) {
  const launcher = launcherFrom(clientOrConfig);
  if (Array.isArray(launcher.command) && launcher.command.length) {
    if (launcher.command.some(item => typeof item !== 'string' || !item)) throw new Error('launcher.command 必须是非空字符串数组');
    return {
      executable: launcher.command[0],
      args: launcher.command.slice(1),
      workingDirectory: launcher.working_directory || process.cwd(),
      source: 'config.command'
    };
  }
  const desktop = launcher.desktop_file && fs.existsSync(launcher.desktop_file) ? parseDesktopFile(launcher.desktop_file) : null;
  const clientDirectory = resolveClientDirectory(launcher, launcher.working_directory || desktop?.workingDirectory || process.cwd());
  if (clientDirectory) {
    const startupScript = path.join(clientDirectory, 'bin', platform.startupScriptName);
    if (!fs.existsSync(startupScript)) throw new Error(`所选 EAS 客户端目录缺少启动文件：${startupScript}`);
    const wrapped = platform.wrapStartupScript(startupScript);
    return { ...wrapped, workingDirectory: path.dirname(startupScript), source: startupScript };
  }
  if (!desktop) throw new Error('EAS Desktop 启动器不存在');
  const parsed = desktop;
  return {
    executable: parsed.argv[0],
    args: parsed.argv.slice(1),
    workingDirectory: launcher.working_directory || parsed.workingDirectory,
    source: launcher.desktop_file,
    displayName: parsed.name
  };
}

function publicLaunchSpec(spec) {
  return { executable: path.basename(spec.executable), argumentCount: spec.args.length, source: spec.source, workingDirectory: spec.workingDirectory };
}

module.exports = { resolveLaunchSpec, resolveClientDirectory, publicLaunchSpec, launcherFrom };
