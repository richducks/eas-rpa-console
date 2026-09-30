const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWmctrl, waitForLoginWindow } = require('../src/core/windows');

test('只匹配属于目标 PID 且标题正确的窗口', () => {
  const output = '0x01  0  120 host 其他窗口\n0x02  0  456 host 金蝶EAS Cloud系统登录\n';
  assert.equal(parseWmctrl(output, 120, '金蝶EAS Cloud系统登录'), null);
  assert.deepEqual(parseWmctrl(output, 456, '金蝶EAS Cloud系统登录'), { id: '0x02', pid: 456, title: '金蝶EAS Cloud系统登录', backend: 'wmctrl' });
});

test('窗口等待通过轮询的可观察条件完成', async () => {
  let attempts = 0;
  const result = await waitForLoginWindow({ pid: 88, title: '登录', timeoutMs: 300, pollIntervalMs: 5, isProcessAlive: () => true, findWindow: async () => ++attempts === 3 ? { id: '0x3', pid: 88, title: '登录' } : null });
  assert.equal(result.pid, 88);
  assert.equal(attempts, 3);
});

test('进程退出时窗口等待立即失败', async () => {
  await assert.rejects(() => waitForLoginWindow({ pid: 9, title: '登录', timeoutMs: 100, pollIntervalMs: 5, isProcessAlive: () => false, findWindow: async () => null }), error => error.code === 'PROCESS_EXITED_WHILE_WAITING_WINDOW');
});
