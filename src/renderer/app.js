let appConfig = null;
let configPath = '';
let clients = [];
let selectedClientId = null;
let accounts = [];
let dataCenters = [];
let selectedDataCenter = null;
let running = false;
let activeAccountId = null;
let credentialStates = {};
let launcherReady = false;
let launcherReadyClientId = null;
let logs = [];
let deleteArmed = false;
let clientDeleteArmed = false;
let clientInspection = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]));
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
const uniqueStrings = values => [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];

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

function selectedClient() {
  return clients.find(client => client.id === selectedClientId) || null;
}

function clientAccounts(clientId = selectedClientId) {
  return accounts.filter(account => account.client_id === clientId);
}

function hasClient() {
  return Boolean(selectedClient() && launcherReady && launcherReadyClientId === selectedClientId);
}

function clientStorageKey(clientId = selectedClientId) {
  return `eas-selected-datacenter:${clientId || 'none'}`;
}

function syncSelectedClientData() {
  const client = selectedClient();
  const accountCenters = clientAccounts().map(account => account.data_center);
  dataCenters = uniqueStrings([...(client?.data_centers || []), ...accountCenters]);
  if (client) client.data_centers = [...dataCenters];
  let saved = null;
  try { saved = localStorage.getItem(clientStorageKey()); } catch {}
  selectedDataCenter = saved && dataCenters.includes(saved) ? saved : dataCenters[0] || accountCenters[0] || null;
}

function currentAccounts() {
  return accounts.filter(account => account.client_id === selectedClientId && account.data_center === selectedDataCenter);
}

function enabledCurrentAccounts() {
  return currentAccounts().filter(account => account.enabled);
}

function clientVersionLabel(client) {
  if (!client) return '尚未选择';
  return client.detected_version ? `EAS ${client.detected_version}` : 'EAS 兼容模式';
}

function renderClientSwitcher() {
  const client = selectedClient();
  const select = $('#client-select');
  select.innerHTML = clients.length
    ? clients.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedClientId ? 'selected' : ''}>${escapeHtml(item.remark)}</option>`).join('')
    : '<option value="">尚未添加客户端</option>';
  select.disabled = running || !clients.length;
  $('#active-client-label').textContent = client?.remark || '尚未添加';
  $('#active-client-meta').textContent = client ? `${clientVersionLabel(client)} · ${dataCenters.length} 个数据中心` : '保存常用 EAS 客户端后可快速切换';
  $('#settings-client-count').textContent = `${clients.length} 个客户端`;
  $('#settings-active-client').textContent = client ? `当前：${client.remark} · ${clientVersionLabel(client)}` : '尚未选择';
  $('#manage-clients').disabled = running;
  $('#settings-manage-clients').disabled = running;
}

function updateReadiness() {
  const scopedAccounts = clientAccounts();
  const enabledScopedAccounts = scopedAccounts.filter(account => account.enabled);
  const clientReady = hasClient();
  const centersReady = dataCenters.length > 0;
  const accountsReady = scopedAccounts.length > 0;
  const credentialsChecked = enabledScopedAccounts.length > 0 && enabledScopedAccounts.every(account => account.id in credentialStates);
  const credentialReady = credentialsChecked && enabledScopedAccounts.every(account => credentialStates[account.id] === true);
  const allReady = clientReady && centersReady && accountsReady && credentialReady;
  $('#setup-card').classList.toggle('complete', allReady);
  $('#setup-client').classList.toggle('done', clientReady);
  $('#setup-centers').classList.toggle('done', centersReady);
  $('#setup-account').classList.toggle('done', accountsReady && credentialReady);
  $('#setup-client em').textContent = selectedClient() ? '管理' : '添加';
  $('#setup-client-state').textContent = !selectedClient() ? '尚未添加' : clientReady ? `${selectedClient().remark} 已就绪` : `${selectedClient().remark} 待检查`;
  $('#setup-centers-state').textContent = centersReady ? `${dataCenters.length} 个可用` : selectedClient() ? '尚未读取' : '等待客户端';
  const missingPasswords = enabledScopedAccounts.filter(account => credentialStates[account.id] === false).length;
  $('#setup-account-state').textContent = !accountsReady ? '尚未添加' : !enabledScopedAccounts.length ? '没有启用账号' : !credentialsChecked ? '正在检查密码' : missingPasswords ? `${missingPasswords} 个缺少密码` : `${enabledScopedAccounts.length} 个已就绪`;
  $('#setup-summary').textContent = !selectedClient() ? '先添加这台电脑上的 EAS 客户端。' : !clientReady ? '客户端已保存，正在确认启动能力。' : !centersReady ? '客户端已就绪，下一步读取数据中心。' : !accountsReady ? '最后添加登录账号和密码。' : !enabledScopedAccounts.length ? '启用至少一个账号后即可登录。' : !credentialsChecked ? '正在确认已启用账号的密码。' : !credentialReady ? '补全缺失密码后即可登录。' : '设置已完成。';
  const enabled = enabledCurrentAccounts();
  const runnable = allReady && enabled.length > 0 && enabled.every(account => credentialStates[account.id] === true);
  $('#run-button').disabled = running ? false : !runnable;
  $('#setup-client').disabled = running;
  $('#setup-centers').disabled = running || !clientReady;
  $('#setup-account').disabled = running || !centersReady;
  $('#manual-datacenter').disabled = running || !selectedClient();
  $('#refresh-datacenters').disabled = running || !clientReady;
  $('#add-account').disabled = running || !centersReady;
  $('#choose-client-directory').disabled = running;
  const status = $('#app-status');
  status.classList.toggle('ready', allReady && !running);
  status.classList.toggle('running', running);
  status.querySelector('span').textContent = running ? '正在登录' : allReady ? '可以登录' : '需要设置';
  renderClientSwitcher();
}

function renderCenters() {
  const client = selectedClient();
  if (!client) {
    dataCenters = [];
    selectedDataCenter = null;
  } else {
    dataCenters = uniqueStrings([...(client.data_centers || []), ...clientAccounts().map(account => account.data_center)]);
    client.data_centers = [...dataCenters];
    if (!selectedDataCenter || !dataCenters.includes(selectedDataCenter)) selectedDataCenter = dataCenters[0] || null;
  }
  $('#datacenter-list').innerHTML = dataCenters.map((center, index) => {
    const count = accounts.filter(account => account.client_id === selectedClientId && account.data_center === center).length;
    return `<button class="center-item ${center === selectedDataCenter ? 'active' : ''}" data-center="${escapeHtml(center)}"><span class="center-icon">${String(index + 1).padStart(2,'0')}</span><span class="center-copy"><strong>${escapeHtml(center)}</strong><small>${count} 个账号</small></span></button>`;
  }).join('') || `<div class="empty-state"><strong>${client ? '还没有数据中心' : '先添加 EAS 客户端'}</strong><p>${client ? '客户端准备好后点击“刷新”。' : '可保存多个版本，之后在顶部快速切换。'}</p></div>`;
  $$('[data-center]').forEach(button => button.onclick = () => {
    selectedDataCenter = button.dataset.center;
    try { localStorage.setItem(clientStorageKey(), selectedDataCenter); } catch {}
    renderCenters(); renderAccounts(); updateReadiness();
  });
  $('#account-title').textContent = selectedDataCenter || '账号';
  $('#datacenter-source').textContent = !client ? '等待客户端' : dataCenters.length ? `${dataCenters.length} 个可用` : '尚未读取';
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
  </div>`).join('') || `<div class="empty-state"><strong>${selectedDataCenter ? '这里还没有账号' : selectedClient() ? '先选择数据中心' : '先选择客户端'}</strong><p>${selectedDataCenter ? '添加账号后即可直接登录。' : selectedClient() ? '从左侧选择一个数据中心。' : '账号会绑定到具体客户端。'}</p>${selectedDataCenter ? '<button class="secondary-button" id="empty-add-account">添加第一个账号</button>' : ''}</div>`;
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
  appConfig.clients = clients;
  appConfig.active_client_id = selectedClientId;
  appConfig.accounts = accounts;
  delete appConfig.launcher;
  if (appConfig.ui) delete appConfig.ui.data_centers;
  return window.easDesktop.saveConfig(appConfig);
}

async function checkCredentials() {
  credentialStates = {};
  await Promise.all(accounts.map(async account => {
    try { credentialStates[account.id] = Boolean((await window.easDesktop.checkCredential(account.id)).available); }
    catch { credentialStates[account.id] = false; }
  }));
  renderAccounts(); updateReadiness();
}

function populateSettings() {
  $('#startup-timeout').value = appConfig.global.startup_timeout_seconds;
  $('#login-timeout').value = appConfig.global.login_timeout_seconds;
  $('#retry-count').value = appConfig.global.retry_count;
  $('#poll-interval').value = appConfig.global.poll_interval_seconds;
  $('#continue-on-error').checked = appConfig.global.continue_on_error;
  renderClientSwitcher();
}

async function loadConfig() {
  const result = await window.easDesktop.getConfig();
  appConfig = result.config;
  configPath = result.path;
  clients = Array.isArray(appConfig.clients) ? appConfig.clients : [];
  accounts = Array.isArray(appConfig.accounts) ? appConfig.accounts : [];
  selectedClientId = clients.some(client => client.id === appConfig.active_client_id) ? appConfig.active_client_id : clients[0]?.id || null;
  syncSelectedClientData();
  populateSettings(); renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness();
  if (result.recovery?.recovered) toast('检测到配置损坏，已自动恢复最近一次有效设置');
  else if (result.recovery?.migrated) toast('旧版单客户端配置已升级为多客户端结构');
  else if (result.recovery?.migrationError) addLog('WARN', `旧配置迁移未能写盘：${result.recovery.migrationError}`);
  await checkCredentials();
}

function renderClientManager() {
  const list = $('#client-manager-list');
  list.innerHTML = clients.length ? clients.map((client, index) => {
    const linked = accounts.filter(account => account.client_id === client.id).length;
    const pathText = client.client_directory || client.desktop_file || '自定义启动命令';
    return `<article class="client-manager-row ${client.id === selectedClientId ? 'active' : ''}">
      <span class="client-manager-icon">${String(index + 1).padStart(2,'0')}</span>
      <div class="client-manager-copy"><strong>${escapeHtml(client.remark)}</strong><small>${escapeHtml(clientVersionLabel(client))} · ${linked} 个账号 · ${escapeHtml(pathText)}</small></div>
      <div class="client-manager-actions">${client.id === selectedClientId ? '<button class="row-button" disabled>当前</button>' : `<button class="row-button login" data-use-client="${escapeHtml(client.id)}">使用</button>`}<button class="row-button" data-edit-client="${escapeHtml(client.id)}">编辑</button></div>
    </article>`;
  }).join('') : '<div class="client-manager-empty"><strong>还没有保存客户端</strong><p>先添加一个常用 EAS 安装目录。以后切换版本只需要一次点击。</p></div>';
  $$('[data-use-client]').forEach(button => button.onclick = async () => { await activateClient(button.dataset.useClient); renderClientManager(); });
  $$('[data-edit-client]').forEach(button => button.onclick = () => openClientEditor(button.dataset.editClient));
}

function openClientManager() {
  renderClientManager();
  $('#client-modal').classList.add('open');
  $('#client-modal').setAttribute('aria-hidden', 'false');
}

function closeClientManager() {
  $('#client-modal').classList.remove('open');
  $('#client-modal').setAttribute('aria-hidden', 'true');
}

async function inspectClientFormDirectory(directory) {
  const box = $('#client-inspection');
  clientInspection = null;
  box.classList.remove('good', 'bad');
  box.innerHTML = '<strong>正在识别客户端…</strong><small>检查启动文件和版本信息。</small>';
  const result = await window.easDesktop.inspectClient(directory);
  clientInspection = result;
  box.classList.toggle('good', result.valid === true);
  box.classList.toggle('bad', result.valid === false);
  if (result.valid) {
    $('#client-form').elements.clientDirectory.value = result.clientDirectory || directory;
    const version = result.detectedVersion ? `EAS ${result.detectedVersion}` : 'EAS 兼容模式';
    box.innerHTML = `<strong>${escapeHtml(version)} · 目录有效</strong><small>${escapeHtml(result.clientDirectory || directory)}${result.versionSource ? ` · 版本来源：${escapeHtml(result.versionSource)}` : ''}</small>`;
    if (!$('#client-form').elements.remark.value.trim()) $('#client-form').elements.remark.value = result.detectedVersion ? `EAS ${result.detectedVersion}` : 'EAS 客户端';
  } else {
    box.innerHTML = `<strong>目录不可用</strong><small>${escapeHtml(result.message || '请选择有效的 EAS 客户端目录')}</small>`;
  }
  return result;
}

function openClientEditor(clientId = null) {
  const form = $('#client-form');
  form.reset();
  const client = clientId ? clients.find(item => item.id === clientId) : null;
  form.elements.clientId.value = client?.id || '';
  form.elements.remark.value = client?.remark || '';
  form.elements.clientDirectory.value = client?.client_directory || '';
  form.elements.desktopFile.value = client?.desktop_file || '';
  $('#client-editor-title').textContent = client ? '编辑客户端' : '添加客户端';
  const deleteButton = $('#delete-client');
  deleteButton.hidden = !client;
  deleteButton.textContent = '删除客户端';
  deleteButton.classList.remove('armed');
  clientDeleteArmed = false;
  clientInspection = client ? { valid: true, clientDirectory: client.client_directory, detectedVersion: client.detected_version, compatibility: clientVersionLabel(client) } : null;
  const box = $('#client-inspection');
  box.classList.remove('good', 'bad');
  if (client) {
    box.classList.add('good');
    box.innerHTML = `<strong>${escapeHtml(clientVersionLabel(client))}</strong><small>${escapeHtml(client.client_directory || client.desktop_file || '自定义启动方式')}</small>`;
  } else box.innerHTML = '<strong>等待选择目录</strong><small>识别不到具体版本时仍可按 EAS 兼容模式使用。</small>';
  $('#client-editor-modal').classList.add('open');
  $('#client-editor-modal').setAttribute('aria-hidden', 'false');
  form.elements.remark.focus();
}

function closeClientEditor() {
  $('#client-editor-modal').classList.remove('open');
  $('#client-editor-modal').setAttribute('aria-hidden', 'true');
  clientInspection = null;
}

async function activateClient(clientId, { save = true, probe = true } = {}) {
  if (running) return;
  const client = clients.find(item => item.id === clientId);
  if (!client) return;
  selectedClientId = client.id;
  appConfig.active_client_id = client.id;
  launcherReady = false;
  launcherReadyClientId = null;
  syncSelectedClientData();
  if (save) {
    const saved = await persistConfig();
    if (!saved.valid) return toast(saved.errors[0]);
  }
  renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness();
  if (probe) await probeEnvironment();
}

async function deleteCurrentClient() {
  const clientId = String($('#client-form').elements.clientId.value || '');
  const client = clients.find(item => item.id === clientId);
  if (!client) return;
  const linkedAccounts = accounts.filter(account => account.client_id === client.id).length;
  if (linkedAccounts) return toast(`此客户端还有 ${linkedAccounts} 个账号，请先删除或迁移账号`);
  if (!clientDeleteArmed) {
    clientDeleteArmed = true;
    $('#delete-client').textContent = '再次点击删除';
    $('#delete-client').classList.add('armed');
    return toast('再次点击“删除客户端”确认此操作');
  }
  const snapshot = [...clients];
  clients = clients.filter(item => item.id !== client.id);
  if (selectedClientId === client.id) selectedClientId = clients[0]?.id || null;
  const saved = await persistConfig();
  if (!saved.valid) { clients = snapshot; return toast(saved.errors[0]); }
  closeClientEditor();
  syncSelectedClientData(); launcherReady = false; launcherReadyClientId = null;
  renderClientManager(); renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness();
  if (selectedClient()) await probeEnvironment();
  toast('客户端已删除');
}

$('#client-form').onsubmit = async event => {
  event.preventDefault();
  if (running) return;
  const form = event.currentTarget;
  const clientId = String(form.elements.clientId.value || '');
  const remark = String(form.elements.remark.value || '').trim();
  const directory = String(form.elements.clientDirectory.value || '').trim();
  const desktopFile = String(form.elements.desktopFile.value || '').trim() || null;
  if (!remark) return toast('请填写客户端备注');
  if (!directory && !desktopFile) return toast('请选择客户端目录，或在高级启动方式中指定启动器');
  let inspection = clientInspection;
  if (directory && (!inspection?.valid || inspection.clientDirectory !== directory)) inspection = await inspectClientFormDirectory(directory);
  if (directory && !inspection?.valid) return toast(inspection?.message || '客户端目录不可用');
  const existingIndex = clients.findIndex(item => item.id === clientId);
  const existing = existingIndex >= 0 ? clients[existingIndex] : null;
  const id = existing?.id || `client-${Date.now().toString(36)}`;
  const next = {
    id,
    remark,
    client_directory: directory ? (inspection?.clientDirectory || directory) : null,
    desktop_file: desktopFile,
    command: existing?.command && directory === (existing.client_directory || '') && desktopFile === (existing.desktop_file || null) ? existing.command : null,
    working_directory: existing?.working_directory || null,
    detected_version: directory ? (inspection?.detectedVersion || null) : (existing?.detected_version || null),
    data_centers: existing?.data_centers || []
  };
  const snapshot = [...clients];
  if (existingIndex >= 0) clients[existingIndex] = next; else clients.push(next);
  selectedClientId = id;
  launcherReady = false; launcherReadyClientId = null;
  const saved = await persistConfig();
  if (!saved.valid) { clients = snapshot; return toast(saved.errors[0]); }
  closeClientEditor(); syncSelectedClientData(); renderClientManager(); renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness();
  await probeEnvironment();
  toast(existing ? '客户端已更新' : '客户端已添加，下一步读取数据中心');
};

async function refreshDataCenters() {
  if (!selectedClient()) return openClientEditor();
  if (!hasClient()) { await probeEnvironment(); if (!hasClient()) return toast('当前客户端尚未准备好，请检查路径'); }
  $('#datacenter-source').textContent = '正在读取…';
  const button = $('#refresh-datacenters');
  button.disabled = true;
  try {
    const result = await window.easDesktop.discoverDataCenters(selectedClientId);
    if (!result.ok) {
      $('#datacenter-source').textContent = '读取失败';
      toast(result.message || '数据中心读取失败，可手动添加');
      if (result.code === 'DATACENTER_CONFIG_NOT_FOUND' || result.code === 'WEB_MANUAL_CANCELLED') openDatacenterModal();
      return;
    }
    dataCenters = uniqueStrings(result.dataCenters || []);
    const client = selectedClient();
    if (client) client.data_centers = [...dataCenters];
    $('#datacenter-source').textContent = `${dataCenters.length} 个可用`;
    await persistConfig();
    selectedDataCenter = dataCenters.includes(selectedDataCenter) ? selectedDataCenter : dataCenters[0] || null;
    try { if (selectedDataCenter) localStorage.setItem(clientStorageKey(), selectedDataCenter); } catch {}
    renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness();
    toast(`已读取 ${dataCenters.length} 个数据中心`);
  } finally { button.disabled = false; }
}

function openDatacenterModal() {
  if (!selectedClient()) return toast('请先选择客户端');
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
  const client = selectedClient();
  if (!client) return toast('请先选择客户端');
  const name = String(new FormData(event.currentTarget).get('name') || '').trim();
  if (!name) return;
  const previous = [...dataCenters];
  dataCenters = uniqueStrings([...dataCenters, name]);
  client.data_centers = [...dataCenters];
  selectedDataCenter = name;
  const saved = await persistConfig();
  if (!saved.valid) { dataCenters = previous; client.data_centers = previous; return toast(saved.errors[0]); }
  try { localStorage.setItem(clientStorageKey(), name); } catch {}
  closeDatacenterModal(); renderClientSwitcher(); renderCenters(); renderAccounts(); updateReadiness(); toast('数据中心已添加');
}

function openAccountModal(accountId = null) {
  if (!selectedClient()) return toast('请先选择客户端');
  if (!dataCenters.length) return toast('请先读取数据中心');
  const form = $('#account-form');
  form.reset();
  $('#account-data-center').innerHTML = dataCenters.map(center => `<option value="${escapeHtml(center)}">${escapeHtml(center)}</option>`).join('');
  const account = accountId ? accounts.find(item => item.id === accountId && item.client_id === selectedClientId) : null;
  form.elements.accountId.value = account?.id || '';
  form.elements.dataCenter.value = account?.data_center || selectedDataCenter || dataCenters[0];
  form.elements.username.value = account?.username || '';
  form.elements.password.required = !account;
  $('#account-modal-title').textContent = account ? '编辑账号' : '添加账号';
  const deleteButton = $('#delete-account');
  deleteButton.hidden = !account;
  deleteButton.textContent = '删除账号'; deleteButton.classList.remove('armed'); deleteArmed = false;
  $('#account-modal').classList.add('open'); $('#account-modal').setAttribute('aria-hidden', 'false'); form.elements.username.focus();
}

function closeAccountModal() {
  $('#account-modal').classList.remove('open'); $('#account-modal').setAttribute('aria-hidden', 'true');
  $('#account-form').querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
}

async function deleteCurrentAccount() {
  const accountId = String($('#account-form').elements.accountId.value || '');
  const account = accounts.find(item => item.id === accountId);
  if (!account) return;
  if (!deleteArmed) { deleteArmed = true; $('#delete-account').textContent = '再次点击删除'; $('#delete-account').classList.add('armed'); return toast('再次点击“删除”确认此操作'); }
  const index = accounts.indexOf(account); accounts.splice(index, 1);
  const saved = await persistConfig();
  if (!saved.valid) { accounts.splice(index, 0, account); return toast(saved.errors[0]); }
  const credential = await window.easDesktop.deleteCredential(account.id); delete credentialStates[account.id];
  closeAccountModal(); renderClientManager(); renderCenters(); renderAccounts(); updateReadiness();
  toast(credential.deleted || credential.code === 'CREDENTIAL_MISSING' ? '账号已删除' : '账号已删除；旧密码凭据未能清理');
}

$('#account-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget; const data = new FormData(form);
  const username = String(data.get('username') || '').trim(); const dataCenter = String(data.get('dataCenter') || '').trim(); const password = String(data.get('password') || ''); const existingId = String(data.get('accountId') || '');
  if (!selectedClientId) return toast('请先选择客户端');
  if (!username || !dataCenter) return toast('请填写数据中心和用户名');
  let account = accounts.find(item => item.id === existingId); const snapshot = account ? { ...account } : null; const isNew = !account;
  if (isNew) {
    const safe = username.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'') || 'account'; const id = `${safe}-${Date.now().toString(36)}`;
    account = { id, client_id: selectedClientId, name: username, data_center: dataCenter, username, password_keyring_service: 'eascloud-rpa', password_keyring_key: id, enabled: true }; accounts.push(account);
  } else {
    account.name = username; account.username = username; account.data_center = dataCenter; account.client_id = selectedClientId;
  }
  const saved = await persistConfig();
  if (!saved.valid) { if (isNew) accounts = accounts.filter(item => item !== account); else Object.assign(account, snapshot); return toast(saved.errors[0]); }
  if (password) {
    const stored = await window.easDesktop.storeCredential(account.id, password);
    if (!stored.stored) { if (isNew) accounts = accounts.filter(item => item.id !== account.id); else Object.assign(account, snapshot); await persistConfig(); return toast('密码未能写入系统安全存储，本次修改已回滚'); }
    credentialStates[account.id] = true;
  }
  selectedDataCenter = dataCenter; closeAccountModal(); renderClientManager(); renderCenters(); renderAccounts(); updateReadiness(); toast(isNew ? '账号已添加，可以登录' : '账号已更新');
};

async function runSingle(accountId) {
  if (running) return stopRun();
  const account = accounts.find(item => item.id === accountId && item.client_id === selectedClientId); if (!account) return;
  try { credentialStates[accountId] = Boolean((await window.easDesktop.checkCredential(accountId)).available); } catch { credentialStates[accountId] = false; }
  if (!credentialStates[accountId]) { renderAccounts(); toast('先为此账号设置密码'); return openAccountModal(accountId); }
  running = true; activeAccountId = accountId; updateReadiness(); renderAccounts(); addLog('INFO', `开始登录 ${selectedClient()?.remark || ''} / ${account.data_center} / ${account.username}`);
  try { const result = await window.easDesktop.startAccountRun(accountId); toast(result.status === 'SUCCESS' ? '登录成功' : result.message || '登录失败'); }
  catch (error) { addLog('WARN', `登录调用失败：${error.message}`); toast('登录失败，请查看诊断'); }
  finally { running = false; activeAccountId = null; updateReadiness(); renderAccounts(); }
}

async function runBatch() {
  if (running) return stopRun();
  if (!selectedClientId) return toast('请选择 EAS 客户端');
  if (!selectedDataCenter) return toast('请选择数据中心');
  const enabled = enabledCurrentAccounts(); if (!enabled.length) return toast('请至少启用一个账号');
  await checkCredentials(); const missing = enabled.find(account => credentialStates[account.id] !== true);
  if (missing) { toast(`${missing.username} 还没有可用密码`); return openAccountModal(missing.id); }
  running = true; updateReadiness(); $('#run-button').textContent = '停止登录'; addLog('INFO', `开始批量登录 ${selectedClient()?.remark || ''} / ${selectedDataCenter}，共 ${enabled.length} 个账号`);
  try { const result = await window.easDesktop.startFoundationRun({ clientId: selectedClientId, dataCenter: selectedDataCenter }); toast(result.status === 'SUCCESS' ? `登录完成：${result.succeeded}/${result.total}` : result.message || '批量登录结束'); }
  catch (error) { addLog('WARN', `批量登录调用失败：${error.message}`); toast('批量登录失败，请查看诊断'); }
  finally { running = false; $('#run-button').textContent = '登录已启用账号'; updateReadiness(); renderAccounts(); }
}

async function stopRun() {
  const result = await window.easDesktop.stopRun(); toast(result.stopped ? '已停止本次登录相关进程' : '当前没有可停止的登录任务');
}

const stageLabels = { VALIDATE_CONFIG:'检查配置',VALIDATE_CREDENTIAL:'检查密码',DISCOVER_ENV:'检查环境',START_CLIENT:'启动 EAS',WAIT_PROCESS:'等待客户端',WAIT_LOGIN_WINDOW:'等待登录窗口',SELECT_DATACENTER:'选择数据中心',SET_USERNAME:'填写用户名',SET_PASSWORD:'填写密码',SUBMIT_LOGIN:'提交登录',VERIFY_LOGIN:'确认登录',SUCCESS:'登录成功',FAILED:'登录失败',STOPPED:'已停止' };
function handleTaskEvent(event) {
  const label = stageLabels[event.stage] || event.stage; const level = event.status === 'FAILED' ? 'WARN' : event.status === 'SUCCESS' ? 'SUCCESS' : 'INFO';
  addLog(level, `${label}${event.message ? `：${event.message}` : ''}${event.errorCode ? ` (${event.errorCode})` : ''}`);
}

async function probeEnvironment() {
  const summary = $('#diagnostic-summary');
  if (!selectedClient()) {
    launcherReady = false; launcherReadyClientId = null; updateReadiness();
    summary.classList.remove('good'); summary.innerHTML = '<strong>需要先添加客户端</strong><p>返回“登录”页添加一个 EAS 客户端目录。</p>';
    $('#environment-grid').innerHTML = ''; $('#capability-list').innerHTML = ''; return;
  }
  const probingClientId = selectedClientId;
  summary.classList.remove('good'); summary.innerHTML = '<strong>正在检查运行环境…</strong><p>不会修改 EAS 配置。</p>';
  try {
    const env = await window.easDesktop.probeEnvironment(probingClientId);
    if (probingClientId !== selectedClientId) return;
    const ready = Boolean(env.launcher?.parsed); launcherReady = ready; launcherReadyClientId = probingClientId; updateReadiness();
    summary.classList.toggle('good', ready);
    summary.innerHTML = `<strong>${ready ? '当前客户端已准备好' : '当前客户端需要检查'}</strong><p>${ready ? `${escapeHtml(selectedClient()?.remark || '')} 可以启动；若仍无法登录，再看下面能力项。` : escapeHtml(env.launcher?.error || '请检查客户端路径。')}</p>`;
    $('#environment-grid').innerHTML = [['客户端',selectedClient()?.remark || '未命名'],['版本',clientVersionLabel(selectedClient())],['桌面会话',env.session.type],['启动器',ready?'已准备':'未准备']].map(([label,value]) => `<article class="diagnostic-card card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    $('#capability-list').innerHTML = (env.capabilities || []).map(item => `<div class="capability-row ${item.available ? 'ok' : ''}"><span class="capability-dot"></span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="capability-status">${escapeHtml(item.status)}</span></div>`).join('');
    addLog('INFO', `环境诊断完成：client=${selectedClient()?.remark || probingClientId}, launcher=${ready ? 'ready' : 'not-ready'}`);
  } catch (error) { if (probingClientId === selectedClientId) { launcherReady = false; launcherReadyClientId = probingClientId; updateReadiness(); summary.innerHTML = `<strong>诊断失败</strong><p>${escapeHtml(error.message)}</p>`; addLog('WARN', `环境诊断失败：${error.message}`); } }
}

function goTo(page) {
  $$('.page').forEach(node => node.classList.toggle('active', node.id === `${page}-page`));
  $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.page === page));
  if (page === 'environment') probeEnvironment();
  if (page === 'settings') renderClientSwitcher();
  try { localStorage.setItem('eas-active-page', page); } catch {}
}

$('#run-button').onclick = runBatch;
$('#refresh-datacenters').onclick = refreshDataCenters;
$('#manual-datacenter').onclick = openDatacenterModal;
$('#choose-client-directory').onclick = openClientManager;
$('#setup-client').onclick = () => clients.length ? openClientManager() : openClientEditor();
$('#setup-centers').onclick = refreshDataCenters;
$('#setup-account').onclick = () => openAccountModal();
$('#add-account').onclick = () => openAccountModal();
$('#manage-clients').onclick = openClientManager;
$('#settings-manage-clients').onclick = openClientManager;
$('#client-select').onchange = event => activateClient(event.currentTarget.value);
$('#add-client').onclick = () => openClientEditor();
$('#browse-client-editor').onclick = async () => { const directory = await window.easDesktop.pickClientDirectory(); if (directory) await inspectClientFormDirectory(directory); };
$('#browse-client-launcher').onclick = async () => { const file = await window.easDesktop.pickLauncher(); if (file) $('#client-form').elements.desktopFile.value = file; };
$('#client-form').elements.clientDirectory.onchange = event => { if (event.currentTarget.value.trim()) inspectClientFormDirectory(event.currentTarget.value.trim()); };
$('#delete-client').onclick = deleteCurrentClient;
$$('.client-modal-close').forEach(item => item.onclick = closeClientManager);
$$('.client-editor-close').forEach(item => item.onclick = closeClientEditor);
$('#client-modal').onclick = event => { if (event.target === $('#client-modal')) closeClientManager(); };
$('#client-editor-modal').onclick = event => { if (event.target === $('#client-editor-modal')) closeClientEditor(); };
$('#probe-button').onclick = probeEnvironment;
$('#clear-logs').onclick = () => { logs = []; renderLogs(); };
$('#settings-button').onclick = () => goTo('settings');
$('#theme-button').onclick = () => { document.body.classList.toggle('dark'); try { localStorage.setItem('eas-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {} };
$$('.nav-item').forEach(item => item.onclick = () => goTo(item.dataset.page));
$$('#account-modal .modal-close').forEach(item => item.onclick = closeAccountModal);
$('#delete-account').onclick = deleteCurrentAccount;
$('#datacenter-form').onsubmit = addManualDatacenter;
$$('.datacenter-modal-close').forEach(item => item.onclick = closeDatacenterModal);
$('#datacenter-modal').onclick = event => { if (event.target === $('#datacenter-modal')) closeDatacenterModal(); };
$('#account-modal').onclick = event => { if (event.target === $('#account-modal')) closeAccountModal(); };
$('#save-settings').onclick = async () => {
  appConfig.global.startup_timeout_seconds = Number($('#startup-timeout').value);
  appConfig.global.login_timeout_seconds = Number($('#login-timeout').value);
  appConfig.global.retry_count = Number($('#retry-count').value);
  appConfig.global.poll_interval_seconds = Number($('#poll-interval').value);
  appConfig.global.continue_on_error = $('#continue-on-error').checked;
  const result = await persistConfig(); if (!result.valid) return toast(result.errors[0]);
  await probeEnvironment(); updateReadiness(); toast('设置已保存');
};

async function boot() {
  try {
    try { document.body.classList.toggle('dark', localStorage.getItem('eas-theme') === 'dark'); } catch {}
    renderLogs(); await loadConfig(); window.easDesktop.onTaskEvent(handleTaskEvent);
    const saved = (() => { try { return localStorage.getItem('eas-active-page'); } catch { return null; } })();
    if (['dashboard','environment','logs','settings'].includes(saved)) goTo(saved);
    await probeEnvironment();
  } catch (error) { console.error(error); addLog('WARN', `初始化失败：${error.message}`); toast(`初始化失败：${error.message}`); }
  finally { window.__easRpaReady = true; }
}

boot();
