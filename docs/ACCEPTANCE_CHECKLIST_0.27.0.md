# 0.27.0 发布验收清单

## A. Brooks 工程轮

- [x] 多客户端为独立领域模型。
- [x] 账号与数据中心按客户端隔离。
- [x] 旧 0.26.x 配置可自动迁移并保留迁移前备份。
- [x] 缺失客户端引用在启动进程前失败。
- [x] 客户端删除有账号引用保护。
- [x] EAS 版本探测不确定时进入兼容模式。
- [x] runId 进程回收、凭据清空、有限重试未退化。
- [x] 40 项测试无失败。
- [x] 静态检查、acceptance、生产依赖审计、diff check 通过。

详见 [`ACCEPTANCE_BROOKS_0.27.0.md`](ACCEPTANCE_BROOKS_0.27.0.md)。

## B. 产品轮

- [x] 首屏有清晰“当前客户端”切换条。
- [x] 备注可编辑并作为主要识别名。
- [x] 三步首次使用路径保留。
- [x] 多版本管理隐藏底层启动细节。
- [x] 密码缺失/没有启用账号的状态文案真实。
- [x] 客户端管理与编辑使用统一视觉组件。
- [x] 1200px / 500px 窗口矩阵无横向溢出。
- [x] 所有公开截图均为虚构数据。

详见 [`ACCEPTANCE_PRODUCT_0.27.0.md`](ACCEPTANCE_PRODUCT_0.27.0.md)。

## C. 用户可验收产物

发布完成后应存在：

```text
dist/EAS-RPA-Console-0.27.0-amd64.deb
dist/EAS-RPA-Console-0.27.0-x86_64.AppImage
EAS-RPA-Console-0.27.0-Setup-x64.exe
docs/MULTI_CLIENT_MODEL.md
docs/ACCEPTANCE_BROOKS_0.27.0.md
docs/ACCEPTANCE_PRODUCT_0.27.0.md
docs/ACCEPTANCE_CHECKLIST_0.27.0.md
docs/screenshots/v0.27.0/first-run.png
docs/screenshots/v0.27.0/multi-client.png
docs/screenshots/v0.27.0/client-manager.png
docs/screenshots/v0.27.0/client-editor.png
docs/screenshots/v0.27.0/narrow.png
```

## D. 安装升级验收（发布阶段填写）

- [x] 本机 0.26.1 配置已备份。
- [x] 本机升级到 0.27.0。
- [x] 首次启动已将旧单客户端配置迁移为 `clients[]`。
- [x] 9 个现有账号与 7 个现有数据中心未丢失。
- [x] `config.yaml.pre-multi-client.bak` 存在。
- [x] GitHub Ubuntu / Windows / macOS CI 全绿。
- [x] GitHub Release 原生生成 Deb / AppImage / Windows EXE 与 SHA256。
- [x] 本机最终安装 GitHub 正式 Deb，而非临时本地包。
- [x] 正式 Deb SHA-256：`555ef6cb1caf417e2d06698e27ace38e568f340a3867906b35974adca1ca2cfe`。
- [x] 正式 Windows EXE SHA-256：`b963d29de97453c50564e10640a4ec22dd05b1b6cb8204b2fc1ebefc3a6f6e0f`。
