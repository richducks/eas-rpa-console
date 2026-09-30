const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const ALLOWED_BACKENDS = new Set(['atspi', 'keyboard', 'image']);

const DEFAULT_CONFIG = {
  global: {
    startup_timeout_seconds: 120,
    login_timeout_seconds: 60,
    poll_interval_seconds: 0.5,
    retry_count: 1,
    continue_on_error: true,
    screenshot_on_failure: true,
    max_instances: null
  },
  launcher: {
    desktop_file: process.platform === 'win32' ? null : '/opt/Kingdee/EASCloud.desktop',
    command: null,
    working_directory: null,
    client_directory: null
  },
  ui: {
    login_window_title: '金蝶EAS Cloud系统登录',
    success_window_title: null,
    backend_order: ['atspi', 'keyboard', 'image'],
    template_directory: 'templates'
  },
  accounts: [
    { id: 'finance-01', name: '财务中心', enabled: true, data_center: '集团 EAS 8.8', username: 'finance_admin', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'finance-01', allow_duplicate_login: true },
    { id: 'settlement-02', name: '结算中心', enabled: true, data_center: '华东数据中心', username: 'settlement_02', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'settlement-02', allow_duplicate_login: true },
    { id: 'audit-03', name: '审计只读', enabled: true, data_center: '集团 EAS 8.8', username: 'audit_reader', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'audit-03', allow_duplicate_login: true },
    { id: 'test-04', name: '测试账号', enabled: false, data_center: '测试数据中心', username: 'test_user', password_keyring_service: 'eascloud-rpa', password_keyring_key: 'test-04', allow_duplicate_login: true }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateConfig(config, options = {}) {
  const errors = [];
  if (!config || typeof config !== 'object') return { valid: false, errors: ['配置必须是对象'] };
  const global = config.global || {};
  for (const key of ['startup_timeout_seconds', 'login_timeout_seconds', 'poll_interval_seconds']) {
    if (typeof global[key] !== 'number' || global[key] <= 0) errors.push(`global.${key} 必须是正数`);
  }
  if (!Number.isInteger(global.retry_count) || global.retry_count < 0) errors.push('global.retry_count 必须是非负整数');
  if (global.max_instances != null && (!Number.isInteger(global.max_instances) || global.max_instances < 1)) errors.push('global.max_instances 必须为空或正整数');

  const backends = config.ui?.backend_order;
  if (!Array.isArray(backends) || !backends.length || backends.some(item => !ALLOWED_BACKENDS.has(item))) {
    errors.push('ui.backend_order 包含不支持的后端');
  }

  if (!Array.isArray(config.accounts)) errors.push('accounts 必须是数组');
  else {
    const ids = new Set();
    for (const [index, account] of config.accounts.entries()) {
      const prefix = `accounts[${index}]`;
      for (const key of ['id', 'data_center', 'username', 'password_keyring_service', 'password_keyring_key']) {
        if (typeof account[key] !== 'string' || !account[key].trim()) errors.push(`${prefix}.${key} 不能为空`);
      }
      if (ids.has(account.id)) errors.push(`账号 ID 重复：${account.id}`);
      ids.add(account.id);
      if ('password' in account) errors.push(`${prefix} 禁止保存明文 password`);
    }
  }

  const desktopFile = config.launcher?.desktop_file;
  const command = config.launcher?.command;
  const clientDirectory = config.launcher?.client_directory;
  if (!desktopFile && !command && !clientDirectory) errors.push('请指定 Desktop 启动器、启动命令或 EAS 客户端目录');
  if (options.checkPaths && desktopFile && !command && !clientDirectory && !fs.existsSync(desktopFile)) errors.push(`启动器文件不存在：${desktopFile}`);
  if (clientDirectory != null && (typeof clientDirectory !== 'string' || !clientDirectory.trim())) errors.push('launcher.client_directory 必须为空或有效路径');
  if (options.checkPaths && clientDirectory) {
    const base = config.launcher?.working_directory || (desktopFile && fs.existsSync(desktopFile) ? require('./desktop-file').parseDesktopFile(desktopFile).workingDirectory : process.cwd());
    const resolvedDirectory = require('./launcher').resolveClientDirectory(config, base);
    if (!fs.existsSync(resolvedDirectory)) errors.push(`EAS 客户端目录不存在：${resolvedDirectory}`);
  }
  return { valid: errors.length === 0, errors };
}

class ConfigStore {
  constructor(filePath) { this.filePath = filePath; }
  ensure() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.filePath)) this.save(clone(DEFAULT_CONFIG));
  }
  load() {
    this.ensure();
    const config = YAML.parse(fs.readFileSync(this.filePath, 'utf8'));
    const result = validateConfig(config);
    if (!result.valid) throw new Error(`配置校验失败：${result.errors.join('；')}`);
    return config;
  }
  save(config) {
    const result = validateConfig(config);
    if (!result.valid) return result;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, YAML.stringify(config), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return { valid: true, errors: [] };
  }
}

module.exports = { DEFAULT_CONFIG, ConfigStore, validateConfig };
