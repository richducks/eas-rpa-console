const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { findLoginWindow } = require('./windowing');
const { currentPlatform } = require('../platform');

const execFileAsync = promisify(execFile);
const encode = value => Buffer.from(String(value), 'utf8').toString('base64');
const TRANSIENT_FORM_ERRORS = new Set([
  'LOGIN_AUTOMATION_FAILED',
  'DATACENTER_NOT_FOUND',
  'COMBO_NOT_FOUND',
  'USERNAME_FIELD_NOT_FOUND',
  'PASSWORD_FIELD_NOT_FOUND',
  'LOGIN_BUTTON_NOT_FOUND'
]);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function automateLogin({ pid, account, password, spec, environment, config, helperJar, agentJar, isCancelled, attachHelper = execFileAsync, wait = sleep, platform = currentPlatform }) {
  const isWindows = platform.isWindows || environment?.session?.type === 'windows';
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-rpa-login-'));
  const controlPath = path.join(temporaryDirectory, 'control.txt');
  const outputPath = path.join(temporaryDirectory, 'result.txt');
  try {
    const javaHome = path.resolve(spec.workingDirectory, '..', '..', 'clientjdk');
    const javaExecutable = path.join(javaHome, 'bin', isWindows ? 'java.exe' : platform.javaExecutableName);
    const classPath = [helperJar, path.join(javaHome, 'lib', 'tools.jar')].join(isWindows ? ';' : platform.classPathDelimiter);
    const deadline = Date.now() + config.global.startup_timeout_seconds * 1000;
    let errorCode = 'LOGIN_AUTOMATION_FAILED';
    while (Date.now() < deadline) {
      if (isCancelled?.()) throw Object.assign(new Error('任务已停止'), { code: 'TASK_CANCELLED' });
      fs.writeFileSync(controlPath, ['LOGIN', encode(outputPath), encode(account.data_center), encode(account.username), encode(password)].join('\n'), { mode: 0o600 });
      try {
        await attachHelper(javaExecutable, ['-cp', classPath, 'easrpa.AttachHelper', String(pid), agentJar, controlPath], { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true });
        const result = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
        if (result === 'SUBMITTED') break;
        errorCode = result.startsWith('ERROR:') ? result.slice(6) : 'LOGIN_AUTOMATION_FAILED';
        if (!TRANSIENT_FORM_ERRORS.has(errorCode)) throw Object.assign(new Error('EAS 登录表单填写失败'), { code: errorCode, permanent: true });
      } catch (error) {
        if (error.permanent) throw error;
        errorCode = error.code || 'LOGIN_AGENT_ATTACH_FAILED';
      }
      await wait(Math.max(250, config.global.poll_interval_seconds * 1000));
    }
    const result = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
    if (result !== 'SUBMITTED') throw Object.assign(new Error('等待 EAS 登录表单加载超时'), { code: errorCode });
    const verifyDeadline = Date.now() + config.global.login_timeout_seconds * 1000;
    if (isWindows) {
      while (Date.now() < verifyDeadline) {
        if (isCancelled?.()) throw Object.assign(new Error('任务已停止'), { code: 'TASK_CANCELLED' });
        fs.writeFileSync(controlPath, ['VERIFY_LOGIN', encode(outputPath)].join('\n'), { mode: 0o600 });
        try {
          await attachHelper(javaExecutable, ['-cp', classPath, 'easrpa.AttachHelper', String(pid), agentJar, controlPath], { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true });
          const verification = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
          if (verification === 'LOGIN_SUCCEEDED') return { backend: 'java-swing-agent' };
          if (verification === 'ERROR:LOGIN_REJECTED') throw Object.assign(new Error('EAS 提示账号或密码错误，请修改密码后重试'), { code: 'LOGIN_REJECTED', permanent: true });
        } catch (error) {
          if (error.permanent) throw error;
        }
        await wait(Math.max(500, config.global.poll_interval_seconds * 1000));
      }
      throw Object.assign(new Error('提交后登录窗口仍未关闭，请检查账号密码或客户端提示'), { code: 'LOGIN_VERIFY_TIMEOUT' });
    }
    while (Date.now() < verifyDeadline) {
      if (isCancelled?.()) throw Object.assign(new Error('任务已停止'), { code: 'TASK_CANCELLED' });
      const loginWindow = await findLoginWindow({ pid, title: config.ui.login_window_title, sessionType: environment.session.type, tools: environment.tools, platform });
      if (!loginWindow) return { backend: 'java-swing-agent' };
      await new Promise(resolve => setTimeout(resolve, config.global.poll_interval_seconds * 1000));
    }
    throw Object.assign(new Error('提交后登录窗口未关闭'), { code: 'LOGIN_VERIFY_TIMEOUT' });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = { automateLogin, TRANSIENT_FORM_ERRORS };
