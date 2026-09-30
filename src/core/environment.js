const os = require('os');
const { resolveLaunchSpec, publicLaunchSpec } = require('./launcher');
const { getClient } = require('./client-registry');
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

  const client = getClient(config, options.clientId);
  let launcher = { configured: Boolean(client), readable: false, parsed: false, error: null, command: null, clientId: client?.id || null, remark: client?.remark || null, version: client?.detected_version || null };
  if (client) {
    try {
      const spec = resolveLaunchSpec(client, platform);
      const publicSpec = publicLaunchSpec(spec);
      launcher = { ...launcher, readable: true, parsed: true, command: publicSpec.executable, workingDirectory: publicSpec.workingDirectory, source: publicSpec.source };
    } catch (error) { launcher.error = error.message; }
  }

  const capabilities = platform.describeCapabilities({ session, tools, launcher });
  return { timestamp: new Date().toISOString(), system: { platform: `${os.type()} ${os.release()}`, architecture: os.arch(), hostname: os.hostname() }, session, tools, launcher, client, capabilities };
}

module.exports = { commandExists, detectSession, probeEnvironment };
