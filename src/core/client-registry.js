const { currentPlatform } = require('../platform');

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizeClient(client = {}, index = 0) {
  return {
    id: String(client.id || '').trim(),
    remark: String(client.remark || client.name || `EAS 客户端 ${index + 1}`).trim(),
    client_directory: client.client_directory == null ? null : String(client.client_directory).trim() || null,
    desktop_file: client.desktop_file == null ? null : String(client.desktop_file).trim() || null,
    command: Array.isArray(client.command) ? [...client.command] : null,
    working_directory: client.working_directory == null ? null : String(client.working_directory).trim() || null,
    detected_version: client.detected_version == null ? null : String(client.detected_version).trim() || null,
    data_centers: uniqueStrings(client.data_centers)
  };
}

function legacyClientFromConfig(config = {}, accounts = [], platform = currentPlatform) {
  const launcher = config.launcher && typeof config.launcher === 'object' ? config.launcher : {};
  const oldCenters = uniqueStrings(config.ui?.data_centers);
  const meaningfulDesktop = launcher.desktop_file && launcher.desktop_file !== platform.defaultDesktopFile;
  const hasLegacy = Boolean(launcher.client_directory || launcher.command || launcher.working_directory || meaningfulDesktop || oldCenters.length || accounts.length);
  if (!hasLegacy) return null;
  return normalizeClient({
    id: 'legacy-default',
    remark: '原有 EAS 客户端',
    client_directory: launcher.client_directory || null,
    desktop_file: launcher.desktop_file || null,
    command: launcher.command || null,
    working_directory: launcher.working_directory || null,
    data_centers: oldCenters
  });
}

function normalizeClients(config = {}, platform = currentPlatform) {
  const sourceAccounts = Array.isArray(config.accounts) ? config.accounts : [];
  let clients = Array.isArray(config.clients) ? config.clients.map(normalizeClient) : [];
  if (!clients.length) {
    const migrated = legacyClientFromConfig(config, sourceAccounts, platform);
    if (migrated) clients = [migrated];
  }
  const ids = new Set(clients.map(client => client.id).filter(Boolean));
  const requestedActive = String(config.active_client_id || '').trim();
  const activeClientId = ids.has(requestedActive) ? requestedActive : clients[0]?.id || null;
  const accounts = sourceAccounts.map(account => ({
    ...account,
    client_id: String(account.client_id || '').trim() || activeClientId || null
  }));
  return { clients, activeClientId, accounts };
}

function getClient(config, clientId = null) {
  const clients = Array.isArray(config?.clients) ? config.clients : [];
  const id = String(clientId || config?.active_client_id || '').trim();
  return clients.find(client => client.id === id) || null;
}

function accountsForClient(config, clientId) {
  return (Array.isArray(config?.accounts) ? config.accounts : []).filter(account => account.client_id === clientId);
}

function dataCentersForClient(config, clientId) {
  const client = getClient(config, clientId);
  const accountCenters = accountsForClient(config, clientId).map(account => account.data_center);
  return uniqueStrings([...(client?.data_centers || []), ...accountCenters]);
}

module.exports = { normalizeClient, normalizeClients, getClient, accountsForClient, dataCentersForClient, uniqueStrings };
