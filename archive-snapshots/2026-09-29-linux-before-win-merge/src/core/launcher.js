const fs = require('fs');
const path = require('path');
const { parseDesktopFile } = require('./desktop-file');

function resolveClientDirectory(config, baseDirectory = process.cwd()) {
  const configured = config.launcher?.client_directory;
  if (!configured) return null;
  const chosen = path.resolve(baseDirectory, configured);
  return ['client.sh', 'client.bat'].some(file => fs.existsSync(path.join(chosen, 'client', 'bin', file))) ? path.join(chosen, 'client') : chosen;
}

function resolveLaunchSpec(config) {
  const launcher = config.launcher || {};
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
  const clientDirectory = resolveClientDirectory(config, launcher.working_directory || desktop?.workingDirectory || process.cwd());
  if (clientDirectory && process.platform !== 'win32') {
    const startupScript = path.join(clientDirectory, 'bin', 'client.sh');
    if (!fs.existsSync(startupScript)) throw new Error(`所选 EAS 客户端目录缺少启动文件：${startupScript}`);
    return { executable: '/bin/sh', args: [startupScript], workingDirectory: path.dirname(startupScript), source: startupScript };
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

module.exports = { resolveLaunchSpec, resolveClientDirectory, publicLaunchSpec };
