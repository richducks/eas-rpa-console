const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

function windowsCredentialPath(service, key) {
  const root = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const name = crypto.createHash('sha256').update(`${service}\0${key}`).digest('hex');
  return path.join(root, 'eascloud-rpa-console', 'credentials', `${name}.bin`);
}

function runPowerShell(script, input = null, environment = {}) {
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...environment }
    });
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { errorOutput += chunk.toString('utf8'); });
    child.once('error', error => resolve({ ok: false, output: '', error: error.code || 'POWERSHELL_START_FAILED' }));
    child.once('exit', code => resolve({ ok: code === 0, output, error: code === 0 ? null : errorOutput.trim() }));
    child.stdin.on('error', () => {});
    child.stdin.end(input == null ? '' : input);
  });
}

async function getWindowsCredential(service, key) {
  const file = windowsCredentialPath(service, key);
  if (!fs.existsSync(file)) return { available: false, code: 'CREDENTIAL_MISSING' };
  const script = 'Add-Type -AssemblyName System.Security;$b=[IO.File]::ReadAllBytes($env:EAS_RPA_CREDENTIAL_FILE);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))';
  const result = await runPowerShell(script, null, { EAS_RPA_CREDENTIAL_FILE: file });
  return result.ok ? { available: true, password: result.output, backend: 'windows-dpapi' } : { available: false, code: 'CREDENTIAL_READ_FAILED' };
}

async function storeWindowsCredential(service, key, password) {
  const file = windowsCredentialPath(service, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const script = 'Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($s);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes($env:EAS_RPA_CREDENTIAL_FILE,$p)';
  const result = await runPowerShell(script, password, { EAS_RPA_CREDENTIAL_FILE: file });
  return { stored: result.ok, code: result.ok ? 'CREDENTIAL_STORED' : 'CREDENTIAL_STORE_FAILED', backend: 'windows-dpapi' };
}

function loadKeytar() {
  try { return require('keytar'); } catch { return null; }
}

async function checkCredentialReference(service, key) {
  if (process.platform === 'win32') {
    const result = await getWindowsCredential(service, key);
    if (result.available) result.password = null;
    return result;
  }
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
  if (process.platform === 'win32') return getWindowsCredential(service, key);
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
  if (process.platform === 'win32') return storeWindowsCredential(service, key, password);
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
  if (process.platform === 'win32') {
    const file = windowsCredentialPath(service, key);
    if (!fs.existsSync(file)) return { deleted: false, code: 'CREDENTIAL_MISSING' };
    try { fs.unlinkSync(file); return { deleted: true, code: 'CREDENTIAL_DELETED' }; }
    catch { return { deleted: false, code: 'CREDENTIAL_DELETE_FAILED' }; }
  }
  const keytar = loadKeytar();
  if (keytar) {
    try { return { deleted: await keytar.deletePassword(service, key), code: 'CREDENTIAL_DELETED' }; }
    catch { return { deleted: false, code: 'CREDENTIAL_DELETE_FAILED' }; }
  }
  return { deleted: false, code: 'KEYRING_UNAVAILABLE' };
}

module.exports = { checkCredentialReference, getCredential, storeCredential, deleteCredential };
