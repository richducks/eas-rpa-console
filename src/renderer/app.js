let appConfig = null;
let configPath = '';
let accounts = [];
let dataCenters = [];
let selectedDataCenter = null;
let running = false;
let activeAccountId = null;
let credentialStates = {};
let launcherReady = false;
let logs = [];
let deleteArmed = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
}

function addLog(level, text) {
  logs.push([now(), level, text]);
  if (logs.length > 300) logs = logs.slice(-300);
  renderLogs();
}

function renderLogs() {
  $('#terminal').innerHTML = logs.map(([time, level, text]) => `<div class="log-line"><span class="time">${escapeHtml(time)}</span> <span class="${level.toLowerCase()}">[${escapeHtml(level)}]</span> ${escapeHtml(text)}</div>`).join('') || '<div class="log-line">本次会话暂无日志。</div>';
  $('#terminal').scrollTop = $('#terminal').scrollHeight;
}

function hasClient() {
  return launcherReady;
}



function currentAccounts() {
  return accounts.filter(account => account.data_center === selectedDataCenter);
}

function enabledCurrentAccounts() {
  return currentAccounts().filter(account => account.enabled);
}

function updateReadiness() {
  const clientReady = hasClient();
  const centersReady = dataCenters.length > 0;
  const accountsReady = accounts.length > 0;
  const credentialReady = accounts.some(account => credentialStates[account.id] === true);
  const credentialsChecked = accounts.length > 0 && accounts.every(account => account.id in credentialStates);
  const allReady = clientReady && centersReady && accountsReady && credentialReady;
  $('#setup-card').classList.toggle('complete', allReady);
  $('#setup-client').classList.toggle('done', clientReady);
  $('#setup-centers').classList.toggle('done', centersReady);
  $('#setup-account').classList.toggle('done', accountsReady && credentialReady);
  $('#setup-client-state').textContent = clientReady ? '已指定' : '未选择';
  $('#setup-centers-state').textContent = centersReady ? `${dataCenters.length} 个可用` : clientReady ? '尚未读取' : '等待客户端';
  const missingPasswords = accounts.filter(account => credentialStates[account.id] === false).length;
  $('#setup-account-state').textContent = !accountsReady ? '尚未添加' : !credentialsChecked ? '正在检查密码' : missingPasswords === accounts.length ? '需要保存密码' : missingPasswords ? `${missingPasswords} 个缺少密码` : `${accounts.length} 个已就绪`;
  $('#setup-summary').textContent = !clientReady ? '先选择这台电脑上的 EAS 客户端。' : !centersReady ? '客户端已就绪，下一步读取数据中心。' : !accountsReady ? '最后添加登录账号和密码。' : '设置已完成。';
  const enabled = enabledCurrentAccounts();
  const runnable = allReady && enabled.length > 0 && enabled.every(account => credentialStates[account.id] === true);
  $('#run-button').disabled = running ? false : !runnable;
  $('#setup-client').disabled = running;
  $('#setup-centers').disabled = running || !clientReady;
  $('#setup-account').disabled = running || !centersReady;
  $('#manual-datacenter').disabled = running || !clientReady;
  $('#refresh-datacenters').disabled = running || !clientReady;
  $('#add-account').disabled = running || !centersReady;
  $('#choose-client-directory').disabled = running;
  const status = $('#app-status');
  status.classList.toggle('ready', allReady && !running);
  status.classList.toggle('running', running);
  status.querySelector('span').textContent = running ? '正在登录' : allReady ? '可以登录' : '需要设置';
}

function renderCenters() {
  const merged = [...new Set([...dataCenters, ...accounts.map(account => account.data_center)].filter(Boolean))];
  dataCenters = merged;
  if (!selectedDataCenter || !merged.includes(selectedDataCenter)) selectedDataCenter = merged[0] || null;
  $('#datacenter-list').innerHTML = merged.map((center, index) => {
    const count = accounts.filter(account => account.data_center === center).length;
    return `<button class="center-item ${center === selectedDataCenter ? 'active' : ''}" data-center="${escapeHtml(center)}"><span class="center-icon">${String(index + 1).padStart(2,'0')}</span><span class="center-copy"><strong>${escapeHtml(center)}</strong><small>${count} 个账号</small></span></button>`;
  }).join('') || '<div class="empty-state"><strong>还没有数据中心</strong><p>选择 EAS 客户端后点击“刷新”。</p></div>';
  $$('[data-center]').forEach(button => button.onclick = () => { selectedDataCenter = button.dataset.center; renderCenters(); renderAccounts(); updateReadiness(); });
  $('#account-title').textContent = selectedDataCenter || '账号';
  $('#account-subtitle').textContent = selectedDataCenter ? `${currentAccounts().length} 个账号 · ${enabledCurrentAccounts().length} 个参与登录` : '选择一个数据中心';
}

function credentialLabel(accountId) {
  const state = credentialStates[accountId];
  if (state === true) return '<span class="credential-state ok">● 密码已保存</span>';
  if (state === false) return '<span class="credential-state warn">● 需要密码</span>';
  return '<span class="credential-state">● 密码未检查</span>';
}

function renderAccounts() {
  const list = currentAccounts();
  $('#account-list').innerHTML = list.map((account, index) => `<div class="account-row">
    <div class="account-main"><span class="account-avatar">${String(index + 1).padStart(2,'0')}</span><span><strong>${escapeHtml(account.name || account.username)}</strong><small>${escapeHtml(account.username)}</small></span></div>
    ${credentialLabel(account.id)}
    <div class="account-actions"><label class="switch" title="是否参与批量登录"><input type="checkbox" data-enabled="${escapeHtml(account.id)}" ${account.enabled ? 'checked' : ''}/><span>启用</span></label><button class="row-button" data-edit="${escapeHtml(account.id)}">编辑</button><button class="row-button login" data-login="${escapeHtml(account.id)}">${running && activeAccountId === account.id ? '停止' : '登录'}</button></div>
  </div>`).join('') || `<div class="empty-state"><strong>${selectedDataCenter ? '这里还没有账号' : '先选择数据中心'}</strong><p>${selectedDataCenter ? '添加账号后即可直接登录。' : '从左侧选择一个数据中心。'}</p>${selectedDataCenter ? '<button class="secondary-button" id="empty-add-account">添加第一个账号</button>' : ''}</div>`;
  $('#empty-add-account')?.addEventListener('click', () => openAccountModal());
  $$('[data-enabled]').forEach(input => input.onchange = async () => {
    const account = accounts.find(item => item.id === input.dataset.enabled);
    const previous = account.enabled;
    account.enabled = input.checked;
    const result = await persistConfig();
    if (!result.valid) { account.enabled = previous; input.checked = previous; return toast(result.errors[0]); }
    renderCenters(); updateReadiness();
  });
  $$('[data-edit]').forEach(button => button.onclick = () => openAccountModal(button.dataset.edit));
  $$('[data-login]').forEach(button => button.onclick = () => runSingle(button.dataset.login));
}

async function persistConfig() {
  appConfig.accounts = accounts;
  appConfig.ui.data_centers = dataCenters;
  return window.easDesktop.saveConfig(appConfig);
}

async function checkCredentials() {
  credentialStates = {};
  await Promise.all(accounts.map(async account => {
    try { credentialStates[account.id] = Boolean((await window.easDesktop.checkCredential(account.id)).available); }
    catch { credentialStates[account.id] = false; }
  }));
  renderAccounts();
  updateReadiness();
}

function populateSettings() {
  $('#client-directory').value = appConfig.launcher.client_directory || '';
  $('#launcher-path').value = appConfig.launcher.desktop_file || '';
  $('#startup-timeout').value = appConfig.global.startup_timeout_seconds;
  $('#login-timeout').value = appConfig.global.login_timeout_seconds;
  $('#retry-count').value = appConfig.global.retry_count;
  $('#poll-interval').value = appConfig.global.poll_interval_seconds;
  $('#continue-on-error').checked = appConfig.global.continue_on_error;
}

async function loadConfig() {
  const result = await window.easDesktop.getConfig();
  appConfig = result.config;
  configPath = result.path;
  accounts = appConfig.accounts || [];
  dataCenters = appConfig.ui?.data_centers || [];
  try { selectedDataCenter = localStorage.getItem('eas-selected-datacenter') || dataCenters[0] || accounts[0]?.data_center || null; } catch { selectedDataCenter = dataCenters[0] || accounts[0]?.data_center || null; }
  populateSettings(); renderCenters(); renderAccounts(); updateReadiness();
  if (result.recovery?.recovered) toast('检测到配置损坏，已自动恢复最近一次有效设置');
  await checkCredentials();
}

async function chooseClient() {
  const directory = await window.easDesktop.pickClientDirectory();
  if (!directory) return;
  const previous = appConfig.launcher.client_directory;
  appConfig.launcher.client_directory = directory;
  const result = await persistConfig();
  if (!result.valid) { appConfig.launcher.client_directory = previous; return toast(result.errors[0]); }
  $('#client-directory').value = directory;
  launcherReady = true;
  updateReadiness();
  await refreshDataCenters();
}

async function refreshDataCenters() {
  if (!hasClient()) return chooseClient();
  $('#datacenter-source').textContent = '正在读取…';
  const button = $('#refresh-datacenters');
  button.disabled = true;
  try {
    const result = await window.easDesktop.discoverDataCenters();
    if (!result.ok) {
      $('#datacenter-source').textContent = '读取失败';
      toast(result.message || '数据中心读取失败，可手动添加');
      if (result.code === 'DATACENTER_CONFIG_NOT_FOUND' || result.code === 'WEB_MANUAL_CANCELLED') openDatacenterModal();
      return;
    } else {
      dataCenters = [...new Set(result.dataCenters || [])];
      $('#datacenter-source').textContent = `${dataCenters.length} 个可用`;
    }
    appConfig.ui.data_centers = dataCenters;
    await persistConfig();
    selectedDataCenter = dataCenters.includes(selectedDataCenter) ? selectedDataCenter : dataCenters[0] || null;
    try { if (selectedDataCenter) localStorage.setItem('eas-selected-datacenter', selectedDataCenter); } catch {}
    renderCenters(); renderAccounts(); updateReadiness();
    toast(`已读取 ${dataCenters.length} 个数据中心`);
  } finally { button.disabled = false; }
}

function openDatacenterModal() {
  $('#datacenter-form').reset();
  $('#datacenter-modal').classList.add('open');
  $('#datacenter-modal').setAttribute('aria-hidden', 'false');
  $('#datacenter-form').elements.name.focus();
}

function closeDatacenterModal() {
  $('#datacenter-modal').classList.remove('open');
  $('#datacenter-modal').setAttribute('aria-hidden', 'true');
}

async function addManualDatacenter(event) {
  event.preventDefault();
  const name = String(new FormData(event.currentTarget).get('name') || '').trim();
  if (!name) return;
  const previous = [...dataCenters];
  dataCenters = [...new Set([...dataCenters, name])];
  selectedDataCenter = name;
  const saved = await persistConfig();
  if (!saved.valid) { dataCenters = previous; return toast(saved.errors[0]); }
  try { localStorage.setItem('eas-selected-datacenter', name); } catch {}
  closeDatacenterModal();
  renderCenters(); renderAccounts(); updateReadiness();
  toast('数据中心已添加');
}

function openAccountModal(accountId = null) {
  if (!dataCenters.length) return toast('请先读取数据中心');
  const form = $('#account-form');
  form.reset();
  $('#account-data-center').innerHTML = dataCenters.map(center => `<option value="${escapeHtml(center)}">${escapeHtml(center)}</option>`).join('');
  const account = accountId ? accounts.find(item => item.id === accountId) : null;
  form.elements.accountId.value = account?.id || '';
  form.elements.dataCenter.value = account?.data_center || selectedDataCenter || dataCenters[0];
  form.elements.username.value = account?.username || '';
  form.elements.password.required = !account;
  $('#account-modal-title').textContent = account ? '编辑账号' : '添加账号';
  const deleteButton = $('#delete-account');
  deleteButton.hidden = !account;
  deleteButton.textContent = '删除账号';
  deleteButton.classList.remove('armed');
  deleteArmed = false;
  $('#account-modal').classList.add('open');
  $('#account-modal').setAttribute('aria-hidden', 'false');
  form.elements.username.focus();
}

function closeAccountModal() {
  $('#account-modal').classList.remove('open');
  $('#account-modal').setAttribute('aria-hidden', 'true');
  $('#account-form').querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
}

async function deleteCurrentAccount() {
  const accountId = String($('#account-form').elements.accountId.value || '');
  const account = accounts.find(item => item.id === accountId);
  if (!account) return;
  if (!deleteArmed) {
    deleteArmed = true;
    $('#delete-account').textContent = '再次点击删除';
    $('#delete-account').classList.add('armed');
    return toast('再次点击“删除”确认此操作');
  }
  const index = accounts.indexOf(account);
  accounts.splice(index, 1);
  const saved = await persistConfig();
  if (!saved.valid) { accounts.splice(index, 0, account); return toast(saved.errors[0]); }
  const credential = await window.easDesktop.deleteCredential(account.id);
  delete credentialStates[account.id];
  closeAccountModal();
  renderCenters(); renderAccounts(); updateReadiness();
  toast(credential.deleted || credential.code === 'CREDENTIAL_MISSING' ? '账号已删除' : '账号已删除；旧密码凭据未能清理');
}

$('#account-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const username = String(data.get('username') || '').trim();
  const dataCenter = String(data.get('dataCenter') || '').trim();
  const password = String(data.get('password') || '');
  const existingId = String(data.get('accountId') || '');
  if (!username || !dataCenter) return toast('请填写数据中心和用户名');
  let account = accounts.find(item => item.id === existingId);
  const snapshot = account ? { ...account } : null;
  const isNew = !account;
  if (isNew) {
    const safe = username.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'') || 'account';
    const id = `${safe}-${Date.now().toString(36)}`;
    account = { id, name: username, data_center: dataCenter, username, password_keyring_service: 'eascloud-rpa', password_keyring_key: id, enabled: true };
    accounts.push(account);
  } else {
    account.name = username; account.username = username; account.data_center = dataCenter;
  }
  const saved = await persistConfig();
  if (!saved.valid) { if (isNew) accounts = accounts.filter(item => item !== account); return toast(saved.errors[0]); }
  if (password) {
    const stored = await window.easDesktop.storeCredential(account.id, password);
    if (!stored.stored) {
      if (isNew) accounts = accounts.filter(item => item.id !== account.id);
      else Object.assign(account, snapshot);
      await persistConfig();
      return toast('密码未能写入系统安全存储，本次修改已回滚');
    }
    credentialStates[account.id] = true;
  }
  selectedDataCenter = dataCenter;
  closeAccountModal(); renderCenters(); renderAccounts(); updateReadiness();
  toast(isNew ? '账号已添加，可以登录' : '账号已更新');
};

async function runSingle(accountId) {
  if (running) return stopRun();
  const account = accounts.find(item => item.id === accountId);
  if (!account) return;
  try { credentialStates[accountId] = Boolean((await window.easDesktop.checkCredential(accountId)).available); }
  catch { credentialStates[accountId] = false; }
  if (!credentialStates[accountId]) { renderAccounts(); toast('先为此账号设置密码'); return openAccountModal(accountId); }
  running = true; activeAccountId = accountId; updateReadiness(); renderAccounts();
  addLog('INFO', `开始登录 ${account.data_center} / ${account.username}`);
  try {
    const result = await window.easDesktop.startAccountRun(accountId);
    toast(result.status === 'SUCCESS' ? '登录成功' : result.message || '登录失败');
  } catch (error) { addLog('WARN', `登录调用失败：${error.message}`); toast('登录失败，请查看诊断'); }
  finally { running = false; activeAccountId = null; updateReadiness(); renderAccounts(); }
}

async function runBatch() {
  if (running) return stopRun();
  if (!selectedDataCenter) return toast('请选择数据中心');
  const enabled = enabledCurrentAccounts();
  if (!enabled.length) return toast('请至少启用一个账号');
  await checkCredentials();
  const missing = enabled.find(account => credentialStates[account.id] !== true);
  if (missing) { toast(`${missing.username} 还没有可用密码`); return openAccountModal(missing.id); }
  running = true; updateReadiness(); $('#run-button').textContent = '停止登录';
  addLog('INFO', `开始批量登录 ${selectedDataCenter}，共 ${enabledCurrentAccounts().length} 个账号`);
  try {
    const result = await window.easDesktop.startFoundationRun(selectedDataCenter);
    toast(result.status === 'SUCCESS' ? `登录完成：${result.succeeded}/${result.total}` : result.message || '批量登录结束');
  } catch (error) { addLog('WARN', `批量登录调用失败：${error.message}`); toast('批量登录失败，请查看诊断'); }
  finally { running = false; $('#run-button').textContent = '登录已启用账号'; updateReadiness(); renderAccounts(); }
}

async function stopRun() {
  const result = await window.easDesktop.stopRun();
  toast(result.stopped ? '已停止本次登录相关进程' : '当前没有可停止的登录任务');
}

const stageLabels = { VALIDATE_CONFIG:'检查配置',VALIDATE_CREDENTIAL:'检查密码',DISCOVER_ENV:'检查环境',START_CLIENT:'启动 EAS',WAIT_PROCESS:'等待客户端',WAIT_LOGIN_WINDOW:'等待登录窗口',SELECT_DATACENTER:'选择数据中心',SET_USERNAME:'填写用户名',SET_PASSWORD:'填写密码',SUBMIT_LOGIN:'提交登录',VERIFY_LOGIN:'确认登录',SUCCESS:'登录成功',FAILED:'登录失败',STOPPED:'已停止' };
function handleTaskEvent(event) {
  const label = stageLabels[event.stage] || event.stage;
  const level = event.status === 'FAILED' ? 'WARN' : event.status === 'SUCCESS' ? 'SUCCESS' : 'INFO';
  addLog(level, `${label}${event.message ? `：${event.message}` : ''}${event.errorCode ? ` (${event.errorCode})` : ''}`);
}

async function probeEnvironment() {
  const summary = $('#diagnostic-summary');
  summary.classList.remove('good'); summary.innerHTML = '<strong>正在检查运行环境…</strong><p>不会修改 EAS 配置。</p>';
  try {
    const env = await window.easDesktop.probeEnvironment();
    const ready = Boolean(env.launcher?.parsed);
    launcherReady = ready || Boolean(appConfig?.launcher?.client_directory);
    updateReadiness();
    summary.classList.toggle('good', ready);
    summary.innerHTML = `<strong>${ready ? '基础环境已准备好' : '需要先完成客户端设置'}</strong><p>${ready ? '如果仍无法登录，可查看下面的能力项。' : '返回“登录”页选择 EAS 客户端。'}</p>`;
    $('#environment-grid').innerHTML = [['操作系统',env.system.platform],['桌面会话',env.session.type],['主机',env.system.hostname],['启动器',ready?'已准备':'未准备']].map(([label,value]) => `<article class="diagnostic-card card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    $('#capability-list').innerHTML = (env.capabilities || []).map(item => `<div class="capability-row ${item.available ? 'ok' : ''}"><span class="capability-dot"></span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="capability-status">${escapeHtml(item.status)}</span></div>`).join('');
    addLog('INFO', `环境诊断完成：session=${env.session.type}, launcher=${ready ? 'ready' : 'not-ready'}`);
  } catch (error) { summary.innerHTML = `<strong>诊断失败</strong><p>${escapeHtml(error.message)}</p>`; addLog('WARN', `环境诊断失败：${error.message}`); }
}

function goTo(page) {
  $$('.page').forEach(node => node.classList.toggle('active', node.id === `${page}-page`));
  $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.page === page));
  if (page === 'environment') probeEnvironment();
  try { localStorage.setItem('eas-active-page', page); } catch {}
}

$('#run-button').onclick = runBatch;
$('#refresh-datacenters').onclick = refreshDataCenters;
$('#manual-datacenter').onclick = openDatacenterModal;
$('#choose-client-directory').onclick = chooseClient;
$('#setup-client').onclick = chooseClient;
$('#setup-centers').onclick = refreshDataCenters;
$('#setup-account').onclick = () => openAccountModal();
$('#add-account').onclick = () => openAccountModal();
$('#probe-button').onclick = probeEnvironment;
$('#clear-logs').onclick = () => { logs = []; renderLogs(); };
$('#settings-button').onclick = () => goTo('settings');
$('#theme-button').onclick = () => { document.body.classList.toggle('dark'); try { localStorage.setItem('eas-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {} };
$$('.nav-item').forEach(item => item.onclick = () => goTo(item.dataset.page));
$$('.modal-close').forEach(item => item.onclick = closeAccountModal);
$('#delete-account').onclick = deleteCurrentAccount;
$('#datacenter-form').onsubmit = addManualDatacenter;
$$('.datacenter-modal-close').forEach(item => item.onclick = closeDatacenterModal);
$('#datacenter-modal').onclick = event => { if (event.target === $('#datacenter-modal')) closeDatacenterModal(); };
$('#account-modal').onclick = event => { if (event.target === $('#account-modal')) closeAccountModal(); };

$('#browse-client-directory').onclick = async () => { const directory = await window.easDesktop.pickClientDirectory(); if (directory) $('#client-directory').value = directory; };
$('#browse-launcher').onclick = async () => { const file = await window.easDesktop.pickLauncher(); if (file) $('#launcher-path').value = file; };
$('#save-settings').onclick = async () => {
  appConfig.launcher.client_directory = $('#client-directory').value.trim() || null;
  appConfig.launcher.desktop_file = $('#launcher-path').value.trim() || null;
  appConfig.global.startup_timeout_seconds = Number($('#startup-timeout').value);
  appConfig.global.login_timeout_seconds = Number($('#login-timeout').value);
  appConfig.global.retry_count = Number($('#retry-count').value);
  appConfig.global.poll_interval_seconds = Number($('#poll-interval').value);
  appConfig.global.continue_on_error = $('#continue-on-error').checked;
  const result = await persistConfig();
  if (!result.valid) return toast(result.errors[0]);
  launcherReady = false;
  await probeEnvironment();
  updateReadiness(); toast(`设置已保存`);
};

async function boot() {
  try {
    try { document.body.classList.toggle('dark', localStorage.getItem('eas-theme') === 'dark'); } catch {}
    renderLogs();
    await loadConfig();
    window.easDesktop.onTaskEvent(handleTaskEvent);
    const saved = (() => { try { return localStorage.getItem('eas-active-page'); } catch { return null; } })();
    if (['dashboard','environment','logs','settings'].includes(saved)) goTo(saved);
    await probeEnvironment();
  } catch (error) { console.error(error); addLog('WARN', `初始化失败：${error.message}`); toast(`初始化失败：${error.message}`); }
  finally { window.__easRpaReady = true; }
}

boot();
