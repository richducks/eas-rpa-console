const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { parseDesktopFile } = require('./desktop-file');

const execFileAsync = promisify(execFile);

async function commandExists(command) {
  try { await execFileAsync('sh', ['-c', 'command -v "$1"', 'probe', command], { timeout: 2500 }); return true; }
  catch { return false; }
}

async function detectSession() {
  const declared = (process.env.XDG_SESSION_TYPE || '').toLowerCase();
  let loginctl = null;
  try {
    const sessionId = process.env.XDG_SESSION_ID;
    if (sessionId) {
      const result = await execFileAsync('loginctl', ['show-session', sessionId, '-p', 'Type', '--value'], { timeout: 2500 });
      loginctl = result.stdout.trim().toLowerCase();
    }
  } catch { /* environment evidence remains optional */ }
  const inferred = process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'unknown';
  return { type: loginctl || declared || inferred, evidence: { xdg: declared || null, loginctl, display: process.env.DISPLAY || null, waylandDisplay: process.env.WAYLAND_DISPLAY || null } };
}

async function probeEnvironment(config) {
  const session = await detectSession();
  const tools = {};
  for (const command of ['wmctrl', 'xdotool', 'xwininfo', 'xprop', 'gdbus', 'secret-tool', 'python3']) tools[command] = await commandExists(command);
  let dogtail = false;
  try { await execFileAsync('python3', ['-c', 'import dogtail'], { timeout: 3000 }); dogtail = true; } catch { /* absent */ }
  tools.dogtail = dogtail;
  let atspi = false;
  try { await execFileAsync('python3', ['-c', 'import gi; gi.require_version("Atspi","2.0"); from gi.repository import Atspi'], { timeout: 3000 }); atspi = true; } catch { /* absent */ }
  tools.atspi = atspi;

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

  const capabilities = [
    { id: 'process', name: 'CLI 与进程', available: launcher.parsed, status: launcher.parsed ? '可用' : '需配置', detail: launcher.error || '启动命令已安全解析' },
    { id: 'window', name: '窗口控制', available: session.type === 'x11' ? tools.wmctrl || tools.xdotool : false, status: session.type === 'wayland' ? '受 Wayland 限制' : tools.wmctrl || tools.xdotool ? '可用' : '工具缺失', detail: session.type === 'wayland' ? '全局窗口枚举与输入注入可能受限' : '使用 PID、窗口类和标题联合定位' },
    { id: 'atspi', name: 'AT-SPI', available: tools.atspi || tools.dogtail, status: tools.atspi || tools.dogtail ? '可用' : '待准备', detail: tools.atspi || tools.dogtail ? 'AT-SPI 可连接，仍需验证 EAS Swing 控件树' : '未检测到 AT-SPI Python 接口' },
    { id: 'keyboard', name: '键盘导航', available: session.type === 'x11' && tools.xdotool, status: session.type === 'x11' && tools.xdotool ? '备用可用' : '当前不可用', detail: '仅在控件树不完整且焦点顺序稳定时使用' },
    { id: 'image', name: '图像识别', available: false, status: '尚未接入', detail: '只作为限定窗口区域的最终兜底' }
  ];
  return { timestamp: new Date().toISOString(), system: { platform: `${os.type()} ${os.release()}`, architecture: os.arch(), hostname: os.hostname() }, session, tools, launcher, capabilities };
}

module.exports = { commandExists, detectSession, probeEnvironment };
