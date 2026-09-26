const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { findLoginWindow } = require('./windows');

const execFileAsync = promisify(execFile);
const encode = value => Buffer.from(String(value), 'utf8').toString('base64');

async function automateLogin({ pid, account, password, spec, environment, config, helperJar, agentJar, isCancelled }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-login-'));
  const controlPath = path.join(temporaryDirectory, 'control.txt');
  const outputPath = path.join(temporaryDirectory, 'result.txt');
  try {
    fs.writeFileSync(controlPath, ['LOGIN', encode(outputPath), encode(account.data_center), encode(account.username), encode(password)].join('\n'), { mode: 0o600 });
    const javaHome = path.resolve(spec.workingDirectory, '..', '..', 'clientjdk');
    await execFileAsync(path.join(javaHome, 'bin', 'java'), ['-cp', `${helperJar}:${path.join(javaHome, 'lib', 'tools.jar')}`, 'easrpa.AttachHelper', String(pid), agentJar, controlPath], { timeout: 15000, maxBuffer: 64 * 1024 });
    const result = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
    if (result !== 'SUBMITTED') throw Object.assign(new Error('EAS 登录表单填写失败'), { code: result.startsWith('ERROR:') ? result.slice(6) : 'LOGIN_AUTOMATION_FAILED' });
    const deadline = Date.now() + config.global.login_timeout_seconds * 1000;
    while (Date.now() < deadline) {
      if (isCancelled?.()) throw Object.assign(new Error('任务已停止'), { code: 'TASK_CANCELLED' });
      const loginWindow = await findLoginWindow({ pid, title: config.ui.login_window_title, sessionType: environment.session.type, tools: environment.tools });
      if (!loginWindow) return { backend: 'java-swing-agent' };
      await new Promise(resolve => setTimeout(resolve, config.global.poll_interval_seconds * 1000));
    }
    throw Object.assign(new Error('提交后登录窗口未关闭'), { code: 'LOGIN_VERIFY_TIMEOUT' });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { automateLogin };
