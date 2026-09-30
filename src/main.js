const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { ConfigStore } = require('./core/config');
const { StructuredLogger } = require('./core/logger');
const { probeEnvironment } = require('./core/environment');
const { checkCredentialReference, storeCredential, deleteCredential } = require('./core/credentials');
const { ProcessManager } = require('./core/process-manager');
const { FoundationRunner } = require('./core/runner');
const { RunCoordinator } = require('./core/run-coordinator');
const { discoverDataCenters } = require('./core/datacenter-discovery');
const { currentPlatform } = require('./platform');

let configStore;
let logger;
let runner;
let runCoordinator;

const MIN_WINDOW_WIDTH = 420;
const MIN_WINDOW_HEIGHT = 420;

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (![state.x, state.y, state.width, state.height].every(Number.isFinite)) return null;
    const display = screen.getAllDisplays().find(({ workArea }) =>
      state.x < workArea.x + workArea.width && state.x + state.width > workArea.x &&
      state.y < workArea.y + workArea.height && state.y + state.height > workArea.y
    );
    if (!display) return null;
    const area = display.workArea;
    const width = Math.max(MIN_WINDOW_WIDTH, Math.min(state.width, area.width));
    const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(state.height, area.height));
    return {
      x: Math.max(area.x, Math.min(state.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(state.y, area.y + area.height - height)),
      width, height, maximized: state.maximized === true
    };
  } catch { return null; }
}

function saveWindowState(win) {
  const file = path.join(app.getPath('userData'), 'window-state.json');
  const temporary = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) { console.error('Failed to save window state', error); }
}

function createWindow() {
  const state = loadWindowState();
  const screenshotWidth = Number.parseInt(process.env.EAS_RPA_SCREENSHOT_WIDTH || '', 10);
  const screenshotHeight = Number.parseInt(process.env.EAS_RPA_SCREENSHOT_HEIGHT || '', 10);
  const forcedScreenshotSize = Boolean(process.env.EAS_RPA_SCREENSHOT && Number.isFinite(screenshotWidth) && Number.isFinite(screenshotHeight));
  const win = new BrowserWindow({
    width: forcedScreenshotSize ? Math.max(MIN_WINDOW_WIDTH, screenshotWidth) : state?.width || 960,
    height: forcedScreenshotSize ? Math.max(MIN_WINDOW_HEIGHT, screenshotHeight) : state?.height || 680,
    ...(!forcedScreenshotSize && state ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    resizable: true,
    title: 'EAS 自动登录中心',
    backgroundColor: '#eef1f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.on('close', () => saveWindowState(win));
  if (!forcedScreenshotSize && state?.maximized) win.maximize();

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.EAS_RPA_SCREENSHOT) {
    win.webContents.once('did-finish-load', async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const ready = await win.webContents.executeJavaScript('Boolean(window.__easRpaReady)').catch(() => false);
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const screenshotPage = process.env.EAS_RPA_SCREENSHOT_PAGE;
      if (['dashboard', 'environment', 'logs', 'settings'].includes(screenshotPage)) await win.webContents.executeJavaScript(`goTo('${screenshotPage}')`);
      if (screenshotPage === 'environment') await win.webContents.executeJavaScript('probeEnvironment()');
      if (process.env.EAS_RPA_SCREENSHOT_THEME === 'dark') await win.webContents.executeJavaScript("document.body.classList.add('dark')");
      await new Promise(resolve => setTimeout(resolve, 250));
      if (process.env.EAS_RPA_LAYOUT_REPORT) {
        const layout = await win.webContents.executeJavaScript(`({
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          workspaceColumns: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,
          background: getComputedStyle(document.querySelector('.app-shell')).backgroundColor
        })`);
        fs.writeFileSync(process.env.EAS_RPA_LAYOUT_REPORT, JSON.stringify(layout, null, 2));
      }
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
    processManager: new ProcessManager(currentPlatform),
    logger,
    emit: payload => BrowserWindow.getAllWindows().forEach(window => window.webContents.send('task:event', payload)),
    assets: { helperJar: path.join(javaAssetRoot, 'attach-helper.jar'), agentJar: path.join(javaAssetRoot, 'datacenter-agent.jar') },
    platform: currentPlatform
  });
  runCoordinator = new RunCoordinator(runner);

  ipcMain.handle('environment:get', () => ({
    platform: `${os.type()} ${os.release()}`,
    session: currentPlatform.sessionType || process.env.XDG_SESSION_TYPE || '未识别',
    display: currentPlatform.isWindows ? (process.env.SESSIONNAME || 'Windows Desktop') : (process.env.DISPLAY || process.env.WAYLAND_DISPLAY || '未连接'),
    architecture: os.arch(),
    hostname: os.hostname()
  }));

  ipcMain.handle('environment:probe', async () => {
    const config = configStore.load();
    const result = await probeEnvironment(config, { platform: currentPlatform });
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

  ipcMain.handle('config:get', () => {
    const config = configStore.load();
    return { config, path: configStore.filePath, recovery: configStore.lastRecovery };
  });
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
  ipcMain.handle('task:start-foundation', async (_event, dataCenter) => runCoordinator.runDataCenter(configStore.load(), dataCenter));
  ipcMain.handle('task:start-account', async (_event, accountId) => runCoordinator.runAccount(configStore.load(), accountId));
  ipcMain.handle('task:stop', () => runner.stop());
  ipcMain.handle('datacenters:discover', async () => {
    try {
      const result = await discoverDataCenters(configStore.load(), { helperJar: path.join(javaAssetRoot, 'attach-helper.jar'), agentJar: path.join(javaAssetRoot, 'datacenter-agent.jar'), platform: currentPlatform });
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
        currentPlatform.launcherFilter,
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('client-directory:pick', async () => {
    const result = await dialog.showOpenDialog({ title: '选择 EAS 根目录、client 目录或 bin 目录', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (currentPlatform.shouldQuitOnAllWindowsClosed) app.quit();
});
