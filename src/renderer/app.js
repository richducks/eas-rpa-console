let accounts = [];
let appConfig = null;
let configPath = '';

let running = false;
let readyProcess = false;
let taskStatuses = {};
let selectedAccountId = null;
let selectedDatacenter = null;
let detailEditing = false;
let discoveredDatacenters = [];
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
  dashboard: ['登录账号簿', '选择账号、修改详情并批量登录'],
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
  $('#enabled-count').textContent = enabled.length;
  $('#total-count').textContent = selectedDatacenter ? `${selectedDatacenter} · 共 ${centerAccounts.length} 个账号` : '请选择数据中心';
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
  const centerAccounts = accounts.filter(account => account.data_center === selectedDatacenter);
  if (selectedAccountId && !centerAccounts.some(account => account.id === selectedAccountId)) selectedAccountId = null;
  $('#ledger-datacenter-list').innerHTML = datacenters.map((center, index) => {
    const count = accounts.filter(account => account.data_center === center).length;
    return `<div class="datacenter-item ${center === selectedDatacenter ? 'active' : ''}" data-datacenter="${escapeHtml(center)}"><div class="datacenter-icon">${String(index + 1).padStart(2, '0')}</div><div class="datacenter-copy"><strong>${escapeHtml(center)}</strong><small>${count} 个账号</small></div><button class="datacenter-delete" type="button" data-delete-datacenter="${escapeHtml(center)}" title="删除数据中心" aria-label="删除 ${escapeHtml(center)}">×</button></div>`;
  }).join('') || '<div class="empty">暂无数据中心</div>';
  $$('[data-datacenter]').forEach(item => item.onclick = () => { selectedDatacenter = item.dataset.datacenter; selectedAccountId = null; detailEditing = false; taskStatuses = {}; renderLedger(); renderTasks(); });
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
  const inlineDetail = $('#account-detail-inline');
  const accountBook = $('#ledger-account-book');
  accountBook.innerHTML = centerAccounts.map((account, index) => `<div class="ledger-account ${account.id === selectedAccountId ? 'active' : ''}" data-ledger-account="${escapeHtml(account.id)}"><div class="task-avatar">${String(index + 1).padStart(2, '0')}</div><div><strong>${escapeHtml(account.name || account.id)}</strong><small>${escapeHtml(account.username)}</small></div><i class="status-dot ${account.enabled ? 'on' : ''}"></i><span class="account-chevron">⌄</span></div>`).join('') || '<div class="empty">此数据中心暂无账号</div>';
  $$('[data-ledger-account]').forEach(item => item.onclick = () => {
    const collapsing = selectedAccountId === item.dataset.ledgerAccount;
    selectedAccountId = collapsing ? null : item.dataset.ledgerAccount;
    detailEditing = !collapsing;
    renderLedger();
  });
  const account = accounts.find(item => item.id === selectedAccountId);
  inlineDetail.hidden = !account;
  if (account) accountBook.querySelector(`[data-ledger-account="${CSS.escape(account.id)}"]`)?.after(inlineDetail);
  else accountBook.after(inlineDetail);
  const form = $('#ledger-detail-form');
  ['#detail-username', '#detail-password', '#detail-enabled'].forEach(selector => { $(selector).disabled = !account || !detailEditing; });
  $('#detail-edit').disabled = !account;
  $('#detail-delete').disabled = !account;
  $('#detail-edit').hidden = detailEditing;
  $('#detail-save').hidden = !detailEditing;
  $('#detail-cancel').hidden = !detailEditing;
  if (!account) {
    $('#detail-username').value = ''; $('#detail-password').value = ''; $('#detail-enabled').checked = false;
    return;
  }
  $('#detail-username').value = account.username || '';
  $('#detail-password').value = '';
  $('#detail-enabled').checked = Boolean(account.enabled);
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

async function runFoundation() {
  if (running || readyProcess) {
    const result = await window.easDesktop.stopRun();
    if (result.stopped) {
      running = false; readyProcess = false;
      $('#run-button').innerHTML = '<span>▶</span>批量登录';
      showToast('已向本任务所属进程发送安全停止信号');
    } else showToast('当前没有可停止的任务进程');
    return;
  }
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
$('#detect-button').onclick = async () => { await probeEnvironment(); goTo('environment'); };
$('#probe-button').onclick = probeEnvironment;
$('#clear-activity').onclick = () => { activities = []; renderActivity(); };
$('#clear-logs').onclick = () => { logs.length = 0; renderLogs(); };
$('#theme-button').onclick = () => document.body.classList.toggle('dark');
$('#settings-button').onclick = () => $('#settings-tabs').hidden ? goTo('settings') : goTo('dashboard');
$$('[data-settings-page]').forEach(button => button.onclick = () => goTo(button.dataset.settingsPage));

function initializeColumnResizers() {
  const grid = $('.ledger-grid');
  const saved = JSON.parse(localStorage.getItem('ledger-column-widths') || '{}');
  if (Number.isFinite(saved.datacenter)) grid.style.setProperty('--datacenter-width', `${Math.min(280, Math.max(165, saved.datacenter))}px`);
  if (Number.isFinite(saved.account)) grid.style.setProperty('--account-width', `${saved.account}px`);
  $$('[data-resizer]').forEach(handle => {
    handle.onpointerdown = event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing-columns');
      const first = $('.ledger-list');
      const second = $('.ledger-detail');
      handle.onpointermove = moveEvent => {
        const gridRect = grid.getBoundingClientRect();
        if (handle.dataset.resizer === 'datacenter') {
          const max = Math.max(220, gridRect.width - second.offsetWidth - 330);
          grid.style.setProperty('--datacenter-width', `${Math.min(max, Math.max(180, moveEvent.clientX - gridRect.left))}px`);
        } else {
          const secondRect = second.getBoundingClientRect();
          const max = Math.max(260, gridRect.right - secondRect.left - 290);
          grid.style.setProperty('--account-width', `${Math.min(max, Math.max(240, moveEvent.clientX - secondRect.left))}px`);
        }
      };
      handle.onpointerup = () => {
        handle.onpointermove = null;
        document.body.classList.remove('resizing-columns');
        localStorage.setItem('ledger-column-widths', JSON.stringify({ datacenter: first.offsetWidth, account: second.offsetWidth }));
      };
    };
  });
}
$('#save-settings').onclick = async () => {
  appConfig.launcher.desktop_file = $('#launcher-path').value.trim() || null;
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
function openAccountModal() {
  if (!selectedDatacenter) return showToast('请先选择数据中心');
  $('#account-modal-context').textContent = `添加到 ${selectedDatacenter}，密码由系统 Keyring 保护`;
  $('#account-modal').classList.add('open');
  $('#account-form input[name="username"]').focus();
}

$('#add-account').onclick = openAccountModal;
$('#ledger-add-account').onclick = openAccountModal;
$('#refresh-datacenters').onclick = async () => {
  const button = $('#refresh-datacenters');
  button.disabled = true; button.textContent = '…';
  $('#datacenter-source').textContent = '正在读取 EAS 登录窗口…';
  const result = await window.easDesktop.discoverDataCenters();
  button.disabled = false; button.textContent = '↻';
  if (!result.ok) {
    $('#datacenter-source').textContent = '读取失败，可再次刷新';
    return showToast(result.code === 'DATACENTER_COMBO_NOT_FOUND' ? '未找到数据中心下拉框，请确认 Java 无障碍已启用' : result.message || '数据中心读取失败');
  }
  discoveredDatacenters = result.dataCenters;
  appConfig.ui.data_centers = discoveredDatacenters;
  await window.easDesktop.saveConfig(appConfig);
  selectedDatacenter = discoveredDatacenters[0] || selectedDatacenter;
  selectedAccountId = null;
  $('#datacenter-source').textContent = `已从 EAS 获取 ${discoveredDatacenters.length} 项`;
  renderLedger();
  showToast(`已获取 ${discoveredDatacenters.length} 个数据中心`);
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

$('#ledger-detail-form').onsubmit = async event => {
  event.preventDefault();
  const account = accounts.find(item => item.id === selectedAccountId);
  if (!account) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = '保存中…';
  const password = $('#detail-password').value;
  account.username = $('#detail-username').value.trim();
  account.name = account.username;
  account.enabled = $('#detail-enabled').checked;
  const saved = await persistConfig();
  if (!saved.valid) {
    button.disabled = false; button.textContent = '保存修改';
    return showToast(saved.errors[0]);
  }
  if (password) {
    const stored = await window.easDesktop.storeCredential(account.id, password);
    $('#detail-password').value = '';
    if (!stored.stored) {
      button.disabled = false; button.textContent = '保存修改';
      return showToast('账号资料已保存，但 Keyring 密码写入失败');
    }
  }
  detailEditing = false;
  renderAccounts(); renderCredentials(); renderTasks(); renderLedger();
  button.disabled = false; button.textContent = '保存修改';
  showToast(password ? '账号和 Keyring 密码已保存' : '账号修改已保存');
};

$('#detail-edit').onclick = () => { detailEditing = true; renderLedger(); $('#detail-username').focus(); };
$('#detail-cancel').onclick = () => { detailEditing = false; renderLedger(); };
$('#detail-delete').onclick = async () => {
  const account = accounts.find(item => item.id === selectedAccountId);
  if (!account || !window.confirm(`确认删除账号“${account.name || account.id}”？其 Keyring 密码也会一并移除。`)) return;
  await window.easDesktop.deleteCredential(account.id);
  const index = accounts.findIndex(item => item.id === account.id);
  accounts.splice(index, 1);
  const result = await persistConfig();
  if (!result.valid) { accounts.splice(index, 0, account); return showToast(result.errors[0]); }
  selectedAccountId = null; detailEditing = false;
  renderAccounts(); renderCredentials(); renderTasks(); renderLedger();
  showToast('账号已删除');
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
  try { await loadConfig(); window.easDesktop.onTaskEvent(handleTaskEvent); await probeEnvironment(); }
  catch (error) { console.error('Renderer initialization failed', error); addLog('WARN', `初始化失败：${error.message}`); showToast(`初始化失败：${error.message}`); }
}

boot();
