const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { collectDescendants } = require('./shared');

const execFileAsync = promisify(execFile);

function createWindowsCredentialStore(environment) {
  const credentialPath = (service, key) => {
    const root = environment.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const name = crypto.createHash('sha256').update(`${service}\0${key}`).digest('hex');
    return path.join(root, 'eascloud-rpa-console', 'credentials', `${name}.bin`);
  };

  const runPowerShell = (script, input = null, extraEnvironment = {}) => new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...environment, ...extraEnvironment }
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

  const get = async (service, key) => {
    const file = credentialPath(service, key);
    if (!fs.existsSync(file)) return { available: false, code: 'CREDENTIAL_MISSING' };
    const script = 'Add-Type -AssemblyName System.Security;$b=[IO.File]::ReadAllBytes($env:EAS_RPA_CREDENTIAL_FILE);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))';
    const result = await runPowerShell(script, null, { EAS_RPA_CREDENTIAL_FILE: file });
    return result.ok ? { available: true, password: result.output, backend: 'windows-dpapi' } : { available: false, code: 'CREDENTIAL_READ_FAILED' };
  };

  return Object.freeze({
    async check(service, key) {
      const result = await get(service, key);
      if (result.available) result.password = null;
      return result;
    },
    get,
    async store(service, key, password) {
      if (typeof password !== 'string' || !password.length) return { stored: false, code: 'PASSWORD_REQUIRED' };
      const file = credentialPath(service, key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const script = 'Add-Type -AssemblyName System.Security;$s=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($s);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes($env:EAS_RPA_CREDENTIAL_FILE,$p)';
      const result = await runPowerShell(script, password, { EAS_RPA_CREDENTIAL_FILE: file });
      return { stored: result.ok, code: result.ok ? 'CREDENTIAL_STORED' : 'CREDENTIAL_STORE_FAILED', backend: 'windows-dpapi' };
    },
    async delete(service, key) {
      const file = credentialPath(service, key);
      if (!fs.existsSync(file)) return { deleted: false, code: 'CREDENTIAL_MISSING' };
      try { fs.unlinkSync(file); return { deleted: true, code: 'CREDENTIAL_DELETED', backend: 'windows-dpapi' }; }
      catch { return { deleted: false, code: 'CREDENTIAL_DELETE_FAILED', backend: 'windows-dpapi' }; }
    }
  });
}

function createWindowsAdapter({ rawPlatform = 'win32', environment = process.env } = {}) {
  return {
    rawPlatform,
    id: 'windows',
    isWindows: true,
    isLinux: false,
    isMac: false,
    defaultDesktopFile: null,
    defaultClientDirectory: 'D:\\Kingdee\\eas',
    startupScriptName: 'client.bat',
    javaExecutableName: 'java.exe',
    classPathDelimiter: ';',
    sessionType: 'windows',
    supportsAtspi: false,
    environmentCommands: ['powershell.exe', 'cmd.exe', 'java.exe'],
    launcherFilter: { name: 'Windows 启动器', extensions: ['bat', 'cmd', 'exe'] },
    shouldQuitOnAllWindowsClosed: true,
    loginVerificationMode: 'agent',
    credentials: createWindowsCredentialStore(environment),
    commandProbe(command) { return { executable: environment.ComSpec || 'cmd.exe', args: ['/d', '/c', 'where', command] }; },
    wrapStartupScript(startupScript) { return { executable: environment.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'call', startupScript] }; },
    async commandExists(command) {
      const probe = this.commandProbe(command);
      try { await execFileAsync(probe.executable, probe.args, { timeout: 2500, windowsHide: true }); return true; } catch { return false; }
    },
    async detectSession() { return { type: 'windows', evidence: { sessionName: environment.SESSIONNAME || null } }; },
    async probeAccessibility() { return { dogtail: false, atspi: false }; },
    describeCapabilities({ launcher }) {
      return [
        { id: 'process', name: 'EAS 启动', available: launcher.parsed, status: launcher.parsed ? '可用' : '需配置', detail: launcher.error || 'Windows 启动命令已准备' },
        { id: 'window', name: '登录窗口', available: launcher.parsed, status: launcher.parsed ? 'Java Agent 可用' : '等待客户端', detail: '使用 EAS Java/Swing Agent 定位并操作登录界面' },
        { id: 'credential', name: '密码保护', available: true, status: 'DPAPI', detail: '密码使用当前 Windows 用户作用域 DPAPI 加密' }
      ];
    },
    async findLoginWindow({ pid, title }) { return { id: null, pid: Number(pid), title: title || '', backend: 'java-swing-agent' }; },
    stopProcess({ pid }) {
      try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }); return { stopped: true, code: 'STOP_SIGNAL_SENT' }; }
      catch { return { stopped: false, code: 'PROCESS_STOP_FAILED' }; }
    },
    descendants(rootPid) {
      const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
      let parsed;
      try {
        const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        parsed = JSON.parse(output || '[]');
      } catch { return []; }
      const rows = (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({ pid: Number(row.ProcessId), ppid: Number(row.ParentProcessId), command: String(row.CommandLine || '') }));
      return collectDescendants(rows, rootPid);
    }
  };
}

module.exports = { createWindowsAdapter };
