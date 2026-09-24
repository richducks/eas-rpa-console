const { spawn } = require('child_process');

function loadKeytar() {
  try { return require('keytar'); } catch { return null; }
}

async function checkCredentialReference(service, key) {
  const keytar = loadKeytar();
  if (keytar) {
    try {
      const credential = await keytar.getPassword(service, key);
      return { available: credential !== null, code: credential !== null ? 'CREDENTIAL_AVAILABLE' : 'CREDENTIAL_MISSING', backend: 'keytar' };
    } catch { /* use command fallback when the native backend cannot connect */ }
  }
  return new Promise(resolve => {
    const child = spawn('secret-tool', ['lookup', 'service', service, 'account', key], { stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ available: false, code: 'CREDENTIAL_CHECK_TIMEOUT' }); }, 5000);
    child.once('error', error => { clearTimeout(timer); resolve({ available: false, code: error.code === 'ENOENT' ? 'SECRET_TOOL_UNAVAILABLE' : 'CREDENTIAL_CHECK_FAILED' }); });
    child.once('exit', code => { clearTimeout(timer); resolve({ available: code === 0, code: code === 0 ? 'CREDENTIAL_AVAILABLE' : 'CREDENTIAL_MISSING' }); });
  });
}

async function getCredential(service, key) {
  const keytar = loadKeytar();
  if (keytar) {
    try {
      const password = await keytar.getPassword(service, key);
      return password === null ? { available: false, code: 'CREDENTIAL_MISSING' } : { available: true, password, backend: 'keytar' };
    } catch { /* use command fallback */ }
  }
  return new Promise(resolve => {
    const child = spawn('secret-tool', ['lookup', 'service', service, 'account', key], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ available: false, code: 'CREDENTIAL_READ_TIMEOUT' }); }, 5000);
    child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
    child.once('error', error => finish({ available: false, code: error.code === 'ENOENT' ? 'SECRET_TOOL_UNAVAILABLE' : 'CREDENTIAL_READ_FAILED' }));
    child.once('exit', code => finish(code === 0 ? { available: true, password: output.replace(/\r?\n$/, ''), backend: 'secret-tool' } : { available: false, code: 'CREDENTIAL_MISSING' }));
  });
}

async function storeCredential(service, key, password, label = 'EAS RPA credential') {
  if (typeof password !== 'string' || !password.length) return { stored: false, code: 'PASSWORD_REQUIRED' };
  const keytar = loadKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(service, key, password);
      return { stored: true, code: 'CREDENTIAL_STORED', backend: 'keytar' };
    } catch { /* use command fallback when the native backend cannot connect */ }
  }
  return new Promise(resolve => {
    const child = spawn('secret-tool', ['store', `--label=${label}`, 'service', service, 'account', key], { stdio: ['pipe', 'ignore', 'ignore'] });
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ stored: false, code: 'CREDENTIAL_STORE_TIMEOUT' }); }, 15000);
    child.once('error', error => finish({ stored: false, code: error.code === 'ENOENT' ? 'SECRET_TOOL_UNAVAILABLE' : 'CREDENTIAL_STORE_FAILED' }));
    child.once('exit', code => finish({ stored: code === 0, code: code === 0 ? 'CREDENTIAL_STORED' : 'CREDENTIAL_STORE_FAILED' }));
    child.stdin.on('error', () => {});
    child.stdin.end(password);
  });
}

async function deleteCredential(service, key) {
  const keytar = loadKeytar();
  if (keytar) {
    try { return { deleted: await keytar.deletePassword(service, key), code: 'CREDENTIAL_DELETED' }; }
    catch { return { deleted: false, code: 'CREDENTIAL_DELETE_FAILED' }; }
  }
  return { deleted: false, code: 'KEYRING_UNAVAILABLE' };
}

module.exports = { checkCredentialReference, getCredential, storeCredential, deleteCredential };
