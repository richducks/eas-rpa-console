# EAS 自动登录中心

当前源码版本为 **0.24.0**。这是 EAS Cloud 多账号自动登录控制台。自 0.24.0 起 Windows / Linux 共用同一套业务代码，操作系统差异统一收敛到 `src/platform` 平台适配层。

![EAS 自动登录中心界面](docs/screenshots/latest-ui.png)

## 目录结构

| 目录 | 内容 |
|---|---|
| `src` | Electron 主进程、界面、自动化与核心逻辑 |
| `src/platform` | Windows / Linux / macOS 平台策略适配层，业务代码不直接判断操作系统 |
| `tests` | Node.js 自动化测试 |
| `scripts` | Web 版构建脚本 |
| `build` | 图标、Java 辅助工具和构建资源 |
| `skill/eascloud-ubuntu-rpa` | EAS Cloud Ubuntu RPA Skill |
| `docs/screenshots` | 当前界面截图 |
| `docs/PROJECT_MIGRATION.md` | 从原 `kingdee-eas` 工作区迁移到独立仓库的版本整理说明 |
| `dist` | 构建产物；仅分发已验证的对应平台版本 |

## 最新发布包

Ubuntu 版本已在本机完成构建：

- Ubuntu 免安装：`dist/EAS-RPA-Console-0.24.0-x86_64.AppImage`
- Ubuntu/Debian 安装包：`dist/EAS-RPA-Console-0.24.0-amd64.deb`

Windows 与 macOS 包必须分别在 Windows、macOS 上构建。不要分发在 Ubuntu 上交叉构建的包：`keytar` 是原生凭据模块，交叉构建时可能混入错误平台二进制。0.24.0 已把 Windows 0.21.2 的 DPAPI、`client.bat`、Windows 进程树和 Java Swing Agent 能力纳入统一主线；Windows 0.24.0 仍应在 Windows 主机原生构建并做一次实机登录回归。macOS 目前只复用 POSIX 启动和 Keychain/keytar 基础能力，不宣称已经完成 EAS 实机自动登录验证。

AppImage 可直接双击运行。如当前系统未启用 FUSE，建议安装 `.deb` 包。

## 开发与构建

```bash
npm ci
npm start
```

```bash
npm run build:linux
npm run build:windows
npm run build:mac
npm run build:web
```

请在目标操作系统分别执行对应命令；构建脚本会拒绝在错误系统上交叉打包。分别使用 x64 Windows、x64/Apple Silicon macOS 主机，并检查包内 `keytar.node` 的平台格式，再在该系统实机安装验证。分发 macOS 版本前还需要 Apple Developer ID 签名与公证。

构建过程会重新生成展开目录和中间文件；请勿将 `dist/unverified-cross-builds` 中的旧交叉构建文件发给别人。

## 跨平台代码结构

- `src/platform/index.js` 是唯一直接读取 `process.platform` 的位置。
- `src/core/*` 负责配置、账号、运行状态机、数据中心探测和登录逻辑，只消费平台适配器提供的策略。
- Windows：`client.bat` + `cmd.exe`、DPAPI、PowerShell/CIM 进程树、Java Swing Agent。
- Linux：`client.sh` / `.desktop`、Keyring/Secret Service、`/proc` 进程树、X11/AT-SPI + Java Swing Agent。
- macOS：保留 Electron 构建和 POSIX/Keychain 适配入口，但在完成 EAS 客户端实机验证前视为实验支持。

## 当前能力

- 运行中心与串行登录任务。
- 账号启用、停用与添加。
- Linux X11/Wayland 与 Windows 会话、窗口工具、AT-SPI、Secret Service/DPAPI 和启动器的真实探测。
- Linux `.desktop` 与 Windows `client.bat` 启动路径解析及自动化能力矩阵。
- 启动器、超时和失败策略的 YAML 持久化。
- Linux 使用 Keyring/Secret Service，Windows 使用当前用户 DPAPI 加密凭据；配置和日志不保存明文密码。
- 以参数数组启动客户端，不经过 shell 或桌面图标双击。
- 按 run ID、账号 ID 和 PID 记录任务创建的进程。
- 使用 PID、窗口标题和 AT-SPI 识别登录窗口。
- 安全停止仅作用于当前任务明确持有的进程。
- 实时活动、脱敏日志与明暗主题。

## 安全说明

Linux 密码通过系统 Keyring/Secret Service 读取；Windows 密码使用当前用户作用域的 DPAPI 加密存储。配置、日志及界面中不保存明文密码。

运行时配置与日志通常位于 `~/.config/eascloud-rpa-console/`。仓库中的 `config.example.yaml` 仅含虚构示例。

## 历史版本

已从旧发布包与 Windows 测试快照中恢复历史版本。Git 中保留 `v0.13.0` 至 `v0.23.0` 的可证明历史版本，其中 `v0.21.2-windows-test` 为独立 Windows 实机测试快照；`v0.24.0` 为跨平台适配层重构后的当前主线。

恢复版本的证据、分支设计和本地发布包归档位置见 [`docs/RECOVERED_HISTORY.md`](docs/RECOVERED_HISTORY.md)。

用户提供的 Windows 0.21.2 正式安装包静态解包与源码一致性校验见 [`docs/WINDOWS_0.21.2_INSTALLER_ANALYSIS.md`](docs/WINDOWS_0.21.2_INSTALLER_ANALYSIS.md)。

```bash
git tag --list --sort=version:refname
git log --oneline --decorate history/recovered-release-snapshots
```

## 测试

```bash
npm test
npm run check
```
