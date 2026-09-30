# RPA 历史版本恢复说明

## 为什么需要恢复

2026-09-30 重新盘点 `/home/sducks/Documents/CodexProjects` 时发现，旧版 EAS RPA 发布包并未丢失，而是在 2026-09-29 项目整理时从原 `kingdee-eas/apps/eas-rpa-console/dist/` 移入了系统回收站。

这些文件已经恢复到当前独立项目的本地归档目录：

```text
artifacts/recovered-releases/
```

该目录受 `.gitignore` 保护，不直接提交到 Git；当前共恢复 27 个发布文件，约 2.2 GB。

## 已确认的版本

| 版本 | 可恢复证据 | Git 表示 |
|---|---|---|
| 0.13.0 | Deb、AppImage、Web ZIP、Windows Setup | `v0.13.0` |
| 0.14.0 | Deb、AppImage、Web ZIP | `v0.14.0` |
| 0.15.0 | Deb、AppImage、Web ZIP | `v0.15.0` |
| 0.16.0 | Deb、AppImage | `v0.16.0` |
| 0.17.0 | Deb、AppImage | `v0.17.0` |
| 0.18.0 | Deb、AppImage | `v0.18.0` |
| 0.19.0 | Deb、AppImage、Windows Setup | `v0.19.0` |
| 0.20.0 | Deb、AppImage、原 GitHub 正式源码 | 原有 `v0.20.0` |
| 0.21.0 | Deb、AppImage | `v0.21.0` |
| 0.21.2 | 2026-09-29 Windows 实机测试完整工作区快照 | `v0.21.2-windows-test` |
| 0.22.0 | Deb、AppImage | `v0.22.0` |
| 0.23.0 | 当前 Linux/Windows 合并主线 | 原有 `v0.23.0` |
| 0.24.0 | Windows / Linux 共用平台适配层的当前主线 | `v0.24.0` |
| 0.24.1 | 三平台 CI 验证后的配置优先级修正版 | `v0.24.1` |
| 0.25.0 | Windows 0.21.2 正式安装包复核后的平台实现彻底隔离版本 | `v0.25.0` |
| 0.26.0 | 工程恢复能力与首次使用体验双轮验收版本 | `v0.26.0` |

历史迁移记录曾说明 0.1.0–0.12.0 的旧发布包在 2026-09-25 被移入系统回收站；本次重新扫描时这些文件已经不在当前回收站和 `CodexProjects` 目录中，因此没有伪造或补造这些版本。

## 源码是怎样恢复的

0.13.0–0.22.0 的 Deb 包均为 Electron 应用。恢复过程只读取发布包，不安装旧程序：

1. 使用 `dpkg-deb` 解开 Deb。
2. 找到 `resources/app.asar`。
3. 使用 Electron ASAR 工具提取发布时实际打包进去的 `src/`、`build/java/` 和运行时 `package.json`。
4. 排除 `node_modules` 和平台原生依赖。
5. 按发布包文件时间建立“恢复发布快照”时间线。

因此 `history/recovered-release-snapshots` 表示的是**从发布制品恢复出的运行时源码快照**，不是声称找回了当年每一次原始 Git commit。

## 可靠性校验

做了两项交叉验证：

- 从 0.20.0 Deb 恢复出的整个 `src/` 与 GitHub 原有 `v0.20.0` 的 `src/` 完全一致。打包后的 `package.json` 只比开发仓库版本少 Electron Builder 自动裁剪掉的 `scripts`、`devDependencies` 和 `build` 字段。
- 0.19.0 Windows Setup 与同版本 Linux Deb 分别解包后，`src/`、`build/java/` 和运行时 `package.json` 完全一致；归一化源码树哈希相同。
- 用户再次提供的 `EAS-RPA-Console-0.21.2-Setup-x64.exe` SHA-256 为 `a6e089791e1703bb91f631716d9e604dc7472f44df39e228247e2857eec4c26d`，与本机原 Windows 安装包逐字节一致；其 `app.asar` 运行时代码与 `history/windows-0.21.2` 的核心代码一致，历史分支仅额外保留开发期 `src/web-marker` 和 Java 编译输出。

这证明恢复出的版本属于同一个跨平台 EAS RPA 项目，而不是另一套 Linux 工程。

## Git 分支设计

### `main`

当前可维护主线为 0.26.0。历史 `v0.23.0`、`v0.24.0`、`v0.24.1`、`v0.25.0` 均保持不变；0.26.0 在 0.25.0 平台隔离基础上增加失败恢复边界、配置恢复和首次使用 UI 双轮验收。

### `history/recovered-release-snapshots`

按发布制品的实际时间串联 0.13.0–0.22.0 的恢复源码快照。它用于浏览版本变化，不冒充原始 Git 开发提交历史。

其中原有 `v0.20.0` 标签仍然指向此前公开发布的完整源码提交，没有被移动或覆盖。

### `history/windows-0.21.2`

独立保存 2026-09-29 从 Windows 电脑迁入的 0.21.2 实机测试完整工作区。由于原 Windows Git 父提交关系没有保留下来，这个分支故意保持独立，不强行声明它从 0.21.0 或 0.22.0 的哪一个 commit 分叉。

## 如何查看

查看全部版本：

```bash
git tag --list --sort=version:refname
```

查看恢复发布线：

```bash
git log --oneline --decorate history/recovered-release-snapshots
```

查看 Windows 0.21.2：

```bash
git switch history/windows-0.21.2
```

返回当前主线：

```bash
git switch main
```

查看某个版本而不改分支：

```bash
git show v0.19.0:src/main.js
git diff v0.18.0 v0.19.0 -- src/
```

## 本地发布包归档

发布二进制文件不进入 Git 仓库，统一保留在：

```text
/home/sducks/Documents/CodexProjects/kingdee-eas-rpa/artifacts/recovered-releases/
```

目录按版本号分层。不要再把这些文件当成可再生成缓存直接删除；在确认新的 Git/Release 备份策略之前，它们仍然是历史版本的重要取证材料。
