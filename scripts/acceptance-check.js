const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

assert.equal(lock.version, packageJson.version, 'package-lock 顶层版本必须与 package.json 一致');
assert.equal(lock.packages[''].version, packageJson.version, 'package-lock 根包版本必须与 package.json 一致');

const jsFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
  }
}
walk(path.join(root, 'src'));
const platformReads = jsFiles.filter(file => fs.readFileSync(file, 'utf8').includes('process.platform')).map(file => path.relative(root, file).split(path.sep).join('/'));
assert.deepEqual(platformReads, ['src/platform/index.js'], 'process.platform 只能出现在平台入口');

const { DEFAULT_CONFIG } = require(path.join(root, 'src/core/config'));
assert.deepEqual(DEFAULT_CONFIG.clients, [], '首次启动不得注入演示客户端');
assert.equal(DEFAULT_CONFIG.active_client_id, null, '首次启动不得伪造当前客户端');
assert.deepEqual(DEFAULT_CONFIG.accounts, [], '首次启动不得注入演示账号');
assert.equal('data_centers' in DEFAULT_CONFIG.ui, false, '数据中心必须属于客户端，而不是全局 UI');
assert.equal('launcher' in DEFAULT_CONFIG, false, '启动配置必须属于客户端，而不是全局配置');
for (const deadField of ['screenshot_on_failure', 'max_instances']) assert.equal(deadField in DEFAULT_CONFIG.global, false, `默认配置不得继续暴露未实现字段：${deadField}`);

const coreSource = fs.readdirSync(path.join(root, 'src/core')).filter(name => name.endsWith('.js')).map(name => read(`src/core/${name}`)).join('\n');
for (const forbidden of ['powershell.exe', 'taskkill.exe', 'secret-tool', '/proc/', 'loginctl', 'wmctrl', 'xwininfo', 'xprop', 'Atspi']) {
  assert.equal(coreSource.includes(forbidden), false, `核心层不得包含平台实现：${forbidden}`);
}

const html = read('src/renderer/index.html');
for (const required of ['3 步完成设置', '当前客户端', '管理客户端', 'EAS 客户端', '数据中心', '登录账号', '运行诊断']) assert.ok(html.includes(required), `首次使用路径缺少：${required}`);
for (const forbidden of ['Keyring 凭据', 'RPA CONTROL CENTER', '自动化能力矩阵']) assert.equal(html.includes(forbidden), false, `主界面不应暴露实现术语：${forbidden}`);
for (const required of ['manual-datacenter', 'delete-account', 'client-modal', 'client-editor-modal', 'delete-client']) assert.ok(html.includes(required), `失败/维护路径缺少一致的界面入口：${required}`);
const renderer = read('src/renderer/app.js');
assert.equal(renderer.includes('window.prompt('), false, '主流程不得回退到浏览器原生 prompt');
assert.ok(renderer.includes('await checkCredentials();'), '批量登录前必须预检查凭据，避免任务启动后才发现缺密码');
assert.ok(renderer.includes('client_id: selectedClientId'), '新增账号必须显式绑定当前客户端');
assert.ok(renderer.includes("startFoundationRun({ clientId: selectedClientId, dataCenter: selectedDataCenter })"), '批量登录必须同时传客户端和数据中心边界');
assert.ok(renderer.includes('linkedAccounts'), '删除客户端必须检查账号引用');

const configSource = read('src/core/config.js');
const registrySource = read('src/core/client-registry.js');
const discoverySource = read('src/core/datacenter-discovery.js');
assert.ok(configSource.includes('migrationBackupPath'), '旧单客户端配置迁移必须保留独立备份');
assert.ok(registrySource.includes('client_id'), '客户端模型必须负责旧账号绑定迁移');
assert.ok(discoverySource.includes("account.client_id === client.id"), '数据中心回退必须隔离客户端账号');

const css = read('src/renderer/styles.css');
assert.equal((css.match(/:root\{/g) || []).length, 1, '视觉变量必须只有一套根定义，避免主题层叠互相覆盖');
assert.ok(css.includes('.setup-card'), '首次使用卡片必须有明确视觉层级');
assert.equal(css.includes('min-width:680px'), false, '窗口不得再用固定 680px 最小页面宽度制造横向滚动');
assert.ok(css.includes('overflow-x:hidden'), '页面必须显式禁止整窗横向溢出');
assert.ok(css.includes('.app-shell{width:100%;min-width:0;min-height:100vh'), '应用背景必须覆盖完整视口，避免窗口放大后露出底色');
assert.ok(css.includes('@media(max-width:720px)'), '窄窗口必须具备单列响应式断点');
assert.ok(css.includes('.workspace{grid-template-columns:1fr;min-height:0}'), '窄窗口工作区必须从双栏重排为单栏');

const mainProcess = read('src/main.js');
assert.ok(mainProcess.includes('const MIN_WINDOW_WIDTH = 420;'), '桌面窗口必须保留可用的最小宽度');
assert.ok(mainProcess.includes('EAS_RPA_SCREENSHOT_WIDTH'), '响应式布局必须支持固定尺寸截图回归');
assert.ok(mainProcess.includes("ipcMain.handle('client:inspect'"), '客户端路径与版本探测必须由桌面主进程提供明确边界');

const coordinator = read('src/core/run-coordinator.js');
assert.ok(coordinator.includes('RETRYABLE_CODES'), '重试必须使用显式瞬时错误白名单');
assert.equal(coordinator.includes('NON_RETRYABLE_CODES'), false, '未知错误不得默认重试');

const manager = read('src/core/process-manager.js');
assert.ok(manager.includes('stopRun(runId)'), '失败恢复必须支持按 runId 回收全部进程');

console.log(`acceptance: PASS v${packageJson.version}`);
console.log('architecture: host-OS boundary PASS');
console.log('failure recovery: bounded retry + run cleanup PASS');
console.log('product first-run: 3-step path PASS');
console.log('visual system: single root token set PASS');
