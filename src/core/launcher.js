const fs = require('fs');
const path = require('path');
const { parseDesktopFile } = require('./desktop-file');

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
  if (!launcher.desktop_file || !fs.existsSync(launcher.desktop_file)) throw new Error('EAS Desktop 启动器不存在');
  const parsed = parseDesktopFile(launcher.desktop_file);
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

module.exports = { resolveLaunchSpec, publicLaunchSpec };
