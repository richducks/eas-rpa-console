# Windows 0.21.2 安装包分析

## 样本

用户提供的正式 Windows 安装包：

```text
EAS-RPA-Console-0.21.2-Setup-x64.exe
```

SHA-256：

```text
a6e089791e1703bb91f631716d9e604dc7472f44df39e228247e2857eec4c26d
```

## 解包结论

安装包为 Electron / NSIS 应用。只做静态解包，没有运行旧程序。

从安装包中提取到 `resources/app.asar` 和 `app.asar.unpacked`，运行时代码版本为：

```text
name    = eascloud-rpa-console
version = 0.21.2
```

核心运行时代码包含：

- `src/main.js`
- `src/preload.js`
- `src/core/*`
- `src/automation/*`
- `src/renderer/*`
- `build/java/attach-helper.jar`
- `build/java/datacenter-agent.jar`

## 与历史 Windows 快照校验

把安装包中 25 个核心源码 / Java 文件按“文件 SHA-256 + 相对路径”排序后再次计算组合哈希：

```text
4c70538dafc6c525a24f6dc0dd1b2673e984ae8be0dd4c1f9c1e8b544b527775
```

Git 分支 `history/windows-0.21.2` 排除开发辅助目录 `src/web-marker/*` 后得到完全相同的组合哈希。

因此可以确认：

1. 当前历史分支保存的 0.21.2 Windows 核心代码就是该正式安装包实际运行的代码。
2. 历史工作区额外存在 `src/web-marker/index.html`、`marker.css`、`marker.js` 三个开发辅助文件，但它们没有进入正式安装包。
3. Windows 0.21.2 的关键能力包括 DPAPI 凭据、`client.bat` 启动、PowerShell/CIM 进程树、Java Swing Agent 登录和 Windows 数据中心探测。

## 0.24.0 重构后的处理方式

0.21.2 不再作为一套独立 Windows 代码长期维护。其经过验证的 Windows 能力已经并入主线，并在 0.24.0 中进一步整理为统一平台适配结构：

```text
src/platform/index.js     # 唯一直接识别操作系统的平台策略层
src/core/*                # 跨平台业务逻辑
src/automation/*          # 共用 Java/Python 自动化能力
src/renderer/*            # 共用 UI
```

Windows / Linux 共享账号模型、配置、状态机、日志、数据中心发现和 Java Swing 自动化逻辑；只有启动器、凭据、进程树、窗口能力等操作系统差异由平台适配层控制。

这样后续功能只开发一次，不再维护“Windows 一套、Linux 一套”两条容易漂移的主线。
