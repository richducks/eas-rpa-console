const { currentPlatform } = require('../platform');

async function findLoginWindow(options) {
  const platform = options.platform || currentPlatform;
  return platform.findLoginWindow(options);
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

module.exports = { findLoginWindow, waitForLoginWindow };
