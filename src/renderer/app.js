let accounts = [];
let appConfig = null;
let configPath = '';

let running = false;
let readyProcess = false;
let activeSingleAccountId = null;
let taskStatuses = {};
let selectedAccountId = null;
let selectedDatacenter = null;
try {
  selectedDatacenter = localStorage.getItem('eas-selected-datacenter');
  document.body.classList.toggle('dark', localStorage.getItem('eas-theme') === 'dark');
} catch { /* Preferences are optional in restricted browser contexts. */ }
let detailEditing = false;
let discoveredDatacenters = [];
let draggedDatacenter = null;
let activities = [
  { icon: '✓', text: '环境探测完成，AT-SPI 后端可优先使用', time: '09:41:58' },
  { icon: '↗', text: '上一次批量任务已完成：3 个成功', time: '09:42:36' },
  { icon: '•', text: '等待下一次任务', time: '刚刚' }
];
const logs = [
  ['09:41:56', 'INFO', '环境探测开始：检查桌面会话与可用后端'],
  ['09:41:57', 'INFO', '会话类型已识别，窗口控制能力待真实环境确认'],
  ['09:41:58', 'SUCCESS', '配置校验通过：3 个启用账号，将严格串行执行'],
  ['09:42:36', 'SUCCESS', '上一次运行已完成：success=3, failed=0']
];

const pageMeta = {
  dashboard: ['登录账号簿', '直接编辑账号并批量登录'],
  accounts: ['账号管理', '维护登录账号与数据中心配置'],
  credentials: ['Keyring 凭据', '在系统 Secret Service 中安全维护账号密码'],
  environment: ['环境探测', '检查桌面会话及自动化能力'],
  logs: ['运行日志', '查看任务阶段、降级原因与诊断信息'],
  settings: ['系统设置', '配置启动器、超时与安全策略']
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function renderTasks(statuses = {}) {
  const centerAccounts = accounts.filter(a => a.data_center === selectedDatacenter);
  const enabled = centerAccounts.filter(a => a.enabled);
  $('#enabled-count').textContent = `${enabled.length} 可登录`;
  $('#queue-count').textContent = enabled.length;
  $('#task-table').innerHTML = enabled.map((a, index) => {
    const status = statuses[a.id] || { label: '等待执行', type: '', phase: '尚未开始', progress: 0 };
    return `<div class="queue-item">
      <div class="queue-index">${String(index + 1).padStart(2, '0')}</div>
      <div><strong>${escapeHtml(a.name || a.id)}</strong><small>${escapeHtml(a.data_center)} · ${escapeHtml(status.phase)}</small>${status.progress ? `<div class="run-progress"><i style="width:${status.progress}%"></i></div>` : ''}</div>
      <span class="status-badge ${status.type}">${status.label}</span>
    </div>`;
  }).join('') || '<div class="empty">暂无参与登录的账号</div>';
}

function renderLedger() {
  const datacenters = [...new Set([...discoveredDatacenters, ...accounts.map(account => account.data_center)].filter(Boolean))];
  if (!selectedDatacenter || !datacenters.includes(selectedDatacenter)) selectedDatacenter = datacenters[0] || null;
  try {
    if (selectedDatacenter) localStorage.setItem('eas-selected-datacenter', selectedDatacenter);
    else localStorage.removeItem('eas-selected-datacenter');
  } catch { /* Keep the UI usable when storage is unavailable. */ }
  const centerAccounts = accounts.filter(account => account.data_center === selectedDatacenter);
  if (selectedAccountId && !centerAccounts.some(account => account.id === selectedAccountId)) selectedAccountId = null;
  $('#ledger-datacenter-list').innerHTML = datacenters.map((center, index) => {
    const count = accounts.filter(account => account.data_center === center).length;
    return `<div class="datacenter-item ${center === selectedDatacenter ? 'active' : ''}" data-datacenter="${escapeHtml(center)}" draggable="true" title="拖动调整顺序"><div class="datacenter-icon">${String(index + 1).padStart(2, '0')}</div><div class="datacenter-copy"><strong>${escapeHtml(center)}</strong><small>${count} 个账号</small></div><button class="datacenter-delete" type="button" data-delete-datacenter="${escapeHtml(center)}" title="删除数据中心" aria-label="删除 ${escapeHtml(center)}">×</button></div>`;
  }).join('') || '<div class="empty">暂无数据中心</div>';
  $$('[data-datacenter]').forEach(item => {
    item.onclick = () => { if (draggedDatacenter) return; selectedDatacenter = item.dataset.datacenter; selectedAccountId = null; detailEditing = false; taskStatuses = {}; renderLedger(); renderTasks(); };
    item.ondragstart = event => {
      if (event.target.closest('.datacenter-delete')) { event.preventDefault(); return; }
      draggedDatacenter = item.dataset.datacenter;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedDatacenter);
      item.classList.add('dragging');
    };
    item.ondragover = event => {
      if (!draggedDatacenter || draggedDatacenter === item.dataset.datacenter) return;
      event.preventDefault();
      item.classList.toggle('drop-before', event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2);
      item.classList.toggle('drop-after', event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2);
    };
    item.ondragleave = () => item.classList.remove('drop-before', 'drop-after');
    item.ondrop = async event => {
      event.preventDefault();
      const source = draggedDatacenter;
      const target = item.dataset.datacenter;
      const insertAfter = item.classList.contains('drop-after');
      clearDatacenterDrag();
      if (!source || source === target) return;
      const previous = [...discoveredDatacenters];
      const next = datacenters.filter(center => center !== source);
      const index = next.indexOf(target);
      next.splice(index + (insertAfter ? 1 : 0), 0, source);
      discoveredDatacenters = next;
      appConfig.ui.data_centers = next;
      const result = await persistConfig();
      if (!result.valid) { discoveredDatacenters = previous; appConfig.ui.data_centers = previous; return showToast(result.errors[0]); }
      renderLedger();
    };
    item.ondragend = clearDatacenterDrag;
  });
  $$('[data-delete-datacenter]').forEach(button => button.onclick = async event => {
    event.stopPropagation();
    const center = button.dataset.deleteDatacenter;
    const centerAccountsToDelete = accounts.filter(account => account.data_center === center);
    const message = centerAccountsToDelete.length
      ? `确认删除数据中心“${center}”及其 ${centerAccountsToDelete.length} 个账号？账号对应的 Keyring 密码也会删除。`
      : `确认删除数据中心“${center}”？刷新后仍可从 EAS 重新获取。`;
    if (!window.confirm(message)) return;
    const previousAccounts = accounts;
    const previousDatacenters = discoveredDatacenters;
    accounts = accounts.filter(account => account.data_center !== center);
    discoveredDatacenters = discoveredDatacenters.filter(item => item !== center);
    appConfig.accounts = accounts;
    appConfig.ui.data_centers = discoveredDatacenters;
    const result = await window.easDesktop.saveConfig(appConfig);
    if (!result.valid) {
      accounts = previousAccounts;
      discoveredDatacenters = previousDatacenters;
      appConfig.accounts = accounts;
      appConfig.ui.data_centers = discoveredDatacenters;
      return showToast(result.errors[0]);
    }
    for (const account of centerAccountsToDelete) await window.easDesktop.deleteCredential(account.id);
    selectedDatacenter = null;
    selectedAccountId = null;
    detailEditing = false;
    renderAccounts(); renderCredentials(); renderTasks(); renderLedger();
    showToast(centerAccountsToDelete.length ? `数据中心及 ${centerAccountsToDelete.length} 个账号已删除` : '数据中心已删除');
  });
  $('#account-book-subtitle').textContent = selectedDatacenter || '选择数据中心查看账号';
  $('#account-book-count').textContent = centerAccounts.length;
  const accountBook = $('#ledger-account-book');
  accountBook.innerHTML = centerAccounts.map((account, index) => `<form class="account-edit-row" data-account-row="${escapeHtml(account.id)}">
    <div class="task-avatar">${String(index + 1).padStart(2, '0')}</div>
    <label><span>账号</span><input name="username" value="${escapeHtml(account.username)}" required autocomplete="username" /></label>
    <label><span>密码</span><input name="password" type="password" autocomplete="new-password" placeholder="留空不修改" /></label>
    <label class="row-enabled" title="参与批量登录"><input name="enabled" type="checkbox" ${account.enabled ? 'checked' : ''} /><i></i><span>启用</span></label>
    <button class="row-login" type="button" data-login-account="${escapeHtml(account.id)}" title="仅登录此账号">${account.id === activeSingleAccountId ? '■ 停止' : '▶ 登录'}</button>
    <button class="row-save" type="submit">保存</button>
    <button class="row-delete" type="button" data-delete-account="${escapeHtml(account.id)}">删除</button>
  </form>`).join('') || '<div class="empty">此数据中心暂无账号</div>';
  $$('[data-account-row]').forEach(form => form.onsubmit = saveAccountRow);
  $$('[data-login-account]').forEach(button => button.onclick = () => runSingleAccount(button.dataset.loginAccount));
  $$('[data-delete-account]').forEach(button => button.onclick = () => deleteAccountRow(button.dataset.deleteAccount));
}

function clearDatacenterDrag() {
  draggedDatacenter = null;
  $$('.datacenter-item').forEach(item => item.classList.remove('dragging', 'drop-before', 'drop-after'));
}

async function saveAccountRow(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const account = accounts.find(item => item.id === form.dataset.accountRow);
  if (!account) return false;
  const previous = { username: account.username, name: account.name, enabled: account.enabled };
  const data = new FormData(form);
  const username = String(data.get('username') || '').trim();
  const password = String(data.get('password') || '');
  if (!username) { showToast('用户名不能为空'); return false; }
  account.username = username;
  account.name = username;
  account.enabled = data.get('enabled') === 'on';
  const button = form.querySelector('.row-save');
  button.disabled = true; button.innerHTML = '<span class="action-symbol">…</span><span class="action-label">读取中</span>';
  const saved = await persistConfig();
  if (!saved.valid) {
    Object.assign(account, previous);
    button.disabled = false; button.textContent = '保存';
    showToast(saved.errors[0]); return false;
  }
  if (password) {
    const stored = await window.easDesktop.storeCredential(account.id, password);
    form.elements.password.value = '';
    if (!stored.stored) {
      button.disabled = false; button.textContent = '保存';
      showToast('账号已保存，但 Keyring 密码写入失败'); return false;
    }
  }
  renderAccounts(); renderCredentials(); renderTasks(); renderLedger();
  showToast(password ? '账号和密码已保存' : '账号已保存');
  return true;
}

async function runSingleAccount(accountId) {
  if (running) {
    if (activeSingleAccountId === accountId) await stopActiveLogin();
    else showToast('已有登录任务正在运行');
    return;
  }
  const account = accounts.find(item => item.id === accountId);
  if (!account) return showToast('账号不存在');
  const form = [...$$('[data-account-row]')].find(item => item.dataset.accountRow === accountId);
  if (form && (form.elements.username.value.trim() !== account.username || form.elements.password.value || form.elements.enabled.checked !== account.enabled)) {
    const saved = await saveAccountRow({ preventDefault() {}, currentTarget: form });
    if (!saved) return;
  }
  running = true;
  activeSingleAccountId = accountId;
  taskStatuses = { [accountId]: { label: '准备中', type: 'running', phase: '执行启动前检查', progress: 0 } };
  renderLedger(); renderTasks(taskStatuses);
  $('#run-button').innerHTML = '<span>■</span>安全停止';
  addActivity(`${account.data_center} · ${account.username} 开始单个登录`, '▶');
  try {
    const result = await window.easDesktop.startAccountRun(accountId);
    showToast(result.status === 'SUCCESS' ? '该账号登录成功' : result.message || '该账号登录失败，请查看日志');
  } catch (error) {
    addLog('WARN', `单个登录调用失败：${error.message}`);
    showToast('单个登录失败，请查看日志');
  } finally {
    running = false; readyProcess = false; activeSingleAccountId = null;
    $('#run-button').innerHTML = '<span>▶</span>批量登录';
    renderLedger();
  }
}

async function deleteAccountRow(accountId) {
  const account = accounts.find(item => item.id === accountId);
  if (!account || !window.confirm(`确认删除账号“${account.name || account.id}”？其 Keyring 密码也会一并移除。`)) return;
  const index = accounts.findIndex(item => item.id === account.id);
  accounts.splice(index, 1);
  const result = await persistConfig();
  if (!result.valid) { accounts.splice(index, 0, account); return showToast(result.errors[0]); }
  await window.easDesktop.deleteCredential(account.id);
  renderAccounts(); renderCredentials(); renderTasks(); renderLedger();
  showToast('账号已删除');
}

function renderAccounts() {
  $('.nav-count').textContent = accounts.filter(account => account.enabled).length;
  $('#account-list').innerHTML = accounts.map((a, index) => `<div class="account-card">
    <div class="task-avatar">${String(index + 1).padStart(2, '0')}</div>
    <div><strong>${escapeHtml(a.name || a.id)}</strong><small>ID · ${escapeHtml(a.id)}</small></div>
    <div><span class="account-label">数据中心</span><div class="account-value">${escapeHtml(a.data_center)}</div></div>
    <div><span class="account-label">用户名</span><div class="account-value">${escapeHtml(a.username)}</div></div>
    <div><span class="account-label">状态</span><div class="account-value">${a.enabled ? '已启用' : '已停用'}</div></div>
    <button class="credential-btn" data-credential="${escapeHtml(a.id)}">检查凭据</button>
    <div class="toggle ${a.enabled ? 'on' : ''}" data-account="${a.id}" title="启用或停用"></div>
  </div>`).join('');
  $$('.toggle').forEach(toggle => toggle.onclick = async () => {
    const account = accounts.find(a => a.id === toggle.dataset.account);
    account.enabled = !account.enabled;
    const result = await persistConfig();
    if (!result.valid) { account.enabled = !account.enabled; return showToast(result.errors[0]); }
    renderAccounts(); renderTasks();
    renderLedger();
    showToast(`${account.name || account.id}已${account.enabled ? '启用' : '停用'}`);
  });
  $$('.credential-btn').forEach(button => button.onclick = async () => {
    button.textContent = '检查中…';
    const result = await window.easDesktop.checkCredential(button.dataset.credential);
    button.textContent = result.available ? '凭据可用' : result.code === 'SECRET_TOOL_UNAVAILABLE' ? '服务不可用' : '凭据缺失';
    showToast(result.available ? 'Keyring 凭据引用有效' : '未找到凭据，不会回退到明文密码');
  });
}

function renderCredentials(states = {}) {
  $('#credential-list').innerHTML = accounts.map((account, index) => {
    const state = states[account.id] || { label: '未检查', type: '' };
    return `<div class="credential-row">
      <div class="task-avatar">${String(index + 1).padStart(2, '0')}</div>
      <div><strong>${escapeHtml(account.name || account.id)}</strong><small>${escapeHtml(account.username)}</small></div>
      <div><span class="account-label">Keyring 服务</span><div class="account-value">${escapeHtml(account.password_keyring_service)}</div></div>
      <div><span class="account-label">键名</span><div class="account-value">${escapeHtml(account.password_keyring_key)}</div></div>
      <span class="credential-state ${state.type}">● ${state.label}</span>
      <button class="credential-btn" data-set-credential="${escapeHtml(account.id)}">设置/更新</button>
    </div>`;
  }).join('') || '<div class="empty">请先添加一个登录账号</div>';
  $('#credential-account').innerHTML = accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name || account.id)} · ${escapeHtml(account.username)}</option>`).join('');
  $$('[data-set-credential]').forEach(button => button.onclick = () => openCredentialModal(button.dataset.setCredential));
}

function openCredentialModal(accountId) {
  renderCredentials();
  if (accountId) $('#credential-account').value = accountId;
  $('#credential-modal').classList.add('open');
  $('#credential-form input[name="password"]').focus();
}

async function checkAllCredentials() {
  const states = {};
  $('#refresh-credentials').textContent = '检查中…';
  for (const account of accounts) {
    states[account.id] = { label: '检查中', type: '' };
    renderCredentials(states);
    const result = await window.easDesktop.checkCredential(account.id);
    states[account.id] = result.available ? { label: '凭据可用', type: 'available' } : { label: result.code === 'SECRET_TOOL_UNAVAILABLE' ? '服务不可用' : '凭据缺失', type: 'missing' };
  }
  renderCredentials(states);
  $('#refresh-credentials').textContent = '检查全部';
}

async function persistConfig() {
  appConfig.accounts = accounts;
  return window.easDesktop.saveConfig(appConfig);
}

async function loadConfig() {
  const result = await window.easDesktop.getConfig();
  appConfig = result.config;
  configPath = result.path;
  accounts = appConfig.accounts;
  discoveredDatacenters = appConfig.ui.data_centers || [];
  $('#launcher-path').value = appConfig.launcher.desktop_file || '';
  $('#client-directory').value = appConfig.launcher.client_directory || '';
  $('#startup-timeout').value = appConfig.global.startup_timeout_seconds;
  $('#login-timeout').value = appConfig.global.login_timeout_seconds;
  $('#retry-count').value = appConfig.global.retry_count;
  $('#poll-interval').value = appConfig.global.poll_interval_seconds;
  $('#continue-on-error').checked = appConfig.global.continue_on_error;
  $('#screenshot-on-failure').checked = appConfig.global.screenshot_on_failure;
  renderAccounts(); renderLedger(); renderTasks();
  renderCredentials();
  addLog('SUCCESS', `配置校验通过：${accounts.filter(a => a.enabled).length} 个启用账号`);
}

function renderActivity() {
  $('#activity-list').innerHTML = activities.length ? activities.slice(0, 7).map(item => `<div class="activity-item"><div class="activity-dot">${item.icon}</div><div><p>${item.text}</p><time>${item.time}</time></div></div>`).join('') : '<div class="empty">暂无运行事件</div>';
}

function addActivity(text, icon = '•') {
  activities.unshift({ icon, text, time: now() });
  renderActivity();
}

function renderLogs() {
  $('#terminal').innerHTML = logs.map(([time, level, text]) => `<div class="log-line"><span class="time">${time}</span> <span class="${level.toLowerCase()}">[${level}]</span> ${text}</div>`).join('');
  $('#terminal').scrollTop = $('#terminal').scrollHeight;
}

function addLog(level, text) { logs.push([now(), level, text]); renderLogs(); }

const stageLabels = {
  VALIDATE_CONFIG: '校验配置', VALIDATE_CREDENTIAL: '检查 Keyring 凭据', DISCOVER_ENV: '探测运行环境',
  START_CLIENT: '启动客户端', WAIT_PROCESS: '确认进程存活', WAIT_LOGIN_WINDOW: '等待登录窗口',
  SELECT_DATACENTER: '选择数据中心', SET_USERNAME: '填写用户名', SET_PASSWORD: '填写密码', SUBMIT_LOGIN: '提交登录', VERIFY_LOGIN: '验证登录', SUCCESS: '登录成功', FAILED: '登录失败', STOPPED: '任务已停止'
};

function handleTaskEvent(event) {
  const account = accounts.find(item => item.id === event.accountId) || accounts.find(item => item.enabled);
  const label = stageLabels[event.stage] || event.stage;
  if (account) {
    const progressByStage = { VALIDATE_CONFIG: 5, VALIDATE_CREDENTIAL: 10, DISCOVER_ENV: 20, START_CLIENT: 30, WAIT_PROCESS: 40, WAIT_LOGIN_WINDOW: 55, SELECT_DATACENTER: 65, SET_USERNAME: 72, SET_PASSWORD: 78, SUBMIT_LOGIN: 85, VERIFY_LOGIN: 92, SUCCESS: 100 };
    taskStatuses[account.id] = {
      label: event.status === 'FAILED' ? '失败' : event.status === 'SUCCESS' ? '成功' : event.status === 'STOPPED' ? '已停止' : '执行中',
      type: event.status === 'FAILED' ? 'failed' : event.status === 'SUCCESS' ? 'success' : event.status === 'STOPPED' ? '' : 'running',
      phase: event.message || label,
      progress: progressByStage[event.stage] || 0
    };
    renderTasks(taskStatuses);
  }
  const level = event.status === 'FAILED' ? 'WARN' : event.status === 'SUCCESS' ? 'SUCCESS' : 'INFO';
  addLog(level, `stage=${event.stage} status=${event.status}${event.pid ? ` pid=${event.pid}` : ''}${event.errorCode ? ` error=${event.errorCode}` : ''}`);
  if (['START_CLIENT', 'WAIT_LOGIN_WINDOW', 'SUBMIT_LOGIN', 'SUCCESS', 'FAILED', 'STOPPED'].includes(event.stage)) addActivity(event.message || label, event.status === 'FAILED' ? '!' : event.status === 'SUCCESS' ? '✓' : '↗');
}

async function stopActiveLogin() {
  const result = await window.easDesktop.stopRun();
  showToast(result.stopped ? '已向当前任务发送安全停止信号' : '当前没有可停止的任务进程');
}

async function runFoundation() {
  if (running || readyProcess) return stopActiveLogin();
  if (!selectedDatacenter) return showToast('请先选择数据中心');
  const enabled = accounts.filter(a => a.enabled && a.data_center === selectedDatacenter);
  if (!enabled.length) return showToast('请先启用至少一个账号');
  running = true;
  const button = $('#run-button');
  button.innerHTML = '<span>■</span>安全停止';
  taskStatuses = Object.fromEntries(enabled.map((a, index) => [a.id, { label: index ? '排队中' : '准备中', type: '', phase: index ? '等待前序账号' : '执行启动前检查', progress: 0 }]));
  renderTasks(taskStatuses); addActivity(`${selectedDatacenter} 批量登录已开始，共 ${enabled.length} 个账号`, '▶');
  try {
    const result = await window.easDesktop.startFoundationRun(selectedDatacenter);
    running = false;
    if (result.status === 'SUCCESS') {
      readyProcess = false;
      button.innerHTML = '<span>▶</span>批量登录';
      showToast(`批量登录完成：${result.succeeded} 个成功`);
    } else {
      readyProcess = false;
      button.innerHTML = '<span>▶</span>重新批量登录';
      showToast(result.message || '启动前检查失败，请查看日志');
    }
  } catch (error) {
    running = false; readyProcess = false;
    button.innerHTML = '<span>▶</span>重新批量登录';
    addLog('WARN', `任务调用失败：${error.message}`); showToast('任务调用失败，请查看日志');
  }
}

async function probeEnvironment() {
  const env = await window.easDesktop.probeEnvironment();
  $('#environment-grid').innerHTML = [
    ['操作系统', env.system.platform], ['桌面会话', env.session.type.toUpperCase()], ['显示服务', env.session.evidence.display || env.session.evidence.waylandDisplay || '未连接'], ['主机', env.system.hostname]
  ].map(([label, value]) => `<article class="env-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const icons = ['⌘', '▣', '◎', '⌨', '◉'];
  $('#capability-list').innerHTML = env.capabilities.map((item, index) => `<div class="capability-row"><div class="capability-icon">${icons[index]}</div><div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.detail)}</small></div><small>优先级 ${index + 1}</small><span class="${item.available ? 'check' : 'pending'}">● ${escapeHtml(item.status)}</span></div>`).join('');
  addLog('INFO', `真实环境探测完成：session=${env.session.type}, launcher=${env.launcher.parsed ? 'ready' : 'not-ready'}`); showToast('真实环境信息已刷新');
}

function goTo(page) {
  try { localStorage.setItem('eas-active-page', page); } catch { /* Optional preference. */ }
  document.body.classList.toggle('dashboard-view', page === 'dashboard');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `${page}-page`));
  $('#page-title').textContent = pageMeta[page][0]; $('#page-subtitle').textContent = pageMeta[page][1];
  const settingsOpen = ['settings', 'environment', 'logs'].includes(page);
  $('#settings-tabs').hidden = !settingsOpen;
  $$('[data-settings-page]').forEach(button => button.classList.toggle('active', button.dataset.settingsPage === page));
  $('#settings-button').classList.toggle('active', settingsOpen);
}

$$('.nav-item').forEach(item => item.onclick = () => goTo(item.dataset.page));
$$('[data-goto]').forEach(item => item.onclick = () => goTo(item.dataset.goto));
$('#run-button').onclick = runFoundation;
$('#probe-button').onclick = probeEnvironment;
$('#clear-activity').onclick = () => { activities = []; renderActivity(); };
$('#clear-logs').onclick = () => { logs.length = 0; renderLogs(); };
$('#theme-button').onclick = () => {
  document.body.classList.toggle('dark');
  try { localStorage.setItem('eas-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch { /* Optional preference. */ }
};
$('#settings-button').onclick = () => $('#settings-tabs').hidden ? goTo('settings') : goTo('dashboard');
$('#dashboard-theme-button').onclick = () => $('#theme-button').click();
$('#dashboard-settings-button').onclick = () => goTo('settings');
$$('[data-settings-page]').forEach(button => button.onclick = () => goTo(button.dataset.settingsPage));

function initializeColumnResizers() {
  const grid = $('.ledger-grid');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ledger-column-widths') || '{}'); } catch { /* Ignore malformed old preference. */ }
  if (Number.isFinite(saved.datacenter)) grid.style.setProperty('--datacenter-width', `${Math.min(280, Math.max(72, saved.datacenter))}px`);
  $$('[data-resizer]').forEach(handle => {
    handle.onpointerdown = event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing-columns');
      const first = $('.ledger-list');
      handle.onpointermove = moveEvent => {
        const gridRect = grid.getBoundingClientRect();
        if (handle.dataset.resizer === 'datacenter') {
          const max = Math.max(72, gridRect.width - 124);
          grid.style.setProperty('--datacenter-width', `${Math.min(max, Math.max(72, moveEvent.clientX - gridRect.left))}px`);
        }
      };
      handle.onpointerup = () => {
        handle.onpointermove = null;
        document.body.classList.remove('resizing-columns');
        localStorage.setItem('ledger-column-widths', JSON.stringify({ datacenter: first.offsetWidth }));
      };
    };
  });
}
$('#save-settings').onclick = async () => {
  appConfig.launcher.desktop_file = $('#launcher-path').value.trim() || null;
  appConfig.launcher.client_directory = $('#client-directory').value.trim() || null;
  appConfig.global.startup_timeout_seconds = Number($('#startup-timeout').value);
  appConfig.global.login_timeout_seconds = Number($('#login-timeout').value);
  appConfig.global.retry_count = Number($('#retry-count').value);
  appConfig.global.poll_interval_seconds = Number($('#poll-interval').value);
  appConfig.global.continue_on_error = $('#continue-on-error').checked;
  appConfig.global.screenshot_on_failure = $('#screenshot-on-failure').checked;
  const result = await persistConfig();
  showToast(result.valid ? `设置已保存至 ${configPath}` : result.errors[0]);
};
$('#browse-launcher').onclick = async () => { const file = await window.easDesktop.pickLauncher(); if (file) $('#launcher-path').value = file; };
$('#browse-client-directory').onclick = async () => { const directory = await window.easDesktop.pickClientDirectory(); if (directory) $('#client-directory').value = directory; };
function openAccountModal() {
  if (!selectedDatacenter) return showToast('请先选择数据中心');
  $('#account-modal-context').textContent = `添加到 ${selectedDatacenter}，密码由系统 Keyring 保护`;
  $('#account-modal').classList.add('open');
  $('#account-form input[name="username"]').focus();
}

$('#add-account').onclick = openAccountModal;
$('#ledger-add-account').onclick = openAccountModal;
async function refreshDatacenters() {
  const button = $('#refresh-datacenters');
  button.disabled = true; button.textContent = '…';
  $('#datacenter-source').textContent = '正在读取客户端目录…';
  const result = await window.easDesktop.discoverDataCenters();
  button.disabled = false; button.innerHTML = '<span class="action-symbol">↻</span><span class="action-label">刷新</span>';
  if (!result.ok) {
    $('#datacenter-source').textContent = '本地配置读取失败';
    if (result.code === 'DATACENTER_CONFIG_NOT_FOUND') {
      const names = window.prompt('此客户端目录未保存数据中心列表。请输入名称，多个用逗号分隔：', '');
      if (!names) return showToast('未添加数据中心');
      const entered = names.split(/[,，\n]/).map(name => name.trim()).filter(Boolean);
      if (!entered.length) return showToast('数据中心名称不能为空');
      discoveredDatacenters = [...new Set([...discoveredDatacenters, ...entered])];
      appConfig.ui.data_centers = discoveredDatacenters;
      const saved = await window.easDesktop.saveConfig(appConfig);
      if (!saved.valid) return showToast(saved.errors[0]);
      $('#datacenter-source').textContent = `手动添加 · ${discoveredDatacenters.length} 项`;
      renderLedger(); renderTasks();
      return showToast(`已添加 ${entered.length} 个数据中心`);
    }
    return showToast(result.message || '数据中心读取失败');
  }
  discoveredDatacenters = [
    ...discoveredDatacenters.filter(center => result.dataCenters.includes(center)),
    ...result.dataCenters.filter(center => !discoveredDatacenters.includes(center))
  ];
  appConfig.ui.data_centers = discoveredDatacenters;
  const saved = await window.easDesktop.saveConfig(appConfig);
  if (!saved.valid) return showToast(saved.errors[0]);
  if (!selectedDatacenter || !discoveredDatacenters.includes(selectedDatacenter)) selectedDatacenter = discoveredDatacenters[0] || null;
  selectedAccountId = null;
  $('#datacenter-source').textContent = `${result.windowBackend === 'install-directory' ? '安装目录' : '本地配置'} · ${discoveredDatacenters.length} 项`;
  renderLedger();
  showToast(`已获取 ${discoveredDatacenters.length} 个数据中心`);
}
$('#refresh-datacenters').onclick = refreshDatacenters;
$('#choose-datacenter-directory').onclick = async () => {
  const directory = await window.easDesktop.pickClientDirectory();
  if (!directory) return showToast('请在桌面版选择 EAS 客户端目录');
  const previous = appConfig.launcher.client_directory;
  appConfig.launcher.client_directory = directory;
  const saved = await window.easDesktop.saveConfig(appConfig);
  if (!saved.valid) { appConfig.launcher.client_directory = previous; return showToast(saved.errors[0]); }
  $('#client-directory').value = directory;
  await refreshDatacenters();
};
$('#add-keyring-account').onclick = openAccountModal;
$('#open-credential-modal').onclick = () => openCredentialModal();
$('#refresh-credentials').onclick = checkAllCredentials;
$$('.modal-close').forEach(b => b.onclick = () => $('#account-modal').classList.remove('open'));
$$('.credential-modal-close').forEach(b => b.onclick = () => { $('#credential-form').reset(); $('#credential-modal').classList.remove('open'); });
$('#account-form').onsubmit = async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (!selectedDatacenter) return showToast('请先选择数据中心');
  const username = data.username.trim();
  const safeName = username.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'account';
  const accountId = `${safeName}-${Date.now().toString(36)}`;
  accounts.push({ id: accountId, name: username, data_center: selectedDatacenter, username, password_keyring_service: 'eascloud-rpa', password_keyring_key: accountId, allow_duplicate_login: true, enabled: true });
  const result = await persistConfig();
  if (!result.valid) { accounts.pop(); return showToast(result.errors[0]); }
  const stored = await window.easDesktop.storeCredential(accountId, data.password);
  if (!stored.stored) {
    accounts.pop();
    await persistConfig();
    return showToast('Keyring 密码写入失败，账号未添加');
  }
  selectedAccountId = accountId;
  renderAccounts(); renderTasks(); renderCredentials(); renderLedger(); event.currentTarget.reset(); $('#account-modal').classList.remove('open'); showToast('账号已添加');
};

$('#credential-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = data.get('password');
  const confirmation = data.get('confirmation');
  if (password !== confirmation) return showToast('两次输入的密码不一致');
  const submit = form.querySelector('button[type="submit"], button.primary-btn');
  submit.disabled = true; submit.textContent = '正在安全写入…';
  try {
    const result = await window.easDesktop.storeCredential(data.get('accountId'), password);
    form.reset();
    if (result.stored) {
      $('#credential-modal').classList.remove('open');
      showToast('密码已写入系统 Keyring');
      await checkAllCredentials();
    } else showToast(result.code === 'SECRET_TOOL_UNAVAILABLE' ? '系统未安装 secret-tool' : 'Keyring 写入失败');
  } finally {
    form.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
    submit.disabled = false; submit.textContent = '安全写入';
  }
};

async function boot() {
  renderActivity(); renderLogs();
  initializeColumnResizers();
  try {
    await loadConfig();
    const savedPage = localStorage.getItem('eas-active-page');
    if (['dashboard', 'settings', 'environment', 'logs'].includes(savedPage)) goTo(savedPage);
    window.easDesktop.onTaskEvent(handleTaskEvent);
    await probeEnvironment();
  }
  catch (error) { console.error('Renderer initialization failed', error); addLog('WARN', `初始化失败：${error.message}`); showToast(`初始化失败：${error.message}`); }
}

boot();
