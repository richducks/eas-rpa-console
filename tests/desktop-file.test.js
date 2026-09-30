const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenizeExec } = require('../src/core/desktop-file');

test('安全解析引号、转义与 Desktop 字段代码', () => {
  assert.deepEqual(tokenizeExec('"/opt/Kingdee EAS/start" --mode cloud %U --label "财务 中心"'), ['/opt/Kingdee EAS/start', '--mode', 'cloud', '--label', '财务 中心']);
  assert.deepEqual(tokenizeExec('/opt/eas/start --literal %%'), ['/opt/eas/start', '--literal', '%']);
});

test('拒绝不完整引号', () => {
  assert.throws(() => tokenizeExec('eas "broken'), /不完整/);
});
