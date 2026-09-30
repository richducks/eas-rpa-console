(function initializeWebBridge() {
  if (window.easDesktop) return;

  const storageKey = 'eas-rpa-web-config';
  const defaultConfig = {
    global: { startup_timeout_seconds: 120, login_timeout_seconds: 60, poll_interval_seconds: 0.5, retry_count: 1, continue_on_error: true },
    launcher: { desktop_file: '', command: null, working_directory: null, client_directory: null },
    ui: { login_window_title: '金蝶EAS Cloud系统登录', data_centers: [] },
    accounts: []
  };
  const readConfig = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(defaultConfig); }
    catch { return structuredClone(defaultConfig); }
  };

  window.easDesktop = {
    getEnvironment: async () => ({ platform: 'Web', session: 'browser', display: '内置浏览器', architecture: 'web', hostname: location.hostname || 'local' }),
    probeEnvironment: async () => ({
      system: { platform: 'Web 浏览器', hostname: location.hostname || 'local' },
      session: { type: 'browser', evidence: { display: '内置浏览器' } },
      tools: {}, launcher: { parsed: false },
      capabilities: [{ id: 'web', name: '网页版管理模式', detail: '浏览器不能启动或控制本机 EAS 客户端', available: false, status: '仅管理' }]
    }),
    getConfig: async () => ({ config: readConfig(), path: '浏览器本地存储' }),
    saveConfig: async config => { localStorage.setItem(storageKey, JSON.stringify(config)); return { valid: true, errors: [], path: '浏览器本地存储' }; },
    checkCredential: async () => ({ available: false, code: 'DESKTOP_REQUIRED' }),
    storeCredential: async () => ({ stored: true, code: 'WEB_NOT_PERSISTED' }),
    deleteCredential: async () => ({ deleted: true, code: 'WEB_NOT_PERSISTED' }),
    getPaths: async () => ({ userData: '浏览器本地存储', config: '浏览器本地存储', logs: '仅桌面版提供' }),
    startFoundationRun: async () => ({ status: 'FAILED', succeeded: 0, total: 0, message: '网页版不能控制本机 EAS，请使用 Windows 或 Ubuntu 桌面版' }),
    startAccountRun: async () => ({ status: 'FAILED', succeeded: 0, total: 0, message: '网页版不能控制本机 EAS，请使用 Windows 或 Ubuntu 桌面版' }),
    stopRun: async () => ({ stopped: false, code: 'DESKTOP_REQUIRED' }),
    discoverDataCenters: async () => {
      const value = window.prompt('网页版无法读取本机 EAS。请输入数据中心名称；多个名称用逗号分隔：', '');
      const dataCenters = String(value || '').split(/[,，]/).map(item => item.trim()).filter(Boolean);
      return dataCenters.length ? { ok: true, dataCenters, windowBackend: 'manual-web' } : { ok: false, code: 'WEB_MANUAL_CANCELLED', message: '未添加数据中心' };
    },
    onTaskEvent: () => () => {},
    pickLauncher: async () => null,
    pickClientDirectory: async () => null
  };

  document.body.classList.add('web-mode');
  document.addEventListener('DOMContentLoaded', () => {
    const status = document.querySelector('.system-status span');
    if (status) status.textContent = '网页版 · 仅管理';
    const dashboardStatus = document.querySelector('.ledger-foot .system-status span');
    if (dashboardStatus) dashboardStatus.textContent = '网页版 · 仅管理';
  });
})();
