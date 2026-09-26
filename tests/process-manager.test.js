const test = require('node:test');
const assert = require('node:assert/strict');
const { ProcessManager } = require('../src/core/process-manager');

test('仅停止由当前 run 启动并持有的进程', async () => {
  const manager = new ProcessManager();
  const record = manager.launch({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], workingDirectory: process.cwd() }, { runId: 'run-a', accountId: 'account-a' });
  await manager.waitUntilAlive(record, 1000);
  assert.equal(manager.stopOwned(record.pid, 'run-b').code, 'PROCESS_NOT_OWNED');
  assert.equal(manager.stopOwned(record.pid, 'run-a').stopped, true);
  await new Promise(resolve => record.child.once('exit', resolve));
  assert.equal(record.exited, true);
});
