const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { currentPlatform } = require('../platform');
const { normalizeClients, getClient } = require('./client-registry');
const { resolveLaunchSpec } = require('./launcher');

const DEFAULT_CONFIG = {
  global: {
    startup_timeout_seconds: 120,
    login_timeout_seconds: 60,
    poll_interval_seconds: 0.5,
    retry_count: 1,
    continue_on_error: true
  },
  clients: [],
  active_client_id: null,
  ui: {
    login_window_title: '金蝶EAS Cloud系统登录'
  },
  accounts: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeConfig(config = {}) {
  const global = config.global && typeof config.global === 'object' ? config.global : {};
  const ui = config.ui && typeof config.ui === 'object' ? config.ui : {};
  const { data_centers: _legacyCenters, ...cleanUi } = ui;
  const { launcher: _legacyLauncher, clients: _rawClients, active_client_id: _rawActiveClientId, accounts: _rawAccounts, ...rest } = config;
  const migrated = normalizeClients(config, currentPlatform);
  return {
    ...rest,
    global: { ...DEFAULT_CONFIG.global, ...global },
    clients: migrated.clients,
    active_client_id: migrated.activeClientId,
    ui: { ...DEFAULT_CONFIG.ui, ...cleanUi },
    accounts: migrated.accounts
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

  const clientIds = new Set();
  for (const [index, client] of normalized.clients.entries()) {
    const prefix = `clients[${index}]`;
    if (typeof client.id !== 'string' || !client.id.trim()) errors.push(`${prefix}.id 不能为空`);
    if (typeof client.remark !== 'string' || !client.remark.trim()) errors.push(`${prefix}.remark 不能为空`);
    if (clientIds.has(client.id)) errors.push(`客户端 ID 重复：${client.id}`);
    clientIds.add(client.id);
    if (client.command != null && (!Array.isArray(client.command) || !client.command.length || client.command.some(item => typeof item !== 'string' || !item.trim()))) errors.push(`${prefix}.command 必须为空或非空字符串数组`);
    if (client.client_directory != null && (typeof client.client_directory !== 'string' || !client.client_directory.trim())) errors.push(`${prefix}.client_directory 必须为空或有效路径`);
    if (!client.client_directory && !client.desktop_file && !(Array.isArray(client.command) && client.command.length)) errors.push(`${prefix} 至少需要客户端目录、启动器或启动命令之一`);
  }
  if (normalized.clients.length && !clientIds.has(normalized.active_client_id)) errors.push('active_client_id 必须指向已保存客户端');
  if (!normalized.clients.length && normalized.active_client_id != null) errors.push('没有客户端时 active_client_id 必须为空');

  const accountIds = new Set();
  for (const [index, account] of normalized.accounts.entries()) {
    const prefix = `accounts[${index}]`;
    for (const key of ['id', 'client_id', 'data_center', 'username', 'password_keyring_service', 'password_keyring_key']) {
      if (typeof account[key] !== 'string' || !account[key].trim()) errors.push(`${prefix}.${key} 不能为空`);
    }
    if (accountIds.has(account.id)) errors.push(`账号 ID 重复：${account.id}`);
    accountIds.add(account.id);
    if (account.client_id && !clientIds.has(account.client_id)) errors.push(`${prefix}.client_id 指向不存在的客户端`);
    if ('password' in account) errors.push(`${prefix} 禁止保存明文 password`);
  }

  if (options.checkPaths) {
    const client = getClient(normalized, options.clientId);
    if (!client) errors.push('请先选择 EAS 客户端');
    else {
      try { resolveLaunchSpec(client, options.platform || currentPlatform); }
      catch (error) { errors.push(error.message); }
    }
  }
  return { valid: errors.length === 0, errors, config: normalized };
}

function isLegacyConfig(config = {}) {
  return Boolean(
    config.launcher
    || config.ui?.data_centers
    || (Array.isArray(config.accounts) && config.accounts.some(account => !account?.client_id))
  );
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
    this.migrationBackupPath = `${filePath}.pre-multi-client.bak`;
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
      const source = YAML.parse(fs.readFileSync(this.filePath, 'utf8'));
      const result = validateConfig(source);
      if (!result.valid) throw new Error(`配置校验失败：${result.errors.join('；')}`);
      if (isLegacyConfig(source)) {
        try {
          if (!fs.existsSync(this.migrationBackupPath)) {
            fs.copyFileSync(this.filePath, this.migrationBackupPath);
            fs.chmodSync(this.migrationBackupPath, 0o600);
          }
          writeAtomic(this.filePath, result.config);
          this.lastRecovery = { migrated: true, source: this.migrationBackupPath };
        } catch (migrationError) {
          this.lastRecovery = { migrated: false, migrationError: migrationError.message };
        }
      }
      return result.config;
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

module.exports = { DEFAULT_CONFIG, ConfigStore, normalizeConfig, validateConfig, isLegacyConfig };
