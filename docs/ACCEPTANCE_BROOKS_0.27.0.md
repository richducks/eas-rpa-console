# 0.27.0 工程验收：Brooks 工程纪律

本轮只审工程系统，不评价 UI 是否好看。

## 1. 架构与边界

- [x] 客户端成为一等模型 `clients[]`，不再把多版本状态塞进一个全局 `launcher`。
- [x] 账号显式绑定 `client_id`；单账号运行使用账号绑定客户端。
- [x] 批量运行边界为 `clientId + dataCenter`，不允许只按数据中心筛选。
- [x] 数据中心保存、缓存回退和账号回退均限定在客户端边界内。
- [x] 平台差异仍只在 `src/platform/*`；`process.platform` 只出现在平台入口。
- [x] 客户端目录/版本探测集中在 `client-inspector`，配置迁移集中在 `client-registry/config`，renderer 不承担文件系统规则。

## 2. 复杂度控制

- [x] 公共启动逻辑只增加 `client -> launch spec` 投影，没有复制 Windows/Linux 启动流程。
- [x] 版本识别为 best-effort；证据不足进入兼容模式，不扩展脆弱的版本特判矩阵。
- [x] UI 管理、配置归一化、目录探测、运行协调分别有明确职责。
- [x] 旧单客户端字段从新标准配置中移除，避免长期维护两套写模型。

## 3. 失败恢复

- [x] 旧配置迁移前保留 `config.yaml.pre-multi-client.bak`。
- [x] 迁移主文件使用原子写入；迁移写盘失败不阻断内存兼容读取。
- [x] 配置损坏仍可回退最近一次有效备份。
- [x] 账号绑定的客户端不存在时，在启动任何 EAS 进程前失败。
- [x] 删除仍有账号引用的客户端被拒绝。
- [x] 登录失败仍按 runId 回收本次运行持有的全部进程；凭据在 finally 中清空。
- [x] 仅显式瞬时错误进入有上限的重试；未知错误不重试。

## 4. 可维护性与自动验证

- [x] `npm test`：40 项，39 通过，0 失败；Ubuntu 仅跳过 Windows DPAPI 实机项。
- [x] `npm run check`：主进程、renderer、platform、core，包括新增 `client-registry` / `client-inspector` 全部通过。
- [x] `npm run acceptance`：领域边界、迁移、客户端隔离、产品结构和响应式约束通过。
- [x] `npm audit --omit=dev --audit-level=high`：0 vulnerabilities。
- [x] `git diff --check`：通过。

## 5. 关键回归用例

- [x] 旧单客户端配置迁移后账号数量与数据中心不丢失。
- [x] 迁移首次写盘会生成独立迁移前备份。
- [x] 两个客户端拥有同名/不同数据中心时不会串线。
- [x] Windows `client.bat` 与 Linux `client.sh` 使用同一客户端领域模型。
- [x] 无可靠版本信息的 EAS 目录可正常进入兼容模式。
- [x] XML `version="1.0"` 等非产品版本信息不会被误判为 EAS 1.0。

结论：工程轮通过后才进入产品轮；产品轮的视觉取舍不反向破坏以上边界。
