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
assert.deepEqual(DEFAULT_CONFIG.accounts, [], '首次启动不得注入演示账号');
assert.deepEqual(DEFAULT_CONFIG.ui.data_centers, [], '首次启动不得注入演示数据中心');
for (const deadField of ['screenshot_on_failure', 'max_instances']) assert.equal(deadField in DEFAULT_CONFIG.global, false, `默认配置不得继续暴露未实现字段：${deadField}`);

const coreSource = fs.readdirSync(path.join(root, 'src/core')).filter(name => name.endsWith('.js')).map(name => read(`src/core/${name}`)).join('\n');
for (const forbidden of ['powershell.exe', 'taskkill.exe', 'secret-tool', '/proc/', 'loginctl', 'wmctrl', 'xwininfo', 'xprop', 'Atspi']) {
  assert.equal(coreSource.includes(forbidden), false, `核心层不得包含平台实现：${forbidden}`);
}

const html = read('src/renderer/index.html');
for (const required of ['3 步完成设置', 'EAS 客户端', '数据中心', '登录账号', '运行诊断']) assert.ok(html.includes(required), `首次使用路径缺少：${required}`);
for (const forbidden of ['Keyring 凭据', 'RPA CONTROL CENTER', '自动化能力矩阵']) assert.equal(html.includes(forbidden), false, `主界面不应暴露实现术语：${forbidden}`);
for (const required of ['manual-datacenter', 'delete-account']) assert.ok(html.includes(required), `失败/维护路径缺少一致的界面入口：${required}`);
const renderer = read('src/renderer/app.js');
assert.equal(renderer.includes('window.prompt('), false, '主流程不得回退到浏览器原生 prompt');
assert.ok(renderer.includes('await checkCredentials();'), '批量登录前必须预检查凭据，避免任务启动后才发现缺密码');

const css = read('src/renderer/styles.css');
assert.equal((css.match(/:root\{/g) || []).length, 1, '视觉变量必须只有一套根定义，避免主题层叠互相覆盖');
assert.ok(css.includes('.setup-card'), '首次使用卡片必须有明确视觉层级');

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
