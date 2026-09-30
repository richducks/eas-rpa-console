const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { collectDescendants, createKeyringCredentialStore, stopPosixProcess } = require('./shared');

const execFileAsync = promisify(execFile);

function createMacosAdapter({ rawPlatform = 'darwin', environment = process.env } = {}) {
  return {
    rawPlatform,
    id: 'macos',
    isWindows: false,
    isLinux: false,
    isMac: true,
    defaultDesktopFile: null,
    defaultClientDirectory: null,
    startupScriptName: 'client.sh',
    javaExecutableName: 'java',
    classPathDelimiter: ':',
    sessionType: 'macos',
    supportsAtspi: false,
    environmentCommands: ['python3', 'java'],
    launcherFilter: { name: '启动器', extensions: ['command', 'sh'] },
    shouldQuitOnAllWindowsClosed: false,
    loginVerificationMode: 'window-close',
    credentials: createKeyringCredentialStore({ allowSecretTool: false }),
    commandProbe(command) { return { executable: 'sh', args: ['-c', 'command -v "$1"', 'probe', command] }; },
    wrapStartupScript(startupScript) { return { executable: '/bin/sh', args: [startupScript] }; },
    async commandExists(command) {
      const probe = this.commandProbe(command);
      try { await execFileAsync(probe.executable, probe.args, { timeout: 2500 }); return true; } catch { return false; }
    },
    async detectSession() { return { type: 'macos', evidence: { display: environment.DISPLAY || null } }; },
    async probeAccessibility() { return { dogtail: false, atspi: false }; },
    describeCapabilities({ launcher }) {
      return [
        { id: 'process', name: 'EAS 启动', available: launcher.parsed, status: launcher.parsed ? '实验' : '需配置', detail: '仅保留 POSIX 启动入口，尚未完成 EAS 实机验收' },
        { id: 'window', name: '登录窗口', available: false, status: '未验收', detail: 'macOS 自动登录暂不宣称可用' },
        { id: 'credential', name: '密码保护', available: true, status: 'Keychain', detail: '通过 keytar 接入系统 Keychain' }
      ];
    },
    async findLoginWindow() { return null; },
    stopProcess: stopPosixProcess,
    descendants(rootPid) {
      let output = '';
      try { output = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024 }); }
      catch { return []; }
      const rows = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
        return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
      }).filter(Boolean);
      return collectDescendants(rows, rootPid);
    }
  };
}

module.exports = { createMacosAdapter };
