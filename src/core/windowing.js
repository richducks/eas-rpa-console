const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { currentPlatform } = require('../platform');

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

async function findLoginWindow({ pid, title, sessionType, tools }) {
  if (currentPlatform.isWindows || sessionType === 'windows') return { id: null, pid: Number(pid), title: title || '', backend: 'java-swing-agent' };
  if (sessionType === 'x11' && tools.wmctrl) {
    try { const match = await findWithWmctrl(pid, title); if (match) return match; } catch { /* try accessibility */ }
  }
  if (tools.xwininfo && tools.xprop) {
    try { const match = await findWithXwininfo(pid, title); if (match) return match; } catch { /* try accessibility */ }
  }
  if (tools.dogtail || tools.python3) return findWithAtspi(pid, title);
  return null;
}

async function waitForLoginWindow(options) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (!options.isProcessAlive()) throw Object.assign(new Error('等待窗口时客户端进程已退出'), { code: 'PROCESS_EXITED_WHILE_WAITING_WINDOW' });
    if (options.isCancelled?.()) throw Object.assign(new Error('任务已停止'), { code: 'TASK_CANCELLED' });
    const window = await (options.findWindow || findLoginWindow)(options);
    if (window) return window;
    await new Promise(resolve => setTimeout(resolve, options.pollIntervalMs));
  }
  throw Object.assign(new Error('等待 EAS 登录窗口超时'), { code: 'LOGIN_WINDOW_TIMEOUT' });
}

module.exports = { parseWmctrl, findLoginWindow, waitForLoginWindow };
