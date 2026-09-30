const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { automateLogin } = require('../src/core/login-automation');

test('登录表单尚未加载时持续重试，加载完成后填写并提交', async () => {
  let attempts = 0;
  const attachHelper = async (_java, args) => {
    const controlPath = args.at(-1);
    const lines = fs.readFileSync(controlPath, 'utf8').split(/\r?\n/);
    const outputPath = Buffer.from(lines[1], 'base64').toString('utf8');
    if (lines[0] === 'VERIFY_LOGIN') return fs.writeFileSync(outputPath, 'LOGIN_SUCCEEDED\n');
    attempts += 1;
    fs.writeFileSync(outputPath, attempts < 3 ? 'ERROR:DATACENTER_NOT_FOUND\n' : 'SUBMITTED\n');
  };
  const result = await automateLogin({
    pid: 123,
    account: { data_center: '生产中心', username: 'user' },
    password: 'secret',
    spec: { workingDirectory: 'C:\\EAS\\client\\bin' },
    environment: { session: { type: 'windows' }, tools: {} },
    config: { global: { startup_timeout_seconds: 2, login_timeout_seconds: 1, poll_interval_seconds: 0.01 }, ui: {} },
    helperJar: 'helper.jar',
    agentJar: 'agent.jar',
    attachHelper,
    wait: async () => {}
  });
  assert.equal(attempts, 3);
  assert.equal(result.backend, 'java-swing-agent');
});

test('EAS 返回密码错误时登录任务明确失败', async () => {
  const attachHelper = async (_java, args) => {
    const controlPath = args.at(-1);
    const lines = fs.readFileSync(controlPath, 'utf8').split(/\r?\n/);
    const outputPath = Buffer.from(lines[1], 'base64').toString('utf8');
    fs.writeFileSync(outputPath, lines[0] === 'VERIFY_LOGIN' ? 'ERROR:LOGIN_REJECTED\n' : 'SUBMITTED\n');
  };
  await assert.rejects(() => automateLogin({
    pid: 123,
    account: { data_center: '生产中心', username: 'user' },
    password: 'wrong',
    spec: { workingDirectory: 'C:\\EAS\\client\\bin' },
    environment: { session: { type: 'windows' }, tools: {} },
    config: { global: { startup_timeout_seconds: 2, login_timeout_seconds: 1, poll_interval_seconds: 0.01 }, ui: {} },
    helperJar: 'helper.jar', agentJar: 'agent.jar', attachHelper, wait: async () => {}
  }), error => error.code === 'LOGIN_REJECTED');
});
