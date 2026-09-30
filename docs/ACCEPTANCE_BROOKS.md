# 工程验收：Brooks 式纪律

本轮只审工程系统，不评价界面是否“好看”。验收目标是：边界清楚、复杂度可控、失败可恢复、维护者能在不理解全部实现细节的情况下安全修改。

## 结论

**通过。** 当前主线版本：`0.26.0`。

## 验收清单

- [x] **架构边界**：`src/core/*` 只保留业务流程；Windows / Linux / macOS 的凭据、进程树、停止进程、会话和启动器实现位于 `src/platform/*`。
- [x] **平台判断集中**：直接读取 `process.platform` 的代码只允许存在于 `src/platform/index.js`。
- [x] **协调与执行分离**：`RunCoordinator` 负责账号隔离、批量顺序、重试策略；`FoundationRunner` 只执行单账号登录状态机。
- [x] **失败重试有界**：只对白名单中的瞬时错误重试；未知错误不重试；配置重试次数限制为 `0..3`。
- [x] **进程恢复完整**：失败和人工停止均按 `runId` 回收该次运行持有的全部进程，而不是只停最后一个 PID。
- [x] **凭据生命周期最小化**：密码读取后只在当前运行内存中存在；无论在哪个阶段失败，`finally` 都会清空引用。
- [x] **配置可恢复**：配置保存前保留最近一次有效备份；主配置损坏时自动恢复，并把恢复事实返回界面。
- [x] **首次配置无伪数据**：默认配置不再注入演示账号或演示数据中心。
- [x] **跨平台构建边界**：原生依赖仍要求在目标 OS 构建；Windows / Linux / macOS 共用同一业务源码。
- [x] **自动回归**：`npm test`、`npm run check`、`npm run acceptance` 三套检查相互独立。

## 本轮发现并修复的问题

1. **失败只停止最后一个 PID**：启动脚本或父进程可能残留。改为 `ProcessManager.stopRun(runId)`，按运行归属统一回收。
2. **密码清理路径不完整**：在进入自动化前失败时，密码引用会比必要时间更久。改为整个 `run()` 的外层 `finally` 清理。
3. **重试采用黑名单**：未知错误会被误当作可重试，可能把程序缺陷放大为重复操作。改为明确的 `RETRYABLE_CODES` 白名单。
4. **重试次数无上限**：配置错误可导致过长失败循环。限制为最多 3 次重试。
5. **批量逻辑堆在 Electron IPC**：主进程同时承担 UI 适配和业务协调。抽出 `RunCoordinator`。
6. **配置没有可验证恢复点**：新增有效备份和损坏恢复测试。
7. **旧 renderer CSS 多轮覆盖**：同一控件有 Bauhaus、macOS、compact 等多套规则连续覆盖。产品轮次中直接删除多重设计层，仅保留一套 token 和组件规则。

## 自动验收命令

```bash
npm ci
npm test
npm run check
npm run acceptance
```

其中 `npm run acceptance` 会额外阻止以下退化：

- `process.platform` 扩散到平台入口之外；
- PowerShell / `taskkill` / `secret-tool` / `/proc` / `loginctl` 泄漏回 `src/core`；
- renderer 重新出现独立的 Keyring 一级产品概念；
- CSS 再次出现多套 `:root` 设计变量互相覆盖；
- 重试策略退回“未知错误默认重试”；
- `stopRun(runId)` 被移除。

## 未伪装成已完成的事项

- Windows DPAPI 真正的加密读写测试只能在 Windows CI / Windows 实机执行；Ubuntu 本地测试会明确 `SKIP`。
- macOS 有平台适配与 CI，但 EAS 客户端自动登录仍需真实 macOS EAS 环境验收后才能宣称完整支持。
