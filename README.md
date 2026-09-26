# EAS 自动登录中心

当前版本为 **0.13.0**。这是根据 `eascloud-ubuntu-rpa` Skill 开发的 Electron 控制台，用于 EAS Cloud 多账号任务、运行环境检测、Keyring 凭据管理和安全的客户端启动。

![EAS 自动登录中心界面](docs/screenshots/latest-ui.png)

## 目录结构

| 目录 | 内容 |
|---|---|
| `src` | Electron 主进程、界面、自动化与核心逻辑 |
| `tests` | Node.js 自动化测试 |
| `scripts` | Web 版构建脚本 |
| `build` | 图标、Java 辅助工具和构建资源 |
| `skill/eascloud-ubuntu-rpa` | EAS Cloud Ubuntu RPA Skill |
| `docs/screenshots` | 当前界面截图 |
| `dist` | 仅保留最新版本的发布成品 |

## 发布包与个人配置

公开仓库不包含 `dist/`、`node_modules/`、运行日志、`config.yaml` 或真实凭据。使用者执行 `npm ci` 后可按下方命令自行构建。复制 `config.example.yaml` 为本机配置，并在界面或系统 Keyring 中录入自己的账号和密码。

## 开发与构建

```bash
npm ci
npm start
```

```bash
npm run build:linux
npm run build:windows
npm run build:web
```

构建过程会重新生成展开目录和中间文件；对外保存时仍应只保留最新版本的发布包。

## 当前能力

- 运行中心与串行登录任务。
- 账号启用、停用与添加。
- X11/Wayland、窗口工具、AT-SPI、Secret Service 和启动器的真实探测。
- `.desktop` 的 `Exec=` 安全解析及自动化能力矩阵。
- 启动器、超时和失败策略的 YAML 持久化。
- Keyring 凭据引用检查、写入和更新，不在界面或日志中保存明文密码。
- 以参数数组启动客户端，不经过 shell 或桌面图标双击。
- 按 run ID、账号 ID 和 PID 记录任务创建的进程。
- 使用 PID、窗口标题和 AT-SPI 识别登录窗口。
- 安全停止仅作用于当前任务明确持有的进程。
- 实时活动、脱敏日志与明暗主题。

## 安全说明

密码只通过系统 Keyring/Secret Service 读取。配置、日志及界面中不保存明文密码。

运行时配置与日志通常位于 `~/.config/eascloud-rpa-console/`。仓库中的 `config.example.yaml` 仅含虚构示例。

## 测试

```bash
npm test
npm run check
```
