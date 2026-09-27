const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { ConfigStore } = require('./core/config');
const { StructuredLogger } = require('./core/logger');
const { probeEnvironment } = require('./core/environment');
const { checkCredentialReference, storeCredential, deleteCredential } = require('./core/credentials');
const { ProcessManager } = require('./core/process-manager');
const { FoundationRunner } = require('./core/runner');
const { discoverDataCenters } = require('./core/datacenter-discovery');

let configStore;
let logger;
let runner;

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 360,
    minHeight: 280,
    resizable: true,
    title: 'EAS 自动登录中心',
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.EAS_RPA_SCREENSHOT) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
      if (process.env.EAS_RPA_SCREENSHOT_PAGE === 'credentials') await win.webContents.executeJavaScript("goTo('credentials')");
      await new Promise(resolve => setTimeout(resolve, 200));
      const image = await win.webContents.capturePage();
      fs.writeFileSync(process.env.EAS_RPA_SCREENSHOT, image.toPNG());
      app.quit();
    });
  }
  return win;
}

app.whenReady().then(() => {
  const dataDirectory = app.getPath('userData');
  configStore = new ConfigStore(path.join(dataDirectory, 'config.yaml'));
  logger = new StructuredLogger(path.join(dataDirectory, 'logs'));
  configStore.ensure();
  const javaAssetRoot = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'java') : path.join(__dirname, '..', 'build', 'java');
  runner = new FoundationRunner({
    processManager: new ProcessManager(),
    logger,
    emit: payload => BrowserWindow.getAllWindows().forEach(window => window.webContents.send('task:event', payload)),
    assets: { helperJar: path.join(javaAssetRoot, 'attach-helper.jar'), agentJar: path.join(javaAssetRoot, 'datacenter-agent.jar') }
  });

  ipcMain.handle('environment:get', () => ({
    platform: `${os.type()} ${os.release()}`,
    session: process.env.XDG_SESSION_TYPE || '未识别',
    display: process.env.DISPLAY || process.env.WAYLAND_DISPLAY || '未连接',
    architecture: os.arch(),
    hostname: os.hostname()
  }));

  ipcMain.handle('environment:probe', async () => {
    const config = configStore.load();
    const result = await probeEnvironment(config);
    logger.write('INFO', 'ENVIRONMENT_PROBED', {
      run_id: null,
      account_id: null,
      stage: 'DISCOVER_ENV',
      status: 'COMPLETE',
      session_type: result.session.type,
      launcher_ready: result.launcher.parsed,
      capabilities: result.capabilities.map(item => ({ id: item.id, available: item.available }))
    });
    return result;
  });

  ipcMain.handle('config:get', () => ({ config: configStore.load(), path: configStore.filePath }));
  ipcMain.handle('config:save', (_event, config) => {
    const result = configStore.save(config);
    logger.write(result.valid ? 'INFO' : 'ERROR', result.valid ? 'CONFIG_SAVED' : 'CONFIG_INVALID', {
      run_id: null,
      account_id: null,
      stage: 'CONFIGURE',
      status: result.valid ? 'COMPLETE' : 'FAILED',
      errors: result.errors
    });
    return { ...result, path: configStore.filePath };
  });

  ipcMain.handle('credentials:check', async (_event, accountId) => {
    const account = configStore.load().accounts.find(item => item.id === accountId);
    if (!account) return { available: false, code: 'ACCOUNT_NOT_FOUND' };
    const result = await checkCredentialReference(account.password_keyring_service, account.password_keyring_key);
    logger.write('INFO', 'CREDENTIAL_REFERENCE_CHECKED', {
      run_id: null,
      account_id: account.id,
      stage: 'VALIDATE_CREDENTIAL',
      status: result.available ? 'COMPLETE' : 'FAILED',
      error_code: result.available ? null : result.code
    });
    return result;
  });

  ipcMain.handle('credentials:store', async (_event, request) => {
    const account = configStore.load().accounts.find(item => item.id === request?.accountId);
    if (!account) return { stored: false, code: 'ACCOUNT_NOT_FOUND' };
    const result = await storeCredential(
      account.password_keyring_service,
      account.password_keyring_key,
      request.password,
      `EAS RPA · ${account.name || account.id}`
    );
    logger.write(result.stored ? 'INFO' : 'ERROR', result.stored ? 'CREDENTIAL_STORED' : 'CREDENTIAL_STORE_FAILED', {
      run_id: null,
      account_id: account.id,
      stage: 'STORE_CREDENTIAL',
      status: result.stored ? 'COMPLETE' : 'FAILED',
      error_code: result.stored ? null : result.code
    });
    return result;
  });
  ipcMain.handle('credentials:delete', async (_event, accountId) => {
    const account = configStore.load().accounts.find(item => item.id === accountId);
    if (!account) return { deleted: false, code: 'ACCOUNT_NOT_FOUND' };
    const result = await deleteCredential(account.password_keyring_service, account.password_keyring_key);
    logger.write('INFO', 'CREDENTIAL_DELETE_REQUESTED', { run_id: null, account_id: account.id, stage: 'DELETE_CREDENTIAL', status: result.deleted ? 'COMPLETE' : 'SKIPPED', error_code: result.deleted ? null : result.code });
    return result;
  });

  ipcMain.handle('app:paths', () => ({ userData: dataDirectory, config: configStore.filePath, logs: logger.logDirectory }));
  ipcMain.handle('task:start-foundation', async (_event, dataCenter) => {
    const config = configStore.load();
    if (typeof dataCenter !== 'string' || !dataCenter.trim()) return { status: 'FAILED', succeeded: 0, total: 0, message: '未选择数据中心' };
    const enabled = config.accounts.filter(account => account.enabled && account.data_center === dataCenter);
    if (!enabled.length) return { status: 'FAILED', succeeded: 0, total: 0, message: '当前数据中心没有启用账号' };
    const results = [];
    for (const account of enabled) {
      const accountConfig = JSON.parse(JSON.stringify(config));
      accountConfig.accounts.forEach(item => { item.enabled = item.id === account.id && item.data_center === dataCenter; });
      const result = await runner.run(accountConfig);
      results.push(result);
      if (result.status !== 'SUCCESS' && !config.global.continue_on_error) break;
    }
    const succeeded = results.filter(result => result.status === 'SUCCESS').length;
    return { status: succeeded === enabled.length ? 'SUCCESS' : succeeded ? 'PARTIAL' : 'FAILED', succeeded, total: enabled.length, results };
  });
  ipcMain.handle('task:stop', () => runner.stop());
  ipcMain.handle('datacenters:discover', async () => {
    try {
      const result = await discoverDataCenters(configStore.load(), { helperJar: path.join(javaAssetRoot, 'attach-helper.jar'), agentJar: path.join(javaAssetRoot, 'datacenter-agent.jar') });
      logger.write('INFO', 'DATACENTERS_DISCOVERED', { run_id: null, account_id: null, stage: 'DISCOVER_DATACENTERS', status: 'COMPLETE', count: result.dataCenters.length, backend: result.windowBackend });
      return { ok: true, ...result };
    } catch (error) {
      logger.write('ERROR', 'DATACENTER_DISCOVERY_FAILED', { run_id: null, account_id: null, stage: 'DISCOVER_DATACENTERS', status: 'FAILED', error_code: error.code || 'DISCOVERY_FAILED' });
      return { ok: false, code: error.code || 'DISCOVERY_FAILED', message: error.message };
    }
  });

  ipcMain.handle('launcher:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 EAS Cloud 启动器',
      properties: ['openFile'],
      filters: [
        { name: 'Desktop 启动器', extensions: ['desktop'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('client-directory:pick', async () => {
    const result = await dialog.showOpenDialog({ title: '选择 EAS 客户端目录', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
