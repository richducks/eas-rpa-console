const { spawn } = require('child_process');

function collectDescendants(rows, rootPid) {
  const result = [];
  const parents = new Set([Number(rootPid)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (parents.has(row.ppid) && !parents.has(row.pid)) {
        parents.add(row.pid);
        result.push(row);
        changed = true;
      }
    }
  }
  return result;
}

function loadKeytar() {
  try { return require('keytar'); } catch { return null; }
}

function runSecretTool(args, { input = null, capture = false, timeoutMs = 5000 } = {}) {
  return new Promise(resolve => {
    const child = spawn('secret-tool', args, { stdio: [input == null ? 'ignore' : 'pipe', capture ? 'pipe' : 'ignore', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ ok: false, code: 'TIMEOUT', output }); }, timeoutMs);
    if (capture) child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
    child.once('error', error => finish({ ok: false, code: error.code === 'ENOENT' ? 'UNAVAILABLE' : 'FAILED', output }));
    child.once('exit', code => finish({ ok: code === 0, code: code === 0 ? 'OK' : 'NOT_FOUND', output }));
    if (input != null) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

function createKeyringCredentialStore({ allowSecretTool = false } = {}) {
  return Object.freeze({
    async check(service, key) {
      const keytar = loadKeytar();
      if (keytar) {
        try {
          const credential = await keytar.getPassword(service, key);
          return { available: credential !== null, code: credential !== null ? 'CREDENTIAL_AVAILABLE' : 'CREDENTIAL_MISSING', backend: 'keytar' };
        } catch { /* fall through */ }
      }
      if (!allowSecretTool) return { available: false, code: 'KEYRING_UNAVAILABLE' };
      const result = await runSecretTool(['lookup', 'service', service, 'account', key]);
      return result.ok
        ? { available: true, code: 'CREDENTIAL_AVAILABLE', backend: 'secret-tool' }
        : { available: false, code: result.code === 'UNAVAILABLE' ? 'SECRET_TOOL_UNAVAILABLE' : result.code === 'TIMEOUT' ? 'CREDENTIAL_CHECK_TIMEOUT' : 'CREDENTIAL_MISSING' };
    },

    async get(service, key) {
      const keytar = loadKeytar();
      if (keytar) {
        try {
          const password = await keytar.getPassword(service, key);
          return password === null ? { available: false, code: 'CREDENTIAL_MISSING' } : { available: true, password, backend: 'keytar' };
        } catch { /* fall through */ }
      }
      if (!allowSecretTool) return { available: false, code: 'KEYRING_UNAVAILABLE' };
      const result = await runSecretTool(['lookup', 'service', service, 'account', key], { capture: true });
      if (result.ok) return { available: true, password: result.output.replace(/\r?\n$/, ''), backend: 'secret-tool' };
      return { available: false, code: result.code === 'UNAVAILABLE' ? 'SECRET_TOOL_UNAVAILABLE' : result.code === 'TIMEOUT' ? 'CREDENTIAL_READ_TIMEOUT' : 'CREDENTIAL_MISSING' };
    },

    async store(service, key, password, label = 'EAS RPA credential') {
      if (typeof password !== 'string' || !password.length) return { stored: false, code: 'PASSWORD_REQUIRED' };
      const keytar = loadKeytar();
      if (keytar) {
        try {
          await keytar.setPassword(service, key, password);
          return { stored: true, code: 'CREDENTIAL_STORED', backend: 'keytar' };
        } catch { /* fall through */ }
      }
      if (!allowSecretTool) return { stored: false, code: 'KEYRING_UNAVAILABLE' };
      const result = await runSecretTool(['store', `--label=${label}`, 'service', service, 'account', key], { input: password, timeoutMs: 15000 });
      return { stored: result.ok, code: result.ok ? 'CREDENTIAL_STORED' : result.code === 'UNAVAILABLE' ? 'SECRET_TOOL_UNAVAILABLE' : result.code === 'TIMEOUT' ? 'CREDENTIAL_STORE_TIMEOUT' : 'CREDENTIAL_STORE_FAILED', backend: 'secret-tool' };
    },

    async delete(service, key) {
      const keytar = loadKeytar();
      if (keytar) {
        try {
          const deleted = await keytar.deletePassword(service, key);
          return { deleted, code: deleted ? 'CREDENTIAL_DELETED' : 'CREDENTIAL_MISSING', backend: 'keytar' };
        } catch { /* fall through */ }
      }
      if (!allowSecretTool) return { deleted: false, code: 'KEYRING_UNAVAILABLE' };
      const result = await runSecretTool(['clear', 'service', service, 'account', key]);
      return { deleted: result.ok, code: result.ok ? 'CREDENTIAL_DELETED' : result.code === 'UNAVAILABLE' ? 'SECRET_TOOL_UNAVAILABLE' : 'CREDENTIAL_MISSING', backend: 'secret-tool' };
    }
  });
}

function stopPosixProcess({ pid, child }) {
  try {
    if (child) child.kill('SIGTERM');
    else process.kill(pid, 'SIGTERM');
    return { stopped: true, code: 'STOP_SIGNAL_SENT' };
  } catch {
    return { stopped: false, code: 'PROCESS_STOP_FAILED' };
  }
}

module.exports = { collectDescendants, createKeyringCredentialStore, stopPosixProcess };
