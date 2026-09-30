# 0.26.0 发布验收清单

## A. 工程验收

- [x] `npm test`：无失败；非当前平台的原生测试允许明确跳过。
- [x] `npm run check`：所有主进程、renderer、platform、core 文件语法通过。
- [x] `npm run acceptance`：架构边界、失败恢复与产品约束全部通过。
- [x] `git diff --check`：无空白错误。
- [x] 敏感信息扫描：无真实密码、Token、私钥进入 Git。
- [x] Linux 原生构建完成；Windows/macOS 由 GitHub 对应原生 runner 继续验证。

## B. 产品验收

- [x] 全新配置目录可启动，首屏无演示账号/假日志。
- [x] 首屏只给出三步设置路径。
- [x] 默认但不存在的客户端路径不会显示为就绪。
- [x] 缺少密码时不会显示“可以登录”。
- [x] 账号添加/编辑/单账号登录无需跳转到独立凭据页。
- [x] 诊断、日志、设置均能从首屏进入，并且不会阻断主登录路径。
- [x] 明暗主题下主操作、文本、禁用状态仍清晰。

## C. 用户可拿走的产物

发布后应至少存在：

```text
dist/EAS-RPA-Console-0.26.0-x86_64.AppImage
dist/EAS-RPA-Console-0.26.0-amd64.deb
docs/screenshots/acceptance-first-run.png
docs/ACCEPTANCE_BROOKS.md
docs/ACCEPTANCE_PRODUCT.md
docs/ACCEPTANCE_CHECKLIST.md
artifacts/acceptance-0.26.0/SHA256SUMS
```

Windows 安装包由 Windows 原生发布工作流生成：

```text
EAS-RPA-Console-0.26.0-Setup-x64.exe
```


## 本机验收证据

- AppImage、`linux-unpacked` 与 Deb 解包后的安装目录均可启动；三种入口在全新配置下首屏截图哈希完全一致。
- Deb 元数据：`eascloud-rpa-console 0.26.0 amd64`。
- Windows / macOS 的源码与自动验收由 GitHub 原生 runner 验证；Windows 安装包由发布工作流在 Windows runner 原生构建。
