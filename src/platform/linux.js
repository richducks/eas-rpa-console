const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { collectDescendants, createKeyringCredentialStore, stopPosixProcess } = require('./shared');

const execFileAsync = promisify(execFile);

function parseWmctrl(output, pid, expectedTitle) {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(0x[0-9a-f]+)\s+\S+\s+(\d+)\s+\S+\s+(.*)$/i);
    if (!match || Number(match[2]) !== Number(pid)) continue;
    const title = match[3].trim();
    if (!expectedTitle || title.includes(expectedTitle)) return { id: match[1], pid: Number(match[2]), title, backend: 'wmctrl' };
  }
  return null;
}

async function findWithWmctrl(pid, expectedTitle) {
  const result = await execFileAsync('wmctrl', ['-lp'], { timeout: 3000, maxBuffer: 1024 * 1024 });
  return parseWmctrl(result.stdout, pid, expectedTitle);
}

async function findWithXwininfo(pid, expectedTitle) {
  const tree = await execFileAsync('xwininfo', ['-root', '-tree'], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 });
  const candidates = [];
  for (const line of tree.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*(0x[0-9a-f]+)\s+"([^"]*)"/i);
    if (match && (!expectedTitle || match[2].includes(expectedTitle))) candidates.push({ id: match[1], title: match[2] });
  }
  for (const candidate of candidates) {
    try {
      const property = await execFileAsync('xprop', ['-id', candidate.id, '_NET_WM_PID'], { timeout: 2000, maxBuffer: 16 * 1024 });
      const windowPid = Number(property.stdout.match(/=\s*(\d+)/)?.[1]);
      if (windowPid === Number(pid)) return { ...candidate, pid: windowPid, backend: 'xwininfo' };
    } catch { /* candidate disappeared */ }
  }
  return null;
}

async function findWithAtspi(pid, expectedTitle) {
  const script = [
    'import json, sys',
    'import gi',
    'gi.require_version("Atspi","2.0")',
    'from gi.repository import Atspi',
    'pid=int(sys.argv[1]); title=sys.argv[2]',
    'desktop=Atspi.get_desktop(0)',
    'def children(n):',
    ' try: return [n.get_child_at_index(i) for i in range(n.get_child_count())]',
    ' except Exception: return []',
    'for app in children(desktop):',
    ' try:',
    '  if app.get_process_id()!=pid: continue',
    '  for child in children(app):',
    '   name=child.get_name() or ""',
    '   if not title or title in name:',
    '    print(json.dumps({"id":None,"pid":pid,"title":name,"backend":"atspi"}, ensure_ascii=False)); sys.exit(0)',
    ' except Exception:',
    '  continue',
    'sys.exit(2)'
  ].join('\n');
  try {
    const result = await execFileAsync('python3', ['-c', script, String(pid), expectedTitle || ''], { timeout: 4000, maxBuffer: 64 * 1024 });
    return JSON.parse(result.stdout);
  } catch { return null; }
}

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
    describeCapabilities({ session, tools, launcher }) {
      const windowTools = Boolean(tools.wmctrl || (tools.xwininfo && tools.xprop));
      const accessibility = Boolean(tools.atspi || tools.dogtail);
      const windowAvailable = session.type === 'x11' ? (windowTools || accessibility) : accessibility;
      return [
        { id: 'process', name: 'EAS 启动', available: launcher.parsed, status: launcher.parsed ? '可用' : '需配置', detail: launcher.error || 'Linux 启动命令已准备' },
        { id: 'window', name: '登录窗口', available: windowAvailable, status: session.type === 'wayland' && !accessibility ? '受 Wayland 限制' : windowAvailable ? '可用' : '工具缺失', detail: session.type === 'wayland' ? 'Wayland 下优先依赖辅助功能接口' : '使用 PID、窗口标题或辅助功能接口定位 EAS' },
        { id: 'accessibility', name: '辅助功能', available: accessibility, status: accessibility ? '可用' : '可选', detail: accessibility ? 'AT-SPI/dogtail 可连接' : '无辅助功能接口时仍可尝试 X11 窗口探测' },
        { id: 'credential', name: '密码保护', available: Boolean(tools['secret-tool']), status: tools['secret-tool'] ? 'Secret Service' : '检查 Keyring', detail: '优先使用系统 Keyring；必要时调用 Secret Service' }
      ];
    },
    async findLoginWindow({ pid, title, sessionType, tools = {} }) {
      if (sessionType === 'x11' && tools.wmctrl) {
        try { const match = await findWithWmctrl(pid, title); if (match) return match; } catch { /* try other observers */ }
      }
      if (tools.xwininfo && tools.xprop) {
        try { const match = await findWithXwininfo(pid, title); if (match) return match; } catch { /* try accessibility */ }
      }
      if (tools.atspi || tools.dogtail) return findWithAtspi(pid, title);
      return null;
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

module.exports = { createLinuxAdapter, parseWmctrl };
