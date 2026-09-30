const { execFile } = require('child_process');
const { promisify } = require('util');
const { createKeyringCredentialStore, stopPosixProcess } = require('./shared');

const execFileAsync = promisify(execFile);

function createGenericAdapter({ rawPlatform, environment = process.env } = {}) {
  return {
    rawPlatform,
    id: rawPlatform,
    isWindows: false,
    isLinux: false,
    isMac: false,
    defaultDesktopFile: null,
    defaultClientDirectory: null,
    startupScriptName: 'client.sh',
    javaExecutableName: 'java',
    classPathDelimiter: ':',
    sessionType: rawPlatform,
    supportsAtspi: false,
    environmentCommands: ['java'],
    launcherFilter: { name: '启动器', extensions: ['sh'] },
    shouldQuitOnAllWindowsClosed: true,
    loginVerificationMode: 'window-close',
    credentials: createKeyringCredentialStore({ allowSecretTool: false }),
    commandProbe(command) { return { executable: 'sh', args: ['-c', 'command -v "$1"', 'probe', command] }; },
    wrapStartupScript(startupScript) { return { executable: '/bin/sh', args: [startupScript] }; },
    async commandExists(command) {
      const probe = this.commandProbe(command);
      try { await execFileAsync(probe.executable, probe.args, { timeout: 2500 }); return true; } catch { return false; }
    },
    async detectSession() { return { type: rawPlatform || 'unknown', evidence: { display: environment.DISPLAY || null } }; },
    async probeAccessibility() { return { dogtail: false, atspi: false }; },
    stopProcess: stopPosixProcess,
    descendants() { return []; }
  };
}

module.exports = { createGenericAdapter };
