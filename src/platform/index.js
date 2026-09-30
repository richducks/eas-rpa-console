const { createWindowsAdapter } = require('./windows');
const { createLinuxAdapter } = require('./linux');
const { createMacosAdapter } = require('./macos');
const { createGenericAdapter } = require('./generic');

function createPlatformAdapter(rawPlatform = process.platform, environment = process.env) {
  const options = { rawPlatform, environment };
  const adapter = rawPlatform === 'win32'
    ? createWindowsAdapter(options)
    : rawPlatform === 'linux'
      ? createLinuxAdapter(options)
      : rawPlatform === 'darwin'
        ? createMacosAdapter(options)
        : createGenericAdapter(options);
  return Object.freeze(adapter);
}

const currentPlatform = createPlatformAdapter();

module.exports = { createPlatformAdapter, currentPlatform };
