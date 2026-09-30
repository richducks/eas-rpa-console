const RETRYABLE_CODES = new Set([
  'PROCESS_EXITED',
  'PROCESS_START_TIMEOUT',
  'EAS_JAVA_PROCESS_TIMEOUT',
  'LOGIN_WINDOW_TIMEOUT',
  'LOGIN_AUTOMATION_FAILED',
  'LOGIN_AGENT_ATTACH_FAILED',
  'DATACENTER_NOT_FOUND',
  'COMBO_NOT_FOUND',
  'USERNAME_FIELD_NOT_FOUND',
  'PASSWORD_FIELD_NOT_FOUND',
  'LOGIN_BUTTON_NOT_FOUND',
  'LOGIN_VERIFY_TIMEOUT'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function configForAccount(config, accountId) {
  const isolated = clone(config);
  isolated.accounts.forEach(account => { account.enabled = account.id === accountId; });
  return isolated;
}

function shouldRetry(result, attempt, retryCount) {
  return result?.status === 'FAILED' && attempt <= retryCount && RETRYABLE_CODES.has(result.errorCode);
}

class RunCoordinator {
  constructor(runner) {
    this.runner = runner;
  }

  async executeAccount(config, account) {
    const retryCount = Number.isInteger(config.global?.retry_count) ? config.global.retry_count : 0;
    let attempt = 0;
    let result;
    do {
      attempt += 1;
      result = await this.runner.run(configForAccount(config, account.id));
    } while (shouldRetry(result, attempt, retryCount));
    return { ...result, attempts: attempt };
  }

  async runDataCenter(config, dataCenter) {
    if (typeof dataCenter !== 'string' || !dataCenter.trim()) return { status: 'FAILED', succeeded: 0, total: 0, message: '未选择数据中心', results: [] };
    const accounts = config.accounts.filter(account => account.enabled && account.data_center === dataCenter);
    if (!accounts.length) return { status: 'FAILED', succeeded: 0, total: 0, message: '当前数据中心没有启用账号', results: [] };
    const results = [];
    for (const account of accounts) {
      const result = await this.executeAccount(config, account);
      results.push(result);
      if (result.status !== 'SUCCESS' && !config.global.continue_on_error) break;
      if (result.status === 'STOPPED') break;
    }
    const succeeded = results.filter(result => result.status === 'SUCCESS').length;
    const status = succeeded === accounts.length ? 'SUCCESS' : succeeded ? 'PARTIAL' : results.some(result => result.status === 'STOPPED') ? 'STOPPED' : 'FAILED';
    return { status, succeeded, total: accounts.length, results, message: status === 'SUCCESS' ? `登录完成：${succeeded}/${accounts.length}` : `登录结束：${succeeded}/${accounts.length} 成功` };
  }

  async runAccount(config, accountId) {
    const account = typeof accountId === 'string' ? config.accounts.find(item => item.id === accountId) : null;
    if (!account) return { status: 'FAILED', succeeded: 0, total: 0, message: '账号不存在', results: [] };
    const result = await this.executeAccount(config, account);
    return { status: result.status, succeeded: result.status === 'SUCCESS' ? 1 : 0, total: 1, message: result.message, results: [result] };
  }
}

module.exports = { RunCoordinator, configForAccount, shouldRetry, RETRYABLE_CODES };
