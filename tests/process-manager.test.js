const test = require('node:test');
const assert = require('node:assert/strict');
const { ProcessManager } = require('../src/core/process-manager');

test('进程管理器把平台相关停止与进程树委托给适配器', () => {
  const calls = [];
  const platform = {
    stopProcess: ({ pid, child }) => { calls.push(['stop', pid, child]); return { stopped: true, code: 'STOP_SIGNAL_SENT' }; },
    descendants: rootPid => { calls.push(['descendants', rootPid]); return [{ pid: 22, ppid: rootPid, command: 'java' }]; }
  };
  const manager = new ProcessManager(platform);
  manager.registerOwnedPid(11, { runId: 'run-a', accountId: 'account-a' });
  assert.equal(manager.stopOwned(11, 'run-a').stopped, true);
  assert.deepEqual(manager.descendants(11), [{ pid: 22, ppid: 11, command: 'java' }]);
  assert.deepEqual(calls, [['stop', 11, null], ['descendants', 11]]);
});

test('仅停止由当前 run 启动并持有的进程', async () => {
  const manager = new ProcessManager();
  const record = manager.launch({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], workingDirectory: process.cwd() }, { runId: 'run-a', accountId: 'account-a' });
  await manager.waitUntilAlive(record, 1000);
  assert.equal(manager.stopOwned(record.pid, 'run-b').code, 'PROCESS_NOT_OWNED');
  assert.equal(manager.stopOwned(record.pid, 'run-a').stopped, true);
  await new Promise(resolve => record.child.once('exit', resolve));
  assert.equal(record.exited, true);
});
