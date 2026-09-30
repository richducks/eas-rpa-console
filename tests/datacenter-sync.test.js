const test = require('node:test');
const assert = require('node:assert/strict');
const { planDatacenterSync } = require('../src/core/datacenter-sync');

const accounts = [
  { id: 'keep', data_center: 'A' },
  { id: 'remove', data_center: 'OLD' }
];

test('同一客户端只增删变化的数据中心并保留相同中心账号', () => {
  const plan = planDatacenterSync({ previousSource: 'D:\\Kingdee\\eas\\client\\bin\\client.bat', nextSource: 'd:/Kingdee/eas/client/bin/client.bat', existingCenters: ['A', 'OLD'], nextCenters: ['A', 'B'], accounts });
  assert.equal(plan.sameSoftware, true);
  assert.deepEqual(plan.keptAccounts.map(item => item.id), ['keep']);
  assert.deepEqual(plan.removedAccounts.map(item => item.id), ['remove']);
  assert.deepEqual(plan.addedCenters, ['B']);
  assert.deepEqual(plan.removedCenters, ['OLD']);
});

test('切换客户端时清空旧账号，即使数据中心同名', () => {
  const plan = planDatacenterSync({ previousSource: 'D:\\Kingdee\\one\\client\\bin\\client.bat', nextSource: 'D:\\Kingdee\\two\\client\\bin\\client.bat', existingCenters: ['A'], nextCenters: ['A'], accounts });
  assert.equal(plan.sameSoftware, false);
  assert.equal(plan.keptAccounts.length, 0);
  assert.equal(plan.removedAccounts.length, 2);
});
