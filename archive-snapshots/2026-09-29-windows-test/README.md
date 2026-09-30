# EAS 自动登录中心

当前版本为 **0.20.0**。这是根据 `eascloud-ubuntu-rpa` Skill 开发的 Electron 控制台，用于 EAS Cloud 多账号任务、运行环境检测、Keyring 凭据管理和安全的客户端启动。

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
| `dist` | 构建产物；仅分发已验证的对应平台版本 |

## 最新发布包

Ubuntu 版本已在本机完成构建：

- Ubuntu 免安装：`dist/EAS-RPA-Console-0.20.0-x86_64.AppImage`
- Ubuntu/Debian 安装包：`dist/EAS-RPA-Console-0.20.0-amd64.deb`

Windows 与 macOS 包必须分别在 Windows、macOS 上构建。不要分发在 Ubuntu 上交叉构建的包：`keytar` 是原生凭据模块，交叉构建时可能混入 Linux 二进制文件。macOS 的 DMG 还需要在 macOS 上制作并签名/公证，才能避免 Gatekeeper 阻拦。当前自动登录的窗口控制也主要面向 Ubuntu，Windows/macOS 自动登录尚未完成适配与实机验证。

AppImage 可直接双击运行。如当前系统未启用 FUSE，建议安装 `.deb` 包。

## 开发与构建

```bash
npm install
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
