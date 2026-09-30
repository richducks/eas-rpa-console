const fs = require('fs');
const os = require('os');
const { parseDesktopFile } = require('./desktop-file');
const { currentPlatform } = require('../platform');

async function commandExists(command, platform = currentPlatform) {
  return platform.commandExists(command);
}

async function detectSession(platform = currentPlatform) {
  return platform.detectSession();
}

async function probeEnvironment(config, options = {}) {
  const platform = options.platform || currentPlatform;
  const session = await detectSession(platform);
  const tools = {};
  for (const command of platform.environmentCommands) tools[command] = await commandExists(command, platform);
  const accessibility = await platform.probeAccessibility();
  tools.dogtail = Boolean(accessibility.dogtail);
  tools.atspi = Boolean(accessibility.atspi);

  const desktopFile = config.launcher?.desktop_file;
  let launcher = { configured: Boolean(desktopFile || config.launcher?.command), readable: false, parsed: false, error: null, command: null };
  if (desktopFile) {
    launcher.readable = fs.existsSync(desktopFile);
    if (launcher.readable) {
      try { const parsed = parseDesktopFile(desktopFile); launcher = { ...launcher, parsed: true, command: parsed.argv[0], workingDirectory: parsed.workingDirectory }; }
      catch (error) { launcher.error = error.message; }
    } else launcher.error = '启动器文件不存在';
  } else if (Array.isArray(config.launcher?.command) && config.launcher.command.length) {
    launcher = { ...launcher, readable: true, parsed: true, command: config.launcher.command[0] };
  }

  const capabilities = platform.describeCapabilities({ session, tools, launcher });
  return { timestamp: new Date().toISOString(), system: { platform: `${os.type()} ${os.release()}`, architecture: os.arch(), hostname: os.hostname() }, session, tools, launcher, capabilities };
}

module.exports = { commandExists, detectSession, probeEnvironment };
