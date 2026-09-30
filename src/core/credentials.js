const { currentPlatform } = require('../platform');

function credentialStore(platform) {
  if (!platform?.credentials) throw Object.assign(new Error('当前平台未提供凭据存储实现'), { code: 'CREDENTIAL_BACKEND_UNAVAILABLE' });
  return platform.credentials;
}

async function checkCredentialReference(service, key, platform = currentPlatform) {
  return credentialStore(platform).check(service, key);
}

async function getCredential(service, key, platform = currentPlatform) {
  return credentialStore(platform).get(service, key);
}

async function storeCredential(service, key, password, label = 'EAS RPA credential', platform = currentPlatform) {
  return credentialStore(platform).store(service, key, password, label);
}

async function deleteCredential(service, key, platform = currentPlatform) {
  return credentialStore(platform).delete(service, key);
}

module.exports = { checkCredentialReference, getCredential, storeCredential, deleteCredential };
