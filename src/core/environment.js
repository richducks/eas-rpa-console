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

  const capabilities = [
    { id: 'process', name: 'CLI 与进程', available: launcher.parsed, status: launcher.parsed ? '可用' : '需配置', detail: launcher.error || '启动命令已安全解析' },
    { id: 'window', name: '窗口控制', available: session.type === 'windows' || (session.type === 'x11' ? tools.wmctrl || tools.xdotool : false), status: session.type === 'windows' ? 'Java Agent 可用' : session.type === 'wayland' ? '受 Wayland 限制' : tools.wmctrl || tools.xdotool ? '可用' : '工具缺失', detail: session.type === 'windows' ? '使用 EAS Java 进程与 Swing Agent 定位登录界面' : session.type === 'wayland' ? '全局窗口枚举与输入注入可能受限' : '使用 PID、窗口类和标题联合定位' },
    { id: 'atspi', name: 'AT-SPI', available: tools.atspi || tools.dogtail, status: tools.atspi || tools.dogtail ? '可用' : '待准备', detail: tools.atspi || tools.dogtail ? 'AT-SPI 可连接，仍需验证 EAS Swing 控件树' : '未检测到 AT-SPI Python 接口' },
    { id: 'keyboard', name: '键盘导航', available: session.type === 'x11' && tools.xdotool, status: session.type === 'x11' && tools.xdotool ? '备用可用' : '当前不可用', detail: '仅在控件树不完整且焦点顺序稳定时使用' },
    { id: 'image', name: '图像识别', available: false, status: '尚未接入', detail: '只作为限定窗口区域的最终兜底' }
  ];
  return { timestamp: new Date().toISOString(), system: { platform: `${os.type()} ${os.release()}`, architecture: os.arch(), hostname: os.hostname() }, session, tools, launcher, capabilities };
}

module.exports = { commandExists, detectSession, probeEnvironment };
