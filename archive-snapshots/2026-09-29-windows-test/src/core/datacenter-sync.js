const path = require('path');

function normalizeSource(value) {
  if (!value) return '';
  const normalized = path.normalize(String(value).trim());
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function planDatacenterSync({ previousSource, nextSource, existingCenters = [], nextCenters = [], accounts = [] }) {
  const centers = [...new Set(nextCenters.map(value => String(value || '').trim()).filter(Boolean))];
  const nextSet = new Set(centers);
  const oldCenters = [...new Set([...existingCenters, ...accounts.map(account => account.data_center)].filter(Boolean))];
  const sameSoftware = !previousSource || normalizeSource(previousSource) === normalizeSource(nextSource);
  const keptAccounts = sameSoftware ? accounts.filter(account => nextSet.has(account.data_center)) : [];
  const keptIds = new Set(keptAccounts.map(account => account.id));
  return {
    sameSoftware,
    centers,
    keptAccounts,
    removedAccounts: accounts.filter(account => !keptIds.has(account.id)),
    addedCenters: centers.filter(center => !oldCenters.includes(center)),
    removedCenters: oldCenters.filter(center => !nextSet.has(center))
  };
}

module.exports = { normalizeSource, planDatacenterSync };
