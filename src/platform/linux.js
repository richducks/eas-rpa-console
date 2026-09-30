const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { collectDescendants, createKeyringCredentialStore, stopPosixProcess } = require('./shared');

const execFileAsync = promisify(execFile);

function createLinuxAdapter({ rawPlatform = 'linux', environment = process.env } = {}) {
  return {
    rawPlatform,
    id: 'linux',
    isWindows: false,
    isLinux: true,
    isMac: false,
    defaultDesktopFile: '/opt/Kingdee/EASCloud.desktop',
    defaultClientDirectory: null,
    startupScriptName: 'client.sh',
    javaExecutableName: 'java',
    classPathDelimiter: ':',
    sessionType: null,
    supportsAtspi: true,
    environmentCommands: ['wmctrl', 'xdotool', 'xwininfo', 'xprop', 'gdbus', 'secret-tool', 'python3', 'java'],
    launcherFilter: { name: 'Linux 启动器', extensions: ['desktop', 'sh'] },
    shouldQuitOnAllWindowsClosed: true,
    loginVerificationMode: 'window-close',
    credentials: createKeyringCredentialStore({ allowSecretTool: true }),
    commandProbe(command) { return { executable: 'sh', args: ['-c', 'command -v "$1"', 'probe', command] }; },
    wrapStartupScript(startupScript) { return { executable: '/bin/sh', args: [startupScript] }; },
    async commandExists(command) {
      const probe = this.commandProbe(command);
      try { await execFileAsync(probe.executable, probe.args, { timeout: 2500 }); return true; } catch { return false; }
    },
    async detectSession() {
      const declared = (environment.XDG_SESSION_TYPE || '').toLowerCase();
      let loginctl = null;
      try {
        if (environment.XDG_SESSION_ID) {
          const result = await execFileAsync('loginctl', ['show-session', environment.XDG_SESSION_ID, '-p', 'Type', '--value'], { timeout: 2500 });
          loginctl = result.stdout.trim().toLowerCase();
        }
      } catch { /* optional evidence */ }
      const inferred = environment.WAYLAND_DISPLAY ? 'wayland' : environment.DISPLAY ? 'x11' : 'unknown';
      return { type: loginctl || declared || inferred, evidence: { xdg: declared || null, loginctl, display: environment.DISPLAY || null, waylandDisplay: environment.WAYLAND_DISPLAY || null } };
    },
    async probeAccessibility() {
      let dogtail = false;
      let atspi = false;
      try { await execFileAsync('python3', ['-c', 'import dogtail'], { timeout: 3000 }); dogtail = true; } catch { /* absent */ }
      try { await execFileAsync('python3', ['-c', 'import gi; gi.require_version("Atspi","2.0"); from gi.repository import Atspi'], { timeout: 3000 }); atspi = true; } catch { /* absent */ }
      return { dogtail, atspi };
    },
    stopProcess: stopPosixProcess,
    descendants(rootPid) {
      const rows = [];
      let entries = [];
      try { entries = fs.readdirSync('/proc'); } catch { return []; }
      for (const name of entries) {
        if (!/^\d+$/.test(name)) continue;
        try {
          const status = fs.readFileSync(`/proc/${name}/status`, 'utf8');
          const ppid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
          const command = fs.readFileSync(`/proc/${name}/cmdline`).toString('utf8').replace(/\0/g, ' ').trim();
          rows.push({ pid: Number(name), ppid, command });
        } catch { /* process exited during snapshot */ }
      }
      return collectDescendants(rows, rootPid);
    }
  };
}

module.exports = { createLinuxAdapter };
