const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { currentPlatform } = require('../platform');

const DEFAULT_CONFIG = {
  global: {
    startup_timeout_seconds: 120,
    login_timeout_seconds: 60,
    poll_interval_seconds: 0.5,
    retry_count: 1,
    continue_on_error: true
  },
  launcher: {
    desktop_file: currentPlatform.defaultDesktopFile,
    command: null,
    working_directory: null,
    client_directory: currentPlatform.defaultClientDirectory
  },
  ui: {
    login_window_title: '金蝶EAS Cloud系统登录',
    data_centers: []
  },
  accounts: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeConfig(config = {}) {
  const global = config.global && typeof config.global === 'object' ? config.global : {};
  const launcher = config.launcher && typeof config.launcher === 'object' ? config.launcher : {};
  const ui = config.ui && typeof config.ui === 'object' ? config.ui : {};
  return {
    ...config,
    global: { ...DEFAULT_CONFIG.global, ...global },
    launcher: { ...DEFAULT_CONFIG.launcher, ...launcher },
    ui: {
      ...DEFAULT_CONFIG.ui,
      ...ui,
      data_centers: Array.isArray(ui.data_centers) ? [...new Set(ui.data_centers.map(value => String(value || '').trim()).filter(Boolean))] : []
    },
    accounts: Array.isArray(config.accounts) ? config.accounts : []
  };
}

function validateConfig(config, options = {}) {
  const errors = [];
  if (!config || typeof config !== 'object') return { valid: false, errors: ['配置必须是对象'] };
  const normalized = normalizeConfig(config);
  const global = normalized.global;
  for (const key of ['startup_timeout_seconds', 'login_timeout_seconds', 'poll_interval_seconds']) {
    if (typeof global[key] !== 'number' || global[key] <= 0) errors.push(`global.${key} 必须是正数`);
  }
  if (!Number.isInteger(global.retry_count) || global.retry_count < 0 || global.retry_count > 3) errors.push('global.retry_count 必须是 0 到 3 的整数');
  if (typeof global.continue_on_error !== 'boolean') errors.push('global.continue_on_error 必须是布尔值');
  if (typeof normalized.ui.login_window_title !== 'string' || !normalized.ui.login_window_title.trim()) errors.push('ui.login_window_title 不能为空');

  const ids = new Set();
  for (const [index, account] of normalized.accounts.entries()) {
    const prefix = `accounts[${index}]`;
    for (const key of ['id', 'data_center', 'username', 'password_keyring_service', 'password_keyring_key']) {
      if (typeof account[key] !== 'string' || !account[key].trim()) errors.push(`${prefix}.${key} 不能为空`);
    }
    if (ids.has(account.id)) errors.push(`账号 ID 重复：${account.id}`);
    ids.add(account.id);
    if ('password' in account) errors.push(`${prefix} 禁止保存明文 password`);
  }

  const desktopFile = normalized.launcher.desktop_file;
  const command = normalized.launcher.command;
  const clientDirectory = normalized.launcher.client_directory;
  if (command != null && (!Array.isArray(command) || !command.length || command.some(item => typeof item !== 'string' || !item.trim()))) errors.push('launcher.command 必须为空或非空字符串数组');
  if (options.checkPaths && !desktopFile && !command && !clientDirectory) errors.push('请指定 EAS 客户端目录、Desktop 启动器或启动命令');
  if (options.checkPaths && desktopFile && !command && !clientDirectory && !fs.existsSync(desktopFile)) errors.push(`启动器文件不存在：${desktopFile}`);
  if (clientDirectory != null && (typeof clientDirectory !== 'string' || !clientDirectory.trim())) errors.push('launcher.client_directory 必须为空或有效路径');
  if (options.checkPaths && clientDirectory && !command) {
    const base = normalized.launcher.working_directory || (desktopFile && fs.existsSync(desktopFile) ? require('./desktop-file').parseDesktopFile(desktopFile).workingDirectory : process.cwd());
    const resolvedDirectory = require('./launcher').resolveClientDirectory(normalized, base);
    if (!fs.existsSync(resolvedDirectory)) errors.push(`EAS 客户端目录不存在：${resolvedDirectory}`);
  }
  return { valid: errors.length === 0, errors, config: normalized };
}

function readConfigFile(filePath) {
  const parsed = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  const result = validateConfig(parsed);
  if (!result.valid) throw new Error(`配置校验失败：${result.errors.join('；')}`);
  return result.config;
}

function writeAtomic(filePath, config) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, YAML.stringify(config), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.lastRecovery = null;
  }

  ensure() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.filePath)) writeAtomic(this.filePath, clone(DEFAULT_CONFIG));
  }

  load() {
    this.ensure();
    try {
      this.lastRecovery = null;
      return readConfigFile(this.filePath);
    } catch (primaryError) {
      if (fs.existsSync(this.backupPath)) {
        try {
          const recovered = readConfigFile(this.backupPath);
          writeAtomic(this.filePath, recovered);
          this.lastRecovery = { recovered: true, source: this.backupPath, reason: primaryError.message };
          return recovered;
        } catch { /* fall through to a clear fatal error */ }
      }
      const error = new Error(`配置无法读取且没有可用备份：${primaryError.message}`);
      error.code = 'CONFIG_RECOVERY_FAILED';
      throw error;
    }
  }

  save(config) {
    const result = validateConfig(config);
    if (!result.valid) return { valid: false, errors: result.errors };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      if (fs.existsSync(this.filePath)) {
        try {
          readConfigFile(this.filePath);
          fs.copyFileSync(this.filePath, this.backupPath);
          fs.chmodSync(this.backupPath, 0o600);
        } catch { /* keep the previous known-good backup instead of copying a corrupt primary */ }
      }
      writeAtomic(this.filePath, result.config);
      this.lastRecovery = null;
      return { valid: true, errors: [] };
    } catch (error) {
      try { fs.rmSync(`${this.filePath}.tmp`, { force: true }); } catch { /* best effort */ }
      return { valid: false, errors: [`配置保存失败：${error.message}`] };
    }
  }
}

module.exports = { DEFAULT_CONFIG, ConfigStore, normalizeConfig, validateConfig };
